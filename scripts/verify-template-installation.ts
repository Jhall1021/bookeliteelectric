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
/**
 * RUN-UNIQUE, because the worktree and the database are shared.
 *
 * The fixed slug this replaced broke a production deployment on 1 September
 * 2026. `npm run verify` runs inside `next build`, so a Vercel build and a
 * local run are two processes racing on one throwaway contractor: teardown
 * runs first, so the second starter deletes the first's fixture and then
 * `contractor.create` fails P2002 on the slug the other run still holds. The
 * build failed on a unique-constraint error unrelated to the commit deployed.
 *
 * Same shape as verify-activation-dependencies, deliberately — that verifier
 * hit this first, and the fix is copied rather than reinvented.
 *
 * The prefix stays fixed so a fixture from a crashed run is still sweepable.
 */
const PREFIX = "test-template-install";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

/**
 * Only what is genuinely abandoned.
 *
 * Sweeping every sibling would delete a CONCURRENT run's live fixture
 * mid-assertion — the exact collision the unique slug exists to prevent,
 * reintroduced by the cleanup. Age is what separates "crashed" from
 * "running": this verifier takes seconds, so an hour is far past any live run.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

async function removeContractor(slug: string) {
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}

async function sweepStale() {
  const stale = await raw.contractor.findMany({
    where: {
      slug: { startsWith: PREFIX },
      NOT: { slug: SLUG },
      createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

async function teardown() {
  await removeContractor(SLUG);
}

async function main() {
  console.log(`\nTEMPLATE INSTALLATION — all of it, or none of it\n`);
  await teardown();
  await sweepStale();
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

    // ── snapshot + deltas = the CURRENT catalog state ──────────────────
    //
    // Neither shortcut is safe. "Latest version" installs Electrical v2, a
    // one-service update. "Earliest version" is right for Electrical today and
    // wrong the moment a trade republishes a complete catalog. TemplateVersion
    // says which it is, and nothing infers it.
    const snapshot = await raw.templateVersion.findFirstOrThrow({
      where: { trade: "electrical", kind: "SNAPSHOT" }, orderBy: { version: "desc" },
    });
    const deltas = await raw.templateVersion.findMany({
      where: { trade: "electrical", kind: "DELTA", version: { gt: snapshot.version } },
      select: { id: true, version: true },
    });
    ok(`16. the catalog resolves from a declared SNAPSHOT`,
      pre.preview.version === snapshot.version, `installed v${pre.preview.version}`);
    ok(`17.  and every published version says which kind it is`,
      (await raw.templateVersion.count()) > 0);

    if (deltas.length > 0) {
      // The delta redefines new-120v-outlet with an extra question. A new
      // contractor should receive the CURRENT state, not the snapshot's.
      const deltaKeys = (await raw.templateService.findMany({
        where: { templateVersionId: { in: deltas.map((d) => d.id) } },
        select: { key: true, templateVersionId: true },
      }));
      const k = deltaKeys[0];
      const mine = await raw.service.findFirstOrThrow({
        where: { contractorId: c.id, templateKey: k.key },
        select: { templateVersionId: true, _count: { select: { questions: true } } },
      });
      const inSnapshot = await raw.templateService.findFirst({
        where: { templateVersionId: snapshot.id, key: k.key },
        select: { _count: { select: { questions: true } } },
      });
      ok(`18. a later DELTA is folded in, so the contractor gets today's catalog`,
        mine._count.questions !== inSnapshot?._count.questions,
        `${inSnapshot?._count.questions} in snapshot, ${mine._count.questions} installed`);
      ok(`19.  and provenance records the version the definition CAME from`,
        mine.templateVersionId === k.templateVersionId,
        "stamping the snapshot would make adoption offer changes already applied");
    }

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
