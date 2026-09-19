/**
 * ROUTING V2 — New 120V Outlet, as a consumer of the shared routing layer.
 *
 * The strongest assertion here is EQUIVALENCE: for identical physical facts,
 * the direct Surface-Mounted Outlet service and the outlet service's own
 * surface branch must produce the same canonical components in the same
 * quantities. Not similar, not equivalent-looking — the same ids. That is what
 * makes them one implementation rather than two that happen to agree today.
 *
 * The safety gates above the routing are asserted too. Routing V2 has nothing
 * to say about which loads may use an ordinary extension, and the migration
 * must not have weakened that.
 */
import { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { ACCESSIBLE_KEYS } from "../prisma/_concealedRouteModules";
import { FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { OUTLET_V2_KEYS, RETIRED_OUTLET_QUESTIONS } from "../prisma/seed-new-outlet-v2";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { eliteService } from "../prisma/_serviceTargets";
import { eliteContractorId } from "../prisma/_componentHelpers";

const prisma = new PrismaClient();
const OUTLET = "new-120v-outlet";
const DIRECT = "surface-mounted-outlet";
const LEGACY = ["OUTLET_RUN_ACCESSIBLE_UNDER_10", "OUTLET_RUN_ACCESSIBLE_10_20",
                "OUTLET_RUN_FINISHED_UNDER_10", "OUTLET_RUN_FINISHED_10_20"];
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function walk(slug: string, answers: Record<string, string>) {
  const svc = await eliteService(prisma, slug);
  const loaded = await loadServiceForResolution(prisma, svc.id);
  if (!loaded) throw new Error(`${slug} not loadable`);
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  return resolveRoute(loaded, answers, true, settings);
}
const comps = (r: any) => (r?.config?.components ?? []).map((c: any) => ({ key: c.key, quantity: c.quantity }));
const has = (r: any, k: string) => comps(r).some((c: any) => c.key === k);
const qty = (r: any, k: string) => comps(r).find((c: any) => c.key === k)?.quantity;
const built = (r: any) => comps(r).length > 0;
/** Canonical ids and quantities only — never labels or authored order. */
const fingerprint = (r: any) =>
  comps(r).map((c: any) => `${c.key}x${c.quantity}`).sort().join(",");

/** Qualified ordinary extension: everyday load, tap an existing source. */
const qualified = { outlet_load_type: "everyday", outlet_power_source: "tap_existing" };

async function setCap(cid: string, key: string, state: "none" | "declared" | "revoked") {
  await prisma.contractorCapability.deleteMany({ where: { contractorId: cid, key } });
  if (state === "declared") await prisma.contractorCapability.create({ data: { contractorId: cid, key } });
  if (state === "revoked") await prisma.contractorCapability.create({ data: { contractorId: cid, key, revokedAt: new Date() } });
}

async function main() {
  console.log("\nROUTING V2 — NEW 120V OUTLET\n");
  const svc = await eliteService(prisma, OUTLET);
  const CID = svc.contractorId;
  const BB = "BASEBOARD_ACCESS_REINSTALL", DW = "DRYWALL_ACCESS_CUTTING";
  await setCap(CID, BB, "declared"); await setCap(CID, DW, "declared");

  console.log("  1-4  THE SAFETY GATES ABOVE THE ROUTING ARE UNCHANGED\n");
  {
    const ordinary = await walk(OUTLET, { ...qualified, below_above_access: "has_access",
      [ACCESSIBLE_KEYS.feet]: "12" });
    ok(built(ordinary), "1  a qualified ordinary extension reaches Routing V2", JSON.stringify(comps(ordinary)));

    for (const load of ["motor_appliance", "heating_appliance", "shop_equipment", "ev"]) {
      const r = await walk(OUTLET, { outlet_load_type: load });
      ok(r.status === "REROUTE", `2  ${load} reroutes, never enters ordinary extension (status ${r.status})`);
      ok(!has(r, "OUTLET_EXTENSION_CORE"),
        `2  ${load} carries no abandoned extension recipe`, JSON.stringify(comps(r)));
    }
    const panel = await walk(OUTLET, { outlet_load_type: "everyday", outlet_power_source: "dedicated" });
    ok(panel.status === "REROUTE", `3  a new panel circuit reroutes (status ${panel.status})`);
    ok(!has(panel, "OUTLET_EXTENSION_CORE"),
      "3  and carries no OUTLET_EXTENSION_CORE from the abandoned branch", JSON.stringify(comps(panel)));

    const unsure = await walk(OUTLET, { outlet_load_type: "unsure" });
    ok(!built(unsure), `4  an uncertain load cannot price (status ${unsure.status})`);
  }

  console.log("\n  5  DIRECT vs IN-FLOW SURFACE EQUIVALENCE\n");
  {
    const facts = { [SURFACE_KEYS.feet]: "31", [SURFACE_KEYS.inside]: "2", [SURFACE_KEYS.outside]: "0",
                    [SURFACE_KEYS.flat]: "0",
                    [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear" };
    const direct = await walk(DIRECT, facts);
    const inFlow = await walk(OUTLET, { ...qualified, below_above_access: "no_access",
      [OUTLET_V2_KEYS.method]: "surface", ...facts });
    ok(fingerprint(direct) === fingerprint(inFlow),
      "5  identical canonical components AND quantities",
      `direct:  ${fingerprint(direct)}\n         in-flow: ${fingerprint(inFlow)}`);
    ok(qty(inFlow, "SURFACE_ROUTE_FT") === 31 && qty(inFlow, "SURFACE_ROUTE_INSIDE_CORNER") === 2,
      "5  31 ft and 2 inside corners", JSON.stringify(comps(inFlow)));
    ok(!has(inFlow, "SURFACE_ROUTE_OUTSIDE_CORNER"),
      "5  and no outside-corner component at zero", JSON.stringify(comps(inFlow)));
    ok(has(inFlow, "OUTLET_EXTENSION_CORE") && has(inFlow, "SURFACE_DEVICE_BOX_OUTLET"),
      "5  with the outlet endpoint and its surface box", JSON.stringify(comps(inFlow)));
  }

  console.log("\n  6-7  ACCESSIBLE CONCEALED, FROM THE REAL SERVICE\n");
  {
    const prints: Record<string, string> = {};
    for (const feet of ["8", "18", "50"]) {
      const r = await walk(OUTLET, { ...qualified, below_above_access: "has_access", [ACCESSIBLE_KEYS.feet]: feet });
      ok(built(r) && has(r, "ELEC_ROUTE_ACCESSIBLE_CONCEALED") && qty(r, "CONCEALED_ROUTE_FT") === Number(feet),
        `6  ${feet} ft -> accessible strategy, CONCEALED_ROUTE_FT x${feet}`, JSON.stringify(comps(r)));
      prints[feet] = comps(r).map((c: any) => c.key).sort().join(",");
    }
    ok(new Set(Object.values(prints)).size === 1,
      "6  8, 18 and 50 ft select the same components — only quantity differs", JSON.stringify(prints));
    const r50 = await walk(OUTLET, { ...qualified, below_above_access: "has_access", [ACCESSIBLE_KEYS.feet]: "50" });
    ok(built(r50), "7  50 ft accessible is NOT sent to review for its length");
  }

  console.log("\n  8  BACK TO BACK\n");
  {
    const r = await walk(OUTLET, { ...qualified, below_above_access: "no_access",
      [OUTLET_V2_KEYS.method]: "concealed", [FINISHED_KEYS.backToBack]: "yes" });
    ok(built(r) && has(r, "ELEC_ROUTE_BACK_TO_BACK"), "8  back-to-back uses its own strategy", JSON.stringify(comps(r)));
    ok(!has(r, "CONCEALED_ROUTE_FT"), "8  with no invented footage", JSON.stringify(comps(r)));
  }

  console.log("\n  9-16  FINISHED WALL, ENVELOPE AND CAPABILITY\n");
  const wall = (feet: string, method: "baseboard" | "drywall_access", over: Record<string, string> = {}) => ({
    ...qualified, below_above_access: "no_access", [OUTLET_V2_KEYS.method]: "concealed",
    [FINISHED_KEYS.backToBack]: "no", [FINISHED_KEYS.feet]: feet,
    [FINISHED_KEYS.surface]: "drywall", [FINISHED_KEYS.obstacles]: "clear",
    [FINISHED_KEYS.method]: method,
    ...(method === "baseboard" ? { [FINISHED_KEYS.baseboard]: "yes" } : {}), ...over });

  for (const [method, strategy, restore] of [
    ["drywall_access", "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS", "RESTORE_DRYWALL_ACCESS"],
    ["baseboard", "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS", "RESTORE_BASEBOARD_ACCESS"],
  ] as const) {
    const r = await walk(OUTLET, wall("18", method));
    ok(built(r) && has(r, strategy) && has(r, restore) && qty(r, "CONCEALED_ROUTE_FT") === 18,
      `9  18 ft ${method} -> ${strategy} + ${restore} + x18`, JSON.stringify(comps(r)));
  }
  for (const [feet, inEnv] of [["18", true], ["20", true], ["21", false], ["24", false]] as const) {
    const r = await walk(OUTLET, wall(feet, "drywall_access"));
    ok(built(r) === inEnv, `12  ${feet} ft ${inEnv ? "within" : "beyond"} the envelope`, `status ${r.status}`);
    if (!inEnv) ok(r.status !== "INVALID", `13  and ${feet} ft is a valid measurement, not a rejected number`);
  }
  for (const [method, key] of [["baseboard", BB], ["drywall_access", DW]] as const) {
    for (const state of ["none", "revoked"] as const) {
      await setCap(CID, key, state);
      const r = await walk(OUTLET, wall("18", method));
      ok(!built(r), `10  ${method} + ${state === "none" ? "not-established" : state} -> no recipe`, `status ${r.status}`);
      ok(!has(r, "RESTORE_BASEBOARD_ACCESS") && !has(r, "RESTORE_DRYWALL_ACCESS"),
        `10  and restoration is not quietly dropped to keep it priceable`, JSON.stringify(comps(r)));
    }
    await setCap(CID, key, "declared");
  }
  for (const [label, over] of [
    ["plaster", { [FINISHED_KEYS.surface]: "plaster" }],
    ["a fireplace", { [FINISHED_KEYS.obstacles]: "fireplace" }],
    ['"not sure" about the method', { [FINISHED_KEYS.method]: "unsure" }],
    ['"not sure" how to run it', { [OUTLET_V2_KEYS.method]: "unsure" }],
  ] as const) {
    const r = await walk(OUTLET, wall("18", "drywall_access", over as Record<string, string>));
    ok(!built(r), `14-16  ${label} -> review (status ${r.status})`, JSON.stringify(comps(r)));
  }

  console.log("\n  17-20  LEGACY, DUPLICATES, GRAPH, ECONOMICS\n");
  {
    const authored = await prisma.answerOptionComponent.findMany({
      where: { answerOption: { question: { serviceId: svc.id } },
               canonicalComponent: { key: { in: LEGACY } } }, select: { id: true } });
    ok(authored.length === 0, "17  no authored row on this service emits a legacy OUTLET_RUN_* key",
      `${authored.length} rows`);

    const retired = await prisma.question.findMany({
      where: { serviceId: svc.id, key: { in: [...RETIRED_OUTLET_QUESTIONS] } },
      select: { key: true, options: { select: { id: true } } } });
    ok(retired.length === RETIRED_OUTLET_QUESTIONS.length,
      "17  the retired questions still EXIST — history is not deleted", JSON.stringify(retired.map((r) => r.key)));
    ok(retired.every((r) => r.options.length === 0),
      "17  and carry no options, so no path through them can emit anything",
      JSON.stringify(retired.map((r) => `${r.key}:${r.options.length}`)));
    const canon = await prisma.canonicalComponent.findMany({ where: { key: { in: LEGACY } }, select: { key: true } });
    ok(canon.length === 4, "17  all four legacy canonical rows are intact", JSON.stringify(canon.map((c) => c.key)));

    const dup = await walk(OUTLET, { ...qualified, below_above_access: "no_access",
      [OUTLET_V2_KEYS.method]: "surface", [SURFACE_KEYS.feet]: "31", [SURFACE_KEYS.inside]: "2",
      [SURFACE_KEYS.outside]: "1", [SURFACE_KEYS.flat]: "0",
      [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear" });
    const keys = comps(dup).map((c: any) => c.key);
    ok(new Set(keys).size === keys.length, "18  no duplicated component in a resolved recipe", JSON.stringify(keys));

    const dangling = await findDanglingReferences(prisma, svc.id);
    const unreachable = await findUnreachableQuestions(prisma, svc.id);
    ok(dangling.length === 0, "19  no dangling nextQuestionId", JSON.stringify(dangling));
    const liveUnreachable = unreachable.filter(
      (u: any) => !RETIRED_OUTLET_QUESTIONS.includes((typeof u === "string" ? u : u.key) as never));
    ok(liveUnreachable.length === 0,
      "19  nothing unreachable except the deliberately retired questions", JSON.stringify(liveUnreachable));
    ok(unreachable.length >= 1,
      "19  and the retired questions ARE proven unreachable, not assumed", JSON.stringify(unreachable));

    const econ = await prisma.contractorComponent.findMany({
      where: { canonicalComponent: { key: { startsWith: "ELEC_ROUTE_" } } },
      select: { approvedPriceCents: true } });
    ok(econ.length > 0 && econ.every((e) => e.approvedPriceCents === null),
      `20  every V2 route component remains unpriced (${econ.length} rows)`);
  }

  console.log("\n  21  THE V1 STANDARD-RUN MODEL IS GONE FROM THIS SERVICE\n");
  {
    const svc = await eliteService(prisma, OUTLET);
    const rows = await prisma.serviceMaterial.findMany({
      where: { serviceId: svc.id },
      select: { quantity: true, canonicalMaterial: { select: { key: true } } },
    });

    // The specific defect: every outlet billed a fixed 25 ft of cable whether
    // the run was 8 ft or 50 ft. Named rather than counted, so a future
    // assembly that reintroduces it is caught by the thing it reintroduces.
    const wire = rows.find((r) => r.canonicalMaterial?.key === "WIRE_14_2");
    ok(!wire, "21  no unconditional WIRE_14_2 requirement at all", `found x${wire?.quantity}`);
    ok(!(wire && wire.quantity === 25),
      "21  and specifically not the fixed 25 ft standard run", `found x${wire?.quantity}`);

    const box = rows.find((r) => r.canonicalMaterial?.key === "BOX_OLD_WORK");
    ok(!box, "21  no unconditional BOX_OLD_WORK — the box belongs to an endpoint, not the service",
      `found x${box?.quantity}`);

    ok(rows.length === 0,
      "21  the whole unconditional assembly is gone", JSON.stringify(rows.map((r) => r.canonicalMaterial?.key ?? "(unlinked)")));

    // Asserted, not implied. Deleting rows alone would leave the cached $21.50.
    const st = await prisma.service.findUniqueOrThrow({
      where: { id: svc.id },
      select: { materialCostCents: true, materialCostResolved: true,
                unresolvedMaterialKeys: true, unresolvedPolicyKeys: true },
    });
    ok(st.materialCostCents === 0,
      "21  materialCostCents is 0 — asserted, not a stale $21.50 left behind", String(st.materialCostCents));
    ok(st.materialCostResolved === true && st.unresolvedMaterialKeys.length === 0,
      "21  and readiness is derived, not faked",
      JSON.stringify({ r: st.materialCostResolved, k: st.unresolvedMaterialKeys }));

    // The materials themselves are a fact about the trade and must survive.
    const preserved = await prisma.contractorMaterial.findMany({
      where: {
        contractorId: svc.contractorId,
        canonicalMaterial: { key: { in: ["WIRE_14_2", "BOX_OLD_WORK", "RECEPTACLE_STANDARD", "WALL_PLATE", "CONSUMABLES_SMALL"] } },
        active: true,
      },
      select: { unitCostCents: true, canonicalMaterial: { select: { key: true } } },
    });
    ok(preserved.length === 5,
      "21  all five canonical materials keep Elite's real costs — the COMBINATION was retired, not the parts",
      JSON.stringify(preserved.map((m) => `${m.canonicalMaterial.key}=${m.unitCostCents}`)));

    console.log("\n  22  NO DEPENDENCY ON THE LEGACY DISTANCE POLICY\n");
    ok(!st.unresolvedPolicyKeys.includes("outlet_run.breakpoints"),
      "22  Elite's outlet does not depend on outlet_run.breakpoints", st.unresolvedPolicyKeys.join(","));
    const policyOptions = await prisma.answerOption.count({
      where: { question: { serviceId: svc.id }, policyKey: "outlet_run.breakpoints" },
    });
    ok(policyOptions === 0, "22  no option on this service reads that policy", String(policyOptions));
    const patterned = await prisma.answerOption.count({
      where: { question: { serviceId: svc.id }, labelPattern: { not: null } },
    });
    ok(patterned === 0,
      "22  and no option label still carries an unfilled band pattern", String(patterned));

    // The definition itself is preserved: other services have not migrated.
    const eliteId = await eliteContractorId(prisma);
    const stillUsing = await prisma.service.findMany({
      where: { unresolvedPolicyKeys: { has: "outlet_run.breakpoints" } },
      select: { slug: true, contractorId: true, contractor: { select: { slug: true } } },
    });
    ok(!stillUsing.some((x) => x.contractorId === eliteId),
      "22  no Elite service depends on it",
      stillUsing.map((x) => `${x.contractor?.slug}/${x.slug}`).join(", "));
    console.log(`         (still depended on elsewhere: ${stillUsing.map((x) => `${x.contractor?.slug}/${x.slug}`).join(", ") || "nobody"} — definition preserved)`);
  }

  console.log("\n  23  ROUTING SUCCEEDS; PRICING WAITS. THEY ARE DIFFERENT ANSWERS.\n");
  {
    // The whole architecture in one assertion. A complete physical recipe that
    // cannot be priced is a ROUTING SUCCESS held at the pricing gate — not a
    // routing failure, and not a price. If these two ever collapse into each
    // other, an unpriced component becomes either a free one or a broken tree.
    const r = await walk(OUTLET, {
      ...qualified, below_above_access: "has_access", accessible_route_feet: "18",
    });
    ok(built(r), "23  a qualified route builds a complete physical recipe", JSON.stringify(comps(r)));
    ok(r.status === "REVIEW",
      "23  …and still returns REVIEW, because the economics are not approved yet", String(r.status));
    // `reason` exists only on the non-priced variants, so narrow rather than cast.
    const reason = "reason" in r ? String(r.reason) : "";
    // ECONOMIC, not routing. Which economic input is named depends on which is
    // missing first: labor is more fundamental than an approved price — you
    // cannot approve a price for work whose duration nobody has established —
    // so the resolver names labor when both are absent.
    ok(/price|approv|labor/i.test(reason),
      "23  …for an ECONOMIC reason, not a routing one", reason || "(none)");
    ok(comps(r).every((c: any) => typeof c.quantity === "number" && c.quantity > 0),
      "23  every component carries a measured quantity", JSON.stringify(comps(r)));
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
