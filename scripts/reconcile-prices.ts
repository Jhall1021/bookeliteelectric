/**
 * Price reconciliation — REPORT ONLY.
 *
 *   npx tsx scripts/reconcile-prices.ts
 *   npx tsx scripts/reconcile-prices.ts --csv > reconciliation.csv
 *
 * Writes nothing. Compares every published customer price against what the
 * model produces from crew-hours, materials and direct costs, and sorts the
 * catalog into what matches, what sits above, what sits below, and what can't
 * be judged yet.
 *
 * The model, for reference:
 *
 *   standalone = max(crew-hours x rate, primary minimum when <= 1.0 hr)
 *                + materials x tier + permit + other
 *   same-visit = crew-hours x rate + materials x tier + permit + other
 *                — NO minimum, no floor. The technician is already on site.
 *
 * Read this before changing anything. A published price above the model isn't
 * automatically wrong: it may be a deliberate decision nobody has recorded as
 * one. The point of the report is to make each gap a choice rather than an
 * accident.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice, type PricingSettings } from "../lib/pricing";

const prisma = new PrismaClient();

/** Rounding is $5, so anything inside that is agreement, not a gap. */
const TOLERANCE_CENTS = 500;

/**
 * Deliberate, owner-approved departures from the model.
 *
 * Deliberately short. Every entry here is a price the model can't explain, so
 * each one needs a reason a person wrote down — not a category that quietly
 * absorbs anything inconvenient. There is no generic "scope premium" type.
 */
const APPROVED_EXCEPTIONS: Record<string, string> = {
  "electrical-troubleshooting":
    "Diagnostic product, not a labor calculation. $249 covers the visit and the " +
    "first hour of diagnostic and repair time; owner-approved as a separate " +
    "offering. Corrected from $250 in the 23 Aug reconciliation — the price was " +
    "always $249, the database was wrong.",

  "recessed-lighting":
    "First light held at the published $375 rather than the $385 the model " +
    "computes. A deliberate launch decision recorded in " +
    "prisma/seed-recessed-lighting.ts, taken when the figures were set and " +
    "not revisited since.\n" +
    "\n" +
    "The $10 gap only became visible on 26 Aug, when the canonical/contractor " +
    "component split made component economics reachable by the model for the " +
    "first time. The price did not move; the reconciler stopped being blind " +
    "to it. Worth knowing the migration surfaced a real gap rather than " +
    "creating one.\n" +
    "\n" +
    "Kept rather than published because re-deciding a customer-facing price " +
    "as a side effect of a schema migration is the wrong reason to change " +
    "one. Revisit deliberately, with field data on how long these actually " +
    "take.",
};

type Row = {
  slug: string;
  name: string;
  category: string;
  kind: "standalone" | "same-visit";
  published: number | null;
  model: number | null;
  blocked: string | null;
};

function classify(r: Row) {
  if (r.blocked) return "blocked";
  if (r.published === null || r.model === null) return "blocked";
  const d = r.published - r.model;
  if (Math.abs(d) <= TOLERANCE_CENTS) return "match";
  return d > 0 ? "above" : "below";
}

