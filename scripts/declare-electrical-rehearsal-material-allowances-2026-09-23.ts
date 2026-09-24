/**
 * Declare the rehearsal contractor's documented material allowances for every
 * installed electrical recipe whose policy quantity is still unset.
 *
 * These values come from the service's own bounded-scope seed recipe. They are
 * contractor policy, not universal trade facts. This script does not activate
 * services or publish customer prices.
 *
 *   npx tsx scripts/declare-electrical-rehearsal-material-allowances-2026-09-23.ts
 *   npx tsx scripts/declare-electrical-rehearsal-material-allowances-2026-09-23.ts --apply \
 *     --contractor rv2-pilot-rehearsal-manual-0922
 */
import { PrismaClient } from "@prisma/client";
import { isRehearsalSlug } from "../lib/electrical/pilotScope";
import { declarePolicyMaterialQuantity } from "../lib/materialCost";
import { assessMaterialReadiness } from "../lib/materialResolution";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";

type Allowance = { service: string; role: string; quantity: number; source: string };

const ALLOWANCES: Allowance[] = [
  { service: "200a-service-upgrade", role: "SERVICE_ENTRANCE_CABLE_200A", quantity: 20, source: "seed-200a-service-upgrade FEEDER_FT" },
  { service: "200a-service-upgrade", role: "WIRE_GROUND_6", quantity: 25, source: "seed-200a-service-upgrade bounded recipe" },
  { service: "200a-service-upgrade", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-200a-service-upgrade bounded recipe" },

  { service: "240v-garage-outlet", role: "WIRE_10_2", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },
  { service: "240v-garage-outlet-14-30", role: "WIRE_10_3", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet-14-30", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },
  { service: "240v-garage-outlet-6-50", role: "WIRE_6_2", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet-6-50", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },
  { service: "240v-garage-outlet-14-50", role: "WIRE_6_3", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet-14-50", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },

  { service: "electrical-panel-replacement", role: "BREAKER_SINGLE_POLE", quantity: 17, source: "seed-panel-replacement current panel assumption" },
  { service: "electrical-panel-replacement", role: "BREAKER_DOUBLE_POLE", quantity: 3, source: "seed-panel-replacement current panel assumption" },
  { service: "electrical-panel-replacement", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-panel-replacement bounded recipe" },
  { service: "fan-replacing-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "generator-inlet-interlock", role: "WIRE_10_3", quantity: 10, source: "seed-generator-inlet INCLUDED_RUN_FT" },
  { service: "generator-inlet-interlock", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-generator-inlet bounded recipe" },
  { service: "hot-tub-spa-electrical", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-hot-tub-spa fixed reviewed package" },
  { service: "new-ceiling-fan", role: "WIRE_14_2", quantity: 25, source: "seed-materials new light point policy" },
  { service: "new-ceiling-fan", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "new-ceiling-light", role: "WIRE_14_2", quantity: 25, source: "seed-materials new light point policy" },
  { service: "new-ceiling-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "new-coax-line", role: "CABLE_RG6", quantity: 60, source: "seed-low-voltage-and-sconces accessible run" },
  { service: "new-coax-line", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces recipe" },
  { service: "new-ethernet-line", role: "CABLE_CAT6", quantity: 60, source: "seed-low-voltage-and-sconces accessible run" },
  { service: "new-ethernet-line", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces recipe" },
  { service: "new-exterior-flood-camera", role: "WIRE_12_2", quantity: 2, source: "seed-materials ordinary siding/soffit recipe" },
  { service: "new-exterior-flood-camera", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials ordinary siding/soffit recipe" },
  { service: "new-video-doorbell-wiring", role: "WIRE_BELL_18_2", quantity: 25, source: "seed-video-doorbell-wiring INCLUDED_WIRE_FT" },
  { service: "new-video-doorbell-wiring", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-video-doorbell-wiring bounded recipe" },
  { service: "new-wall-sconce", role: "WIRE_14_2", quantity: 25, source: "seed-low-voltage-and-sconces recipe" },
  { service: "new-wall-sconce", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces recipe" },
  { service: "recessed-lighting", role: "WIRE_14_2", quantity: 25, source: "seed-materials first-light home run" },
  { service: "recessed-lighting", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials first-light recipe" },
  { service: "replace-bathroom-exhaust-fan", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-bathroom-fans replacement recipe" },
  { service: "replace-bathroom-exhaust-fan-with-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "bathroom fan replacement package" },
  { service: "replace-range-hood", role: "CONSUMABLES_SMALL", quantity: 1, source: "range hood replacement package" },
  { service: "replace-wall-sconce", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces replacement recipe" },
  { service: "soundbar-installation", role: "CONSUMABLES_SMALL", quantity: 1, source: "soundbar installation package" },
  { service: "tv-installation", role: "WIRE_14_2", quantity: 8, source: "seed-materials TV power recipe" },
  { service: "under-cabinet-led-lighting", role: "WIRE_14_2", quantity: 25, source: "seed-under-cabinet-lighting bounded recipe" },
  { service: "under-cabinet-led-lighting", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-under-cabinet-lighting bounded recipe" },

  { service: "bidet-smart-toilet-outlet", role: "WIRE_14_2", quantity: 25, source: "seed-materials bounded outlet recipe" },
  { service: "bidet-smart-toilet-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials bounded outlet recipe" },
  { service: "customer-supplied-smart-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "dedicated-120v-circuit-outlet", role: "WIRE_14_2", quantity: 50, source: "derived circuit-family policy allowance" },
  { service: "dedicated-120v-circuit-outlet", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived circuit-family policy allowance" },
  { service: "dishwasher-electrical", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance connection recipe" },
  { service: "doorbell-transformer-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "double-pole-breaker-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials breaker recipe" },
  { service: "dryer-receptacle-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "electric-fireplace-circuit", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived circuit-family policy allowance" },
  { service: "exterior-gfci-other-routing", role: "WIRE_12_2", quantity: 15, source: "seed-exterior-gfci-routing bounded legacy package" },
  { service: "exterior-gfci-other-routing", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-exterior-gfci-routing bounded recipe" },
  { service: "exterior-gfci-standard", role: "WIRE_12_2", quantity: 2, source: "seed-materials back-to-back GFCI recipe" },
  { service: "exterior-gfci-standard", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials back-to-back GFCI recipe" },
  { service: "floodlight-camera-existing", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "garage-door-opener-outlet", role: "WIRE_14_2", quantity: 25, source: "seed-materials bounded outlet recipe" },
  { service: "garage-door-opener-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials bounded outlet recipe" },
  { service: "garage-door-opener-outlet-ev", role: "WIRE_14_2", quantity: 25, source: "seed-materials bounded outlet recipe" },
  { service: "garage-door-opener-outlet-ev", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials bounded outlet recipe" },
  { service: "garbage-disposal-install", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance connection recipe" },
  { service: "hardwired-smoke-detector", role: "SMOKE_DETECTOR_HARDWIRED", quantity: 1, source: "seed-materials detector recipe" },
  { service: "hardwired-smoke-detector", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials detector recipe" },
  { service: "install-new-microwave", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance recipe" },
  { service: "level-2-ev-charger", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived EV route package" },
  { service: "new-240v-appliance-circuit", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived circuit-family policy allowance" },
  { service: "occupancy-motion-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials control recipe" },
  { service: "otr-microwave-install", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance recipe" },
  { service: "outdoor-landscape-lighting", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-materials landscape-lighting recipe" },
  { service: "range-receptacle-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-3-way-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-ceiling-fan", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-exterior-light-fixture", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-gfci-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-interior-light-fixture", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-led-dimmer", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials control recipe" },
  { service: "replace-motion-flood-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-standard-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-standard-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "single-pole-breaker-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials breaker recipe" },
  { service: "smart-outlet-upgrade", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "smoke-co-detector", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials detector recipe" },
  { service: "timer-switch-install", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials control recipe" },
  { service: "tv-install-existing-location", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials TV recipe" },
  { service: "usb-outlet-upgrade", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "video-doorbell-existing-wiring", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const contractorSlug = arg("contractor");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (!contractorSlug) throw new Error("--contractor is required");
  if (!isRehearsalSlug(contractorSlug)) throw new Error(`refusing non-rehearsal contractor ${contractorSlug}`);

  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT ||
      identity.lineage !== PRODUCTION_LINEAGE ||
      identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({ where: { slug: contractorSlug }, select: { id: true } });
    if (!contractor) throw new Error(`contractor ${contractorSlug} does not exist`);

    const services = new Map((await db.service.findMany({
      where: { contractorId: contractor.id, slug: { in: [...new Set(ALLOWANCES.map((a) => a.service))] } },
      select: { id: true, slug: true },
    })).map((service) => [service.slug, service.id]));
    const roles = new Map((await db.canonicalMaterial.findMany({
      where: { key: { in: [...new Set(ALLOWANCES.map((a) => a.role))] } }, select: { id: true, key: true },
    })).map((role) => [role.key, role.id]));

    console.log(`\nELECTRICAL REHEARSAL MATERIAL ALLOWANCES — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}\n`);

    let changed = 0, unchanged = 0, missing = 0;
    for (const allowance of ALLOWANCES) {
      const serviceId = services.get(allowance.service);
      const roleId = roles.get(allowance.role);
      if (!serviceId || !roleId) {
        console.log(`  ✗ ${allowance.service} / ${allowance.role} — missing service or role`);
        missing++;
        continue;
      }
      const row = await db.serviceMaterial.findFirst({
        where: { serviceId, canonicalMaterialId: roleId }, select: { quantity: true, quantityIsPolicy: true },
      });
      if (!row) {
        console.log(`  ✗ ${allowance.service} / ${allowance.role} — recipe line missing`);
        missing++;
        continue;
      }
      if (!row.quantityIsPolicy) throw new Error(`${allowance.service} / ${allowance.role} is fixed recipe material, not contractor policy`);
      const same = row.quantity === allowance.quantity;
      console.log(`  ${same ? "·" : apply ? "+" : "?"} ${allowance.service} / ${allowance.role} = ${allowance.quantity} (${allowance.source})`);
      if (same) { unchanged++; continue; }
      if (apply) {
        await declarePolicyMaterialQuantity(db, serviceId, roleId, allowance.quantity);
        changed++;
      }
    }

    const stillMissing: string[] = [];
    for (const [slug, serviceId] of services) {
      const readiness = await assessMaterialReadiness(db, serviceId, contractor.id);
      if (!readiness.ready) stillMissing.push(`${slug}: ${readiness.missing.map((item) => `${item.key}:${item.reason}`).join(", ")}`);
    }

    console.log(`\n  ${ALLOWANCES.length} declarations; ${changed} changed, ${unchanged} already matched, ${missing} missing lines.`);
    if (!apply) console.log("  Report only. Re-run with --apply and the exact rehearsal contractor to write.");
    if (stillMissing.length) {
      console.log("\n  Services still missing base recipe material setup:");
      for (const item of stillMissing) console.log(`  ✗ ${item}`);
    }
    console.log();
    if (missing || (apply && stillMissing.length)) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
