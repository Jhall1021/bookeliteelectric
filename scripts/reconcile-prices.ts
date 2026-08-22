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
    "Diagnostic product, not a labor calculation. $249 covers the visit and the first hour; owner-approved as a separate offering.",
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

async function main() {
  const csv = process.argv.includes("--csv");

  const settings = (await prisma.pricingSettings.findUnique({
    where: { id: "default" },
  })) as PricingSettings | null;
  if (!settings) {
    console.error("No pricing settings — run seed-pricing-settings.ts first.");
    process.exit(1);
  }

  const services = await prisma.service.findMany({
    where: { active: true },
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
    console.log("slug,name,category,kind,published,model,variance,status,blocked,exception");
    for (const r of rows) {
      const status = classify(r);
      const v = r.published !== null && r.model !== null ? r.published - r.model : "";
      const ex = APPROVED_EXCEPTIONS[r.slug] ?? "";
      console.log(
        [r.slug, `"${r.name}"`, `"${r.category}"`, r.kind, r.published ?? "", r.model ?? "", v, status, `"${r.blocked ?? ""}"`, `"${ex}"`].join(",")
      );
    }
    return;
  }

  const groups = {
    match: rows.filter((r) => classify(r) === "match"),
    above: rows.filter((r) => classify(r) === "above"),
    below: rows.filter((r) => classify(r) === "below"),
    blocked: rows.filter((r) => classify(r) === "blocked"),
  };

  const priced = rows.length - groups.blocked.length;

  console.log(`\nPRICE RECONCILIATION\n`);
  // Printed apart because they're independent settings that happened to
  // share a value, which made the report look like it was quoting one
  // number twice.
  console.log(`  Crew-hour rate        $${settings.targetRateCents / 100}   — what an hour of one van costs`);
  console.log(`  Service-call minimum  $${settings.primaryMinimumCents / 100}   — floor on the FIRST service, set independently`);
  console.log(`  Rounding tolerance    $${TOLERANCE_CENTS / 100}\n`);
  if (settings.primaryMinimumCents > settings.targetRateCents) {
    // Worth saying: below this many hours the minimum decides the price and
    // the crew-hours don't move it at all, which makes "matches the model"
    // mean less than it appears.
    const bound = settings.primaryMinimumCents / settings.targetRateCents;
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
  console.log(`  --csv for a spreadsheet.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
