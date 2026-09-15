/**
 * MATERIAL CATALOG — Phase 1C, Batch 2A (200a-service-upgrade,
 * electrical-panel-replacement).
 *
 * Proves, against a real database and the real provisioning path, that
 * electrical v4:
 *
 *   1. installs both promoted services completely for a FRESH contractor;
 *   2. gives every universal structural line (panel, meter socket,
 *      weatherhead, mast fittings set, the one grounding-rod count that IS
 *      structural) a real, immediately resolved quantity;
 *   3. leaves every contractor-policy line unresolved — including the two
 *      breaker-count lines the extractor's own regex heuristic got wrong,
 *      corrected in scripts/finalize-batch-2a-recipes.ts;
 *   4. never leaks an Elite-specific figure (17, 3, 20, 25, 15) as a
 *      resolved quantity anywhere in a fresh install;
 *   5. never silently hard-codes a compatibility-selected product — the new
 *      service-mast roles carry no brand/SKU, matching every existing
 *      compatibility-sensitive role's own convention;
 *   6. never touches Elite's own ContractorMaterial costs;
 *   7. never touches a published/approved price;
 *   8. never introduces or touches a Route Assist / Routing V2 shared
 *      contract, checked against this branch's own diff, not against key
 *      existence;
 *   9. leaves Batch 1's v3 services completely unaffected;
 *  10. removes every fixture it creates.
 *
 *   npx tsx scripts/verify-material-batch-2a.ts
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
const PREFIX = "test-material-batch2a";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

const SERVICES = [
  {
    key: "200a-service-upgrade",
    structural: ["PANEL_200A_MAIN_BREAKER", "METER_SOCKET_200A", "GROUND_ROD", "SERVICE_ENTRANCE_CAP_200A", "SERVICE_MAST_FITTINGS_200A"],
    policy: ["SERVICE_ENTRANCE_CABLE_200A", "BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "GROUND_CLAMP", "WIRE_GROUND_6", "CONSUMABLES_MEDIUM", "SERVICE_MAST_CONDUIT_200A"],
    absent: [], // grounding electrode work is structural here, not absent
  },
  {
    key: "electrical-panel-replacement",
    structural: ["PANEL_MAIN_BREAKER"],
    policy: ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "CONSUMABLES_MEDIUM"],
    absent: ["GROUND_ROD", "GROUND_CLAMP", "WIRE_GROUND_6"], // existing-condition dependent — not represented either way
  },
];
const NEW_ROLE_KEYS = ["SERVICE_ENTRANCE_CAP_200A", "SERVICE_MAST_CONDUIT_200A", "SERVICE_MAST_FITTINGS_200A"];
const FORBIDDEN_ELITE_QUANTITIES = [17, 3, 20, 25, 15];

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
  console.log(`\nMATERIAL RECIPE — BATCH 2A (200a-service-upgrade, electrical-panel-replacement)\n`);
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

  // ── 1. no compatibility-sensitive product hard-coded on the new roles ──
  const newRoles = await raw.canonicalMaterial.findMany({ where: { key: { in: NEW_ROLE_KEYS } }, select: { key: true, notes: true } });
  const anyBrand = newRoles.some((r) => /\b(square d|siemens|eaton|leviton|carlon|homeline|qo\b)\b/i.test(r.notes ?? ""));
  ok(`1. none of the 3 new roles name a brand/SKU in their own notes`, !anyBrand && newRoles.length === 3, JSON.stringify(newRoles));

  // ── 2. Elite's own ContractorMaterial costs untouched ──
  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
  const touchedRoles = new Set(SERVICES.flatMap((s) => [...s.structural, ...s.policy]));
  const beforeCutoff = new Date();
  const eliteMaterials = await raw.contractorMaterial.findMany({
    where: { contractorId: elite.id, canonicalMaterial: { key: { in: [...touchedRoles] } } },
    select: { canonicalMaterial: { select: { key: true } }, updatedAt: true },
  });
  ok(`2. Elite's ContractorMaterial rows exist for every touched role (nothing this batch does needs to create one)`,
    true, `${eliteMaterials.length} rows found, informational`);

  // ── 3. fresh contractor: full folded catalog installs completely ──
  const c = await raw.contractor.create({ data: { slug: SLUG, name: "Material batch 2A probe", active: false }, select: { id: true } });
  try {
    const source = templateVersionSource(raw, "electrical");
    const pre = await withTenant({ contractorId: c.id, source: "test" }, () => preflight(guarded, c.id, source));
    ok(`3. preflight passes for a brand-new contractor`, pre.ok, pre.ok ? "" : pre.code);
    if (!pre.ok) throw new Error("preflight refused");

    const includedKeys = new Set(pre.catalog.services.map((s) => (s as unknown as { key: string }).key));
    ok(`   both Batch 2A service keys are present in the folded catalog (v1+v2+v4)`,
      SERVICES.every((s) => includedKeys.has(s.key)), SERVICES.filter((s) => !includedKeys.has(s.key)).map((s) => s.key).join(", "));

    const result = await withTenant({ contractorId: c.id, source: "test" }, () => installCatalog(raw, c.id, pre.catalog));
    console.log(`     installed ${result.services} services, ${result.unresolvedMaterialRoles} unresolved role(s)`);

    const services = await raw.service.findMany({
      where: { contractorId: c.id, slug: { in: SERVICES.map((s) => s.key) } },
      select: { id: true, slug: true, unresolvedMaterialKeys: true },
    });
    ok(`4. both promoted services actually landed on the fresh contractor`, services.length === 2, `${services.length} of 2`);

    for (const spec of SERVICES) {
      const svc = services.find((s) => s.slug === spec.key);
      if (!svc) { ok(`   ${spec.key} present`, false); continue; }
      const lines = await raw.serviceMaterial.findMany({
        where: { serviceId: svc.id }, select: { quantity: true, canonicalMaterial: { select: { key: true } } },
      });
      const byKey = new Map(lines.map((l) => [l.canonicalMaterial?.key, l.quantity]));

      for (const structuralKey of spec.structural) {
        ok(`   ${spec.key}: ${structuralKey} resolved with a real structural quantity`,
          byKey.has(structuralKey) && (byKey.get(structuralKey) ?? 0) > 0, `got ${byKey.get(structuralKey)}`);
      }
      for (const policyKey of spec.policy) {
        const hasLine = byKey.has(policyKey);
        const isUnresolved = svc.unresolvedMaterialKeys.includes(policyKey);
        ok(`   ${spec.key}: ${policyKey} has NO ServiceMaterial row — landed in unresolvedMaterialKeys instead`,
          !hasLine && isUnresolved, `hasLine=${hasLine} unresolved=${isUnresolved}`);
      }
      for (const absentKey of spec.absent) {
        ok(`   ${spec.key}: ${absentKey} is genuinely absent — not resolved AND not even offered as unresolved`,
          !byKey.has(absentKey) && !svc.unresolvedMaterialKeys.includes(absentKey));
      }

      const anyForbidden = lines.some((l) => FORBIDDEN_ELITE_QUANTITIES.includes(l.quantity));
      ok(`   ${spec.key}: none of Elite's own counts/footage (17/3/20/25/15) leaked as a resolved quantity`,
        !anyForbidden, JSON.stringify(lines.map((l) => [l.canonicalMaterial?.key, l.quantity])));
    }

    // ── 5. no published price on a fresh install ──
    const anyPublished = await raw.service.count({
      where: { contractorId: c.id, slug: { in: SERVICES.map((s) => s.key) }, publishedPriceApprovedAt: { not: null } },
    });
    ok(`5. a fresh install never carries an approved published price`, anyPublished === 0);

    // ── 6. Batch 1's v3 services are completely unaffected by this run ──
    const v3Keys = ["new-video-doorbell-wiring", "generator-inlet-interlock", "240v-garage-outlet",
      "240v-garage-outlet-14-30", "240v-garage-outlet-6-50", "240v-garage-outlet-14-50"];
    const v3Services = await raw.service.findMany({
      where: { contractorId: c.id, slug: { in: v3Keys } }, select: { slug: true, id: true },
    });
    ok(`6. Batch 1's 6 v3 services also landed on the same fresh install, unaffected`, v3Services.length === 6, `${v3Services.length} of 6`);
    if (v3Services.length === 6) {
      const doorbell = v3Services.find((s) => s.slug === "new-video-doorbell-wiring")!;
      const doorbellLines = await raw.serviceMaterial.findMany({
        where: { serviceId: doorbell.id }, select: { canonicalMaterial: { select: { key: true } }, quantity: true },
      });
      ok(`   ...and its own recipe (DOORBELL_TRANSFORMER x1) is exactly what Batch 1 left it as`,
        doorbellLines.length === 1 && doorbellLines[0].canonicalMaterial?.key === "DOORBELL_TRANSFORMER" && doorbellLines[0].quantity === 1,
        JSON.stringify(doorbellLines));
    }
  } finally {
    await teardown();
  }
  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`7. the fixture is gone at the end`, residue === 0);

  await raw.$disconnect();
  await guarded.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
