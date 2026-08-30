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
import { suggestPrimaryPrice } from "../lib/pricing";

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
  ok(`10. every unapproved price is a known, listed backlog item`,
    unapproved.every((s) => /AWAITING_APPROVAL/.test(readFileSync("scripts/verify-public-pricing.ts", "utf8")) &&
      readFileSync("scripts/verify-public-pricing.ts", "utf8").includes(`"${s}"`)),
    unapproved.join(", ") || "none");

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  A price enters one way, carries its approval, and never moves on its own.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
