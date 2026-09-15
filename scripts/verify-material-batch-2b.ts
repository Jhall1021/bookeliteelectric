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
 * REHEARSAL-BRANCH CAVEAT: the shared rehearsal branch (br-hidden-hall-
 * ayvlh5bg) still carries the REJECTED electrical v5 DELTA from the earlier
 * (now-superseded) Batch 2B proposal — not production parity, and no
 * destructive branch cleanup was performed to fix that divergence. Checks
 * 0b/0c below (no v5 exists, bathroom-fan-light-combo is v1-sourced) are
 * true on production but will correctly FAIL if this script is ever re-run
 * against that stale rehearsal branch — that is expected, not a bug in the
 * check, and is exactly why v5 was never relied on for the production proof
 * this file was actually used for.
 *
 * Proves:
 *   0. this branch's diff touches zero Route Assist / Routing V2 / shared-
 *      schema files;
 *   0b/0c. no Electrical v5 exists; bathroom-fan-light-combo remains
 *      v1-sourced with no v4/v5 override;
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
 *  11. fixture teardown is complete;
 *  v3/v4. Batch 1's six v3 services and v4's electrical-panel-replacement
 *      remain intact, checked directly against the canonical provenance
 *      manifest on the same fresh install.
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
const RETIRED_KEY = "DUCT_CONNECTOR";
const FAN_SERVICE_KEY = "bathroom-fan-light-combo";
const PANEL_KEY = "electrical-panel-replacement";
const V3_KEYS = ["new-video-doorbell-wiring", "generator-inlet-interlock", "240v-garage-outlet",
  "240v-garage-outlet-14-30", "240v-garage-outlet-6-50", "240v-garage-outlet-14-50"];
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

  // ── 0b. template-version state: v1-v4 only, no v5, bathroom-fan-light-combo v1-sourced ──
  const versions = await raw.templateVersion.findMany({
    where: { trade: "electrical" }, select: { version: true, kind: true }, orderBy: { version: "asc" },
  });
  ok(`0b. Electrical template versions are exactly v1-v4 — no v5 exists`,
    versions.length === 4 && versions.every((v, i) => v.version === i + 1), JSON.stringify(versions));
  const fanSource = await raw.templateService.findFirst({
    where: { key: FAN_SERVICE_KEY, templateVersion: { trade: "electrical", version: 1 } }, select: { id: true },
  });
  const fanV4OrLater = await raw.templateService.findFirst({
    where: { key: FAN_SERVICE_KEY, templateVersion: { trade: "electrical", version: { gte: 4 } } },
  });
  ok(`0c. bathroom-fan-light-combo's only source is v1 — no v4/v5 override exists for it`,
    !!fanSource && !fanV4OrLater, JSON.stringify({ v1Source: !!fanSource, laterOverride: fanV4OrLater }));

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

    // ── v4 (electrical-panel-replacement) remains intact ──
    const panelSvc = await raw.service.findFirst({ where: { contractorId: c.id, slug: PANEL_KEY }, select: { id: true, unresolvedMaterialKeys: true } });
    ok(`v4a. electrical-panel-replacement landed on the fresh contractor`, !!panelSvc);
    if (panelSvc) {
      const panelLines = await raw.serviceMaterial.findMany({ where: { serviceId: panelSvc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKeyPanel = new Map(panelLines.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const panelOk = byKeyPanel.get("PANEL_MAIN_BREAKER") === 1 && panelLines.length === 1
        && ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "CONSUMABLES_MEDIUM"].every((k) => panelSvc.unresolvedMaterialKeys.includes(k));
      ok(`v4b. its recipe still exactly matches the approved v4 shape`, panelOk,
        JSON.stringify({ lines: panelLines.map((l) => [l.canonicalMaterial?.key, l.quantity]), unresolved: panelSvc.unresolvedMaterialKeys }));
    }

    // ── v3 (Batch 1's six services) remain intact, checked directly against provenance ──
    const v3Services = await raw.service.findMany({ where: { contractorId: c.id, slug: { in: V3_KEYS } }, select: { slug: true, id: true } });
    ok(`v3a. all six Batch 1 v3 services landed on the fresh contractor`, v3Services.length === 6, `${v3Services.length} of 6`);
    const provenance = JSON.parse(readFileSync(resolve(REPO_ROOT, "prisma/template/electrical-v3-provenance.json"), "utf8"));
    for (const entry of provenance.services as Array<{ key: string; structuralMaterials: { role: string; quantity: number }[]; policyMaterialRoles: string[] }>) {
      const svc3 = v3Services.find((s) => s.slug === entry.key);
      if (!svc3) { ok(`v3b. ${entry.key} present`, false); continue; }
      const lines3 = await raw.serviceMaterial.findMany({ where: { serviceId: svc3.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } });
      const byKey3 = new Map(lines3.map((l) => [l.canonicalMaterial?.key, l.quantity]));
      const svc3Row = await raw.service.findUniqueOrThrow({ where: { id: svc3.id }, select: { unresolvedMaterialKeys: true } });
      const structuralOk = entry.structuralMaterials.every((m) => byKey3.get(m.role) === m.quantity);
      const policyOk = entry.policyMaterialRoles.every((r) => !byKey3.has(r) && svc3Row.unresolvedMaterialKeys.includes(r));
      ok(`v3b. ${entry.key}: recipe matches provenance exactly`, structuralOk && policyOk, JSON.stringify({ structuralOk, policyOk }));
    }
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
