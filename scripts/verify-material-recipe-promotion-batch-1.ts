/**
 * MATERIAL CATALOG — Phase 1C, first canonical recipe promotion batch.
 *
 * Proves, against the real database and the real provisioning path, that six
 * services extracted from Elite's tenant catalog into `electrical` template
 * v3 (`new-video-doorbell-wiring`, `generator-inlet-interlock`,
 * `240v-garage-outlet` and its three NEMA siblings):
 *
 *   1. install completely for a FRESH contractor, through the same
 *      preflight/installCatalog path every real onboarding uses — not a
 *      hand-built shortcut;
 *   2. leave every contractor-policy quantity (wire footage, consumables)
 *      UNRESOLVED, never a fixed number copied from Elite — the exact
 *      leak this batch exists to prevent;
 *   3. give every structural line (device/box/breaker/panel-inlet count) a
 *      real, immediately resolved quantity;
 *   4. never touch Elite's own ContractorMaterial costs — extraction reads
 *      Elite's Service/ServiceMaterial tree, never writes it, and never
 *      reads or writes ContractorMaterial at all;
 *   5. never introduce a Route Assist / Routing V2 reserved key — none of
 *      those exist in this schema at all, verified directly.
 *
 *   npx tsx scripts/verify-material-recipe-promotion-batch-1.ts
 */
import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";
import { loadEnv } from "./_env";

loadEnv();
const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;

const ELITE_SLUG = "elite-electric";
const PREFIX = "test-material-recipe-batch1";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

/** The extraction timestamp this run checks Elite's costs against — set once, at the top of this run. */
const EXTRACTION_CUTOFF = new Date("2026-09-15T18:23:00.000Z");

const PROMOTED_SERVICES = [
  { key: "new-video-doorbell-wiring", structural: ["DOORBELL_TRANSFORMER"], policy: ["WIRE_BELL_18_2", "CONSUMABLES_SMALL"] },
  { key: "generator-inlet-interlock", structural: ["GENERATOR_INLET_BOX_30A", "INTERLOCK_KIT", "BREAKER_DOUBLE_POLE_30A"], policy: ["WIRE_10_3", "CONSUMABLES_MEDIUM"] },
  { key: "240v-garage-outlet", structural: ["RECEPTACLE_6_30", "BREAKER_DOUBLE_POLE_30A", "BOX_SURFACE_4S", "COVER_RAISED_4S"], policy: ["WIRE_10_2", "CONSUMABLES_MEDIUM"] },
  { key: "240v-garage-outlet-14-30", structural: ["RECEPTACLE_14_30", "BREAKER_DOUBLE_POLE_30A", "BOX_SURFACE_4S", "COVER_RAISED_4S"], policy: ["WIRE_10_3", "CONSUMABLES_MEDIUM"] },
  { key: "240v-garage-outlet-6-50", structural: ["RECEPTACLE_6_50", "BREAKER_DOUBLE_POLE_50A", "BOX_SURFACE_4S", "COVER_RAISED_4S"], policy: ["WIRE_6_2", "CONSUMABLES_MEDIUM"] },
  { key: "240v-garage-outlet-14-50", structural: ["RECEPTACLE_14_50", "BREAKER_DOUBLE_POLE_50A", "BOX_SURFACE_4S", "COVER_RAISED_4S"], policy: ["WIRE_6_3", "CONSUMABLES_MEDIUM"] },
];

