/**
 * A catalog installs completely, or not at all.
 *
 *   npx tsx scripts/verify-template-installation.ts
 *
 * The script this replaced wrote service by service with individual awaits, so
 * a failure at service 62 of 75 left 61 services, some policies and a
 * half-built tree — and nothing told the contractor. "62 of 63" is not a
 * degraded catalog, it is a catalog that lies about what the business sells.
 *
 * The other half of the guarantee is what installation may NOT write. A
 * canonical template owns structure; the contractor owns every economic value.
 * Provisioning that seeded a labor hour or a material cost to make a catalog
 * look ready would be inventing a business decision on their behalf.
 */

import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import {
  templateVersionSource, preflight, installCatalog, type CanonicalCatalog,
} from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
const SLUG = "test-template-install";

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function teardown() {
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await destroyContractor(raw, SLUG).catch(() => {});
}

async function main() {
  console.log(`\nTEMPLATE INSTALLATION — all of it, or none of it\n`);
  await teardown();
  const c = await raw.contractor.create({
    data: { slug: SLUG, name: "Template install probe", active: false },
    select: { id: true },
  });

  try {
    const source = templateVersionSource(raw, "electrical");

    // ── preflight and preview ──────────────────────────────────────────
    const pre = await withTenant({ contractorId: c.id, source: "test" }, () =>
      preflight(guarded, c.id, source)
    );
    ok(`1. preflight passes for a contractor with no catalog`, pre.ok, pre.ok ? "" : pre.code);
    if (!pre.ok) throw new Error("preflight refused");

    console.log(`     ${pre.preview.services} services · ${pre.preview.questions} questions · ` +
      `${pre.preview.options} options · ${pre.preview.policies} policies`);
    console.log(`     ${pre.preview.unresolvedMaterialRoles.length} material role(s) this contractor has not costed`);
    ok(`2. the preview counts a real catalog`, pre.preview.services > 50 && pre.preview.options > 100);
    ok(`3. and warns that every material role is uncosted`,
      pre.preview.unresolvedMaterialRoles.length > 0);

    // ── a failure part-way writes NOTHING ──────────────────────────────
    //
    // A duplicated slug is rejected by the unique index near the end of the
    // catalog, which is exactly the shape of the failure this guards against.
    const poisoned: CanonicalCatalog = {
      ...pre.catalog,
      services: [...pre.catalog.services, pre.catalog.services[0]],
    };
    let threw = false;
    try {
      await withTenant({ contractorId: c.id, source: "test" }, () =>
        installCatalog(raw, c.id, poisoned)
      );
    } catch { threw = true; }
    const afterFailure = await raw.service.count({ where: { contractorId: c.id } });
    ok(`4. a failure part-way through refuses loudly`, threw);
    ok(`5.  and leaves ZERO services, not a partial catalog`, afterFailure === 0, `${afterFailure}`);
    ok(`6.  and no policy rows either`,
      (await raw.contractorPolicyValue.count({ where: { contractorId: c.id } })) === 0);

    // ── the real install ───────────────────────────────────────────────
    const result = await withTenant({ contractorId: c.id, source: "test" }, () =>
      installCatalog(raw, c.id, pre.catalog)
    );
    console.log(`\n     installed ${result.services} services, ${result.policies} policies, ` +
      `${result.unresolvedMaterialRoles} unresolved role(s), ` +
      `${result.disclaimersToAuthor} disclaimer(s) to author\n`);

    const services = await raw.service.findMany({ where: { contractorId: c.id } });
    ok(`7. the whole catalog landed`, services.length === pre.preview.services,
      `${services.length} of ${pre.preview.services}`);

    // ── economics stay the contractor's ────────────────────────────────
    const seeded = services.filter(
      (s) => s.basePrice !== null || s.publishedPriceApprovedAt !== null ||
             s.fieldLaborHours !== null || s.wwtLaborHours !== null ||
             s.materialCostCents !== null || s.materialMultiplier !== null ||
             s.permitAdminCents !== null || s.otherDirectCostCents !== null ||
             s.depositCents !== null
    );
    ok(`8. NOT ONE economic value was seeded`, seeded.length === 0,
      seeded.slice(0, 3).map((s) => s.slug).join(", "));
    ok(`9. nothing is live`, services.every((s) => !s.active));
    ok(`10. and nothing is offered — a catalog is possibilities, not commitments`,
      services.every((s) => !s.offered));
    ok(`11. every service records where it came from`,
      services.every((s) => s.templateVersionId !== null && s.templateKey !== null));
    // A service with NO material roles has nothing to cost, so `resolved` is
    // honest there — the claim is narrower than "everything is unresolved":
    // anything with an uncosted role must say so, and nothing may carry a
    // cached cost it was never given.
    const withRoles = services.filter((s) => s.unresolvedMaterialKeys.length > 0);
    ok(`12. every service with an uncosted role says so, and none holds a cost`,
      withRoles.length > 0 &&
        withRoles.every((s) => !s.materialCostResolved) &&
        services.every((s) => s.materialCostCents === null),
      `${withRoles.length} of ${services.length} have uncosted roles`);
    ok(`     and zero is never used to mean "not told yet"`,
      services.every((s) => s.materialCostResolved || s.unresolvedMaterialKeys.length > 0));

    const policies = await raw.contractorPolicyValue.findMany({ where: { contractorId: c.id } });
    ok(`13. every policy question is recorded unresolved`,
      policies.length > 0 && policies.every((p) => (p.boundaries as unknown[]).length === 0),
      `${policies.length}`);

    // ── installing twice is refused, not duplicated ────────────────────
    const second = await withTenant({ contractorId: c.id, source: "test" }, () =>
      preflight(guarded, c.id, source)
    );
    ok(`14. a second install is refused rather than duplicating the catalog`,
      !second.ok && second.code === "CATALOG_ALREADY_INSTALLED",
      second.ok ? "allowed" : second.code);
    ok(`15.  and the catalog is untouched by the refusal`,
      (await raw.service.count({ where: { contractorId: c.id } })) === services.length);
  } finally {
    await teardown();
  }

  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  The whole catalog, with none of the contractor's decisions made for them.\n`);
  await raw.$disconnect();
  await (guarded as PrismaClient).$disconnect();
  if (fail) process.exit(1);
}

main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
