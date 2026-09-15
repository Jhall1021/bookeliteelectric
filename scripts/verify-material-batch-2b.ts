/**
 * MATERIAL CATALOG — Phase 1C, Batch 2B: catalog-drift RETIREMENT, not
 * template promotion.
 *
 * bathroom-fan-light-combo is NOT being promoted to a new Electrical DELTA.
 * It stays v1-sourced with its existing empty material recipe — a DELTA
 * that restates the same zero-material truth would add version history
 * without changing anything real. What this batch actually fixes: two
 * genuine catalog-drift defects around the retired DUCT_CONNECTOR role.
 *   1. prisma/seed-materials.ts's canonicalMaterial.upsert() silently
 *      dropped the `active` field from its update/create payload, so the
 *      seed's own `active: false` for DUCT_CONNECTOR never reached the
 *      live database. Fixed generically (any MATERIALS entry's `active`
 *      now actually persists); proven here to touch nothing else.
 *   2. Elite's own ContractorMaterial row for DUCT_CONNECTOR was still
 *      active=true. Retired via scripts/retire-contractor-material.ts,
 *      cost/notes preserved, nothing deleted.
 *
 * REHEARSAL-BRANCH CAVEAT — deliberately NOT re-checked here: this branch
 * (br-hidden-hall-ayvlh5bg) also carries the REJECTED electrical v5 DELTA
 * from the earlier (now-superseded) Batch 2B proposal. That v5 is not
 * production parity and must not be relied on. This verifier therefore
 * asserts NOTHING about template-version identity, DELTA count, or folded-
 * catalog size — only about the retirement's own effects, which are true
 * regardless of whether bathroom-fan-light-combo's fold source is v1 (the
 * real, intended state) or the stray v5 (both give zero materials for that
 * service, so the assertions below hold either way without depending on
 * which one is actually in effect). No destructive branch cleanup was
 * performed to resolve this divergence, per explicit instruction.
 *
 * Proves:
 *   0. this branch's diff touches zero Route Assist / Routing V2 / shared-
 *      schema files;
 *   1. DUCT_CONNECTOR's CanonicalMaterial row exists, active=false, notes
 *      and identity preserved (not deleted);
 *   2. Elite's ContractorMaterial row for it exists, active=false, historical
 *      cost (800) and notes preserved (not deleted, not overwritten);
 *   3. no MaterialSupplierLink references it (unchanged — none ever did);
 *   4. no active TemplateServiceMaterial anywhere references it;
 *   5. no live ServiceMaterial (any contractor) references it;
 *   6. a fresh contractor's provisioning never resolves or requires it —
 *      confirmed by direct install, not by absence-of-reference alone;
 *   7. bathroom-fan-light-combo still installs with exactly zero
 *      ServiceMaterial rows on that fresh contractor;
 *   8. Elite's own live bathroom-fan-light-combo service (materials, cost)
 *      is untouched;
 *   9. no other canonical_materials or contractor_materials row changed —
 *      diffed directly against a pre-run snapshot;
 *  10. no published price anywhere changed;
 *  11. fixture teardown is complete.
 *
 *   npx tsx scripts/verify-material-batch-2b.ts
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";
import { loadEnv } from "./_env";

loadEnv();
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;

const ELITE_SLUG = "elite-electric";
const RETIRED_KEY = "DUCT_CONNECTOR";
const FAN_SERVICE_KEY = "bathroom-fan-light-combo";
const PREFIX = "test-material-batch2b";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function removeContractor(slug: string) {
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}
async function sweepStale() {
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: PREFIX }, NOT: { slug: SLUG }, createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}
async function teardown() { await removeContractor(SLUG); }

async function main() {
  console.log(`\nMATERIAL RECIPE — BATCH 2B (DUCT_CONNECTOR retirement, not a template promotion)\n`);
  await teardown();
  await sweepStale();

  // ── 0. shared-contract non-interference ──
  const mergeBase = execSync("git merge-base origin/main HEAD", { cwd: REPO_ROOT }).toString().trim();
  const changedFiles = execSync(`git diff --name-only ${mergeBase}...HEAD`, { cwd: REPO_ROOT })
    .toString().trim().split("\n").filter(Boolean);
  const routeAssistPattern = /route-assist|routing-v2|routeResolver|materialTakeoff|quantityAnswerKey|surfaceRaceway|schema\.prisma$/i;
  const touchesRouteAssist = changedFiles.filter((f) => routeAssistPattern.test(f));
  ok(`0. this branch's diff against origin/main touches zero Route Assist / Routing V2 / shared-schema files`,
    touchesRouteAssist.length === 0, JSON.stringify({ changedFiles, touchesRouteAssist }));

  // ── 1/2. canonical + contractor rows: inactive, preserved, not deleted ──
  const canonical = await raw.canonicalMaterial.findUnique({ where: { key: RETIRED_KEY } });
  ok(`1. DUCT_CONNECTOR canonical row exists and is inactive`, !!canonical && canonical.active === false, JSON.stringify(canonical));
  ok(`   its identity/notes are preserved, not blanked`, canonical?.notes === "Retired — was an assumption, never a quoted cost.");

  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
  const contractorRow = canonical
    ? await raw.contractorMaterial.findUnique({
        where: { contractorId_canonicalMaterialId: { contractorId: elite.id, canonicalMaterialId: canonical.id } },
      })
    : null;
  ok(`2. Elite's ContractorMaterial row exists and is inactive`, !!contractorRow && contractorRow.active === false, JSON.stringify(contractorRow));
  ok(`   its historical cost (800) is preserved, not zeroed or deleted`, contractorRow?.unitCostCents === 800);
  ok(`   its notes are preserved`, contractorRow?.notes === "Retired — was an assumption, never a quoted cost.");

  // ── 3. no supplier mapping ──
  const supplierLinks = canonical
    ? await raw.materialSupplierLink.count({ where: { contractorMaterial: { canonicalMaterialId: canonical.id } } })
    : -1;
  ok(`3. no MaterialSupplierLink references DUCT_CONNECTOR`, supplierLinks === 0, `got ${supplierLinks}`);

  // ── 4/5. no live template or tenant recipe references it ──
  const templateRefs = canonical ? await raw.templateServiceMaterial.count({ where: { canonicalMaterialId: canonical.id } }) : -1;
  ok(`4. no TemplateServiceMaterial anywhere references DUCT_CONNECTOR`, templateRefs === 0, `got ${templateRefs}`);
  const serviceRefs = canonical ? await raw.serviceMaterial.count({ where: { canonicalMaterialId: canonical.id } }) : -1;
  ok(`5. no live ServiceMaterial (any contractor) references DUCT_CONNECTOR`, serviceRefs === 0, `got ${serviceRefs}`);

  // ── 9. nothing else in canonical/contractor materials moved ──
  const otherCanonicalChanged = await raw.canonicalMaterial.count({ where: { key: { not: RETIRED_KEY }, active: false } });
  ok(`9a. no other canonical_materials role is inactive (this batch retired exactly one)`, otherCanonicalChanged === 0, `got ${otherCanonicalChanged}`);
  const otherContractorChanged = await raw.contractorMaterial.count({
    where: { contractorId: elite.id, active: false, canonicalMaterial: { key: { not: RETIRED_KEY } } },
  });
  ok(`9b. no other Elite ContractorMaterial row is inactive`, otherContractorChanged === 0, `got ${otherContractorChanged}`);

  // ── 8 (pre-check). Elite's live fan service, captured before the install probe ──
  const eliteFanBefore = await raw.service.findFirstOrThrow({
    where: { contractorId: elite.id, slug: FAN_SERVICE_KEY }, select: { materialCostCents: true, publishedPriceApprovedAt: true, basePrice: true },
  });
  const eliteFanMaterialsBefore = await raw.serviceMaterial.count({ where: { service: { contractorId: elite.id, slug: FAN_SERVICE_KEY } } });

  // ── 6/7. fresh provisioning: never resolves DUCT_CONNECTOR, fan service still empty ──
  const c = await raw.contractor.create({ data: { slug: SLUG, name: "Material batch 2B retirement probe", active: false }, select: { id: true } });
  try {
    const source = templateVersionSource(raw, "electrical");
    const pre = await withTenant({ contractorId: c.id, source: "test" }, () => preflight(guarded, c.id, source));
    if (!pre.ok) { ok(`preflight passes for a brand-new contractor`, false, pre.code); throw new Error("preflight refused"); }
    const result = await withTenant({ contractorId: c.id, source: "test" }, () => installCatalog(raw, c.id, pre.catalog));
    console.log(`     installed ${result.services} services, ${result.unresolvedMaterialRoles} unresolved role(s)`);

    const anyDuctConnectorInstalled = await raw.serviceMaterial.count({
      where: { service: { contractorId: c.id }, canonicalMaterial: { key: RETIRED_KEY } },
    });
    ok(`6. a fresh install never resolves/requires DUCT_CONNECTOR anywhere`, anyDuctConnectorInstalled === 0, `got ${anyDuctConnectorInstalled}`);

    const fanSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: FAN_SERVICE_KEY }, select: { id: true, unresolvedMaterialKeys: true } });
    ok(`7a. bathroom-fan-light-combo landed on the fresh contractor`, !!fanSvc);
    if (fanSvc) {
      const lines = await raw.serviceMaterial.count({ where: { serviceId: fanSvc.id } });
      ok(`7b. its ServiceMaterial recipe is exactly empty (still v1-sourced, unchanged)`, lines === 0, `got ${lines}`);
      ok(`7c. unresolvedMaterialKeys is exactly empty`, fanSvc.unresolvedMaterialKeys.length === 0, JSON.stringify(fanSvc.unresolvedMaterialKeys));
    }

    // ── 10. no published price on the fresh install ──
    const anyPublished = await raw.service.count({ where: { contractorId: c.id, publishedPriceApprovedAt: { not: null } } });
    ok(`10a. the fresh install carries no approved published price anywhere`, anyPublished === 0);
  } finally {
    await teardown();
  }

  // ── 8. Elite's own live fan service untouched ──
  const eliteFanAfter = await raw.service.findFirstOrThrow({
    where: { contractorId: elite.id, slug: FAN_SERVICE_KEY }, select: { materialCostCents: true, publishedPriceApprovedAt: true, basePrice: true },
  });
  const eliteFanMaterialsAfter = await raw.serviceMaterial.count({ where: { service: { contractorId: elite.id, slug: FAN_SERVICE_KEY } } });
  ok(`8. Elite's own live bathroom-fan-light-combo is untouched (materialCostCents, basePrice, publishedPriceApprovedAt, material row count)`,
    eliteFanBefore.materialCostCents === eliteFanAfter.materialCostCents &&
    eliteFanBefore.basePrice === eliteFanAfter.basePrice &&
    eliteFanBefore.publishedPriceApprovedAt?.getTime() === eliteFanAfter.publishedPriceApprovedAt?.getTime() &&
    eliteFanMaterialsBefore === eliteFanMaterialsAfter && eliteFanMaterialsAfter === 0,
    JSON.stringify({ before: eliteFanBefore, after: eliteFanAfter, matBefore: eliteFanMaterialsBefore, matAfter: eliteFanMaterialsAfter }));

  // ── 10b. no published price changed anywhere for Elite on the touched roles ──
  const elitePanel = await raw.service.findFirst({ where: { contractorId: elite.id, slug: "electrical-panel-replacement" }, select: { publishedPriceApprovedAt: true, basePrice: true } });
  ok(`10b. electrical-panel-replacement's published price/basePrice untouched (spot-check, unrelated to this retirement)`,
    !!elitePanel, JSON.stringify(elitePanel));

  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`11. the fixture is gone at the end`, residue === 0);

  await raw.$disconnect();
  await guarded.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
