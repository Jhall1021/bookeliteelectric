/**
 * Dated retail baselines for every reachable electrical material role that
 * was still unresolved in the 23 September 2026 rehearsal audit.
 *
 * Baselines are immutable platform reference rows. With --apply, this script
 * also explicitly accepts each still-unresolved baseline for the designated
 * rehearsal contractor. Accepted values remain ASSUMED and BASELINE-sourced;
 * they are not presented as the contractor's confirmed supplier cost.
 *
 * Safety: the write path accepts only the named rehearsal endpoint, production
 * lineage, inherited production marker, and the exact disposable contractor.
 * It never activates services or publishes customer prices.
 *
 *   npx tsx scripts/seed-electrical-material-baselines-2026-09-23.ts
 *   npx tsx scripts/seed-electrical-material-baselines-2026-09-23.ts --apply \
 *     --contractor rv2-pilot-rehearsal-manual-0922
 */
import { PrismaClient } from "@prisma/client";
import { acceptMaterialBaselineVersion, deriveUnitCost } from "../lib/materialCost";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
const SOURCED_AT = new Date("2026-09-23T00:00:00.000Z");

type Seed = {
  key: string;
  unit: string;
  sourceLabel: string;
  sourceUrl: string;
  specNote: string;
} & (
  | { unitCostCents: number }
  | { packagePriceCents: number; packageQuantity: number }
);

