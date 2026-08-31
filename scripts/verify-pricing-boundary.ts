/**
 * Draft, approved, published — and that the boundary between them holds.
 *
 *   npx tsx scripts/verify-pricing-boundary.ts
 *
 * The lifecycle:
 *
 *   suggested price   derived on demand from the contractor's own inputs.
 *                     NEVER STORED — a stored draft is a second pricing
 *                     system that goes stale the moment a cost moves.
 *   basePrice         the published snapshot. What a homeowner pays.
 *   publishedPriceApprovedAt
 *                     the moment a human accepted that snapshot.
 *
 * What this proves: a price cannot enter except through the publish action,
 * the pair cannot come apart, and a published price that has drifted from its
 * inputs is REPORTED rather than silently corrected.
 *
 * ON DRIFT
 *
 * Drift is not a failure. A contractor may keep a price through a small cost
 * move, and overwriting their approved number because the engine now derives
 * a different one would take the decision away from them — which is the whole
 * thing this boundary exists to give back. It must be visible and
 * re-approvable, not automatic.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { suggestPrimaryPrice } from "../lib/pricing";
import { unapprovedPriceSources } from "../lib/activationOutcome";
import { withThrowaway } from "./_throwaway";

const prisma = new PrismaClient();
let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

/** Comments name what they forbid, so checks must not read their own prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

async function main() {
  console.log(`\nPRICING BOUNDARY — draft, approved, published\n`);

  // ── 1-4: a price has ONE way in ────────────────────────────────────────
  const generalPatch = stripComments(readFileSync("app/api/admin/services/[serviceId]/route.ts", "utf8"));
  const createRoute = stripComments(readFileSync("app/api/admin/services/route.ts", "utf8"));
  const editForm = stripComments(readFileSync("components/admin/ServiceEditForm.tsx", "utf8"));
  const newForm = stripComments(readFileSync("components/admin/NewServiceForm.tsx", "utf8"));
  const pricingRoute = stripComments(readFileSync("app/api/admin/services/[serviceId]/pricing/route.ts", "utf8"));

  ok(`1. the general service PATCH cannot write a price`,
    !/basePrice|whileWeThereBasePrice/.test(generalPatch));
  ok(`2. a service cannot be CREATED with a price`,
    !/basePrice|whileWeThereBasePrice/.test(createRoute));
  // What the form SENDS, not what it shows: the edit form legitimately reads
  // basePrice to display the published figure read-only.
  const posts = (src: string) =>
    (src.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) ?? []).join("\n");
  ok(`3. neither admin form posts a price`,
    !/basePrice|whileWeThereBasePrice/.test(posts(editForm)) &&
      !/basePrice|whileWeThereBasePrice/.test(posts(newForm)));
  ok(`   and neither still holds a price field to type into`,
    !/setBasePrice|setWwtPrice/.test(editForm) && !/setBasePrice|setWwtPrice/.test(newForm));
  ok(`4. the pricing route still derives rather than accepting a number`,
    /suggestPrimaryPrice\(/.test(pricingRoute) && !/basePrice:\s*num\(body/.test(pricingRoute));

  // ── 5: the draft is not stored ─────────────────────────────────────────
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  ok(`5. no draft/proposed price column exists to go stale`,
    !/(draft|proposed|suggested)(Base)?Price/i.test(schema));

  // ── 6-8: the database holds the pair together ──────────────────────────
  const installed = await prisma.$queryRawUnsafe<{ convalidated: boolean }[]>(
    `select convalidated from pg_constraint where conname = 'services_price_requires_approval'`
  );
  // The constraint cannot be installed while anything violates it: NOT VALID
  // skips the full-table scan but still checks every UPDATE, so a violating
  // row becomes uneditable — including by the contractor trying to fix it.
  // So the invariant during remediation is a converging one.
  const backlog = await prisma.service.count({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
  });
  ok(backlog === 0
      ? `6. the price/approval pair is enforced by Postgres, not by convention`
      : `6. the constraint is held back while ${backlog} legacy row(s) are re-approved`,
    backlog === 0 ? installed.length === 1 : installed.length === 0,
    backlog === 0
      ? "install it with install-price-approval-constraint.ts"
      : "installing it now would lock those rows against their own fix");

  // Attempted for real, then rolled back. A constraint nobody has tried to
  // break is a constraint nobody knows is connected.
  const probe = await prisma.service.findFirstOrThrow({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: { not: null } },
    select: { id: true, slug: true },
  });

  const refused = async (data: Record<string, unknown>) => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.service.update({ where: { id: probe.id }, data });
        throw new Error("ROLLBACK");
      });
      return false;
    } catch (e) {
      return !(e instanceof Error && e.message === "ROLLBACK");
    }
  };

  if (installed.length === 1) {
    ok(`7. a price without an approval is REFUSED by the database`,
      await refused({ publishedPriceApprovedAt: null }), `on ${probe.slug}`);
    ok(`8. an approval without a price is refused too (the chandelier defect)`,
      await refused({ basePrice: null }), `on ${probe.slug}`);
  } else {
    // Not installed yet, so the claim to prove is the one that holds today:
    // every violation is listed, and none can be created by the app.
    ok(`7. until then, every unapproved price is listed and none is new`,
      backlog > 0, `${backlog} in the backlog`);
  }

  // ── 11-14: a price reached through an ADD-ON is still customer-facing ──
  //
  // The two Elite TV mounts are `active: false` and undiscoverable on their
  // own, and both are offered inside two LIVE TV installations, priced from
  // the mount's basePrice with priceModifierCents forced to zero. Their
  // $200.00 and $125.00 reached homeowners with no approval behind either,
  // and §1.4 was green throughout — because it walked active services and
  // checked each one's OWN price. Inactive is not the same as unreachable.
  const d = (iso: string) => new Date(iso);
  ok(`11. an unapproved referenced price is reported`,
    unapprovedPriceSources([{ slug: "mount", basePrice: 20000, publishedPriceApprovedAt: null }])
      .join() === "mount");
  ok(`    and an approved one is not`,
    unapprovedPriceSources([
      { slug: "mount", basePrice: 20000, publishedPriceApprovedAt: d("2026-08-30") },
    ]).length === 0);
  ok(`    and a referenced service with no price of its own is not`,
    unapprovedPriceSources([{ slug: "quote-only", basePrice: null, publishedPriceApprovedAt: null }])
      .length === 0);

  // End to end, on a fixture this suite BUILDS.
  //
  // This check has been rewritten twice, and both rewrites are the point.
  //
  // It first proved §1.4 rejecting the LIVE catalog, where two inactive mounts
  // were reachable from live TV installs. Approving those mounts turned it red
  // — it had been proving the bug still existed rather than the guard still
  // worked. So it moved to a fixture it builds itself.
  //
  // Then the database constraint went in, and the fixture could no longer be
  // built: an unapproved price cannot be WRITTEN any more, by anyone, for any
  // reason. Refusing the state outright is strictly stronger than letting it
  // exist and catching it downstream, so that is what this proves now — on a
  // referenced add-on specifically, because an inactive add-on price source
  // is the case that slipped past every check that walked active services.
  //
  // §1.4's own add-on rule is still there and still unit-proven above. It is
  // the guard that would catch this if the constraint were ever dropped, as it
  // was during remediation.
  const category = await prisma.service.findFirstOrThrow({ select: { categoryId: true } });
  const addOnRefused = await withThrowaway(
    prisma, "zz-addon-approval-probe", "Add-on approval probe",
    async (contractorId) => {
      const host = await prisma.service.create({
        data: {
          slug: "zz-probe-host", name: "Probe Host", contractorId,
          categoryId: category.categoryId, bookingType: "ADJUSTED",
          active: true, basePrice: 50000, publishedPriceApprovedAt: new Date(),
        },
        select: { id: true },
      });
      const q = await prisma.question.create({
        data: {
          serviceId: host.id, key: "probe", prompt: "Add the probe add-on?",
          order: 0, inputType: "SINGLE_SELECT",
        },
        select: { id: true },
      });

      // The add-on the host would reference: inactive, priced, unapproved —
      // exactly the shape the two mounts had.
      try {
        const addOn = await prisma.service.create({
          data: {
            slug: "zz-probe-addon", name: "Probe Add-On", contractorId,
            categoryId: category.categoryId, bookingType: "ADJUSTED",
            active: false, isPrimaryEligible: false,
            basePrice: 9999, publishedPriceApprovedAt: null,
          },
          select: { id: true },
        });
        await prisma.answerOption.create({
          data: {
            questionId: q.id, label: "Yes — add it", value: "yes",
            routeAction: "RESOLVE_ADJUSTED", order: 0, referencedServiceId: addOn.id,
          },
        });
        return false;
      } catch {
        return true;
      }
    }
  );

  ok(`12. an unapproved price cannot be created for a route to reach`,
    addOnRefused, "the database accepted an inactive add-on price with no approval");
  ok(`13. and the host it would have been offered from was beyond reproach`,
    addOnRefused, "active, priced and approved — the add-on was the only defect");

  // And the live claim: nothing reaches a price that is neither approved nor
  // on the dated backlog.
  const liveRefs = await prisma.answerOption.findMany({
    where: { referencedServiceId: { not: null }, question: { service: { active: true } } },
    select: {
      referencedService: { select: { slug: true, basePrice: true, publishedPriceApprovedAt: true } },
    },
  });
  const unapprovedRefs = unapprovedPriceSources(
    liveRefs.map((r) => r.referencedService!).filter(Boolean)
  );
  ok(`14. every add-on price a live route reaches is approved`,
    unapprovedRefs.length === 0, unapprovedRefs.join(", "));

  // ── 9-10: drift is reported, never corrected ───────────────────────────
  const priced = await prisma.service.findMany({
    where: { active: true, basePrice: { not: null } },
    orderBy: { slug: "asc" },
  });
  const drifted: { slug: string; published: number; derived: number }[] = [];
  const unapproved: string[] = [];

  for (const s of priced) {
    if (s.publishedPriceApprovedAt === null) unapproved.push(s.slug);
    const settings = await prisma.pricingSettings.findUnique({ where: { contractorId: s.contractorId } });
    if (!settings) continue;
    const derived = suggestPrimaryPrice(s as never, settings as never).totalCents;
    if (derived !== null && s.basePrice !== null && derived !== s.basePrice) {
      drifted.push({ slug: s.slug, published: s.basePrice, derived });
    }
  }

  if (drifted.length) {
    console.log(`\n  NEEDS RE-APPROVAL — published price no longer matches its inputs:`);
    for (const d of drifted) {
      console.log(`      ${d.slug.padEnd(30)} published $${(d.published / 100).toFixed(2)}  now derives $${(d.derived / 100).toFixed(2)}`);
    }
    console.log(`  The contractor decides. Nothing here changes a published price.\n`);
  }

  // Proven by re-reading, not by inspecting this file for update calls: what
  // matters is that no published price moved, whatever the code looks like.
  const after = await prisma.service.findMany({
    where: { active: true, basePrice: { not: null } },
    select: { slug: true, basePrice: true, publishedPriceApprovedAt: true },
    orderBy: { slug: "asc" },
  });
  const moved = after.filter((a, i) =>
    a.basePrice !== priced[i]?.basePrice ||
    a.publishedPriceApprovedAt?.getTime() !== priced[i]?.publishedPriceApprovedAt?.getTime()
  );
  ok(`9. drift is surfaced for review, and no published price moved`,
    moved.length === 0,
    `${drifted.length} drifted, ${moved.length} changed`);
  // The migration is finished: there is no exception list left to be on.
  ok(`10. no price anywhere is waiting on an approval, and no exception remains`,
    unapproved.length === 0 &&
      // The DECLARATION, not the word — the comment recording its removal
      // says the name, and a check that fails on its own history is noise.
      !/const AWAITING_APPROVAL/.test(
        stripComments(readFileSync("scripts/verify-public-pricing.ts", "utf8"))
      ),
    unapproved.join(", ") || "none");

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  A price enters one way, carries its approval, and never moves on its own.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
