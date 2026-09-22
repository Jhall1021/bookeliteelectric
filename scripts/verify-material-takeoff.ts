/**
 * Physical requirement, purchase requirement, and the honest gap between them.
 *
 * The pilot is the Surface-Mounted New 120V Outlet, run twice: once straight,
 * once with turns. Straight, the raceway subsection resolves — 31 feet becomes
 * 7 five-foot sticks or 4 eight-foot sticks, and the joints follow from the
 * pieces. Turned, the elbows and the endpoint stay exact while the channel's
 * PIECE COUNT and the joint count both become unresolvable, because total
 * footage does not say how long each leg is.
 *
 * Neither run is `purchaseComplete`, and that is the correction. A takeoff that
 * has not established its supports, its terminations or its conductors is not
 * complete, however tidy the raceway arithmetic looks.
 *
 * The wrong answers tested against: guessing a joint count; guessing a piece
 * count from aggregate footage; throwing the whole recipe away because one
 * derived figure is unknown; and calling a takeoff complete because the classes
 * it forgot were never mentioned.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import {
  computeMaterialTakeoff, type ConductorRequirement, type MaterialTakeoff,
  type ProductSelection, type RecipeLine, type SelectedComponent, type TakeoffInput,
} from "../lib/electrical/materialTakeoff";
import {
  CONDUCTOR_SPECIFICATION_UNESTABLISHED, SURFACE_ROLES, SURFACE_ROLE_DIVISIBILITY,
  conductorDivisibility, conductorFunctions, surfaceRacewayRequiredClasses,
} from "../lib/electrical/surfaceRacewayTakeoff";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { eliteService, serviceFor } from "../prisma/_serviceTargets";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { PROOF_SLUG } from "./provision-routing-v2-proof-contractor";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const CHANNEL = SURFACE_ROLES.channel;
const JOINT = SURFACE_ROLES.joint;

/** Product fixtures owned by this proof. Package geometry is the PRODUCT's. */
const stick = (feet: number, cents: number): ProductSelection =>
  ({ role: CHANNEL, packageQuantity: feet, packageUnit: "ft", packagePriceCents: cents,
     productLabel: `${feet} ft channel` });
const jointPack: ProductSelection =
  { role: JOINT, packageQuantity: 1, packageUnit: "each", packagePriceCents: 180, productLabel: "joint cover" };
const elbowPack = (role: string): ProductSelection =>
  ({ role, packageQuantity: 1, packageUnit: "each", packagePriceCents: 320, productLabel: "elbow" });
const boxPack: ProductSelection =
  { role: SURFACE_ROLES.deviceBox, packageQuantity: 1, packageUnit: "each", packagePriceCents: 640, productLabel: "1-gang box" };

