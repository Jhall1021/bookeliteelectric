/**
 * ROUTING V2 IS AN ONBOARDING ARCHITECTURE, NOT AN ELITE CUSTOMIZATION.
 *
 * Everything V2 was built on came from Elite: a mature tenant with real
 * component economics, hand-seeded history and years of decisions already in
 * its rows. Those are exactly the conditions under which a customization
 * passes for an architecture. The only way to tell them apart is to onboard
 * somebody with none of it and look at what actually arrives.
 *
 * So this runs against a contractor created minutes ago through the real
 * lifecycle — contractor row, storefront, trade enrolment, preflight +
 * installCatalog against the published catalog — and asserts two things that
 * have to be true together:
 *
 *   PHYSICAL ROUTING SUCCEEDS   the same modules, the same NUMBER bounds, the
 *                               same quantity bindings, the same capability
 *                               gates, the same components in the same
 *                               quantities as the accepted Elite proof.
 *   ECONOMICS DID NOT COME WITH IT
 *                               no labor, no material costs, no approved
 *                               component prices, no $280, no capabilities,
 *                               nothing activated.
 *
 * Either one alone is misleading. Structure without isolation is a clone;
 * isolation without structure is an empty account.
 *
 * This file names no contractor helper for the thing under test. It resolves
 * the proof tenant by (contractorId, slug) like any other, because a template
 * that needs `eliteContractorId()` to work is not a template.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { serviceFor } from "../prisma/_serviceTargets";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { ACCESSIBLE_KEYS } from "../prisma/_concealedRouteModules";
import { FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { OUTLET_V2_KEYS, OUTLET_SLUG } from "../prisma/seed-new-outlet-v2";
import { PROOF_SLUG } from "./provision-routing-v2-proof-contractor";

const prisma = new PrismaClient();
const DIRECT = "surface-mounted-outlet";
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

let CID = "";
async function walk(slug: string, answers: Record<string, string>) {
  const t = await serviceFor(prisma, CID, slug);
  const loaded = await loadServiceForResolution(prisma, t.id);
  if (!loaded) throw new Error(`${slug} could not be loaded for resolution`);
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  return resolveRoute(loaded, answers, true, settings);
}
/* eslint-disable @typescript-eslint/no-explicit-any */
const comps = (r: any) => (r?.config?.components ?? []).map((c: any) => ({ key: c.key, quantity: c.quantity }));
const has = (r: any, k: string) => comps(r).some((c: any) => c.key === k);
const qty = (r: any, k: string) => comps(r).find((c: any) => c.key === k)?.quantity;
const built = (r: any) => comps(r).length > 0;
const fingerprint = (r: any) =>
  comps(r).map((c: any) => `${c.key}x${c.quantity}`).sort().join("|");
const reasonOf = (r: any) => ("reason" in r ? String(r.reason) : "");

const qualified = { outlet_load_type: "everyday", outlet_power_source: "tap_existing" };
const BB = "BASEBOARD_ACCESS_REINSTALL", DW = "DRYWALL_ACCESS_CUTTING";

async function setCap(key: string, state: "none" | "declared") {
  await prisma.contractorCapability.deleteMany({ where: { contractorId: CID, key } });
  if (state === "declared") await prisma.contractorCapability.create({ data: { contractorId: CID, key } });
}

