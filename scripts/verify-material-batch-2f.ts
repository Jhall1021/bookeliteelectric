/**
 * MATERIAL CATALOG — Phase 1C, Batch 2F: two narrow local cleanups.
 *
 *   whole-house-surge-protection — template's stale generic
 *     BREAKER_DOUBLE_POLE swapped for BREAKER_DOUBLE_POLE_20A, matching
 *     Elite's own already-correct live recipe and the specific role's own
 *     documented purpose ("Feeds a whole-house surge device"). All three
 *     lines remain structural/fixed, quantity 1 — unchanged semantics,
 *     only the one role identity corrected.
 *   replace-bathroom-exhaust-fan (the Elite-supplied sibling — NOT
 *     bathroom-fan-light-combo, which stays untouched) — BATH_FAN_STANDARD
 *     (structural) + CONSUMABLES_SMALL (policy), verified as the ONLY
 *     reachable combination: fan_package/fan_housing_standard/fan_features
 *     each have exactly one CONTINUE path (fan_only + standard housing +
 *     standard features), so BATH_FAN_STANDARD is deterministically the
 *     one role ever resolved automatically — no answer-option-component
 *     selection mechanism needed, none invented. photoState=REVIEW_REQUIRED
 *     means price always needs review; that's a pricing-flow property, not
 *     a material-truth gap — the recipe itself is fully deterministic.
 *
 * REHEARSAL DATA CAVEAT: the rehearsal branch's own Elite tenant data for
 * whole-house-surge-protection is stale relative to production — it still
 * has generic BREAKER_DOUBLE_POLE, not BREAKER_DOUBLE_POLE_20A (confirmed
 * by direct query; production's dry run independently confirmed Elite's
 * PRODUCTION data already has the specific role). So a plain extraction on
 * rehearsal reproduces that staleness; after extracting, one explicit,
 * narrow, rehearsal-only correction was applied (swapping the
 * canonicalMaterialId on that one TemplateServiceMaterial row) to bring
 * rehearsal to the same target state production's own extraction will
 * produce directly. No such correction will be needed in production.
 *
 * REHEARSAL VERSION NUMBER: this verifier targets whichever TemplateVersion
 * DELTA_VERSION names — v7 on the shared rehearsal branch, since that
 * branch's v5 is the historical rejected bathroom-fan-light-combo override
 * (content-identical to v1's own empty recipe, confirmed by direct query —
 * benign but not accurate provenance) and v6 is Batch 2E's 13 services
 * (content matches real production v5). Checks here that touch
 * bathroom-fan-light-combo or the 13 Batch-2E services assert on INSTALLED
 * CONTENT, never on which version number sourced them, specifically to stay
 * correct despite that branch-only numbering divergence. Production has no
 * v6 or v7; the real production write for this batch will target
 * production's actual next version, verified fresh at write time — do not
 * assume it is 6 or 7 without re-checking production's own state first.
 *
 * Proves:
 *   0. branch diff touches zero Route Assist / Routing V2 / shared-schema files;
 *   1. folded Electrical catalog remains exactly 78 distinct keys;
 *   2/3. whole-house-surge-protection installs with BREAKER_DOUBLE_POLE_20A,
 *      and the generic BREAKER_DOUBLE_POLE is NOT used by this service's
 *      installed recipe;
 *   4. its other two lines (SURGE_PROTECTOR_WHOLE_HOUSE, SURGE_TRIM_KIT)
 *      remain unchanged, structural, quantity 1;
 *   5/6. replace-bathroom-exhaust-fan installs with only BATH_FAN_STANDARD
 *      (structural) + CONSUMABLES_SMALL (policy) — no other role, and the
 *      canonical_materials count is unchanged (no new fan role invented);
 *   7. the fan's structural role resolves deterministically — exactly one
 *      structural material line, not an ambiguous set;
 *   8. bathroom-fan-light-combo still installs with zero materials;
 *   9. under-cabinet-led-lighting has no override beyond v1 and its v1
 *      template recipe remains empty (frozen, not promoted);
 *  10/11. hot-tub-spa-electrical and 200a-service-upgrade remain v1-sourced
 *      only, zero template materials, no override at this DELTA version;
 *  12. all 13 Batch 2E services still install with exactly one
 *      CONSUMABLES_SMALL policy line each (content-based, version-agnostic);
 *  13. Batch 1 v3 and Batch 2A v4 remain intact against their provenance;
 *  14. DUCT_CONNECTOR remains inactive (canonical + Elite's contractor row)
 *      and unreferenced anywhere;
 *  15/16/17. no existing contractor catalog is retrofitted, no
 *      ContractorMaterial cost changes, no published price changes;
 *  18. fixture teardown leaves zero residue.
 *
 *   npx tsx scripts/verify-material-batch-2f.ts
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
const DELTA_VERSION = 7; // rehearsal only — production's real next version must be re-verified fresh
const EXPECTED_FOLDED_COUNT = 78;
const SURGE_KEY = "whole-house-surge-protection";
const FAN_KEY = "replace-bathroom-exhaust-fan";
const FROZEN_KEYS = ["hot-tub-spa-electrical", "200a-service-upgrade"];
const UNDER_CABINET_KEY = "under-cabinet-led-lighting";
const FAN_COMBO_KEY = "bathroom-fan-light-combo";
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
const PREFIX = "test-material-batch2f";
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
  console.log(`\nMATERIAL RECIPE — BATCH 2F (surge breaker role fix, bathroom-exhaust-fan promotion), DELTA v${DELTA_VERSION}\n`);
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

  // ── 9. under-cabinet-led-lighting frozen — no override beyond v1, v1 recipe still empty ──
  const ucOverride = await raw.templateService.findFirst({
    where: { key: UNDER_CABINET_KEY, templateVersion: { trade: "electrical", version: { gt: 1 } } },
  });
  ok(`9a. under-cabinet-led-lighting has no override beyond v1`, ucOverride === null);
  const ucV1 = await raw.templateService.findFirst({ where: { key: UNDER_CABINET_KEY, templateVersion: { trade: "electrical", version: 1 } }, select: { id: true } });
  const ucV1Mats = ucV1 ? await raw.templateServiceMaterial.count({ where: { templateServiceId: ucV1.id } }) : -1;
  ok(`9b. under-cabinet-led-lighting's v1 template recipe remains empty (not promoted)`, !!ucV1 && ucV1Mats === 0, `got ${ucV1Mats}`);

  // ── 10/11. frozen spa/200A ──
  for (const key of FROZEN_KEYS) {
    const override = await raw.templateService.findFirst({ where: { key, templateVersion: { trade: "electrical", version: { gt: 1 } } } });
    ok(`10/11. ${key} has no override beyond v1`, override === null);
    const v1Source = await raw.templateService.findFirst({ where: { key, templateVersion: { trade: "electrical", version: 1 } }, select: { id: true } });
    const v1Materials = v1Source ? await raw.templateServiceMaterial.count({ where: { templateServiceId: v1Source.id } }) : -1;
    ok(`   ${key} is still v1-sourced with zero template materials`, !!v1Source && v1Materials === 0, `got ${v1Materials}`);
  }

  // ── 14. DUCT_CONNECTOR retirement intact ──
  const ductConnector = await raw.canonicalMaterial.findUnique({ where: { key: RETIRED_KEY } });
  ok(`14a. DUCT_CONNECTOR canonical row is still inactive`, ductConnector?.active === false, JSON.stringify(ductConnector));
  const ductRefs = ductConnector ? await raw.serviceMaterial.count({ where: { canonicalMaterialId: ductConnector.id } }) : -1;
  ok(`14b. no live ServiceMaterial anywhere still references DUCT_CONNECTOR`, ductRefs === 0, `got ${ductRefs}`);
  const eliteDuctRow = ductConnector
    ? await raw.contractorMaterial.findFirst({ where: { canonicalMaterialId: ductConnector.id, contractor: { slug: ELITE_SLUG } }, select: { active: true, unitCostCents: true } })
    : null;
  ok(`14c. Elite's own DUCT_CONNECTOR ContractorMaterial row remains inactive, cost preserved`, eliteDuctRow?.active === false && eliteDuctRow?.unitCostCents === 800, JSON.stringify(eliteDuctRow));

  // ── canonical role count unchanged (no new fan role invented) ──
  const canonicalCountBefore = await raw.canonicalMaterial.count();

  // ── 15/16/17 (pre-check). Elite's own state, captured before the install probe ──
  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
  const eliteTouchedBefore = new Map<string, { materialCostCents: number | null; materials: number; publishedAt: number | null }>();
  for (const key of [SURGE_KEY, FAN_KEY]) {
    const svc = await raw.service.findFirstOrThrow({
      where: { contractorId: elite.id, slug: key },
      select: { id: true, materialCostCents: true, publishedPriceApprovedAt: true },
    });
    const matCount = await raw.serviceMaterial.count({ where: { serviceId: svc.id } });
    eliteTouchedBefore.set(key, { materialCostCents: svc.materialCostCents, materials: matCount, publishedAt: svc.publishedPriceApprovedAt?.getTime() ?? null });
  }
  const contractorMaterialCostsBefore = await raw.contractorMaterial.findMany({
    where: { contractorId: elite.id, canonicalMaterial: { key: { in: ["SURGE_PROTECTOR_WHOLE_HOUSE", "SURGE_TRIM_KIT", "BREAKER_DOUBLE_POLE_20A", "BREAKER_DOUBLE_POLE", "BATH_FAN_STANDARD", "CONSUMABLES_SMALL"] } } },
    select: { canonicalMaterial: { select: { key: true } }, unitCostCents: true },
  });

  const c = await raw.contractor.create({ data: { slug: SLUG, name: "Material batch 2F probe", active: false }, select: { id: true } });
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

    // ── 2/3/4. surge protection ──
    const surgeSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: SURGE_KEY }, select: { id: true } });
    ok(`2a. whole-house-surge-protection landed on the fresh contractor`, !!surgeSvc);
    if (surgeSvc) {
      const lines = await raw.serviceMaterial.findMany({ where: { serviceId: surgeSvc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKey = new Map(lines.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      ok(`2b. installs with BREAKER_DOUBLE_POLE_20A, quantity 1`, byKey.get("BREAKER_DOUBLE_POLE_20A") === 1, JSON.stringify(lines.map(l=>[l.canonicalMaterial?.key,l.quantity])));
      ok(`3. the generic BREAKER_DOUBLE_POLE is NOT used by this service's installed recipe`, !byKey.has("BREAKER_DOUBLE_POLE"));
      ok(`4. SURGE_PROTECTOR_WHOLE_HOUSE and SURGE_TRIM_KIT remain unchanged, quantity 1 each`,
        byKey.get("SURGE_PROTECTOR_WHOLE_HOUSE") === 1 && byKey.get("SURGE_TRIM_KIT") === 1);
      ok(`   exactly 3 material lines, nothing extra`, lines.length === 3, `got ${lines.length}`);
    }

    // ── 5/6/7. bathroom exhaust fan ──
    const fanSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: FAN_KEY }, select: { id: true, unresolvedMaterialKeys: true } });
    ok(`5a. replace-bathroom-exhaust-fan landed on the fresh contractor`, !!fanSvc);
    if (fanSvc) {
      const lines = await raw.serviceMaterial.findMany({ where: { serviceId: fanSvc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const structural = lines.filter((l) => l.canonicalMaterial?.key !== "CONSUMABLES_SMALL");
      ok(`5b. installs with exactly one structural line: BATH_FAN_STANDARD x1`,
        lines.length === 1 && lines[0].canonicalMaterial?.key === "BATH_FAN_STANDARD" && lines[0].quantity === 1,
        JSON.stringify(lines.map((l) => [l.canonicalMaterial?.key, l.quantity])));
      ok(`5c. CONSUMABLES_SMALL is policy (unresolved), not a resolved line`,
        !lines.some((l) => l.canonicalMaterial?.key === "CONSUMABLES_SMALL") && fanSvc.unresolvedMaterialKeys.includes("CONSUMABLES_SMALL"),
        JSON.stringify(fanSvc.unresolvedMaterialKeys));
      ok(`6. no other fan role (BATH_FAN_HIGH_CFM/LIGHT_STANDARD/LIGHT_HIGH_CFM) appears`,
        !lines.some((l) => ["BATH_FAN_HIGH_CFM", "BATH_FAN_LIGHT_STANDARD", "BATH_FAN_LIGHT_HIGH_CFM"].includes(l.canonicalMaterial?.key ?? "")));
      ok(`7. the fan's structural selection is deterministic — exactly one structural material line`, structural.length === 1, `got ${structural.length}`);
    }
    const canonicalCountAfterInstall = await raw.canonicalMaterial.count();
    ok(`6b. no new canonical fan role was invented — canonical_materials count unchanged`, canonicalCountAfterInstall === canonicalCountBefore, `before ${canonicalCountBefore}, after ${canonicalCountAfterInstall}`);

    // ── 8. bathroom-fan-light-combo untouched (content-based, not version-sourced) ──
    const comboSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: FAN_COMBO_KEY }, select: { id: true } });
    ok(`8a. bathroom-fan-light-combo landed on the fresh contractor`, !!comboSvc);
    if (comboSvc) {
      const comboMats = await raw.serviceMaterial.count({ where: { serviceId: comboSvc.id } });
      ok(`8b. it still installs with zero materials`, comboMats === 0, `got ${comboMats}`);
    }

    // ── 12. Batch 2E's 13 services still install correctly (content-based) ──
    for (const key of BATCH_2E_SERVICES) {
      const svc = await raw.service.findFirst({ where: { contractorId: c.id, slug: key }, select: { id: true, unresolvedMaterialKeys: true } });
      const lines = svc ? await raw.serviceMaterial.count({ where: { serviceId: svc.id } }) : -1;
      const ok12 = !!svc && lines === 0 && svc.unresolvedMaterialKeys.length === 1 && svc.unresolvedMaterialKeys[0] === "CONSUMABLES_SMALL";
      ok(`12. ${key}: still installs with exactly one CONSUMABLES_SMALL policy line`, ok12, JSON.stringify({ found: !!svc, lines, unresolved: svc?.unresolvedMaterialKeys }));
    }

    // ── 13. v3/v4 intact ──
    const panelSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: PANEL_KEY }, select: { id: true, unresolvedMaterialKeys: true } });
    ok(`13a. electrical-panel-replacement (v4) landed on the fresh contractor`, !!panelSvc);
    if (panelSvc) {
      const panelLines = await raw.serviceMaterial.findMany({ where: { serviceId: panelSvc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKeyPanel = new Map(panelLines.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const panelOk = byKeyPanel.get("PANEL_MAIN_BREAKER") === 1 && panelLines.length === 1
        && ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "CONSUMABLES_MEDIUM"].every((k) => panelSvc.unresolvedMaterialKeys.includes(k));
      ok(`13b. its recipe still exactly matches the approved v4 shape`, panelOk, JSON.stringify({ lines: panelLines.map((l) => [l.canonicalMaterial?.key, l.quantity]) }));
    }
    const v3Services = await raw.service.findMany({ where: { contractorId: c.id, slug: { in: V3_KEYS } }, select: { slug: true, id: true } });
    ok(`13c. all six Batch 1 v3 services landed on the fresh contractor`, v3Services.length === 6, `${v3Services.length} of 6`);
    const provenance = JSON.parse(readFileSync(resolve(REPO_ROOT, "prisma/template/electrical-v3-provenance.json"), "utf8"));
    for (const entry of provenance.services as Array<{ key: string; structuralMaterials: { role: string; quantity: number }[]; policyMaterialRoles: string[] }>) {
      const svc3 = v3Services.find((s) => s.slug === entry.key);
      if (!svc3) { ok(`13d. ${entry.key} present`, false); continue; }
      const lines3 = await raw.serviceMaterial.findMany({ where: { serviceId: svc3.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKey3 = new Map(lines3.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const svc3Row = await raw.service.findUniqueOrThrow({ where: { id: svc3.id }, select: { unresolvedMaterialKeys: true } });
      const structuralOk = entry.structuralMaterials.every((m) => byKey3.get(m.role) === m.quantity);
      const policyOk = entry.policyMaterialRoles.every((r) => !byKey3.has(r) && svc3Row.unresolvedMaterialKeys.includes(r));
      ok(`13d. ${entry.key}: recipe matches provenance exactly`, structuralOk && policyOk, JSON.stringify({ structuralOk, policyOk }));
    }

    // ── 14d. fresh install never resolves/requires DUCT_CONNECTOR ──
    const ductOnFresh = await raw.serviceMaterial.count({
      where: { service: { contractorId: c.id }, ...(ductConnector ? { canonicalMaterialId: ductConnector.id } : {}) },
    });
    ok(`14d. the fresh install never resolves or requires DUCT_CONNECTOR`, ductOnFresh === 0, `got ${ductOnFresh}`);

    // ── no published price on the fresh install ──
    const anyPublished = await raw.service.count({ where: { contractorId: c.id, publishedPriceApprovedAt: { not: null } } });
    ok(`   the fresh install carries no approved published price anywhere`, anyPublished === 0);
  } finally {
    await teardown();
  }

  // ── 15/16/17. Elite's own state untouched ──
  let allEliteUnchanged = true;
  for (const key of [SURGE_KEY, FAN_KEY]) {
    const svc = await raw.service.findFirstOrThrow({
      where: { contractorId: elite.id, slug: key },
      select: { id: true, materialCostCents: true, publishedPriceApprovedAt: true },
    });
    const matCount = await raw.serviceMaterial.count({ where: { serviceId: svc.id } });
    const before = eliteTouchedBefore.get(key)!;
    const afterPublishedAt = svc.publishedPriceApprovedAt?.getTime() ?? null;
    const unchanged = before.materialCostCents === svc.materialCostCents && before.materials === matCount && before.publishedAt === afterPublishedAt;
    if (!unchanged) allEliteUnchanged = false;
    ok(`15/16/17. ${key}: Elite's own live service is unchanged (materialCostCents, material row count, publishedPriceApprovedAt)`, unchanged,
      JSON.stringify({ before, after: { materialCostCents: svc.materialCostCents, materials: matCount, publishedAt: afterPublishedAt } }));
  }
  const contractorMaterialCostsAfter = await raw.contractorMaterial.findMany({
    where: { contractorId: elite.id, canonicalMaterial: { key: { in: ["SURGE_PROTECTOR_WHOLE_HOUSE", "SURGE_TRIM_KIT", "BREAKER_DOUBLE_POLE_20A", "BREAKER_DOUBLE_POLE", "BATH_FAN_STANDARD", "CONSUMABLES_SMALL"] } } },
    select: { canonicalMaterial: { select: { key: true } }, unitCostCents: true },
  });
  const beforeMap = new Map(contractorMaterialCostsBefore.map((m) => [m.canonicalMaterial?.key, m.unitCostCents]));
  const costsUnchanged = contractorMaterialCostsAfter.every((m) => beforeMap.get(m.canonicalMaterial?.key) === m.unitCostCents);
  ok(`15/16/17b. Elite's ContractorMaterial costs on every touched role are unchanged`, costsUnchanged);
  ok(`15. no existing contractor catalog was retrofitted (summary of the checks above)`, allEliteUnchanged && costsUnchanged);

  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`18. the fixture is gone at the end`, residue === 0);

  await raw.$disconnect();
  await guarded.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