async function main() {
  console.log("\nMATERIAL TAKEOFF — SURFACE-MOUNTED NEW 120V OUTLET\n");

  // Real canonical recipes, straight from the database.
  const rows = await prisma.canonicalComponentMaterial.findMany({
    select: { quantity: true, canonicalComponent: { select: { key: true } },
              canonicalMaterial: { select: { key: true, unit: true } } } });
  const recipes: RecipeLine[] = rows.map((r) => ({
    componentKey: r.canonicalComponent.key, role: r.canonicalMaterial.key,
    perUnit: r.quantity, unit: r.canonicalMaterial.unit }));

  // Real physical recipe, straight from the resolver.
  const svc = await eliteService(prisma, "surface-mounted-outlet");
  const loaded = await loadServiceForResolution(prisma, svc.id);
  if (!loaded) throw new Error("service not loadable");
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  const walk = (inside: string, flat: string) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const r = resolveRoute(loaded, {
      [SURFACE_KEYS.feet]: "31", [SURFACE_KEYS.inside]: inside, [SURFACE_KEYS.outside]: "0",
      [SURFACE_KEYS.flat]: flat, [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear",
    }, true, settings) as any;
    return ((r?.config?.components ?? []) as SelectedComponent[]);
  };

  const straight = walk("0", "0");
  const turned = walk("2", "1");
  const turnCount = 3;

  /**
   * Assemble a takeoff the way a caller must: the class list is DERIVED from
   * the same components the recipes see, so it cannot drift out of step with
   * the route, and the conductor requirement is always stated.
   */
  const mk = (args: {
    components: SelectedComponent[]; selections: ProductSelection[]; turnCount: number;
    conductors?: ConductorRequirement; extraDivisibility?: typeof SURFACE_ROLE_DIVISIBILITY;
  }): MaterialTakeoff => {
    const conductors = args.conductors ?? CONDUCTOR_SPECIFICATION_UNESTABLISHED;
    const input: TakeoffInput = {
      components: args.components, recipes, selections: args.selections,
      shape: { turnCount: args.turnCount },
      divisibility: [...SURFACE_ROLE_DIVISIBILITY, ...(args.extraDivisibility ?? [])],
      requiredClasses: surfaceRacewayRequiredClasses({ components: args.components, conductors }),
      segmentation: { linearRole: CHANNEL, jointRole: JOINT },
      conductors,
      derivedRequirements: [],
    };
    return computeMaterialTakeoff(input);
  };

  const phys = (t: MaterialTakeoff, role: string) => t.physicalRequirements.find((p) => p.role === role)?.quantity;
  const buy = (t: MaterialTakeoff, role: string) => t.purchaseRequirements.find((p) => p.role === role);
  const cls = (t: MaterialTakeoff, key: string) => t.classStatuses.find((c) => c.classKey === key);
  const codes = (t: MaterialTakeoff) => t.unresolvedRequirements.map((u) => u.code);

  console.log("  A  PHYSICAL REQUIREMENT IS INDEPENDENT OF STOCK LENGTH\n");
  const selsFive = [stick(5, 1450), jointPack, boxPack];
  const selsEight = [stick(8, 2200), jointPack, boxPack];
  const a5 = mk({ components: straight, selections: selsFive, turnCount: 0 });
  const a8 = mk({ components: straight, selections: selsEight, turnCount: 0 });
  ok(phys(a5, CHANNEL) === 31 && phys(a8, CHANNEL) === 31,
    "A  31 physical feet stays 31 whichever stock length is chosen",
    `${phys(a5, CHANNEL)} vs ${phys(a8, CHANNEL)}`);

  console.log("\n  B  PACKAGE ROUNDING COMES FROM THE CONTRACTOR'S PRODUCT\n");
  ok(buy(a5, CHANNEL)?.packages === 7, "B  31 ft with 5 ft sticks -> 7 packages, on ONE straight run", String(buy(a5, CHANNEL)?.packages));
  ok(buy(a8, CHANNEL)?.packages === 4, "B  31 ft with 8 ft sticks -> 4 packages", String(buy(a8, CHANNEL)?.packages));
  ok(buy(a5, CHANNEL)?.costCents === 7 * 1450,
    "B  and cost is 7 whole sticks, not 6.2 of them", `${buy(a5, CHANNEL)?.costCents} vs ${7 * 1450}`);
  ok(buy(a5, CHANNEL)!.costCents !== Math.round(31 * (1450 / 5)),
    "B  …which is strictly more than the linear figure — the offcut is paid for");

  console.log("\n  C  A SINGLE STRAIGHT RUN CAN DERIVE ITS JOINTS\n");
  ok(phys(a5, JOINT) === 6, "C  7 pieces end to end -> 6 joints", String(phys(a5, JOINT)));
  ok(phys(a8, JOINT) === 3, "C  4 pieces -> 3 joints", String(phys(a8, JOINT)));
  ok(cls(a5, "RACEWAY_CHANNEL")?.status === "RESOLVED", "C  the channel class resolves");
  ok(cls(a5, "RACEWAY_STRAIGHT_JOINT")?.status === "RESOLVED", "C  the straight-joint class resolves");
  ok(cls(a5, "DEVICE_BOX")?.status === "RESOLVED", "C  the device-box class resolves");

  const oneStickComponents = straight.map((component) =>
    component.key === "SURFACE_ROUTE_FT" ? { ...component, quantity: 1 } : component,
  );
  const oneStick = mk({ components: oneStickComponents, selections: selsFive, turnCount: 0 });
  ok(phys(oneStick, JOINT) === undefined && buy(oneStick, JOINT) === undefined,
    "C  one purchased stick needs no physical or purchased joint");
  ok(cls(oneStick, "RACEWAY_STRAIGHT_JOINT")?.status === "RESOLVED",
    "C  an exact zero-joint requirement still resolves its declared class");

  console.log("\n  C2 …AND THAT IS STILL NOT A COMPLETE TAKEOFF\n");
  // The correction. Three classes resolving is a SUBSECTION finishing, and the
  // earlier version read that as the whole job being priceable.
  ok(!a5.purchaseComplete,
    "C2 a fully-selected straight route is NOT purchaseComplete", JSON.stringify(codes(a5)));
  ok(cls(a5, "RACEWAY_SUPPORT")?.status === "UNRESOLVED", "C2 …because supports are unresolved");
  ok(cls(a5, "RACEWAY_TERMINATION")?.status === "UNRESOLVED", "C2 …and terminations are unresolved");
  ok(cls(a5, "CONDUCTOR")?.status === "UNRESOLVED", "C2 …and conductors are unresolved");
  ok(codes(a5).includes("SUPPORT_SPACING_NOT_ESTABLISHED"),
    "C2 the support gap is named, not silently omitted", JSON.stringify(codes(a5)));
  ok(codes(a5).includes("END_FITTING_POLICY_NOT_ESTABLISHED"),
    "C2 the termination gap is named too", JSON.stringify(codes(a5)));

  console.log("\n  D  A TURNED ROUTE REFUSES TO INVENT A PIECE COUNT\n");
  const b = mk({ components: turned, turnCount,
    selections: [...selsFive, elbowPack(SURFACE_ROLES.insideElbow), elbowPack(SURFACE_ROLES.flatElbow)] });
  ok(buy(b, CHANNEL) === undefined,
    "D  NO purchase requirement for the channel at all", JSON.stringify(buy(b, CHANNEL)));
  const segCh = b.unresolvedRequirements.find((u) => u.code === "SEGMENT_GEOMETRY_REQUIRED" && u.role === CHANNEL);
  ok(!!segCh, "D  the piece count is SEGMENT_GEOMETRY_REQUIRED", JSON.stringify(codes(b)));
  ok(/1\+1\+29/.test(segCh?.reason ?? "") && /7/.test(segCh?.reason ?? "") && /8/.test(segCh?.reason ?? ""),
    "D  …with the worked counter-example that 31 ft is 7 pieces or 8", segCh?.reason?.slice(0, 120));
  const offcut = b.unresolvedRequirements.find((u) => u.code === "OFFCUT_POLICY_REQUIRED" && u.role === CHANNEL);
  ok(!!offcut, "D  and OFFCUT_POLICY_REQUIRED is reported SEPARATELY", JSON.stringify(codes(b)));
  ok(/reused/.test(offcut?.reason ?? ""),
    "D  …because knowing the leg lengths still would not settle 7 vs 8", offcut?.reason?.slice(0, 100));
  const segJ = b.unresolvedRequirements.find((u) => u.code === "SEGMENT_GEOMETRY_REQUIRED" && u.role === JOINT);
  ok(!!segJ, "D  the straight-joint count is unresolved for the same reason");
  ok(b.physicalRequirements.find((p) => p.role === JOINT) === undefined,
    "D  no joint quantity is stated at all", JSON.stringify(b.physicalRequirements.map((p) => p.role)));
  ok(!b.purchaseComplete, "D  and the takeoff reports itself incomplete");

  console.log("\n  D2 THE LOWER BOUND IS LABELLED, NOT SPENDABLE\n");
  ok(segCh?.minimumTheoreticalPackages === 7,
    "D2 minimumTheoreticalPackages is exposed as 7", String(segCh?.minimumTheoreticalPackages));
  // Guarded: under a mutation that restores exact rounding, segCh is undefined,
  // and an unguarded `in` throws — which ends the run and hides every
  // assertion after this one. A mutation must make the suite FAIL, not crash.
  ok(segCh !== undefined && !("costCents" in segCh),
    "D2 …on a type that carries no cost field at all", segCh === undefined ? "no SEGMENT_GEOMETRY_REQUIRED entry exists at all" : "it has a cost field");
  ok(b.purchaseRequirements.every((p) => p.role !== CHANNEL),
    "D2 …and it produced no purchase requirement to be costed");
  const turnedCost = b.purchaseRequirements.reduce((n, p) => n + p.costCents, 0);
  ok(turnedCost === 320 * 2 + 320 * 1 + 640,
    "D2 total cost counts elbows and box only — the 7 never enters the sum",
    `${turnedCost} (7 sticks would have added ${7 * 1450})`);

  console.log("\n  E  EVERYTHING ELSE ON THAT ROUTE STAYS EXACT\n");
  ok(phys(b, CHANNEL) === 31, "E  31 physical ft of channel is still known", String(phys(b, CHANNEL)));
  ok(phys(b, SURFACE_ROLES.insideElbow) === 2, "E  2 inside elbows, exactly", String(phys(b, SURFACE_ROLES.insideElbow)));
  ok(phys(b, SURFACE_ROLES.flatElbow) === 1, "E  1 flat elbow, exactly", String(phys(b, SURFACE_ROLES.flatElbow)));
  ok(phys(b, SURFACE_ROLES.deviceBox) === 1, "E  1 device box, exactly", String(phys(b, SURFACE_ROLES.deviceBox)));
  ok(cls(b, "RACEWAY_INSIDE_CORNER")?.status === "RESOLVED", "E  the inside-corner class resolves");
  ok(cls(b, "RACEWAY_FLAT_CORNER")?.status === "RESOLVED", "E  the flat-corner class resolves");
  ok(cls(b, "RACEWAY_OUTSIDE_CORNER") === undefined,
    "E  a corner the route does not have is not declared at all");
  ok(b.physicalRequirements.length >= 4,
    "E  the physical recipe did NOT disappear because derived figures are unknown",
    String(b.physicalRequirements.length));

  console.log("\n  F  NO PRODUCT SELECTION FAILS CLOSED\n");
  const none = mk({ components: straight, selections: [], turnCount: 0 });
  ok(none.purchaseRequirements.length === 0, "F  nothing is purchasable without a selected product");
  ok(none.physicalRequirements.length > 0, "F  …while the physical requirement is still fully known");
  ok(none.unresolvedRequirements.some((u) => u.code === "NO_CONTRACTOR_PRODUCT"),
    "F  the missing selections are reported", JSON.stringify(codes(none)));
  ok(!none.purchaseComplete, "F  and the takeoff is incomplete");

  console.log("\n  G  CONDUCTORS — THE SPECIFICATION IS THE CONTRACTOR'S, NOT THE HOMEOWNER'S\n");
  const spec = a5.unresolvedRequirements.find((u) => u.code === "CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED");
  ok(!!spec, "G  conductor gauge is CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED, not guessed", JSON.stringify(codes(a5)));
  ok(/everyday load tapped from an existing/.test(spec?.reason ?? ""),
    "G  …and the reason cites the envelope that makes one spec sufficient", spec?.reason?.slice(0, 90));
  ok(a5.physicalRequirements.every((p) => !/CONDUCTOR/.test(p.role)),
    "G  no conductor quantity was stated", JSON.stringify(a5.physicalRequirements.map((p) => p.role)));

  const fns = conductorFunctions("12");
  const known = mk({ components: straight, selections: selsFive, turnCount: 0,
    conductors: { known: true, footPerConductor: 31, functions: fns },
    extraDivisibility: conductorDivisibility(fns.map((f) => f.role)) });
  const condRoles = known.physicalRequirements.filter((p) => /CONDUCTOR/.test(p.role));
  ok(condRoles.length === 3 && condRoles.every((c) => c.quantity === 31),
    "G  when the spec IS established, each function is its own 31 ft requirement",
    JSON.stringify(condRoles.map((c) => [c.role, c.quantity])));
  ok(condRoles.every((c) => !/BLACK|WHITE|GREEN|RED|BLUE/.test(c.role)),
    "G  …and no colour appears in any canonical role", JSON.stringify(condRoles.map((c) => c.role)));
  ok(cls(known, "CONDUCTOR")?.roles.length === 3,
    "G  the conductor class names all three function roles", JSON.stringify(cls(known, "CONDUCTOR")?.roles));

  // The seam, asserted rather than described: one role cannot serve two functions.
  const collapsed = mk({ components: straight, selections: selsFive, turnCount: 0,
    conductors: { known: true, footPerConductor: 31, functions: [
      { function: "ungrounded", role: "CONDUCTOR_THHN_12_UNGROUNDED" },
      { function: "grounded", role: "CONDUCTOR_THHN_12_UNGROUNDED" },
      { function: "equipment ground", role: "CONDUCTOR_THHN_12_UNGROUNDED" }] } });
  ok(collapsed.physicalRequirements.every((p) => !/CONDUCTOR/.test(p.role)),
    "G  three functions sharing ONE role produces no conductor requirement at all",
    JSON.stringify(collapsed.physicalRequirements.map((p) => p.role)));
  ok(collapsed.unresolvedRequirements.some((u) => /single contractor product/.test(u.reason)),
    "G  …and says why: a role resolves to one product, one wire cannot serve two functions",
    JSON.stringify(codes(collapsed)));
  ok(!collapsed.purchaseComplete, "G  …and that takeoff is not complete");
  // Slack is no longer THIS function's claim to make: `footPerConductor`
  // arrives already carrying whatever allowance the caller established, and
  // this layer cannot see where the number came from. The layer that reads the
  // policy refuses there instead — proved in verify-surface-system-pilot
  // section H, which withdraws a declared allowance and watches completion stop.
  ok(known.unresolvedRequirements.every((u) => u.code !== "TERMINATION_SLACK_NOT_ESTABLISHED"),
    "G  the takeoff makes no claim about slack it cannot see",
    JSON.stringify(codes(known)));
  const derivationSrc = readFileSync("lib/electrical/surfaceSystemConfiguration.ts", "utf8");
  ok(/TERMINATION_SLACK_NOT_ESTABLISHED/.test(derivationSrc),
    "G  …and the layer that CAN see it still refuses by that name");
  const src = readFileSync("lib/electrical/materialTakeoff.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok(!/slack\s*[=:]\s*[0-9]/.test(src) && !/1\.1|0\.1|\* 1\.05/.test(src),
    "G  no slack constant exists anywhere in the code", "found a numeric slack factor");

  console.log("\n  G2 A CONDUCTOR IS BENT BY A CORNER, NOT CUT BY IT\n");
  const turnedKnown = mk({ components: turned, turnCount,
    selections: [...selsFive, elbowPack(SURFACE_ROLES.insideElbow), elbowPack(SURFACE_ROLES.flatElbow),
      { role: "CONDUCTOR_THHN_12_UNGROUNDED", packageQuantity: 500, packageUnit: "ft", packagePriceCents: 8900 },
      { role: "CONDUCTOR_THHN_12_GROUNDED", packageQuantity: 500, packageUnit: "ft", packagePriceCents: 8900 },
      { role: "CONDUCTOR_THHN_12_EQUIPMENT_GROUND", packageQuantity: 500, packageUnit: "ft", packagePriceCents: 7400 }],
    conductors: { known: true, footPerConductor: 31, functions: fns },
    extraDivisibility: conductorDivisibility(fns.map((f) => f.role)) });
  ok(buy(turnedKnown, "CONDUCTOR_THHN_12_UNGROUNDED")?.packages === 1,
    "G2 on the SAME turned route the conductor spool count is exact",
    String(buy(turnedKnown, "CONDUCTOR_THHN_12_UNGROUNDED")?.packages));
  ok(buy(turnedKnown, CHANNEL) === undefined,
    "G2 …while the channel on that very route stays unresolved — CONTINUOUS vs SEGMENTED_BY_TURNS");

  console.log("\n  H  COMPLETENESS INVARIANTS\n");
  const all = [a5, a8, b, none, known, collapsed, turnedKnown];
  ok(all.every((t) => !(t.unresolvedRequirements.length > 0 && t.purchaseComplete)),
    "H1 no takeoff is ever complete while anything is unresolved");
  ok(all.every((t) => !(t.classStatuses.some((c) => c.status === "UNRESOLVED") && t.purchaseComplete)),
    "H2 no takeoff is ever complete while a declared class is unresolved");
  ok(all.every((t) => new Set(t.classStatuses.map((c) => c.classKey)).size === t.classStatuses.length),
    "H3 every declared class is discharged exactly once");
  ok(all.every((t) => t.classStatuses.every((c) =>
      c.status === "RESOLVED" ? c.roles.every((r) => t.purchaseRequirements.some((p) => p.role === r)) : true)),
    "H4 a RESOLVED class has a purchase requirement for every one of its roles");
  ok(all.every((t) => t.purchaseRequirements.every((p) => !("minimumTheoreticalPackages" in p))),
    "H5 no lower bound ever appears on a purchase requirement");
  ok(all.every((t) => t.unresolvedRequirements.every((u) => !("costCents" in u))),
    "H6 no unresolved requirement ever carries a cost");
  const segmentedRoles = SURFACE_ROLE_DIVISIBILITY.filter((d) => d.divisibility === "SEGMENTED_BY_TURNS").map((d) => d.role);
  ok([b, turnedKnown].every((t) => t.purchaseRequirements.every((p) => !segmentedRoles.includes(p.role))),
    "H7 a turn-segmented role never becomes a purchase requirement on a turned route",
    JSON.stringify(b.purchaseRequirements.map((p) => p.role)));

  console.log("\n  I  COMPLETENESS IS REACHABLE, NOT PERMANENTLY FALSE\n");
  // A flag that is always false proves nothing. One class, fully discharged.
  const reachable = computeMaterialTakeoff({
    components: [{ key: "SURFACE_DEVICE_BOX_OUTLET", quantity: 1 }], recipes,
    selections: [boxPack], shape: { turnCount: 0 },
    divisibility: [{ role: SURFACE_ROLES.deviceBox, divisibility: "DISCRETE" }],
    requiredClasses: [{ classKey: "DEVICE_BOX", roles: [SURFACE_ROLES.deviceBox], because: "proof that true is attainable" }],
    segmentation: { notApplicable: true, because: "no linear run in this fixture" },
    conductors: { known: true, footPerConductor: 0, functions: [] },
    derivedRequirements: [],
  });
  ok(reachable.purchaseComplete,
    "I  a takeoff whose every declared class resolved IS complete", JSON.stringify(reachable.unresolvedRequirements));

  // …and under-declaring cannot buy that completeness.
  const underDeclared = computeMaterialTakeoff({
    components: straight, recipes, selections: selsFive, shape: { turnCount: 0 },
    divisibility: SURFACE_ROLE_DIVISIBILITY,
    requiredClasses: [{ classKey: "DEVICE_BOX", roles: [SURFACE_ROLES.deviceBox], because: "deliberately the only class declared" }],
    segmentation: { notApplicable: true, because: "deliberately ignored" },
    conductors: { known: true, footPerConductor: 0, functions: [] },
    derivedRequirements: [],
  });
  ok(!underDeclared.purchaseComplete,
    "I  declaring only ONE class does not make a full route complete", JSON.stringify(codes(underDeclared)));
  ok(underDeclared.unresolvedRequirements.some((u) => u.code === "CLASS_NOT_ACCOUNTED_FOR" && u.role === CHANNEL),
    "I  …the channel is reported as belonging to no declared class", JSON.stringify(codes(underDeclared)));

  console.log("\n  J  NO SUPPLIER OR STOCK LENGTH INSIDE ROUTING V2\n");
  for (const f of ["lib/electrical/materialTakeoff.ts", "lib/electrical/surfaceRacewayTakeoff.ts",
                   "prisma/_surfaceRouteModule.ts", "lib/routeResolver.ts"]) {
    const body = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    ok(!/wiremold|legrand|lowes|supplier(Product|Model|Upc)/i.test(body), `J  ${f} names no supplier`);
  }
  // EVERY Routing V2 file, not just the takeoff. The first version of this
  // check scanned one file, and a mutation that planted a stock-length constant
  // in the surface module walked straight past it.
  // No leading \b: an underscore is a word character, so RACEWAY_STOCK_LENGTH_FT
  // has no boundary before STOCK and the first version of this pattern missed
  // exactly the mutation it was written to catch.
  const STOCK_CONSTANT = /(?:STOCK|STICK|PACKAGE)[A-Z_]*\s*(?::[^=;]*)?=\s*[0-9]/i;
  const v2Surface = [
    "lib/electrical/materialTakeoff.ts", "lib/electrical/surfaceRacewayTakeoff.ts",
    "prisma/_surfaceRouteModule.ts",
    "prisma/_concealedRouteModules.ts", "prisma/_finishedWallModule.ts",
    "prisma/seed-routing-v2-components.ts", "prisma/seed-routing-v2-material-roles.ts",
    "prisma/seed-routing-v2-component-materials.ts", "lib/routeResolver.ts",
  ];
  const planted = v2Surface.filter((f) =>
    STOCK_CONSTANT.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")));
  ok(planted.length === 0,
    `J  no stock length is hard-coded in ANY of the ${v2Surface.length} Routing V2 files — geometry arrives from the selection`,
    planted.join(", "));

  console.log("\n  K  RETIRED ROLES ARE GONE, AND NOTHING POINTS AT THEM\n");
  for (const key of ["CONDUCTOR_THHN_14", "CONDUCTOR_THHN_12", "CONDUCTOR_THHN_10"]) {
    const still = await prisma.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    ok(still === null, `K  ${key} no longer exists as a canonical role`);
  }
  const fnRoles = await prisma.canonicalMaterial.count({ where: { key: { startsWith: "CONDUCTOR_THHN_" } } });
  ok(fnRoles === 9, `K  nine function-aware conductor roles exist (3 gauges x 3 functions)`, String(fnRoles));
  // By KEY SEGMENT, not substring. The first version of this check matched
  // "RED" inside SMOKE_DETECTOR_HARDWIRED and reported a violation that was
  // nothing but the end of the word "hardwired".
  const COLOURS = new Set(["BLACK", "WHITE", "GREEN", "RED", "BLUE", "GREY", "GRAY", "BARE"]);
  const everyRole = await prisma.canonicalMaterial.findMany({ select: { key: true } });
  const colourNamed = everyRole.filter((m) => m.key.split("_").some((seg) => COLOURS.has(seg)));
  ok(colourNamed.length === 0,
    `K  no canonical role names a colour in any key segment (${everyRole.length} roles checked)`,
    JSON.stringify(colourNamed.map((m) => m.key)));
  // …and the check can still see one, so passing means something.
  ok(["CONDUCTOR_THHN_12_WHITE", "X_BARE"].every((k) => k.split("_").some((seg) => COLOURS.has(seg))),
    "K  …and that check does catch a colour-named key when there is one");

  console.log("\n  L  THE FRESH CONTRACTOR INHERITS NO TAKEOFF ECONOMICS\n");
  const proof = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF_SLUG }, select: { id: true } });
  const elite = await prisma.contractor.findUniqueOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const freshSel = await prisma.contractorMaterial.findMany({ where: { contractorId: proof.id },
    select: { packageQuantity: true, packagePriceCents: true, unitCostCents: true, activeSupplierLinkId: true } });
  ok(freshSel.every((m) => !m.packageQuantity && !m.packagePriceCents && !m.unitCostCents && !m.activeSupplierLinkId),
    `L  no package geometry, cost or supplier link on the fresh contractor (${freshSel.length} rows)`,
    JSON.stringify(freshSel.slice(0, 3)));
  const freshSvc = await serviceFor(prisma, proof.id, "surface-mounted-outlet");
  const freshLoaded = await loadServiceForResolution(prisma, freshSvc.id);
  ok(!!freshLoaded, "L  …and its surface service still loads and routes");
  const eliteSel = await prisma.contractorMaterial.count({ where: { contractorId: elite.id } });
  ok(eliteSel > 0, `L  while Elite keeps its own ${eliteSel} material rows`);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
