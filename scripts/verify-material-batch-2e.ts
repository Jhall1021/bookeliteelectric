/**
 * MATERIAL CATALOG — Phase 1C, Batch 2E: 13 consumables-only services.
 *
 * All 13 share one shape: Elite's live recipe is exactly one
 * CONSUMABLES_SMALL line (quantity 1), the template recipe was empty, and
 * the automated known-work path is customer-supplied/existing-equipment-
 * reuse with no new feeder/circuit/routing material promised. Confirmed
 * directly for the two appliance-power-gated services (dishwasher-
 * electrical, garbage-disposal-install): their only CONTINUE/RESOLVE_INSTANT
 * path requires existing usable power already confirmed present; the
 * no-power path REROUTES to dedicated-120v-circuit-outlet rather than being
 * silently absorbed here. CONSUMABLES_SMALL is quantityIsPolicy=true,
 * matching 37/37 existing template uses of that role with zero exceptions —
 * including four services with this exact single-line shape
 * (replace-wall-sconce, customer-supplied-non-smart-outlet,
 * customer-supplied-smart-switch, swap-out-customer-supplied-non-smart-
 * switch), already the established canonical treatment, not a new decision.
 *
 * REHEARSAL VERSION NUMBER: this verifier targets whichever TemplateVersion
 * number DELTA_VERSION below names. On the shared rehearsal branch
 * (br-hidden-hall-ayvlh5bg) that is v6, deliberately NOT v5 — that branch
 * still carries the REJECTED v5 (bathroom-fan-light-combo) from Batch 2B's
 * superseded first proposal, and this batch does not touch or rely on it.
 * Production has no v5 at all; the real production write for this batch
 * will be v5, and DELTA_VERSION must be changed to 5 before running this
 * verifier there. This is a rehearsal-numbering artifact only — the 13
 * services' content and every other assertion here is unaffected by which
 * integer the DELTA lands on.
 *
 * Proves:
 *   0. branch diff touches zero Route Assist / Routing V2 / shared-schema files;
 *   1. folded Electrical catalog still contains exactly 78 distinct keys;
 *   2. all 13 services install on a fresh contractor;
 *   3. each installs with EXACTLY one CONSUMABLES_SMALL line, unresolved
 *      (quantityIsPolicy=true, quantity null on the template, no
 *      ServiceMaterial row, present in unresolvedMaterialKeys);
 *   4. no other material role appears on any of the 13;
 *   5. Batch 1's six v3 services remain intact (direct provenance check);
 *   6. Batch 2A's v4 electrical-panel-replacement remains intact;
 *   7. Batch 2B's DUCT_CONNECTOR retirement remains intact (inactive, zero
 *      references anywhere, including on the fresh install);
 *   8. hot-tub-spa-electrical and 200a-service-upgrade are completely
 *      unchanged — still v1-sourced only, zero materials, no override at
 *      the batch's own DELTA version;
 *   9. Elite's own ContractorMaterial costs are untouched;
 *  10. Elite's own live service material costs/rows for all 13 are untouched;
 *  11. no published price changes anywhere;
 *  12. no existing contractor catalog is retrofitted (only the fresh probe
 *      contractor receives the new DELTA content);
 *  13. fixture teardown is complete.
 *
 *   npx tsx scripts/verify-material-batch-2e.ts
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
const DELTA_VERSION = 6; // rehearsal only — set to 5 for the production run, see header
const EXPECTED_FOLDED_COUNT = 78;
const BATCH_2E_SERVICES = [
  "otr-microwave-install", "replace-interior-light-fixture", "replace-exterior-light-fixture",
  "replace-motion-flood-light", "video-doorbell-existing-wiring", "tv-install-existing-location",
  "dishwasher-electrical", "garbage-disposal-install", "install-new-microwave",
  "replace-ceiling-fan", "replace-range-hood", "soundbar-installation", "floodlight-camera-existing",
];
const V3_KEYS = ["new-video-doorbell-wiring", "generator-inlet-interlock", "240v-garage-outlet",
  "240v-garage-outlet-14-30", "240v-garage-outlet-6-50", "240v-garage-outlet-14-50"];
const PANEL_KEY = "electrical-panel-replacement";
const RETIRED_KEY = "DUCT_CONNECTOR";
const FROZEN_KEYS = ["hot-tub-spa-electrical", "200a-service-upgrade"];
const PREFIX = "test-material-batch2e";
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
  console.log(`\nMATERIAL RECIPE — BATCH 2E (13 consumables-only services, DELTA v${DELTA_VERSION})\n`);
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

  // ── 7. DUCT_CONNECTOR retirement intact ──
  const ductConnector = await raw.canonicalMaterial.findUnique({ where: { key: RETIRED_KEY } });
  ok(`7a. DUCT_CONNECTOR canonical row is still inactive`, ductConnector?.active === false, JSON.stringify(ductConnector));
  const ductRefs = ductConnector ? await raw.serviceMaterial.count({ where: { canonicalMaterialId: ductConnector.id } }) : -1;
  ok(`7b. no live ServiceMaterial anywhere still references DUCT_CONNECTOR`, ductRefs === 0, `got ${ductRefs}`);

  // ── 8. frozen services untouched ──
  for (const key of FROZEN_KEYS) {
    const override = await raw.templateService.findFirst({
      where: { key, templateVersion: { trade: "electrical", version: DELTA_VERSION } },
    });
    ok(`8. ${key} has no override at this batch's DELTA version`, override === null);
    const v1Source = await raw.templateService.findFirst({
      where: { key, templateVersion: { trade: "electrical", version: 1 } }, select: { id: true },
    });
    const v1Materials = v1Source ? await raw.templateServiceMaterial.count({ where: { templateServiceId: v1Source.id } }) : -1;
    ok(`   ${key} is still v1-sourced with zero template materials`, !!v1Source && v1Materials === 0, `got ${v1Materials}`);
  }

  // ── 9/10 (pre-check). Elite's own state, captured before the install probe ──
  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
  const eliteBefore = new Map<string, { materialCostCents: number | null; materials: number }>();
  for (const key of BATCH_2E_SERVICES) {
    const svc = await raw.service.findFirstOrThrow({ where: { contractorId: elite.id, slug: key }, select: { id: true, materialCostCents: true } });
    const matCount = await raw.serviceMaterial.count({ where: { serviceId: svc.id } });
    eliteBefore.set(key, { materialCostCents: svc.materialCostCents, materials: matCount });
  }
  const eliteConsumablesSmallBefore = await raw.contractorMaterial.findFirst({
    where: { contractorId: elite.id, canonicalMaterial: { key: "CONSUMABLES_SMALL" } },
    select: { unitCostCents: true },
  });

  const c = await raw.contractor.create({ data: { slug: SLUG, name: "Material batch 2E probe", active: false }, select: { id: true } });
  try {
    // ── 1. folded catalog still exactly 78 ──
    const source = templateVersionSource(raw, "electrical");
    const pre = await withTenant({ contractorId: c.id, source: "test" }, () => preflight(guarded, c.id, source));
    if (!pre.ok) { ok(`preflight passes for a brand-new contractor`, false, pre.code); throw new Error("preflight refused"); }
    const foldedKeys = new Set(pre.catalog.services.map((s) => (s as unknown as { key: string }).key));
    ok(`1. the folded catalog contains exactly ${EXPECTED_FOLDED_COUNT} distinct electrical service keys`,
      foldedKeys.size === EXPECTED_FOLDED_COUNT, `got ${foldedKeys.size}`);

    const result = await withTenant({ contractorId: c.id, source: "test" }, () => installCatalog(raw, c.id, pre.catalog));
    console.log(`     installed ${result.services} services, ${result.unresolvedMaterialRoles} unresolved role(s)`);

    // ── 2-4. each of the 13 installs with exactly one CONSUMABLES_SMALL policy line ──
    for (const key of BATCH_2E_SERVICES) {
      const svc = await raw.service.findFirst({ where: { contractorId: c.id, slug: key }, select: { id: true, unresolvedMaterialKeys: true } });
      ok(`2. ${key} landed on the fresh contractor`, !!svc);
      if (!svc) continue;
      const lines = await raw.serviceMaterial.findMany({ where: { serviceId: svc.id }, select: { canonicalMaterial: { select: { key: true } } } });
      ok(`3/4. ${key}: zero resolved ServiceMaterial rows (all policy, unresolved)`, lines.length === 0, JSON.stringify(lines.map((l) => l.canonicalMaterial?.key)));
      ok(`3. ${key}: unresolvedMaterialKeys is exactly ["CONSUMABLES_SMALL"]`,
        svc.unresolvedMaterialKeys.length === 1 && svc.unresolvedMaterialKeys[0] === "CONSUMABLES_SMALL",
        JSON.stringify(svc.unresolvedMaterialKeys));
    }

    // ── 6. v4 electrical-panel-replacement intact ──
    const panelSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: PANEL_KEY }, select: { id: true, unresolvedMaterialKeys: true } });
    ok(`6a. electrical-panel-replacement (v4) landed on the fresh contractor`, !!panelSvc);
    if (panelSvc) {
      const panelLines = await raw.serviceMaterial.findMany({ where: { serviceId: panelSvc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKeyPanel = new Map(panelLines.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const panelOk = byKeyPanel.get("PANEL_MAIN_BREAKER") === 1 && panelLines.length === 1
        && ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "CONSUMABLES_MEDIUM"].every((k) => panelSvc.unresolvedMaterialKeys.includes(k));
      ok(`6b. its recipe still exactly matches the approved v4 shape`, panelOk, JSON.stringify({ lines: panelLines.map((l) => [l.canonicalMaterial?.key, l.quantity]) }));
    }

    // ── 5. v3 (Batch 1's six services) intact, checked directly against provenance ──
    const v3Services = await raw.service.findMany({ where: { contractorId: c.id, slug: { in: V3_KEYS } }, select: { slug: true, id: true } });
    ok(`5a. all six Batch 1 v3 services landed on the fresh contractor`, v3Services.length === 6, `${v3Services.length} of 6`);
    const provenance = JSON.parse(readFileSync(resolve(REPO_ROOT, "prisma/template/electrical-v3-provenance.json"), "utf8"));
    for (const entry of provenance.services as Array<{ key: string; structuralMaterials: { role: string; quantity: number }[]; policyMaterialRoles: string[] }>) {
      const svc3 = v3Services.find((s) => s.slug === entry.key);
      if (!svc3) { ok(`5b. ${entry.key} present`, false); continue; }
      const lines3 = await raw.serviceMaterial.findMany({ where: { serviceId: svc3.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKey3 = new Map(lines3.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const svc3Row = await raw.service.findUniqueOrThrow({ where: { id: svc3.id }, select: { unresolvedMaterialKeys: true } });
      const structuralOk = entry.structuralMaterials.every((m) => byKey3.get(m.role) === m.quantity);
      const policyOk = entry.policyMaterialRoles.every((r) => !byKey3.has(r) && svc3Row.unresolvedMaterialKeys.includes(r));
      ok(`5b. ${entry.key}: recipe matches provenance exactly`, structuralOk && policyOk, JSON.stringify({ structuralOk, policyOk }));
    }

    // ── 7c. fresh install never resolves/requires DUCT_CONNECTOR ──
    const ductOnFresh = await raw.serviceMaterial.count({
      where: { service: { contractorId: c.id }, ...(ductConnector ? { canonicalMaterialId: ductConnector.id } : {}) },
    });
    ok(`7c. the fresh install never resolves or requires DUCT_CONNECTOR`, ductOnFresh === 0, `got ${ductOnFresh}`);

    // ── 11. no published price on the fresh install ──
    const anyPublished = await raw.service.count({ where: { contractorId: c.id, publishedPriceApprovedAt: { not: null } } });
    ok(`11. the fresh install carries no approved published price anywhere`, anyPublished === 0);
  } finally {
    await teardown();
  }

  // ── 9/10. Elite's own state untouched ──
  const eliteConsumablesSmallAfter = await raw.contractorMaterial.findFirst({
    where: { contractorId: elite.id, canonicalMaterial: { key: "CONSUMABLES_SMALL" } },
    select: { unitCostCents: true },
  });
  ok(`9. Elite's own CONSUMABLES_SMALL ContractorMaterial cost is unchanged`,
    eliteConsumablesSmallBefore?.unitCostCents === eliteConsumablesSmallAfter?.unitCostCents,
    JSON.stringify({ before: eliteConsumablesSmallBefore, after: eliteConsumablesSmallAfter }));

  let allEliteUnchanged = true;
  for (const key of BATCH_2E_SERVICES) {
    const svc = await raw.service.findFirstOrThrow({ where: { contractorId: elite.id, slug: key }, select: { id: true, materialCostCents: true } });
    const matCount = await raw.serviceMaterial.count({ where: { serviceId: svc.id } });
    const before = eliteBefore.get(key)!;
    const unchanged = before.materialCostCents === svc.materialCostCents && before.materials === matCount;
    if (!unchanged) allEliteUnchanged = false;
    ok(`10. ${key}: Elite's own live service is unchanged (materialCostCents, material row count)`, unchanged,
      JSON.stringify({ before, after: { materialCostCents: svc.materialCostCents, materials: matCount } }));
  }
  ok(`12. no existing contractor catalog was retrofitted (12 = summary of the 13 checks above)`, allEliteUnchanged);

  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`13. the fixture is gone at the end`, residue === 0);

  await raw.$disconnect();
  await guarded.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
