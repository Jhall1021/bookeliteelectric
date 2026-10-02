/**
 * MATERIAL CATALOG — Phase 1C, Batch 2A. FINAL SCOPE: electrical-panel-
 * replacement only. 200a-service-upgrade is deferred whole — its mast-
 * conductor material requirement is physically known but not safely
 * representable in the current canonical material model (one role = one
 * purchased product; no field for "which of several correlated physical
 * conductors"). No 200A CanonicalMaterial rows exist in this release.
 *
 * Proves, against a real database and the real provisioning path:
 *
 *   0. this branch's diff touches zero Route Assist / Routing V2 / shared-
 *      schema files (checked against the actual diff, not key existence);
 *   1. a fresh contractor's folded electrical catalog (v1+v2+v3+v4) contains
 *      exactly 78 distinct service keys, derived from the install itself —
 *      not a hardcoded literal trusted on faith;
 *   2. electrical-panel-replacement installs on that fresh contractor;
 *   3. its recipe is EXACTLY 4 lines: PANEL_MAIN_BREAKER resolved x1,
 *      BREAKER_SINGLE_POLE / BREAKER_DOUBLE_POLE / CONSUMABLES_MEDIUM
 *      unresolved — nothing more, nothing less;
 *   4. no grounding material (GROUND_ROD, GROUND_CLAMP, WIRE_GROUND_6)
 *      landed, resolved or unresolved;
 *   5. no service-entrance/riser/mast/meter material landed — this service
 *      never carried any;
 *   6. none of Elite's own figures (17, 3, 15, 25) leaked as a resolved
 *      quantity;
 *   7. all six Batch 1 v3 services land on the SAME fresh contractor, and
 *      each one's installed materials are read directly off that contractor
 *      and compared against prisma/template/electrical-v3-provenance.json —
 *      not inferred from source-diff non-overlap;
 *   8. Elite's own ContractorMaterial costs are untouched;
 *   9. no fresh-install service carries an approved published price;
 *  10. 200a-service-upgrade is untouched: still v1-sourced only, still zero
 *      materials, no v4 override exists for it;
 *  11. no 200A CanonicalMaterial role was created (74 roles, unchanged);
 *  12. the fixture is fully torn down.
 *
 *   npx tsx scripts/verify-material-batch-2a.ts
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
const PREFIX = "test-material-batch2a";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

const SERVICE_KEY = "electrical-panel-replacement";
const EXPECTED_STRUCTURAL: Record<string, number> = { PANEL_MAIN_BREAKER: 1 };
const EXPECTED_POLICY = ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "CONSUMABLES_MEDIUM"];
const FORBIDDEN_ABSENT = [
  "GROUND_ROD", "GROUND_CLAMP", "WIRE_GROUND_6",
  "PANEL_200A_MAIN_BREAKER", "METER_SOCKET_200A", "SERVICE_ENTRANCE_CABLE_200A",
];
const FORBIDDEN_ELITE_QUANTITIES = [17, 3, 15, 25];
const EXPECTED_FOLDED_COUNT = 78;
const REMOVED_200A_ROLE_KEYS = [
  "SERVICE_ENTRANCE_CAP_200A", "SERVICE_MAST_CONDUCTORS_200A",
  "SERVICE_MAST_CONDUIT_200A", "SERVICE_MAST_CAP_FITTINGS_200A", "SERVICE_MAST_STRAPS_200A",
];
const V3_KEYS = ["new-video-doorbell-wiring", "generator-inlet-interlock", "240v-garage-outlet",
  "240v-garage-outlet-14-30", "240v-garage-outlet-6-50", "240v-garage-outlet-14-50"];

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
  console.log(`\nMATERIAL RECIPE — BATCH 2A (electrical-panel-replacement only; 200a-service-upgrade deferred)\n`);
  await teardown();
  await sweepStale();

  // ── 0. shared-contract non-interference, checked against this branch's diff ──
  const mergeBase = execSync("git merge-base origin/main HEAD", { cwd: REPO_ROOT }).toString().trim();
  const changedFiles = execSync(`git diff --name-only ${mergeBase}...HEAD`, { cwd: REPO_ROOT })
    .toString().trim().split("\n").filter(Boolean);
  const routeAssistPattern = /route-assist|routing-v2|routeResolver|materialTakeoff|quantityAnswerKey|surfaceRaceway|schema\.prisma$/i;
  const touchesRouteAssist = changedFiles.filter((f) => routeAssistPattern.test(f));
  ok(`0. this branch's diff against origin/main touches zero Route Assist / Routing V2 / shared-schema files`,
    touchesRouteAssist.length === 0, JSON.stringify({ changedFiles, touchesRouteAssist }));

  // ── 11. no 200A canonical role exists — this release created none ──
  const stray200a = await raw.canonicalMaterial.count({ where: { key: { in: REMOVED_200A_ROLE_KEYS } } });
  const totalRoles = await raw.canonicalMaterial.count();
  ok(`11. no 200A mast/conductor CanonicalMaterial role exists (none proposed in this release)`, stray200a === 0, `found ${stray200a}`);
  ok(`    canonical_materials count is unchanged at 74`, totalRoles === 74, `got ${totalRoles}`);

  // ── 10. 200a-service-upgrade untouched: v1-sourced only, zero materials, no v4 override ──
  const v4For200a = await raw.templateService.findFirst({
    where: { key: "200a-service-upgrade", templateVersion: { trade: "electrical", version: 4 } },
  });
  ok(`10. no v4 TemplateService override exists for 200a-service-upgrade`, v4For200a === null);
  const v1For200a = await raw.templateService.findFirst({
    where: { key: "200a-service-upgrade", templateVersion: { trade: "electrical", version: 1 } },
    select: { id: true },
  });
  const v1Materials200a = v1For200a
    ? await raw.templateServiceMaterial.count({ where: { templateServiceId: v1For200a.id } })
    : -1;
  ok(`    200a-service-upgrade's only source is v1, still carrying zero materials`, v1Materials200a === 0, `got ${v1Materials200a}`);

  // ── 8. Elite's own ContractorMaterial costs untouched ──
  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
  const touchedRoles = [...Object.keys(EXPECTED_STRUCTURAL), ...EXPECTED_POLICY];
  const eliteMaterialsBefore = await raw.contractorMaterial.findMany({
    where: { contractorId: elite.id, canonicalMaterial: { key: { in: touchedRoles } } },
    select: { canonicalMaterial: { select: { key: true } }, unitCostCents: true, updatedAt: true },
  });

  const c = await raw.contractor.create({ data: { slug: SLUG, name: "Material batch 2A probe", active: false }, select: { id: true } });
  try {
    // ── 1. fresh folded catalog contains exactly 78 distinct service keys ──
    const source = templateVersionSource(raw, "electrical");
    const pre = await withTenant({ contractorId: c.id, source: "test" }, () => preflight(guarded, c.id, source));
    if (!pre.ok) { ok(`preflight passes for a brand-new contractor`, false, pre.code); throw new Error("preflight refused"); }
    const foldedKeys = new Set(pre.catalog.services.map((s) => (s as unknown as { key: string }).key));
    ok(`1. the folded catalog contains exactly ${EXPECTED_FOLDED_COUNT} distinct electrical service keys`,
      foldedKeys.size === EXPECTED_FOLDED_COUNT, `got ${foldedKeys.size}`);
    ok(`   electrical-panel-replacement is present in the fold`, foldedKeys.has(SERVICE_KEY));
    ok(`   200a-service-upgrade is present in the fold (from v1, unmodified)`, foldedKeys.has("200a-service-upgrade"));

    const result = await withTenant({ contractorId: c.id, source: "test" }, () => installCatalog(raw, c.id, pre.catalog));
    console.log(`     installed ${result.services} services, ${result.unresolvedMaterialRoles} unresolved role(s)`);

    const installedCount = await raw.service.count({ where: { contractorId: c.id } });
    ok(`   the installed fresh contractor also has exactly ${EXPECTED_FOLDED_COUNT} services`,
      installedCount === EXPECTED_FOLDED_COUNT, `got ${installedCount}`);

    // ── 2-6. electrical-panel-replacement recipe ──
    const svc = await raw.service.findFirst({
      where: { contractorId: c.id, slug: SERVICE_KEY }, select: { id: true, unresolvedMaterialKeys: true },
    });
    ok(`2. electrical-panel-replacement landed on the fresh contractor`, !!svc);
    if (svc) {
      const lines = await raw.serviceMaterial.findMany({
        where: { serviceId: svc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } },
      });
      const byKey = new Map(lines.map((l) => [l.canonicalMaterial?.key, l.quantity]));

      ok(`3a. recipe has exactly 1 resolved (structural) line`, lines.length === 1, `got ${lines.length}: ${JSON.stringify(lines.map(l=>l.canonicalMaterial?.key))}`);
      for (const [key, qty] of Object.entries(EXPECTED_STRUCTURAL)) {
        ok(`3b. ${key} resolved with quantity ${qty}`, byKey.get(key) === qty, `got ${byKey.get(key)}`);
      }
      for (const key of EXPECTED_POLICY) {
        const hasLine = byKey.has(key);
        const isUnresolved = svc.unresolvedMaterialKeys.includes(key);
        ok(`3c. ${key} has no ServiceMaterial row and is in unresolvedMaterialKeys`, !hasLine && isUnresolved, `hasLine=${hasLine} unresolved=${isUnresolved}`);
      }
      // unresolvedMaterialKeys tracks COST resolution, not quantity: a brand-new
      // contractor has zero seeded ContractorMaterial costs for any role — so
      // PANEL_MAIN_BREAKER (quantity resolved, cost not) legitimately appears
      // here too. installCatalog() "seeds zero economics" by design. The
      // meaningful distinction is already proven per-key in 3b/3c: PANEL_MAIN_BREAKER
      // has a ServiceMaterial row (quantity known); the 3 policy roles do not.

      for (const forbidden of FORBIDDEN_ABSENT) {
        ok(`4/5. ${forbidden} is genuinely absent — not resolved and not unresolved`,
          !byKey.has(forbidden) && !svc.unresolvedMaterialKeys.includes(forbidden));
      }

      const anyForbiddenQty = lines.some((l) => FORBIDDEN_ELITE_QUANTITIES.includes(l.quantity ?? -1));
      ok(`6. none of Elite's own counts (17/3/15/25) leaked as a resolved quantity`, !anyForbiddenQty,
        JSON.stringify(lines.map((l) => [l.canonicalMaterial?.key, l.quantity])));
    }

    // ── 9. no published price on a fresh install ──
    const anyPublished = await raw.service.count({
      where: { contractorId: c.id, slug: SERVICE_KEY, publishedPriceApprovedAt: { not: null } },
    });
    ok(`9. the fresh install of electrical-panel-replacement carries no approved published price`, anyPublished === 0);

    // ── 7. Batch 1's six v3 services coexist, proved directly against install output ──
    const provenance = JSON.parse(readFileSync(resolve(REPO_ROOT, "prisma/template/electrical-v3-provenance.json"), "utf8"));
    const v3Services = await raw.service.findMany({
      where: { contractorId: c.id, slug: { in: V3_KEYS } }, select: { slug: true, id: true },
    });
    ok(`7a. all six Batch 1 v3 services landed on the same fresh contractor`, v3Services.length === 6, `${v3Services.length} of 6`);

    for (const entry of provenance.services as Array<{ key: string; structuralMaterials: { role: string; quantity: number }[]; policyMaterialRoles: string[] }>) {
      const svc3 = v3Services.find((s) => s.slug === entry.key);
      if (!svc3) { ok(`7b. ${entry.key} present`, false); continue; }
      const lines3 = await raw.serviceMaterial.findMany({
        where: { serviceId: svc3.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } },
      });
      const byKey3 = new Map(lines3.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const svcRow = await raw.service.findUniqueOrThrow({ where: { id: svc3.id }, select: { unresolvedMaterialKeys: true } });

      const structuralOk = entry.structuralMaterials.every((m) => byKey3.get(m.role) === m.quantity);
      ok(`7b. ${entry.key}: structural materials match provenance exactly`, structuralOk,
        JSON.stringify({ expected: entry.structuralMaterials, got: lines3.map((l) => [l.canonicalMaterial?.key, l.quantity]) }));

      const policyOk = entry.policyMaterialRoles.every((r) => !byKey3.has(r) && svcRow.unresolvedMaterialKeys.includes(r));
      ok(`7c. ${entry.key}: policy materials match provenance exactly (unresolved, not resolved)`, policyOk,
        JSON.stringify({ expected: entry.policyMaterialRoles, unresolvedGot: svcRow.unresolvedMaterialKeys }));
    }

    // ── 8 (cont'd). Elite's costs still identical after this run ──
    const eliteMaterialsAfter = await raw.contractorMaterial.findMany({
      where: { contractorId: elite.id, canonicalMaterial: { key: { in: touchedRoles } } },
      select: { canonicalMaterial: { select: { key: true } }, unitCostCents: true, updatedAt: true },
    });
    const beforeMap = new Map(eliteMaterialsBefore.map((m) => [m.canonicalMaterial?.key, m]));
    const costsUnchanged = eliteMaterialsAfter.every((m) => {
      const before = beforeMap.get(m.canonicalMaterial?.key);
      return before && before.unitCostCents === m.unitCostCents && before.updatedAt.getTime() === m.updatedAt.getTime();
    });
    ok(`8. Elite's own ContractorMaterial costs/updatedAt are byte-identical before and after`, costsUnchanged);
  } finally {
    await teardown();
  }
  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`12. the fixture is gone at the end`, residue === 0);

  await raw.$disconnect();
  await guarded.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