const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toLocaleString()}`);

/**
 * Reconcile ONE contractor's published prices against ONE contractor's model.
 *
 * Used to read a single PricingSettings row keyed `id: "default"` and every
 * active service in the database, then price all of them against that one
 * row. With a second contractor that means grading their work against
 * somebody else's labour rate and minimum — and this report is what decides
 * whether a published price is wrong.
 *
 * Returns the number of unexplained differences so the caller can total them.
 */
async function reconcileContractor(
  contractor: { id: string; name: string },
  settings: PricingSettings,
  csv: boolean
): Promise<number> {
  const services = await prisma.service.findMany({
    where: { active: true, contractorId: contractor.id },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    include: {
      category: { select: { name: true } },
      _count: { select: { materials: true } },
    },
  });

  const rows: Row[] = [];

  for (const s of services) {
    const inputs = {
      fieldLaborHours: s.fieldLaborHours,
      wwtLaborHours: s.wwtLaborHours,
      requiresTechCount: s.requiresTechCount,
      materialCostCents: s.materialCostCents,
      materialMultiplier: s.materialMultiplier,
      permitAdminCents: s.permitAdminCents,
      otherDirectCostCents: s.otherDirectCostCents,
      isPrimaryEligible: s.isPrimaryEligible,
    };

    // Why a service can't be judged yet. Stated per row rather than lumped
    // into one bucket, because "no labor recorded" and "materials still on an
    // imported allowance" need different work to resolve.
    const blockers: string[] = [];
    if (s.bookingType === "REMOTE_QUOTE" && s.basePrice === null) {
      blockers.push("quote-only");
    }
    if (s.fieldLaborHours === null && s.basePrice !== null) {
      blockers.push("no crew-hours recorded");
    }
    if (s.materialCostCents && s._count.materials === 0) {
      blockers.push("materials not itemized");
    }
    if (s.materialMultiplier !== null) {
      blockers.push(`imported ${s.materialMultiplier}x markup overrides the tier`);
    }

    const primary = suggestPrimaryPrice(inputs, settings);
    rows.push({
      slug: s.slug,
      name: s.name.trim(),
      category: s.category.name,
      kind: "standalone",
      published: s.basePrice,
      model: primary.totalCents,
      blocked: blockers.length ? blockers.join("; ") : null,
    });

    if (s.whileWeThereBasePrice !== null || s.wwtLaborHours !== null) {
      const wwt = suggestWwtPrice(inputs, settings);
      rows.push({
        slug: s.slug,
        name: s.name.trim(),
        category: s.category.name,
        kind: "same-visit",
        published: s.whileWeThereBasePrice,
        model: wwt.totalCents,
        blocked:
          s.wwtLaborHours === null && s.whileWeThereBasePrice !== null
            ? "sells an add-on with no add-on crew-hours"
            : blockers.length
              ? blockers.join("; ")
              : null,
      });
    }
  }

  if (csv) {
    // Built to be marked up, not just read. Sorted by how much thought each
    // row needs — the trivial ones first so they can be accepted in a block,
    // the large gaps last where they'll actually get read.
    //
    // DECISION and NOTE are left blank for you to fill in.
    const decidable = rows
      .filter((r) => ["above", "below"].includes(classify(r)))
      .map((r) => {
        const gap = (r.published ?? 0) - (r.model ?? 0);
        const size = Math.abs(gap);
        return {
          ...r,
          gap,
          band:
            size <= 1500 ? "1 minor (under $15)" :
            size <= 5000 ? "2 moderate ($15-50)" :
            size <= 10000 ? "3 significant ($50-100)" : "4 large (over $100)",
        };
      })
      .sort((a, b) => a.band.localeCompare(b.band) || Math.abs(a.gap) - Math.abs(b.gap));

    console.log(
      [
        "band", "service", "category", "kind",
        "published", "model", "change", "direction",
        "DECISION", "NOTE",
      ].join(",")
    );
    for (const r of decidable) {
      const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
      console.log(
        [
          r.band,
          `"${r.name}"`,
          `"${r.category}"`,
          r.kind,
          dollars(r.published),
          dollars(r.model),
          // What publishing would do to this price, signed from the
          // customer's point of view.
          (r.gap > 0 ? "-" : "+") + Math.abs(r.gap / 100).toFixed(2),
          r.gap > 0 ? "price falls" : "price rises",
          APPROVED_EXCEPTIONS[r.slug] ? "keep (approved exception)" : "",
          APPROVED_EXCEPTIONS[r.slug] ? `"${APPROVED_EXCEPTIONS[r.slug]}"` : "",
        ].join(",")
      );
    }

    // Everything that can't be decided yet, so the file is the whole picture
    // rather than only the easy part.
    for (const r of rows.filter((x) => classify(x) === "blocked")) {
      console.log(
        [
          "5 blocked", `"${r.name}"`, `"${r.category}"`, r.kind,
          r.published === null ? "" : (r.published / 100).toFixed(2),
          "", "", "", "", `"${r.blocked ?? ""}"`,
        ].join(",")
      );
    }
    // --csv is a data dump for a spreadsheet, not a gate: it prints every row
    // and never computes the unexplained set. Returning 0 keeps that unchanged
    // rather than quietly making --csv the way to get a clean exit code.
    return 0;
  }

  const groups = {
    match: rows.filter((r) => classify(r) === "match"),
    above: rows.filter((r) => classify(r) === "above"),
    below: rows.filter((r) => classify(r) === "below"),
    blocked: rows.filter((r) => classify(r) === "blocked"),
  };

  const priced = rows.length - groups.blocked.length;

  console.log(`\nPRICE RECONCILIATION — ${contractor.name}\n`);
  // Printed apart because they're independent settings that happened to
  // share a value, which made the report look like it was quoting one
  // number twice.
  console.log(`  Crew-hour rate        $${settings.crewHourRateCents / 100}   — what an hour of one van costs`);
  console.log(`  Service-call minimum  $${settings.primaryMinimumCents / 100}   — floor on the FIRST service, set independently`);
  console.log(`  Rounding tolerance    $${TOLERANCE_CENTS / 100}`);
  console.log(`  Material markup       30% of the first $750, 20% above\n`);
  // Components whose approved price was derived under the old 3x band.
  // Anything with under $10 of direct material was marked up three times and
  // is now marked up 1.3 — those increments need re-deriving, and silently
  // keeping them would leave the old rule alive inside the components.
  const components = await prisma.jobComponent.findMany({
    where: { active: true, addMaterialCostCents: { gt: 0, lt: 1000 } },
    select: {
      key: true, name: true, addMaterialCostCents: true,
      addFieldLaborHours: true, approvedPriceCents: true,
    },
  });
  // Only flag the ones that ACTUALLY differ. Listing every component with
  // under $10 of material meant re-reading four correct figures every run to
  // find the one that moved — which is how a real finding gets ignored.
  const staleComponents = components
    .map((c) => {
      const labor = Math.round((c.addFieldLaborHours ?? 0) * settings.crewHourRateCents);
      const material = Math.round((c.addMaterialCostCents ?? 0) * 1.3);
      const model = Math.ceil((labor + material) / settings.roundingIncrementCents) *
        settings.roundingIncrementCents;
      return { ...c, model };
    })
    .filter((c) => Math.abs((c.approvedPriceCents ?? 0) - c.model) > TOLERANCE_CENTS);

  if (staleComponents.length) {
    console.log(`  ${staleComponents.length} approved component increment(s) no longer match`);
    console.log(`  their inputs under the current markup:\n`);
    for (const c of staleComponents) {
      console.log(`      ${c.name}`);
      console.log(
        `          approved $${((c.approvedPriceCents ?? 0) / 100).toFixed(2)} — ` +
          `model says $${(c.model / 100).toFixed(2)}`
      );
    }
    console.log();
  } else if (components.length) {
    console.log(`  ${components.length} component(s) carry under $10 of material; all still match.\n`);
  }

  if (settings.primaryMinimumCents > settings.crewHourRateCents) {
    // Worth saying: below this many hours the minimum decides the price and
    // the crew-hours don't move it at all, which makes "matches the model"
    // mean less than it appears.
    const bound = settings.primaryMinimumCents / settings.crewHourRateCents;
    console.log(
      `  Note: the minimum exceeds one crew-hour, so any first service under\n` +
        `  ${bound.toFixed(2)} hours prices at $${settings.primaryMinimumCents / 100} whatever its labor.\n`
    );
  }
  console.log(`  ${rows.length} published prices across ${services.length} active services`);
  console.log(`  ${priced} the model can price`);
  console.log(`    ${groups.match.length} match`);
  console.log(`    ${groups.above.length} published ABOVE model`);
  console.log(`    ${groups.below.length} published BELOW model`);
  console.log(`  ${groups.blocked.length} cannot be reconciled yet\n`);

  for (const [label, list] of [
    ["PUBLISHED ABOVE MODEL", groups.above],
    ["PUBLISHED BELOW MODEL", groups.below],
  ] as const) {
    if (!list.length) continue;
    console.log(`${"─".repeat(78)}\n${label}\n`);
    console.log(
      `  ${"service".padEnd(38)}${"kind".padEnd(12)}${"published".padStart(10)}${"model".padStart(10)}${"gap".padStart(9)}`
    );
    for (const r of list.sort(
      (a, b) => Math.abs((b.published ?? 0) - (b.model ?? 0)) - Math.abs((a.published ?? 0) - (a.model ?? 0))
    )) {
      const gap = (r.published ?? 0) - (r.model ?? 0);
      const ex = APPROVED_EXCEPTIONS[r.slug];
      console.log(
        `  ${r.name.slice(0, 36).padEnd(38)}${r.kind.padEnd(12)}${money(r.published).padStart(10)}${money(r.model).padStart(10)}${(gap > 0 ? "+" : "") + money(Math.abs(gap)).replace("$", "$")}`.padEnd(80) +
          (ex ? "  [approved exception]" : "")
      );
    }
    console.log();
  }

  if (groups.blocked.length) {
    console.log(`${"─".repeat(78)}\nCANNOT BE RECONCILED YET\n`);
    const byReason = new Map<string, string[]>();
    for (const r of groups.blocked) {
      const key = r.blocked ?? "unknown";
      byReason.set(key, [...(byReason.get(key) ?? []), `${r.name} (${r.kind})`]);
    }
    for (const [reason, names] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${reason} — ${names.length}`);
      for (const n of names.slice(0, 8)) console.log(`      ${n}`);
      if (names.length > 8) console.log(`      ...and ${names.length - 8} more`);
      console.log();
    }
  }

  const unexplained = [...groups.above, ...groups.below].filter(
    (r) => !APPROVED_EXCEPTIONS[r.slug]
  );

  console.log(`${"─".repeat(78)}`);
  console.log(`\n  ${unexplained.length} price(s) differ from the model with no recorded reason.`);
  console.log(`  ${Object.keys(APPROVED_EXCEPTIONS).length} approved exception(s) on file.\n`);
  console.log(`  Nothing was changed. Review the table above and decide each one:`);
  console.log(`  publish the model figure, or record why the published price stands.\n`);

  return unexplained.length;
}

/**
 * Every contractor, each against its own settings.
 *
 * A contractor with no PricingSettings is a STOP, not a skip: their published
 * prices cannot be checked at all, and silently reporting on the others would
 * read as a clean run.
 */
async function main() {
  const csv = process.argv.includes("--csv");

  const contractors = await prisma.contractor.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (contractors.length === 0) {
    console.error("No contractors — nothing to reconcile.");
    process.exit(1);
  }

  let unexplained = 0;
  const missing: string[] = [];

  for (const c of contractors) {
    const settings = (await prisma.pricingSettings.findUnique({
      where: { contractorId: c.id },
    })) as PricingSettings | null;
    if (!settings) {
      missing.push(c.name);
      continue;
    }
    unexplained += await reconcileContractor(c, settings, csv);
  }

  if (missing.length) {
    console.error(`\n  ${missing.length} contractor(s) have NO pricing settings, so their`);
    console.error(`  published prices could not be checked at all:\n`);
    for (const n of missing) console.error(`      ${n}`);
    console.error(`\n  Reporting on the others without saying so would read as a clean run.\n`);
  }

  console.log(`  --csv for a spreadsheet.\n`);
  process.exitCode = missing.length === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
