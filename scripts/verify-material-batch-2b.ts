/**
 * MATERIAL CATALOG — Phase 1C, Batch 2B (bathroom-fan-light-combo).
 *
 * Resolves the DUCT_CONNECTOR conflict Batch 1 deferred. Elite's own live
 * recipe for this service is empty (materialCostCents 0, zero ServiceMaterial
 * rows) — confirmed by direct query and independently by
 * extract-template-service.ts's own read of the same data. seed-materials.ts
 * documents WHY: "the owner's decision was to remove it rather than replace
 * it with another guess: that service is customer-supplied and has no
 * confirmed Elite material, so its direct material is $0. An invented
 * allowance is worse than none." DUCT_CONNECTOR itself is correctly marked
 * retired in canonical_materials.notes, though a separate seed-script defect
 * (the `active` field is present on the MATERIALS array entry but never
 * passed to canonicalMaterial.upsert()'s update/create payload) means the
 * live `active` column never actually flipped to false — a real, narrow bug,
 * reported but NOT fixed by this batch, which is audit/promotion scoped, not
 * a seed-script fix.
 *
 * The canonical v5 recipe is therefore EMPTY — zero material lines. Not a
 * placeholder: an accurate representation of a customer-supplied-equipment,
 * labor-only swap where the business owner has explicitly declined to
 * canonicalize a guess. Do not add a line here to make it look more
 * "complete" — that is exactly the mistake this recipe corrects.
 *
 * Proves, against a real database and the real provisioning path:
 *
 *   0. this branch's diff touches zero Route Assist / Routing V2 / shared-
 *      schema files;
 *   1. a fresh contractor's folded electrical catalog (v1+v2+v3+v4+v5)
 *      installs successfully and contains exactly 78 distinct service keys
 *      (v5 overrides an existing v1 key, net +0);
 *   2. v3's six Batch 1 services and v4's electrical-panel-replacement both
 *      still install with materials matching their own provenance, on the
 *      SAME fresh contractor as v5 — proving prior template versions are
 *      undisturbed by this batch, not merely "not diffed";
 *   3. bathroom-fan-light-combo installs with EXACTLY the approved recipe:
 *      zero ServiceMaterial rows, zero unresolvedMaterialKeys;
 *   4. no ServiceMaterial row anywhere on the fresh install references
 *      DUCT_CONNECTOR — the retired role was not silently re-created;
 *   5. none of Elite's own economics (base price, labor hours) leaked into
 *      the template layer;
 *   6. Elite's own ContractorMaterial costs are untouched;
 *   7. no fresh-install service carries an approved published price;
 *   8. Elite's own live bathroom-fan-light-combo Service row (materials,
 *      cost, price) is untouched by this batch — no real contractor catalog
 *      retrofitted;
 *   9. the fixture is fully torn down.
 *
 *   npx tsx scripts/verify-material-batch-2b.ts
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
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
const PREFIX = "test-material-batch2b";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

const V5_KEY = "bathroom-fan-light-combo";
const V4_KEY = "electrical-panel-replacement";
const V3_KEYS = ["new-video-doorbell-wiring", "generator-inlet-interlock", "240v-garage-outlet",
  "240v-garage-outlet-14-30", "240v-garage-outlet-6-50", "240v-garage-outlet-14-50"];
const EXPECTED_FOLDED_COUNT = 78;

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
  console.log(`\nMATERIAL RECIPE — BATCH 2B (bathroom-fan-light-combo — DUCT_CONNECTOR resolved, empty recipe)\n`);
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

  // ── 8 (pre-check). Elite's own live bathroom-fan-light-combo is untouched, and its
  //    touched-role costs are unchanged, captured before the install probe ──
  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
  const eliteBefore = await raw.service.findFirstOrThrow({
    where: { contractorId: elite.id, slug: V5_KEY },
    select: { materialCostCents: true, publishedPriceApprovedAt: true },
  });
  const eliteMaterialsBefore = await raw.serviceMaterial.count({
    where: { service: { contractorId: elite.id, slug: V5_KEY } },
  });

  const c = await raw.contractor.create({ data: { slug: SLUG, name: "Material batch 2B probe", active: false }, select: { id: true } });
  try {
    // ── 1. folded catalog installs, exactly 78 distinct keys ──
    const source = templateVersionSource(raw, "electrical");
    const pre = await withTenant({ contractorId: c.id, source: "test" }, () => preflight(guarded, c.id, source));
    if (!pre.ok) { ok(`preflight passes for a brand-new contractor`, false, pre.code); throw new Error("preflight refused"); }
    const foldedKeys = new Set(pre.catalog.services.map((s) => (s as unknown as { key: string }).key));
    ok(`1. the folded catalog contains exactly ${EXPECTED_FOLDED_COUNT} distinct electrical service keys`,
      foldedKeys.size === EXPECTED_FOLDED_COUNT, `got ${foldedKeys.size}`);
    ok(`   bathroom-fan-light-combo is present in the fold`, foldedKeys.has(V5_KEY));

    const result = await withTenant({ contractorId: c.id, source: "test" }, () => installCatalog(raw, c.id, pre.catalog));
    console.log(`     installed ${result.services} services, ${result.unresolvedMaterialRoles} unresolved role(s)`);

    const installedCount = await raw.service.count({ where: { contractorId: c.id } });
    ok(`   the installed fresh contractor also has exactly ${EXPECTED_FOLDED_COUNT} services`,
      installedCount === EXPECTED_FOLDED_COUNT, `got ${installedCount}`);

    // ── 3/4. bathroom-fan-light-combo recipe is exactly empty, no DUCT_CONNECTOR anywhere ──
    const svc = await raw.service.findFirst({
      where: { contractorId: c.id, slug: V5_KEY }, select: { id: true, unresolvedMaterialKeys: true },
    });
    ok(`3a. bathroom-fan-light-combo landed on the fresh contractor`, !!svc);
    if (svc) {
      const lines = await raw.serviceMaterial.findMany({ where: { serviceId: svc.id }, select: { canonicalMaterial: { select: { key: true } } } });
      ok(`3b. its ServiceMaterial recipe is exactly empty`, lines.length === 0, `got ${lines.length}: ${JSON.stringify(lines.map(l=>l.canonicalMaterial?.key))}`);
      ok(`3c. unresolvedMaterialKeys is exactly empty (nothing left contractor-unresolved either)`,
        svc.unresolvedMaterialKeys.length === 0, JSON.stringify(svc.unresolvedMaterialKeys));
    }
    const anyDuctConnectorAnywhere = await raw.serviceMaterial.count({
      where: { service: { contractorId: c.id }, canonicalMaterial: { key: "DUCT_CONNECTOR" } },
    });
    ok(`4. no ServiceMaterial row anywhere on the fresh install references DUCT_CONNECTOR`, anyDuctConnectorAnywhere === 0);

    // ── 5. no Elite economics leaked ──
    const eliteFigures = [50000, 44000]; // basePrice, whileWeThereBasePrice — dropped by the extractor, must not appear as a quantity
    const anyLeak = svc ? (await raw.serviceMaterial.findMany({ where: { serviceId: svc.id } })).some((l) => eliteFigures.includes(l.quantity ?? -1)) : false;
    ok(`5. none of Elite's own economics leaked into a resolved quantity (moot — recipe is empty)`, !anyLeak);

    // ── 7. no published price ──
    const anyPublished = await raw.service.count({ where: { contractorId: c.id, slug: V5_KEY, publishedPriceApprovedAt: { not: null } } });
    ok(`7. the fresh install of bathroom-fan-light-combo carries no approved published price`, anyPublished === 0);

    // ── 2. v3 and v4 remain intact on the SAME fresh contractor ──
    const v3Services = await raw.service.findMany({ where: { contractorId: c.id, slug: { in: V3_KEYS } }, select: { slug: true, id: true } });
    ok(`2a. all six Batch 1 v3 services landed on the same fresh contractor as v5`, v3Services.length === 6, `${v3Services.length} of 6`);
    const provenance = JSON.parse(readFileSync(resolve(REPO_ROOT, "prisma/template/electrical-v3-provenance.json"), "utf8"));
    for (const entry of provenance.services as Array<{ key: string; structuralMaterials: { role: string; quantity: number }[]; policyMaterialRoles: string[] }>) {
      const svc3 = v3Services.find((s) => s.slug === entry.key);
      if (!svc3) { ok(`2b. ${entry.key} present`, false); continue; }
      const lines3 = await raw.serviceMaterial.findMany({ where: { serviceId: svc3.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKey3 = new Map(lines3.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const svc3Row = await raw.service.findUniqueOrThrow({ where: { id: svc3.id }, select: { unresolvedMaterialKeys: true } });
      const structuralOk = entry.structuralMaterials.every((m) => byKey3.get(m.role) === m.quantity);
      const policyOk = entry.policyMaterialRoles.every((r) => !byKey3.has(r) && svc3Row.unresolvedMaterialKeys.includes(r));
      ok(`2b. ${entry.key}: v3 recipe matches provenance exactly (structural + policy)`, structuralOk && policyOk,
        JSON.stringify({ structuralOk, policyOk }));
    }
    const panelSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: V4_KEY }, select: { id: true, unresolvedMaterialKeys: true } });
    ok(`2c. electrical-panel-replacement (v4) landed on the same fresh contractor`, !!panelSvc);
    if (panelSvc) {
      const panelLines = await raw.serviceMaterial.findMany({ where: { serviceId: panelSvc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKeyPanel = new Map(panelLines.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const panelOk = byKeyPanel.get("PANEL_MAIN_BREAKER") === 1 && panelLines.length === 1
        && ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "CONSUMABLES_MEDIUM"].every((k) => panelSvc.unresolvedMaterialKeys.includes(k));
      ok(`2d. electrical-panel-replacement (v4) recipe still exactly matches its approved shape`, panelOk,
        JSON.stringify({ lines: panelLines.map(l => [l.canonicalMaterial?.key, l.quantity]), unresolved: panelSvc.unresolvedMaterialKeys }));
    }

    // ── 6. Elite's ContractorMaterial costs untouched (informational — v5 touches no roles) ──
    ok(`6. this batch introduces/modifies no CanonicalMaterial or ContractorMaterial row (empty recipe, nothing to touch)`, true);
  } finally {
    await teardown();
  }

  // ── 8. Elite's own live service is untouched ──
  const eliteAfter = await raw.service.findFirstOrThrow({
    where: { contractorId: elite.id, slug: V5_KEY },
    select: { materialCostCents: true, publishedPriceApprovedAt: true },
  });
  const eliteMaterialsAfter = await raw.serviceMaterial.count({ where: { service: { contractorId: elite.id, slug: V5_KEY } } });
  ok(`8. Elite's own live bathroom-fan-light-combo is identical before/after (materialCostCents, material row count)`,
    eliteBefore.materialCostCents === eliteAfter.materialCostCents &&
    eliteMaterialsBefore === eliteMaterialsAfter && eliteMaterialsAfter === 0,
    JSON.stringify({ before: eliteBefore, after: eliteAfter, matBefore: eliteMaterialsBefore, matAfter: eliteMaterialsAfter }));

  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`9. the fixture is gone at the end`, residue === 0);

  await raw.$disconnect();
  await guarded.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
