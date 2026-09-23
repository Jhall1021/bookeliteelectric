/**
 * Dated retail baselines for every reachable electrical material role that
 * was still unresolved in the 23 September 2026 rehearsal audit.
 *
 * Baselines are immutable platform reference rows. `--apply-baseline` writes
 * only those platform rows. `--apply` also explicitly accepts each unresolved
 * baseline for every named rehearsal contractor. Accepted values remain
 * ASSUMED and BASELINE-sourced; they are not presented as the contractor's
 * confirmed supplier cost.
 *
 * Safety: the write path accepts only the named rehearsal endpoint, production
 * lineage and inherited production marker. Distribution accepts only existing
 * disposable contractor slugs in the rehearsal namespace. It never activates
 * services or publishes customer prices.
 *
 *   npx tsx scripts/seed-electrical-material-baselines-2026-09-23.ts
 *   npx tsx scripts/seed-electrical-material-baselines-2026-09-23.ts --apply-baseline
 *   npx tsx scripts/seed-electrical-material-baselines-2026-09-23.ts --apply \
 *     --contractor rv2-pilot-rehearsal-manual-0922 \
 *     --contractor rv2-pilot-rehearsal-second
 */
import { PrismaClient } from "@prisma/client";
import { acceptMaterialBaselineVersion, deriveUnitCost } from "../lib/materialCost";
import { PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const SOURCED_AT = new Date("2026-09-23T00:00:00.000Z");

type Seed = {
  key: string;
  unit: string;
  sourceLabel: string;
  sourceUrl: string;
  specNote: string;
  sourcedAt?: Date;
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
  { key: "NM_CABLE_SUPPORT", unit: "each", sourceLabel: "Gardner Bender MDI-150Y insulated NM cable staples, 100-pack, The Home Depot", sourceUrl: "https://www.homedepot.com/p/205861893", specNote: "1/2-in. PVC-insulated metal staple for NM cable, normalized from a 100-pack; priced per installed support, not as a full box", packagePriceCents: 521, packageQuantity: 100 },
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
  { key: "BOX_FS_CAST", unit: "each", sourceLabel: "BELL 5385-0B 1-gang weatherproof cast box, The Home Depot", sourceUrl: "https://www.homedepot.com/p/315686611", specNote: "NEMA 3R gray cast-metal 1-gang box with three 1/2-in. threaded outlets", unitCostCents: 969 },
  { key: "BOX_SURFACE_4S", unit: "each", sourceLabel: "4-in. square steel surface box retail check, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Electrical-Boxes-Conduit-Fittings-Boxes-Brackets/N-5yc1vZbohn", specNote: "4-in. square steel exposed-work box; cover is a separate role", unitCostCents: 267 },
  { key: "BREAKER_DOUBLE_POLE", unit: "each", sourceLabel: "Square D Homeline standard-trip 2-pole breaker, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Power-Distribution-Electrical-Panels-Protective-Devices-Circuit-Breakers/Square-D/Standard-Trip/Homeline/N-5yc1vZbm16Zal2Z1z0mi4jZ1z1zd2x", specNote: "Representative standard 2-pole Homeline breaker; amperage-specific roles should be used where the recipe knows the rating", unitCostCents: 1824 },
  { key: "BREAKER_DOUBLE_POLE_20A", unit: "each", sourceLabel: "Square D HOM220CP 20A 2-pole breaker, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Power-Distribution-Electrical-Panels-Protective-Devices-Circuit-Breakers/Square-D/Standard-Trip/Homeline/N-5yc1vZbm16Zal2Z1z0mi4jZ1z1zd2x", specNote: "20A, 2-pole, standard-trip Homeline breaker", unitCostCents: 1824 },
  { key: "BREAKER_DOUBLE_POLE_30A", unit: "each", sourceLabel: "Square D HOM230CP 30A 2-pole breaker, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Power-Distribution-Electrical-Panels-Protective-Devices-Circuit-Breakers/Square-D/Standard-Trip/Homeline/N-5yc1vZbm16Zal2Z1z0mi4jZ1z1zd2x", specNote: "30A, 2-pole, standard-trip Homeline breaker", unitCostCents: 1824 },
  { key: "BREAKER_DOUBLE_POLE_50A", unit: "each", sourceLabel: "Square D HOM250CP 50A 2-pole breaker, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Power-Distribution-Electrical-Panels-Protective-Devices-Circuit-Breakers/Square-D/Standard-Trip/Homeline/N-5yc1vZbm16Zal2Z1z0mi4jZ1z1zd2x", specNote: "50A, 2-pole, standard-trip Homeline breaker", unitCostCents: 1824 },
  { key: "BREAKER_SINGLE_POLE_15A", unit: "each", sourceLabel: "Square D HOM115CP 15A single-pole breaker, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Power-Distribution-Electrical-Panels-Protective-Devices-Circuit-Breakers/Square-D/15-amp/Homeline/N-5yc1vZbm16Zal2Z1z1zd2xZ1z1znbn", specNote: "15A, single-pole, standard-trip Homeline breaker", unitCostCents: 726 },
  { key: "CONSUMABLES_SMALL", unit: "job", sourceLabel: "Small electrical consumables representative basket, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Electrical-Tools-Accessories-Electrical-Tape-Wire-Connectors/N-5yc1vZbmco", specNote: "Explicit $3 job allowance for ordinary wire connectors, tape, screws and labels; not a single SKU and not a contractor-confirmed cost", unitCostCents: 300 },
  { key: "CONSUMABLES_MEDIUM", unit: "job", sourceLabel: "Medium electrical consumables representative basket, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Electrical-Tools-Accessories-Electrical-Tape-Wire-Connectors/N-5yc1vZbmco", specNote: "Explicit $7 job allowance for ordinary connectors, fasteners, bushings, tape and labels; not a single SKU and not a contractor-confirmed cost", unitCostCents: 700 },
  { key: "COVER_IN_USE_BUBBLE", unit: "each", sourceLabel: "Commercial Electric extra-duty 1-gang in-use cover, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Electrical-Boxes-Conduit-Fittings-Covers/N-5yc1vZbohm", specNote: "Extra-duty horizontal/vertical non-metallic while-in-use cover, 1-gang", unitCostCents: 3788 },
  { key: "COVER_RAISED_4S", unit: "each", sourceLabel: "Southwire G1944-UPC 4-in. square raised receptacle cover, The Home Depot", sourceUrl: "https://www.homedepot.com/p/324472724", specNote: "Raised exposed-work cover for a 30A-to-50A round receptacle on a 4-in. square box", unitCostCents: 393 },
  { key: "DIMMER_LED", unit: "each", sourceLabel: "Leviton DDL06 Decora LED dimmer/timer, The Home Depot", sourceUrl: "https://www.homedepot.com/p/310267942", specNote: "Compatible wallbox LED dimmer with wall plate; use a separate smart-control role when commissioning is required", unitCostCents: 2997 },
  { key: "DOORBELL_TRANSFORMER", unit: "each", sourceLabel: "Defiant 18000044 16VAC/30VA doorbell transformer, The Home Depot", sourceUrl: "https://www.homedepot.com/p/322882044", specNote: "120V input, 16VAC/30VA output, suitable for ordinary wired and video-doorbell applications", unitCostCents: 1997 },
  { key: "GFCI_INTERIOR", unit: "each", sourceLabel: "Leviton GFTR1-KW 15A self-test tamper-resistant GFCI, The Home Depot", sourceUrl: "https://www.homedepot.com/p/206860596", specNote: "15A/125V interior self-test tamper-resistant GFCI receptacle, white", unitCostCents: 1998 },
  { key: "OUTLET_SMART", unit: "each", sourceLabel: "Leviton D215R Decora Smart Wi-Fi duplex outlet, The Home Depot", sourceUrl: "https://www.homedepot.com/p/320528167", specNote: "15A tamper-resistant in-wall smart duplex receptacle; app ecosystem must be confirmed", unitCostCents: 3310 },
  { key: "OUTLET_USB", unit: "each", sourceLabel: "Leviton BAC15 15A USB-A/USB-C duplex outlet, The Home Depot", sourceUrl: "https://www.homedepot.com/p/343467102", specNote: "15A tamper-resistant duplex receptacle with 18W USB-A and USB-C charging", unitCostCents: 1599 },
  { key: "RECEPTACLE_14_30", unit: "each", sourceLabel: "Leviton 278-S00 NEMA 14-30R receptacle, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Electrical-Outlets-Receptacles-Outlets/30-A/NEMA-14-30R/N-5yc1vZ2fkpdz5Z1z11uk9Z1z241yx", specNote: "30A, 125/250V, 4-wire grounding flush-mount receptacle", unitCostCents: 1098 },
  { key: "RECEPTACLE_14_50", unit: "each", sourceLabel: "Leviton 279-S00 NEMA 14-50R receptacle, The Home Depot", sourceUrl: "https://www.homedepot.com/p/300324414", specNote: "50A, 125/250V, 4-wire grounding flush-mount receptacle; standard appliance duty, not an EV continuous-use upgrade", unitCostCents: 1142 },
  { key: "RECEPTACLE_DRYER_30A", unit: "each", sourceLabel: "Leviton 278-S00 NEMA 14-30R dryer receptacle, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Electrical-Outlets-Receptacles-Outlets/30-A/NEMA-14-30R/N-5yc1vZ2fkpdz5Z1z11uk9Z1z241yx", specNote: "Representative modern 30A 4-wire dryer receptacle; legacy 3-wire conversion is outside this baseline", unitCostCents: 1098 },
  { key: "RECEPTACLE_RANGE_50A", unit: "each", sourceLabel: "Leviton 279-S00 NEMA 14-50R range receptacle, The Home Depot", sourceUrl: "https://www.homedepot.com/p/300324414", specNote: "Representative modern 50A 4-wire range receptacle; legacy 3-wire conversion is outside this baseline", unitCostCents: 1142 },
  { key: "RECEPTACLE_STANDARD", unit: "each", sourceLabel: "Leviton T5320-WMP 15A tamper-resistant receptacles, 10-pack, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Electrical-Outlets-Receptacles/White/15-amp/10/N-5yc1vZc33aZ1z0vm5fZ1z141gsZ1z17l6n", specNote: "15A/125V tamper-resistant residential duplex receptacle, white, normalized from a 10-pack", packagePriceCents: 1098, packageQuantity: 10 },
  { key: "SMOKE_DETECTOR_HARDWIRED", unit: "each", sourceLabel: "Kidde Firex 21029886 hardwired smoke detector, The Home Depot", sourceUrl: "https://www.homedepot.com/p/100246185", specNote: "120V hardwired ionization smoke alarm with interconnect and 9V battery backup", unitCostCents: 2898 },
  { key: "SURFACE_DEVICE_BOX_1G", unit: "each", sourceLabel: "Legrand Wiremold V5748S 1-gang surface box, The Home Depot", sourceUrl: "https://www.homedepot.com/p/202523810", specNote: "500/700-series shallow metal surface-raceway switch/receptacle box, ivory", unitCostCents: 844 },
  { key: "SURFACE_RACEWAY_CHANNEL", unit: "ft", sourceLabel: "Legrand Wiremold 500-series 5-ft metal surface raceway channel, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electronics-Cable-Management-Raceways/Metal/N-5yc1vZc65fZ1z0vb5j", specNote: "500-series metal surface-raceway channel, base and cover; normalized from the retailer's 5-ft $12.73 listing", packagePriceCents: 1273, packageQuantity: 5, sourcedAt: new Date("2026-09-23T16:00:00.000Z") },
  { key: "SURFACE_RACEWAY_ELBOW_FLAT", unit: "each", sourceLabel: "Legrand Wiremold B-6 500-series flat elbow, The Home Depot", sourceUrl: "https://www.homedepot.com/p/100197080", specNote: "90-degree flat elbow for the selected 500-series metal surface raceway", unitCostCents: 630 },
  { key: "SURFACE_RACEWAY_ELBOW_INSIDE", unit: "each", sourceLabel: "Legrand Wiremold 500/700-series inside elbow, The Home Depot", sourceUrl: "https://www.homedepot.com/p/100197080", specNote: "90-degree inside elbow for the selected 500/700-series metal surface raceway", unitCostCents: 598 },
  { key: "SURFACE_RACEWAY_ELBOW_OUTSIDE", unit: "each", sourceLabel: "Legrand Wiremold 500-series outside elbow, The Home Depot", sourceUrl: "https://www.homedepot.com/p/100197080", specNote: "90-degree outside elbow for the selected 500-series metal surface raceway", unitCostCents: 698 },
  { key: "SURGE_PROTECTOR_WHOLE_HOUSE", unit: "each", sourceLabel: "Square D HEPD80 80kA whole-home surge protector, The Home Depot", sourceUrl: "https://www.homedepot.com/p/203540660", specNote: "Universal external-mount Type 1/Type 2 whole-home SPD; breaker and flush-mount kit are separate roles", unitCostCents: 14200 },
  { key: "SURGE_TRIM_KIT", unit: "each", sourceLabel: "Square D HEPD25MKF flush-mount kit, The Home Depot", sourceUrl: "https://www.homedepot.com/p/316388212", specNote: "Representative flush-mount trim/bracket kit for an external Square D HEPD installation; verify selected SPD compatibility", unitCostCents: 5143 },
  { key: "SWITCH_3WAY", unit: "each", sourceLabel: "Leviton residential 15A 3-way switch retail check, The Home Depot", sourceUrl: "https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Light-Switches/3-Way/N-5yc1vZc33wZ1z17m39", specNote: "Residential-grade 15A 3-way toggle switch, white", unitCostCents: 400 },
  { key: "SWITCH_OCCUPANCY", unit: "each", sourceLabel: "Leviton IPS02 Decora occupancy sensor switch, The Home Depot", sourceUrl: "https://www.homedepot.com/p/303169578", specNote: "Auto-on motion sensor wall switch, 2.5A single-pole", unitCostCents: 2578 },
  { key: "SWITCH_STANDARD", unit: "each", sourceLabel: "Leviton 1451-2WM 15A single-pole switches, 10-pack, The Home Depot", sourceUrl: "https://www.homedepot.com/p/100075329", specNote: "Residential-grade 15A single-pole toggle switch, white, normalized from a 10-pack", packagePriceCents: 828, packageQuantity: 10 },
  { key: "SWITCH_TIMER", unit: "each", sourceLabel: "Leviton VPT24 Decora programmable timer switch, The Home Depot", sourceUrl: "https://www.homedepot.com/p/206095031", specNote: "24-hour programmable in-wall timer, neutral required, single-pole or 3-way", unitCostCents: 6259 },
  { key: "WALL_PLATE", unit: "each", sourceLabel: "Leviton PJ1-WM 1-gang nylon wall plates, 10-pack, The Home Depot", sourceUrl: "https://www.homedepot.com/p/sets/Leviton-1-Gang-White-Toggle-Wall-Plate-and-15-Amp-Single-Pole-Switch-Combo-10-Pack/341631750", specNote: "White 1-gang nylon midway wall plate, normalized from a 10-pack", packagePriceCents: 658, packageQuantity: 10 },
  { key: "WIRE_10_3", unit: "ft", sourceLabel: "Southwire 63948422 50-ft 10/3 NM-B cable, The Home Depot", sourceUrl: "https://www.homedepot.com/p/202316239", specNote: "10 AWG, 3-conductor plus ground, solid copper NM-B, 50-ft coil", packagePriceCents: 15600, packageQuantity: 50 },
  { key: "WIRE_6_3", unit: "ft", sourceLabel: "Southwire 63950002 125-ft 6/3 NM-B cable, The Home Depot", sourceUrl: "https://www.homedepot.com/p/202316279", specNote: "6 AWG, 3-conductor plus ground, stranded copper NM-B, 125-ft roll", packagePriceCents: 49600, packageQuantity: 125 },
];

function args(name: string): string[] {
  const flag = `--${name}`;
  return process.argv.flatMap((value, index) => value === flag && process.argv[index + 1]
    ? [process.argv[index + 1]]
    : []);
}

async function main() {
  const acceptForRehearsal = process.argv.includes("--apply");
  const applyBaseline = acceptForRehearsal || process.argv.includes("--apply-baseline");
  const contractorSlugs = [...new Set(args("contractor"))];
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (acceptForRehearsal && contractorSlugs.length === 0) throw new Error("--apply requires at least one --contractor");
  for (const contractorSlug of contractorSlugs) {
    if (!contractorSlug.startsWith(PILOT_REHEARSAL_PREFIX)) throw new Error(`refusing non-rehearsal contractor ${contractorSlug}`);
  }

  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT ||
      identity.lineage !== PRODUCTION_LINEAGE ||
      identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractors = contractorSlugs.length === 0 ? [] : await db.contractor.findMany({
      where: { slug: { in: contractorSlugs } }, select: { id: true, slug: true },
    });
    const foundSlugs = new Set(contractors.map((contractor) => contractor.slug));
    const missingContractors = contractorSlugs.filter((slug) => !foundSlugs.has(slug));
    if (missingContractors.length) throw new Error(`rehearsal contractor(s) do not exist: ${missingContractors.join(", ")}`);

    console.log(`\nELECTRICAL RETAIL MATERIAL BASELINES — ${acceptForRehearsal ? "APPLY + DISTRIBUTE" : applyBaseline ? "APPLY BASELINE" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  rehearsal recipients: ${contractorSlugs.length ? contractorSlugs.join(", ") : "none"}`);
    console.log(`  sourced: 2026-09-23\n`);

    let created = 0, existing = 0, accepted = 0, alreadyResolved = 0, missingRole = 0;
    for (const seed of SEEDS) {
      const canonical = await db.canonicalMaterial.findUnique({ where: { key: seed.key }, select: { id: true, unit: true } });
      if (!canonical) { console.log(`  ✗ ${seed.key} — canonical role missing`); missingRole++; continue; }
      if (canonical.unit !== seed.unit) throw new Error(`${seed.key}: canonical unit ${canonical.unit} does not match baseline unit ${seed.unit}`);

      const derived = "unitCostCents" in seed
        ? { unitCostCents: seed.unitCostCents, unitCostMilliCents: seed.unitCostCents * 1000 }
        : deriveUnitCost({ packagePriceCents: seed.packagePriceCents, packageQuantity: seed.packageQuantity });
      const sourcedAt = seed.sourcedAt ?? SOURCED_AT;
      let version = await db.materialBaselineVersion.findFirst({
        where: { canonicalMaterialId: canonical.id, sourceLabel: seed.sourceLabel, sourcedAt },
        select: { id: true },
      });

      if (!version && applyBaseline) {
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
            sourcedAt,
          },
          select: { id: true },
        });
        created++;
      } else if (version) existing++;

      console.log(`  ${applyBaseline ? "+" : "?"} ${seed.key.padEnd(32)} $${(derived.unitCostCents / 100).toFixed(2)}/${seed.unit} — ${seed.sourceLabel}`);
      if (acceptForRehearsal && version) {
        for (const contractor of contractors) {
          const current = await db.contractorMaterial.findFirst({
            where: { contractorId: contractor.id, canonicalMaterialId: canonical.id, active: true }, select: { id: true },
          });
          if (current) { alreadyResolved++; continue; }
          const result = await acceptMaterialBaselineVersion(
            db,
            { contractorId: contractor.id, baselineVersionId: version.id },
            { reason: "Accepted dated online retail platform baseline for electrical rehearsal", actor: "codex-rehearsal-material-audit" },
          );
          if (result.ok) accepted++;
          else if (result.code === "ALREADY_RESOLVED") alreadyResolved++;
          else throw new Error(`${contractor.slug}/${seed.key}: baseline acceptance failed (${result.code})`);
        }
      }
    }

    console.log(`\n  ${SEEDS.length} baselines; ${created} created, ${existing} existing, ${accepted} accepted by rehearsal recipients, ${alreadyResolved} recipient roles already resolved, ${missingRole} missing roles.`);
    if (!applyBaseline) console.log("  Report only. Re-run with --apply-baseline to seed the platform baseline, or --apply plus one or more rehearsal contractors to distribute it.\n");
    if (missingRole) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