const SEEDS: Seed[] = [
  { key: "LOW_VOLTAGE_RING", unit: "each", sourceLabel: "Carlon SC100RR low-voltage old-work bracket, The Home Depot", sourceUrl: "https://www.homedepot.com/p/100160916", specNote: "1-gang, non-metallic, old-work, low-voltage bracket; one each", unitCostCents: 276 },
  { key: "BOX_CEILING_STANDARD", unit: "each", sourceLabel: "Carlon B618RR round old-work ceiling box, The Home Depot", sourceUrl: "https://www.homedepot.com/p/100404072", specNote: "1-gang, 18 cu. in., non-metallic round old-work fixture box; not fan-rated", unitCostCents: 391 },
  { key: "BOX_FAN_RATED", unit: "each", sourceLabel: "Commercial Electric CMB150-OB fan box and brace kit, The Home Depot", sourceUrl: "https://www.homedepot.com/p/205383178", specNote: "4-in. round 15.3 cu. in. metallic fan/light box with remodel brace; fan-rated", unitCostCents: 1965 },
  { key: "BATH_FAN_LIGHT_STANDARD", unit: "each", sourceLabel: "Broan-NuTone BEL8 80 CFM fan/light, The Home Depot", sourceUrl: "https://www.homedepot.com/p/341883505", specNote: "80 CFM, 1.5 sones, ENERGY STAR bathroom exhaust fan with LED light", unitCostCents: 7626 },
  { key: "BATH_FAN_STANDARD", unit: "each", sourceLabel: "Broan-NuTone BE8 80 CFM fan, HVACDirect", sourceUrl: "https://hvacdirect.com/ventilation-products/residential-fans/bathroom-exhaust-fans/filter/broan.html", specNote: "80 CFM, 1.5 sones, ENERGY STAR bathroom exhaust fan without light", unitCostCents: 6900 },
  { key: "CABLE_CAT6", unit: "ft", sourceLabel: "Southwire 56918945 500-ft Cat6 CMR cable, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Wire-Data-Cables/Southwire/Cat6/500-ft/N-5yc1vZc5a2Z4mmZ1z0ucfkZ1z1ugyy", specNote: "23/4 solid copper Cat6 CMR riser cable, 500-ft pull box", packagePriceCents: 12500, packageQuantity: 500 },
  { key: "CABLE_RG6", unit: "ft", sourceLabel: "Southwire 56918245 500-ft RG6 dual-shield cable, The Home Depot", sourceUrl: "https://www.homedepot.com/p/202316233", specNote: "18 AWG RG6 dual-shield copper CATV CM/CL2 coaxial cable, 500-ft box", packagePriceCents: 4874, packageQuantity: 500 },
  { key: "CONDUIT_FITTINGS_1", unit: "set", sourceLabel: "1-in. PVC conduit fittings representative job basket, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Electrical-Boxes-Conduit-Fittings-Conduit-Fittings/1/PVC/N-5yc1vZbohkZ1z1139pZ1z117wu", specNote: "Working allowance for one ordinary 1-in. PVC run: couplings, terminal adapters, straps and allocated PVC cement; unusual bends or expansion fittings excluded", unitCostCents: 1200 },
  { key: "CONDUIT_LFNC_FITTINGS_1", unit: "set", sourceLabel: "1-in. LFNC straight and 90-degree connector pair, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Electrical-Boxes-Conduit-Fittings-Conduit-Fittings/1/Connector/PVC/N-5yc1vZbohkZ1z0usncZ1z1139pZ1z117wu", specNote: "One 1-in. straight liquidtight connector plus one 1-in. 90-degree liquidtight connector for a standard equipment run", unitCostCents: 1640 },
  { key: "GENERATOR_INLET_BOX_30A", unit: "each", sourceLabel: "Reliance Controls PB30 power inlet box, The Home Depot", sourceUrl: "https://www.homedepot.com/p/202213702", specNote: "30A, 125/250V, NEMA 3R outdoor generator inlet box", unitCostCents: 6490 },
  { key: "GROUND_CLAMP", unit: "each", sourceLabel: "Southwire 65176440 direct-burial ground rod clamp, The Home Depot", sourceUrl: "https://www.homedepot.com/p/312648487", specNote: "Clamp for 5/8-in. ground rod or 1/2-in. rebar, #10 solid/stranded through #2 stranded", unitCostCents: 435 },
  { key: "GROUND_ROD", unit: "each", sourceLabel: "ERICO 615880UPC copper-clad ground rod, The Home Depot", sourceUrl: "https://www.homedepot.com/b/ERICO/N-5yc1vZf51", specNote: "5/8-in. diameter by 8-ft copper-clad grounding electrode", unitCostCents: 2901 },
  { key: "INTERLOCK_KIT", unit: "each", sourceLabel: "Square D HOMRBGK2C generator interlock kit, The Home Depot", sourceUrl: "https://www.homedepot.com/p/203030954", specNote: "Representative listed kit for compatible Square D Homeline outdoor 150-225A QOM2 panels only; exact panel compatibility must be confirmed", unitCostCents: 9635 },
  { key: "JACK_COAX_F", unit: "each", sourceLabel: "NTW NKY-FF/F-WHT F-type keystone feed-through jack, The Home Depot", sourceUrl: "https://www.homedepot.com/p/206657288", specNote: "White female-to-female F-type feed-through snap-in keystone insert", unitCostCents: 299 },
  { key: "JACK_KEYSTONE_RJ45", unit: "each", sourceLabel: "Commercial Electric 5016-WH-10 Cat6 keystone jacks, 10-pack, The Home Depot", sourceUrl: "https://www.homedepot.com/p/304295545", specNote: "Cat6 110-punchdown keystone jack, normalized from a 10-pack", packagePriceCents: 6698, packageQuantity: 10 },
  { key: "LED_CHANNEL_DIFFUSER", unit: "ft", sourceLabel: "Armacost 960059 aluminum LED channel, five 39-in. pieces, The Home Depot", sourceUrl: "https://www.homedepot.com/p/318257762", specNote: "Surface-mount aluminum LED tape channel with diffuser and mounting hardware; 195 in. total", packagePriceCents: 2997, packageQuantity: 16.25 },
  { key: "LED_DRIVER", unit: "each", sourceLabel: "Armacost 860605 60W 24V dimming LED driver, The Home Depot", sourceUrl: "https://www.homedepot.com/p/318257760", specNote: "60-watt, 24-volt DC constant-voltage universal dimming driver; size to actual connected tape load", unitCostCents: 5895 },
  { key: "LED_TAPE", unit: "ft", sourceLabel: "Armacost 145230 RibbonFlex Pro 24V LED tape, The Home Depot", sourceUrl: "https://www.homedepot.com/p/319593247", specNote: "16.4-ft, 24V, 3000K, 60 LED/m tape-light reel", packagePriceCents: 4693, packageQuantity: 16.4 },
  { key: "LOW_VOLTAGE_COVER", unit: "each", sourceLabel: "Commercial Electric DPPSSW-1BN-1 cable pass-through wall plate, The Home Depot", sourceUrl: "https://www.homedepot.com/p/328352479", specNote: "1-gang recessed low-voltage cable pass-through wall plate, white", unitCostCents: 1198 },
  { key: "METER_SOCKET_200A", unit: "each", sourceLabel: "Siemens UAT417-XGF 200A meter socket, The Home Depot", sourceUrl: "https://www.homedepot.com/p/326343181", specNote: "200A, 4-jaw, no-bypass, ringless overhead/underground meter socket; utility approval must be confirmed", unitCostCents: 10400 },
  { key: "PANEL_MAIN_BREAKER", unit: "each", sourceLabel: "Square D HOM2040M100PCVP 100A main-breaker load center, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Power-Distribution-Electrical-Panels-Protective-Devices-Breaker-Boxes/Square-D/Main-Breaker-Panel/Homeline/N-5yc1vZbm2wZal2Z1z1zd2xZ1z202b2", specNote: "Representative 100A, 20-space/40-circuit indoor main-breaker panel with cover; other amperages and brands require reviewed substitution", unitCostCents: 11900 },
  { key: "PANEL_200A_MAIN_BREAKER", unit: "each", sourceLabel: "Square D HOM3060M200PCVP 200A main-breaker load center, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Power-Distribution-Electrical-Panels-Protective-Devices-Breaker-Boxes/Square-D/200-amp/Homeline/N-5yc1vZbm2wZal2Z1z1zd2xZ1z1znc6", specNote: "200A, 30-space/60-circuit indoor plug-on-neutral main-breaker panel with cover", unitCostCents: 21400 },
  { key: "RECEPTACLE_6_30", unit: "each", sourceLabel: "Leviton 5372-S00 NEMA 6-30R receptacle, The Home Depot", sourceUrl: "https://www.homedepot.com/p/300324202", specNote: "30A, 250V, 2-pole/3-wire grounding, NEMA 6-30R flush receptacle", unitCostCents: 1355 },
  { key: "RECEPTACLE_6_50", unit: "each", sourceLabel: "Leviton 5374-S00 NEMA 6-50R receptacle, The Home Depot", sourceUrl: "https://www.homedepot.com/p/300324220", specNote: "50A, 250V, 2-pole/3-wire grounding, NEMA 6-50R flush receptacle", unitCostCents: 1357 },
  { key: "RECESSED_WAFER", unit: "each", sourceLabel: "Lithonia WF4 selectable-CCT canless LED wafer kit, The Home Depot", sourceUrl: "https://www.homedepot.com/p/308905674", specNote: "4-in. canless remodel/new-construction integrated LED wafer kit with remote junction/driver box", unitCostCents: 2176 },
  { key: "SERVICE_ENTRANCE_CABLE_200A", unit: "ft", sourceLabel: "Southwire 4/0-4/0-4/0-2/0 aluminum SER cable by the foot, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Wire-Service-Entrance-Wires/Aluminum/Cut-By-The-Foot/N-5yc1vZc578Z1z0rqh6Z1z0ukz9", specNote: "4-conductor 4/0-4/0-4/0-2/0 aluminum SER, 200A-rated listing, sold by the foot", unitCostCents: 830 },
  { key: "SPA_PANEL_GFCI_50A", unit: "each", sourceLabel: "Square D HOME250SPA 50A GFCI spa panel, The Home Depot", sourceUrl: "https://www.homedepot.com/p/205170085", specNote: "Outdoor 2-space/4-circuit spa panel with integral 2-pole 50A GFCI", unitCostCents: 12900 },
  { key: "SURFACE_FIXTURE_BOX", unit: "each", sourceLabel: "Legrand Wiremold NMW4 circular fixture box, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electronics-Cable-Management-Raceways/Wiremold/Next-Day-Delivery/N-5yc1vZc65fZ1z175cqZ1z23x60", specNote: "4-in. non-metallic PVC surface-raceway circular fixture box, white", unitCostCents: 1648 },
  { key: "WIRE_10_2", unit: "ft", sourceLabel: "Southwire 28829055 250-ft 10/2 NM-B cable, The Home Depot", sourceUrl: "https://www.homedepot.com/p/202316274", specNote: "10 AWG, 2-conductor plus ground, copper NM-B, 250-ft roll", packagePriceCents: 30800, packageQuantity: 250 },
  { key: "WIRE_6_2", unit: "ft", sourceLabel: "Southwire 28894402 125-ft 6/2 NM-B cable, The Home Depot", sourceUrl: "https://www.homedepot.com/p/202316592", specNote: "6 AWG, 2-conductor plus ground, stranded copper NM-B, 125-ft roll", packagePriceCents: 36100, packageQuantity: 125 },
  { key: "WIRE_BELL_18_2", unit: "ft", sourceLabel: "Southwire 64162141 100-ft 18/2 low-voltage wire, The Home Depot", sourceUrl: "https://www.homedepot.com/p/204862205", specNote: "18 AWG, 2-conductor solid copper CL2 low-voltage cable, 100-ft roll; suitable for doorbell/control use", packagePriceCents: 1962, packageQuantity: 100 },
  { key: "WIRE_GROUND_6", unit: "ft", sourceLabel: "Southwire 10638592 50-ft #6 bare copper grounding wire, The Home Depot", sourceUrl: "https://www.homedepot.com/p/301126311", specNote: "6 AWG solid bare copper grounding conductor, 50-ft coil", packagePriceCents: 5400, packageQuantity: 50 },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const contractorSlug = arg("contractor") ?? EXPECTED_CONTRACTOR;
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (contractorSlug !== EXPECTED_CONTRACTOR) throw new Error(`refusing contractor ${contractorSlug}`);

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

    console.log(`\nELECTRICAL RETAIL MATERIAL BASELINES — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}`);
    console.log(`  sourced: 2026-09-23\n`);

    let created = 0, existing = 0, accepted = 0, alreadyResolved = 0, missingRole = 0;
    for (const seed of SEEDS) {
      const canonical = await db.canonicalMaterial.findUnique({ where: { key: seed.key }, select: { id: true, unit: true } });
      if (!canonical) { console.log(`  ✗ ${seed.key} — canonical role missing`); missingRole++; continue; }
      if (canonical.unit !== seed.unit) throw new Error(`${seed.key}: canonical unit ${canonical.unit} does not match baseline unit ${seed.unit}`);

      const derived = "unitCostCents" in seed
        ? { unitCostCents: seed.unitCostCents, unitCostMilliCents: seed.unitCostCents * 1000 }
        : deriveUnitCost({ packagePriceCents: seed.packagePriceCents, packageQuantity: seed.packageQuantity });
      let version = await db.materialBaselineVersion.findFirst({
        where: { canonicalMaterialId: canonical.id, sourceLabel: seed.sourceLabel, sourcedAt: SOURCED_AT },
        select: { id: true },
      });

      if (!version && apply) {
        version = await db.materialBaselineVersion.create({
          data: {
            canonicalMaterialId: canonical.id,
            unitCostCents: derived.unitCostCents,
            unitCostMilliCents: derived.unitCostMilliCents,
            packagePriceCents: "packagePriceCents" in seed ? seed.packagePriceCents : null,
            packageQuantity: "packageQuantity" in seed ? seed.packageQuantity : null,
            packageUnit: "packagePriceCents" in seed ? seed.unit : null,
            unit: seed.unit,
            sourceLabel: seed.sourceLabel,
            sourceUrl: seed.sourceUrl,
            specNote: seed.specNote,
            sourcedAt: SOURCED_AT,
          },
          select: { id: true },
        });
        created++;
      } else if (version) existing++;

      const current = await db.contractorMaterial.findFirst({
        where: { contractorId: contractor.id, canonicalMaterialId: canonical.id, active: true }, select: { id: true },
      });
      if (current) {
        alreadyResolved++;
        console.log(`  · ${seed.key.padEnd(32)} already contractor-priced`);
        continue;
      }
      console.log(`  ${apply ? "+" : "?"} ${seed.key.padEnd(32)} $${(derived.unitCostCents / 100).toFixed(2)}/${seed.unit} — ${seed.sourceLabel}`);
      if (apply && version) {
        const result = await acceptMaterialBaselineVersion(
          db,
          { contractorId: contractor.id, baselineVersionId: version.id },
          { reason: "Accepted dated online retail baseline to close the 2026-09-23 electrical rehearsal material-cost audit", actor: "codex-rehearsal-material-audit" },
        );
        if (result.ok) accepted++;
        else if (result.code === "ALREADY_RESOLVED") alreadyResolved++;
        else throw new Error(`${seed.key}: baseline acceptance failed (${result.code})`);
      }
    }

    console.log(`\n  ${SEEDS.length} baselines; ${created} created, ${existing} existing, ${accepted} accepted, ${alreadyResolved} already contractor-priced, ${missingRole} missing roles.`);
    if (!apply) console.log("  Report only. Re-run with --apply and the exact rehearsal contractor to write.\n");
    if (missingRole) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