async function main() {
  console.log("\nFRESH CONTRACTOR — ROUTING V2 FROM THE CANONICAL TEMPLATE\n");

  const proof = await prisma.contractor.findUnique({
    where: { slug: PROOF_SLUG }, select: { id: true, slug: true, createdAt: true } });
  if (!proof) throw new Error(`No ${PROOF_SLUG}. Run provision-routing-v2-proof-contractor.ts --apply.`);
  CID = proof.id;
  const outlet = await serviceFor(prisma, CID, OUTLET_SLUG);
  console.log(`  tenant: ${proof.slug}  (${proof.id})`);
  console.log(`  outlet: ${outlet.id}\n`);

  // ─────────────────────────────────────────────────────── A  STRUCTURE
  console.log("  A  WHAT ARRIVED\n");
  const qs = await prisma.question.findMany({
    where: { serviceId: outlet.id },
    select: { key: true, inputType: true, numberMin: true, numberMax: true, numberAllowsDecimal: true,
              options: { select: { value: true, routeAction: true, numberAtLeast: true, numberAtMost: true, numberAtLeastExclusive: true,
                                   requiresCapabilityKey: true,
                                   components: { select: { quantityAnswerKey: true } } } } },
  });
  const byKey = new Map(qs.map((q) => [q.key, q]));

  const expected = [
    OUTLET_V2_KEYS.method, ACCESSIBLE_KEYS.feet,
    SURFACE_KEYS.feet, SURFACE_KEYS.inside, SURFACE_KEYS.outside, SURFACE_KEYS.flat,
    SURFACE_KEYS.surface, SURFACE_KEYS.obstacles,
    FINISHED_KEYS.backToBack, FINISHED_KEYS.feet, FINISHED_KEYS.surface,
    FINISHED_KEYS.obstacles, FINISHED_KEYS.method,
  ];
  const missing = expected.filter((k) => !byKey.has(k));
  ok(missing.length === 0, `A  all ${expected.length} Routing V2 questions provisioned`, `missing: ${missing.join(", ")}`);

  const V1 = ["outlet_run_distance", "finished_space_both_sides", "device_on_exterior_wall", "outlet_finish_ack"];
  const v1Present = V1.filter((k) => byKey.has(k));
  ok(v1Present.length === 0,
    "A  and NO V1 access x distance-band question came with them", v1Present.join(", "));

  const bounds = [
    [ACCESSIBLE_KEYS.feet, 1, 300], [SURFACE_KEYS.feet, 1, 200],
    [SURFACE_KEYS.inside, 0, 20], [SURFACE_KEYS.outside, 0, 20], [SURFACE_KEYS.flat, 0, 20],
    [FINISHED_KEYS.feet, 1, 300],
  ] as const;
  for (const [k, min, max] of bounds) {
    const q = byKey.get(k);
    ok(!!q && q.inputType === "NUMBER" && q.numberMin === min && q.numberMax === max,
      `A  ${k} is NUMBER [${min}-${max}]`, `${q?.inputType} [${q?.numberMin}-${q?.numberMax}]`);
  }

  for (const key of [ACCESSIBLE_KEYS.feet, SURFACE_KEYS.feet, FINISHED_KEYS.feet])
    ok(byKey.get(key)?.numberAllowsDecimal === true, `${key}: decimal contract survived provisioning`);
  for (const key of [SURFACE_KEYS.flat, SURFACE_KEYS.inside, SURFACE_KEYS.outside])
    ok(byKey.get(key)?.numberAllowsDecimal === false, `${key}: fittings remain whole counts`);
  const feet = byKey.get(FINISHED_KEYS.feet);
  const ranges = (feet?.options ?? []).filter(o=>o.numberAtLeast != null).map((o) => `${o.numberAtLeastExclusive ? ">" : ""}${o.numberAtLeast}-${o.numberAtMost}`).sort();
  ok(ranges.join(",") === "1-20,>20-300",
    "A  the finished-wall envelope arrived as numeric ROUTING, not a price tier", ranges.join(","));

  const bound = qs.flatMap((q) => q.options).flatMap((o) => o.components).filter((c) => c.quantityAnswerKey);
  ok(bound.length >= 5, `A  quantity bindings provisioned (${bound.length} bound components)`);

  const caps = qs.flatMap((q) => q.options).map((o) => o.requiresCapabilityKey).filter(Boolean);
  ok(caps.includes(BB) && caps.includes(DW),
    "A  both capability REQUIREMENTS arrived on the routes that need them", caps.join(", "));

  const declared = await prisma.contractorCapability.count({ where: { contractorId: CID } });
  ok(declared === 0,
    "A  …and NO capability was DECLARED for them — requiring is the template's, offering is theirs",
    `${declared} rows`);

  // ─────────────────────────────────────────────────────── B  RESOLVER
  console.log("\n  B  THE REAL RESOLVER, ON A CONTRACTOR WITH NO ECONOMICS\n");
  {
    const facts = { [SURFACE_KEYS.feet]: "31", [SURFACE_KEYS.inside]: "2", [SURFACE_KEYS.outside]: "0",
                    [SURFACE_KEYS.flat]: "0",
                    [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear" };
    const inFlow = await walk(OUTLET_SLUG, { ...qualified, below_above_access: "no_access",
      [OUTLET_V2_KEYS.method]: "surface", ...facts });
    ok(built(inFlow), "B  surface 31 ft / 2 inside / 0 outside builds a recipe", JSON.stringify(comps(inFlow)));
    ok(qty(inFlow, "ELEC_ROUTE_SURFACE_MOUNTED") === 1 &&
       qty(inFlow, "SURFACE_ROUTE_FT") === 31 &&
       qty(inFlow, "SURFACE_ROUTE_INSIDE_CORNER") === 2 &&
       qty(inFlow, "OUTLET_EXTENSION_CORE") === 1 &&
       qty(inFlow, "SURFACE_DEVICE_BOX_OUTLET") === 1,
      "B  exactly the validated surface composition and quantities", fingerprint(inFlow));
    ok(!has(inFlow, "SURFACE_ROUTE_OUTSIDE_CORNER"),
      "B  no outside-corner component at zero", fingerprint(inFlow));

    const prints: Record<string, string> = {};
    for (const ft of ["8", "18", "50"]) {
      const r = await walk(OUTLET_SLUG, { ...qualified, below_above_access: "has_access", [ACCESSIBLE_KEYS.feet]: ft });
      ok(built(r) && qty(r, "ELEC_ROUTE_ACCESSIBLE_CONCEALED") === 1 &&
         qty(r, "CONCEALED_ROUTE_FT") === Number(ft) && qty(r, "OUTLET_EXTENSION_CORE") === 1,
        `B  accessible ${ft} ft -> ELEC_ROUTE_ACCESSIBLE_CONCEALED x1, CONCEALED_ROUTE_FT x${ft}`, fingerprint(r));
      prints[ft] = comps(r).map((c: any) => c.key).sort().join(",");
    }
    ok(new Set(Object.values(prints)).size === 1,
      "B  8, 18 and 50 ft select the SAME components — only footage changes", JSON.stringify(prints));

    const b2b = await walk(OUTLET_SLUG, { ...qualified, below_above_access: "no_access",
      [OUTLET_V2_KEYS.method]: "concealed", [FINISHED_KEYS.backToBack]: "yes" });
    ok(qty(b2b, "ELEC_ROUTE_BACK_TO_BACK") === 1 && qty(b2b, "OUTLET_EXTENSION_CORE") === 1,
      "B  back-to-back -> ELEC_ROUTE_BACK_TO_BACK x1 + OUTLET_EXTENSION_CORE x1", fingerprint(b2b));
    ok(!has(b2b, "CONCEALED_ROUTE_FT"), "B  and no invented footage", fingerprint(b2b));
  }

  console.log("\n  C  FINISHED WALL — ENVELOPE AND THE CAPABILITY GATE\n");
  const wall = (ft: string, method: "baseboard" | "drywall_access") => ({
    ...qualified, below_above_access: "no_access", [OUTLET_V2_KEYS.method]: "concealed",
    [FINISHED_KEYS.backToBack]: "no", [FINISHED_KEYS.feet]: ft,
    [FINISHED_KEYS.surface]: "drywall", [FINISHED_KEYS.obstacles]: "clear",
    [FINISHED_KEYS.method]: method,
  });
  {
    // Not established — the day-one state this contractor actually has.
    for (const [m, cap] of [["baseboard", BB], ["drywall_access", DW]] as const) {
      const r = await walk(OUTLET_SLUG, wall("18", m));
      ok(!built(r), `C  ${m} + capability not-established -> no recipe (status ${r.status})`, fingerprint(r));
      ok(!has(r, "RESTORE_BASEBOARD_ACCESS") && !has(r, "RESTORE_DRYWALL_ACCESS"),
        `C  …and restoration is not quietly dropped to keep ${m} priceable`, fingerprint(r));
      void cap;
    }

    // Verifier-owned fixture: declare, assert, remove. The contractor is put
    // back to not-established at the end of this block.
    await setCap(BB, "declared"); await setCap(DW, "declared");
    for (const ft of ["18", "20"]) {
      const d = await walk(OUTLET_SLUG, wall(ft, "drywall_access"));
      ok(built(d) && qty(d, "CONCEALED_ROUTE_FT") === Number(ft) && has(d, "RESTORE_DRYWALL_ACCESS"),
        `C  ${ft} ft drywall + declared -> eligible, with restoration`, fingerprint(d));
      const b = await walk(OUTLET_SLUG, wall(ft, "baseboard"));
      ok(built(b) && has(b, "RESTORE_BASEBOARD_ACCESS"),
        `C  ${ft} ft baseboard + declared -> eligible, with reinstall`, fingerprint(b));
    }
    for (const ft of ["21", "24"]) {
      const r = await walk(OUTLET_SLUG, wall(ft, "drywall_access"));
      ok(!built(r), `C  ${ft} ft is beyond the envelope -> Guided Estimate (status ${r.status})`, fingerprint(r));
      ok(r.status === "REVIEW",
        `C  …and ${ft} is a VALID measurement, not a rejected number (not INVALID)`, String(r.status));
    }
    await setCap(BB, "none"); await setCap(DW, "none");
    const left = await prisma.contractorCapability.count({ where: { contractorId: CID } });
    ok(left === 0, "C  the verifier's capability fixtures are cleaned up", `${left} left`);
  }

  // ─────────────────────────────────────────────────────── D  EQUIVALENCE
  console.log("\n  D  DIRECT vs IN-FLOW, ON THE NEW CONTRACTOR\n");
  {
    const facts = { [SURFACE_KEYS.feet]: "31", [SURFACE_KEYS.inside]: "2", [SURFACE_KEYS.outside]: "0",
                    [SURFACE_KEYS.flat]: "0",
                    [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear" };
    const direct = await walk(DIRECT, facts);
    const inFlow = await walk(OUTLET_SLUG, { ...qualified, below_above_access: "no_access",
      [OUTLET_V2_KEYS.method]: "surface", ...facts });
    ok(fingerprint(direct) === fingerprint(inFlow) && fingerprint(direct) !== "",
      "D  identical components AND quantities through both doors",
      `direct:  ${fingerprint(direct)}\n         in-flow: ${fingerprint(inFlow)}`);
  }

  // ─────────────────────────────────────────────────────── E  ISOLATION
  console.log("\n  E  NONE OF ELITE'S ANSWERS CAME WITH THE STRUCTURE\n");
  {
    const elite = await prisma.contractor.findUniqueOrThrow({
      where: { slug: "elite-electric" }, select: { id: true } });
    const eOutlet = await serviceFor(prisma, elite.id, OUTLET_SLUG);
    const e = await prisma.service.findUniqueOrThrow({
      where: { id: eOutlet.id },
      select: { basePrice: true, whileWeThereBasePrice: true, fieldLaborHours: true,
                primaryLaborUnits: true, estimatedMinutes: true } });
    const n = await prisma.service.findUniqueOrThrow({
      where: { id: outlet.id },
      select: { basePrice: true, whileWeThereBasePrice: true, fieldLaborHours: true,
                primaryLaborUnits: true, estimatedMinutes: true,
                active: true, offered: true, publishedPriceApprovedAt: true,
                materialCostCents: true, materialCostResolved: true } });

    ok(n.basePrice === null, `E  no published base price (Elite's is ${e.basePrice})`, String(n.basePrice));
    ok(n.whileWeThereBasePrice === null,
      `E  no same-visit price (Elite's is ${e.whileWeThereBasePrice})`, String(n.whileWeThereBasePrice));
    ok(n.basePrice !== 28000, "E  specifically not Elite's $280 outlet price");
    ok(!n.fieldLaborHours && !n.primaryLaborUnits,
      `E  no labor hours or units (Elite: ${e.fieldLaborHours}h / ${e.primaryLaborUnits}u)`,
      `${n.fieldLaborHours} / ${n.primaryLaborUnits}`);
    ok(n.publishedPriceApprovedAt === null, "E  nothing is price-approved");
    ok(n.active === false && n.offered === false, "E  nothing was activated or offered on their behalf");

    const settings = await prisma.pricingSettings.findUniqueOrThrow({
      where: { contractorId: CID }, select: { crewHourRateCents: true } });
    const eSettings = await prisma.pricingSettings.findUniqueOrThrow({
      where: { contractorId: elite.id }, select: { crewHourRateCents: true } });
    ok(settings.crewHourRateCents !== eSettings.crewHourRateCents,
      `E  crew-hour rate is not Elite's (${settings.crewHourRateCents} vs ${eSettings.crewHourRateCents})`);

    // Contractor-owned ECONOMICS rows. installCatalog creates none at all —
    // see section G. What matters for isolation is that none of Elite's
    // crossed over, which is asserted rather than inferred from the count.
    const cc = await prisma.contractorComponent.findMany({
      where: { contractorId: CID },
      select: { approvedPriceCents: true, addFieldLaborHours: true, addMaterialCostCents: true } });
    const eCC = await prisma.contractorComponent.count({ where: { contractorId: elite.id } });
    ok(cc.every((x) => x.approvedPriceCents === null),
      `E  no approved component price reached the new contractor (${cc.length} rows; Elite has ${eCC})`,
      JSON.stringify(cc.filter((x) => x.approvedPriceCents !== null).slice(0, 3)));
    ok(cc.every((x) => !x.addFieldLaborHours && !x.addMaterialCostCents),
      "E  and no component labor hours or material cost",
      JSON.stringify(cc.filter((x) => x.addFieldLaborHours || x.addMaterialCostCents).slice(0, 3)));
    // The invariant, not a magic number: Elite keeps its own rows and the fresh
    // contractor has none of them. A hard-coded 44 broke the moment a new
    // canonical component was added, which is a change of catalog rather than
    // a leak between tenants.
    ok(eCC > 0 && cc.length === 0,
      `E  Elite keeps its own ${eCC} component rows and the fresh contractor has ${cc.length} — nothing moved`,
      `elite=${eCC} fresh=${cc.length}`);

    const cm = await prisma.contractorMaterial.findMany({
      where: { contractorId: CID }, select: { unitCostCents: true } });
    ok(cm.every((x) => x.unitCostCents === 0 || x.unitCostCents === null),
      `E  no material unit cost was copied (${cm.length} rows)`,
      JSON.stringify(cm.filter((x) => x.unitCostCents).slice(0, 5)));
  }

  // ─────────────────────────────────────────────────────── F  BOUNDARY
  console.log("\n  F  THE TEMPLATE PATH DOES NOT KNOW WHO ELITE IS\n");
  {
    const ELITE_REFS = /eliteContractorId|eliteService|["']elite-electric["']/;
    for (const f of ["lib/templateProvisioning.ts", "prisma/_surfaceRouteModule.ts",
                     "prisma/_concealedRouteModules.ts", "prisma/_finishedWallModule.ts",
                     "prisma/_moduleHelpers.ts", "scripts/provision-routing-v2-proof-contractor.ts"]) {
      const body = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      ok(!ELITE_REFS.test(body), `F  ${f} names no Elite helper or slug`);
    }
    const ext = readFileSync("scripts/extract-template-service.ts", "utf8");
    ok(/const contractorSlug = arg\("contractor"\)/.test(ext),
      "F  extract-template-service takes the source tenant as an argument");
    ok(!/["']elite-electric["']/.test(ext.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")),
      "F  …and defaults to no contractor at all");
  }

  // ─────────────────────────────────────────────────────── G  THE GAP
  console.log("\n  G  WHAT THE NEW CONTRACTOR STILL CANNOT DO\n");
  {
    // The homeowner estimate now authorizes the ordinary route. This completely
    // fresh contractor still cannot price it because it has no approved labor,
    // materials or pricing rules—not because the route needs office judgment.
    const r = await walk(OUTLET_SLUG, { ...qualified, below_above_access: "has_access",
      [ACCESSIBLE_KEYS.feet]: "18" });
    ok(r.status === "REVIEW",
      "G  incomplete contractor economics still fail CLOSED — REVIEW, never a free price",
      `${r.status} / ${reasonOf(r)}`);
    ok(built(r), "G  …while the physical recipe is still built in full", fingerprint(r));
    const authored = byKey.get(ACCESSIBLE_KEYS.feet)?.options.find((option) => option.value === "__number__");
    ok(authored?.routeAction === "RESOLVE_INSTANT",
      "G  the homeowner's approximate accessible footage is an instant-price route once economics are approved");

    // Now the honest part. There is no product surface that writes one.
    const writers = await prisma.contractorComponent.count({ where: { contractorId: CID } });
    console.log(`\n         NOTE — RECORDED, NOT ASSERTED AWAY:`);
    console.log(`         installCatalog creates no ContractorComponent row (${writers} here),`);
    console.log(`         and app/api/admin has no components surface: lib/contractorComponents.ts`);
    console.log(`         is read-only, and the only writers in the repo are seeds, migrations`);
    console.log(`         and test fixtures. So this contractor has the V2 structure, routes`);
    console.log(`         correctly, fails closed correctly — and has no way through the product`);
    console.log(`         to price a single route component, which means the V2 outlet can never`);
    console.log(`         go live for them.`);
    console.log(`\n         Under V1 that gap was survivable: the outlet priced from a`);
    console.log(`         service-level base price and a material assembly, both of which the`);
    console.log(`         product does surface. V2 moves outlet economics INTO components, so`);
    console.log(`         the missing surface stops being cosmetic and becomes the thing`);
    console.log(`         standing between a new contractor and a priced outlet.`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