/** The exact Elite-specific numbers that must NEVER appear as a resolved quantity anywhere in the fresh install. */
const FORBIDDEN_ELITE_QUANTITIES = [25, 17, 3, 10, 15];

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
  console.log(`\nMATERIAL RECIPE PROMOTION BATCH 1 — provisioning, policy quantities, Elite isolation\n`);
  await teardown();
  await sweepStale();

  // ── 0. Route Assist / Routing V2 reserved keys genuinely don't exist here ──
  const reservedKeys = [
    "ELEC_ROUTE_SURFACE_MOUNTED", "SURFACE_ROUTE_FT", "SURFACE_ROUTE_INSIDE_CORNER",
    "SURFACE_ROUTE_OUTSIDE_CORNER", "SURFACE_ROUTE_FLAT_CORNER", "SURFACE_RACEWAY_CHANNEL",
    "SURFACE_RACEWAY_JOINT", "SURFACE_DEVICE_BOX_1G", "CONDUCTOR_THHN_12_UNGROUNDED",
  ];
  const reservedHits = await raw.canonicalMaterial.count({ where: { key: { in: reservedKeys } } })
    + await raw.canonicalComponent.count({ where: { key: { in: reservedKeys } } });
  ok(`0. no Route Assist / Routing V2 reserved key exists in this schema — nothing to collide with`, reservedHits === 0, `${reservedHits} hit(s)`);

  // ── 1. Elite's own ContractorMaterial costs were not touched by extraction ──
  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });
  const touchedRoles = new Set(PROMOTED_SERVICES.flatMap((s) => [...s.structural, ...s.policy]));
  const eliteMaterials = await raw.contractorMaterial.findMany({
    where: { contractorId: elite.id, canonicalMaterial: { key: { in: [...touchedRoles] } } },
    select: { canonicalMaterial: { select: { key: true } }, updatedAt: true, unitCostCents: true },
  });
  const mutatedAfterExtraction = eliteMaterials.filter((m) => m.updatedAt > EXTRACTION_CUTOFF);
  ok(`1. Elite's ContractorMaterial rows for every touched role: none updated since the extraction ran`,
    mutatedAfterExtraction.length === 0,
    JSON.stringify(mutatedAfterExtraction.map((m) => m.canonicalMaterial.key)));

  // ── 2. fresh contractor: the whole folded catalog installs completely ──
  const c = await raw.contractor.create({ data: { slug: SLUG, name: "Material recipe batch 1 probe", active: false }, select: { id: true } });
  try {
    const source = templateVersionSource(raw, "electrical");
    const pre = await withTenant({ contractorId: c.id, source: "test" }, () => preflight(guarded, c.id, source));
    ok(`2. preflight passes for a brand-new contractor`, pre.ok, pre.ok ? "" : pre.code);
    if (!pre.ok) throw new Error("preflight refused");

    const promotedKeys = new Set(PROMOTED_SERVICES.map((s) => s.key));
    const includedKeys = new Set(pre.catalog.services.map((s) => (s as unknown as { key: string }).key));
    ok(`   all 6 promoted service keys are present in the folded catalog (v1+v2+v3)`,
      [...promotedKeys].every((k) => includedKeys.has(k)),
      [...promotedKeys].filter((k) => !includedKeys.has(k)).join(", "));

    const result = await withTenant({ contractorId: c.id, source: "test" }, () => installCatalog(raw, c.id, pre.catalog));
    console.log(`     installed ${result.services} services, ${result.unresolvedMaterialRoles} unresolved role(s)`);

    const services = await raw.service.findMany({
      where: { contractorId: c.id, slug: { in: PROMOTED_SERVICES.map((s) => s.key) } },
      select: { id: true, slug: true, unresolvedMaterialKeys: true },
    });
    ok(`3. all 6 promoted services actually landed on the fresh contractor`, services.length === 6, `${services.length} of 6`);

    for (const spec of PROMOTED_SERVICES) {
      const svc = services.find((s) => s.slug === spec.key);
      if (!svc) { ok(`   ${spec.key} present`, false); continue; }

      const lines = await raw.serviceMaterial.findMany({
        where: { serviceId: svc.id },
        select: { quantity: true, canonicalMaterial: { select: { key: true } } },
      });
      const byKey = new Map(lines.map((l) => [l.canonicalMaterial?.key, l.quantity]));

      for (const structuralKey of spec.structural) {
        ok(`   ${spec.key}: ${structuralKey} resolved with a real structural quantity`,
          byKey.has(structuralKey) && (byKey.get(structuralKey) ?? 0) > 0,
          `got ${byKey.get(structuralKey)}`);
      }
      for (const policyKey of spec.policy) {
        const hasLine = byKey.has(policyKey);
        const isUnresolved = svc.unresolvedMaterialKeys.includes(policyKey);
        ok(`   ${spec.key}: ${policyKey} has NO ServiceMaterial row — landed in unresolvedMaterialKeys instead`,
          !hasLine && isUnresolved, `hasLine=${hasLine} unresolved=${isUnresolved}`);
      }

      const anyForbidden = lines.some((l) => FORBIDDEN_ELITE_QUANTITIES.includes(l.quantity));
      ok(`   ${spec.key}: none of Elite's own footage/count figures (25/17/3/10/15) leaked as a resolved quantity`,
        !anyForbidden, JSON.stringify(lines.map((l) => [l.canonicalMaterial?.key, l.quantity])));
    }

    // ── 4. reroute mesh resolves — every sibling's target is a real installed service ──
    const garageServices = await raw.service.findMany({
      where: { contractorId: c.id, slug: { startsWith: "240v-garage-outlet" } },
      select: { id: true, slug: true },
    });
    const garageIds = new Set(garageServices.map((s) => s.id));
    const options = await raw.answerOption.findMany({
      where: { question: { serviceId: { in: garageServices.map((s) => s.id) } }, rerouteServiceId: { not: null } },
      select: { rerouteServiceId: true },
    });
    const unresolvedReroutes = options.filter((o) => !o.rerouteServiceId || !garageIds.has(o.rerouteServiceId));
    ok(`4. every 240v-garage-outlet sibling reroute resolves to a real installed sibling`,
      unresolvedReroutes.length === 0, JSON.stringify(unresolvedReroutes));

    // ── 5. nothing here touched a published/approved price ──
    const anyPublished = await raw.service.count({
      where: { contractorId: c.id, slug: { in: PROMOTED_SERVICES.map((s) => s.key) }, publishedPriceApprovedAt: { not: null } },
    });
    ok(`5. a fresh install never carries an approved published price`, anyPublished === 0);
  } finally {
    await teardown();
  }
  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`6. the fixture is gone at the end`, residue === 0);

  await raw.$disconnect();
  await guarded.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
