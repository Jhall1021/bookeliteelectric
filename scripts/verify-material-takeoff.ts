/**
 * Physical requirement, purchase requirement, and the honest gap between them.
 *
 * The pilot is the Surface-Mounted New 120V Outlet, run twice: once straight,
 * once with turns. Straight, everything resolves — 31 feet of channel becomes 7
 * five-foot sticks or 4 eight-foot sticks, and the joints follow from the
 * pieces. Turned, the elbows and endpoint stay exact and the straight-joint
 * count becomes explicitly unresolvable, because total footage does not say how
 * long each leg is.
 *
 * The wrong answers here would be to guess a joint count, or to throw the whole
 * recipe away because one derived figure is unknown. Both are tested against.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { computeMaterialTakeoff, type RecipeLine, type ProductSelection } from "../lib/electrical/materialTakeoff";
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

const CHANNEL = "SURFACE_RACEWAY_CHANNEL";
const JOINT = "SURFACE_RACEWAY_JOINT";

/** Product fixtures owned by this proof. Package geometry is the PRODUCT's. */
const stick = (feet: number, cents: number): ProductSelection =>
  ({ role: CHANNEL, packageQuantity: feet, packageUnit: "ft", packagePriceCents: cents,
     productLabel: `${feet} ft channel` });
const jointPack: ProductSelection =
  { role: JOINT, packageQuantity: 1, packageUnit: "each", packagePriceCents: 180, productLabel: "joint cover" };
const elbowPack = (role: string): ProductSelection =>
  ({ role, packageQuantity: 1, packageUnit: "each", packagePriceCents: 320, productLabel: "elbow" });
const boxPack: ProductSelection =
  { role: "SURFACE_DEVICE_BOX_1G", packageQuantity: 1, packageUnit: "each", packagePriceCents: 640, productLabel: "1-gang box" };

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
    return ((r?.config?.components ?? []) as { key: string; quantity: number }[]);
  };

  const straight = walk("0", "0");
  const turned = walk("2", "1");
  const turnCount = 3;

  console.log("  A  PHYSICAL REQUIREMENT IS INDEPENDENT OF STOCK LENGTH\n");
  const selsFive = [stick(5, 1450), jointPack, boxPack];
  const selsEight = [stick(8, 2200), jointPack, boxPack];
  const a5 = computeMaterialTakeoff({ components: straight, recipes, selections: selsFive,
    shape: { turnCount: 0 }, segmentation: { linearRole: CHANNEL, jointRole: JOINT } });
  const a8 = computeMaterialTakeoff({ components: straight, recipes, selections: selsEight,
    shape: { turnCount: 0 }, segmentation: { linearRole: CHANNEL, jointRole: JOINT } });
  const phys = (t: typeof a5, role: string) => t.physicalRequirements.find((p) => p.role === role)?.quantity;
  ok(phys(a5, CHANNEL) === 31 && phys(a8, CHANNEL) === 31,
    "A  31 physical feet stays 31 whichever stock length is chosen",
    `${phys(a5, CHANNEL)} vs ${phys(a8, CHANNEL)}`);

  console.log("\n  B  PACKAGE ROUNDING COMES FROM THE CONTRACTOR'S PRODUCT\n");
  const buy = (t: typeof a5, role: string) => t.purchaseRequirements.find((p) => p.role === role);
  ok(buy(a5, CHANNEL)?.packages === 7, "B  31 ft with 5 ft sticks -> 7 packages", String(buy(a5, CHANNEL)?.packages));
  ok(buy(a8, CHANNEL)?.packages === 4, "B  31 ft with 8 ft sticks -> 4 packages", String(buy(a8, CHANNEL)?.packages));
  ok(buy(a5, CHANNEL)?.costCents === 7 * 1450,
    "B  and cost is 7 whole sticks, not 6.2 of them", `${buy(a5, CHANNEL)?.costCents} vs ${7 * 1450} (linear would be ${Math.round(31 * (1450 / 5))})`);
  ok(buy(a5, CHANNEL)!.costCents !== Math.round(31 * (1450 / 5)),
    "B  …which is strictly more than the linear figure — the offcut is paid for");

  console.log("\n  C  A SINGLE STRAIGHT RUN CAN DERIVE ITS JOINTS\n");
  ok(phys(a5, JOINT) === 6, "C  7 pieces end to end -> 6 joints", String(phys(a5, JOINT)));
  ok(phys(a8, JOINT) === 3, "C  4 pieces -> 3 joints", String(phys(a8, JOINT)));
  ok(a5.unresolvedRequirements.length === 0,
    "C  nothing is unresolved on a fully-selected straight route",
    JSON.stringify(a5.unresolvedRequirements));
  ok(a5.purchaseComplete, "C  …and the takeoff reports itself complete");

  console.log("\n  D  A TURNED ROUTE REFUSES TO INVENT A JOINT COUNT\n");
  const b = computeMaterialTakeoff({ components: turned, recipes, selections:
    [...selsFive, elbowPack("SURFACE_RACEWAY_ELBOW_INSIDE"), elbowPack("SURFACE_RACEWAY_ELBOW_FLAT")],
    shape: { turnCount }, segmentation: { linearRole: CHANNEL, jointRole: JOINT } });
  const seg = b.unresolvedRequirements.find((u) => u.code === "SEGMENT_GEOMETRY_REQUIRED");
  ok(!!seg, "D  the straight-joint count is SEGMENT_GEOMETRY_REQUIRED", JSON.stringify(b.unresolvedRequirements));
  ok(seg?.role === JOINT && /10\+10\+11/.test(seg?.reason ?? ""),
    "D  …with a reason that explains why footage is not enough", seg?.reason?.slice(0, 80));
  ok(b.physicalRequirements.find((p) => p.role === JOINT) === undefined,
    "D  no joint quantity is stated at all", JSON.stringify(b.physicalRequirements.map((p) => p.role)));
  ok(!b.purchaseComplete, "D  and the takeoff reports itself incomplete");

  console.log("\n  E  EVERYTHING ELSE ON THAT ROUTE STAYS EXACT\n");
  ok(phys(b, CHANNEL) === 31, "E  31 ft of channel is still known", String(phys(b, CHANNEL)));
  ok(phys(b, "SURFACE_RACEWAY_ELBOW_INSIDE") === 2, "E  2 inside elbows, exactly", String(phys(b, "SURFACE_RACEWAY_ELBOW_INSIDE")));
  ok(phys(b, "SURFACE_RACEWAY_ELBOW_FLAT") === 1, "E  1 flat elbow, exactly", String(phys(b, "SURFACE_RACEWAY_ELBOW_FLAT")));
  ok(phys(b, "SURFACE_DEVICE_BOX_1G") === 1, "E  1 device box, exactly", String(phys(b, "SURFACE_DEVICE_BOX_1G")));
  ok(buy(b, CHANNEL)?.packages === 7, "E  and the channel still rounds to 7 sticks", String(buy(b, CHANNEL)?.packages));
  ok(b.physicalRequirements.length >= 4,
    "E  the physical recipe did NOT disappear because one derived figure is unknown",
    String(b.physicalRequirements.length));

  console.log("\n  F  NO PRODUCT SELECTION FAILS CLOSED\n");
  const none = computeMaterialTakeoff({ components: straight, recipes, selections: [],
    shape: { turnCount: 0 }, segmentation: { linearRole: CHANNEL, jointRole: JOINT } });
  ok(none.purchaseRequirements.length === 0, "F  nothing is purchasable without a selected product");
  ok(none.physicalRequirements.length > 0, "F  …while the physical requirement is still fully known");
  ok(none.unresolvedRequirements.every((u) => u.code === "NO_CONTRACTOR_PRODUCT"),
    "F  every gap is reported as a missing product selection",
    JSON.stringify(none.unresolvedRequirements.map((u) => u.code)));
  ok(!none.purchaseComplete, "F  and the takeoff is incomplete");

  console.log("\n  G  CONDUCTORS — THE CIRCUIT IS NOT ESTABLISHED\n");
  const withCond = computeMaterialTakeoff({ components: straight, recipes, selections: selsFive,
    shape: { turnCount: 0 }, segmentation: { linearRole: CHANNEL, jointRole: JOINT },
    conductors: { known: false, code: "CIRCUIT_AMPACITY_REQUIRED",
      reason: "The tree establishes an everyday load tapped from an existing circuit, but never that circuit's overcurrent rating — so the conductor gauge cannot be chosen." } });
  const amp = withCond.unresolvedRequirements.find((u) => u.code === "CIRCUIT_AMPACITY_REQUIRED");
  ok(!!amp, "G  conductor gauge is CIRCUIT_AMPACITY_REQUIRED, not guessed");
  ok(withCond.physicalRequirements.every((p) => !/CONDUCTOR/.test(p.role)),
    "G  and no conductor quantity was stated", JSON.stringify(withCond.physicalRequirements.map((p) => p.role)));

  const known = computeMaterialTakeoff({ components: straight, recipes, selections: selsFive,
    shape: { turnCount: 0 },
    conductors: { known: true, footPerConductor: 31, functions: [
      { function: "ungrounded", role: "CONDUCTOR_THHN_14_UNGROUNDED" },
      { function: "grounded", role: "CONDUCTOR_THHN_14_GROUNDED" },
      { function: "equipment ground", role: "CONDUCTOR_THHN_14_EQUIPMENT_GROUND" }] } });
  const condRoles = known.physicalRequirements.filter((p) => /CONDUCTOR/.test(p.role));
  ok(condRoles.length === 3 && condRoles.every((c) => c.quantity === 31),
    "G  when the circuit IS known, each function is its own 31 ft requirement",
    JSON.stringify(condRoles.map((c) => [c.role, c.quantity])));

  // The seam, asserted rather than described: one role cannot serve two functions.
  const collapsed = computeMaterialTakeoff({ components: straight, recipes, selections: selsFive,
    shape: { turnCount: 0 },
    conductors: { known: true, footPerConductor: 31, functions: [
      { function: "ungrounded", role: "CONDUCTOR_THHN_14" },
      { function: "grounded", role: "CONDUCTOR_THHN_14" },
      { function: "equipment ground", role: "CONDUCTOR_THHN_14" }] } });
  ok(collapsed.physicalRequirements.every((p) => !/CONDUCTOR/.test(p.role)),
    "G  three functions sharing ONE role produces no conductor requirement at all",
    JSON.stringify(collapsed.physicalRequirements.map((p) => p.role)));
  ok(collapsed.unresolvedRequirements.some((u) => /single contractor product/.test(u.reason)),
    "G  …and says why: a role resolves to one product, one wire cannot serve two functions",
    JSON.stringify(collapsed.unresolvedRequirements.map((u) => u.code)));
  const slack = known.unresolvedRequirements.find((u) => u.code === "TERMINATION_SLACK_NOT_ESTABLISHED");
  ok(!!slack, "G  …and termination slack is explicitly NOT established");
  const src = readFileSync("lib/electrical/materialTakeoff.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok(!/slack\s*[=:]\s*[0-9]/.test(src) && !/1\.1|0\.1|\* 1\.05/.test(src),
    "G  no slack constant exists anywhere in the code", "found a numeric slack factor");

  console.log("\n  H  NO SUPPLIER OR STOCK LENGTH INSIDE ROUTING V2\n");
  for (const f of ["lib/electrical/materialTakeoff.ts", "prisma/_surfaceRouteModule.ts", "lib/routeResolver.ts"]) {
    const body = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    ok(!/wiremold|legrand|lowes|supplier(Product|Model|Upc)/i.test(body), `H  ${f} names no supplier`);
  }
  // EVERY Routing V2 file, not just the takeoff. The first version of this
  // check scanned one file, and a mutation that planted a stock-length constant
  // in the surface module walked straight past it.
  // No leading \b: an underscore is a word character, so RACEWAY_STOCK_LENGTH_FT
  // has no boundary before STOCK and the first version of this pattern missed
  // exactly the mutation it was written to catch.
  const STOCK_CONSTANT = /(?:STOCK|STICK|PACKAGE)[A-Z_]*\s*(?::[^=;]*)?=\s*[0-9]/i;
  const v2Surface = [
    "lib/electrical/materialTakeoff.ts", "prisma/_surfaceRouteModule.ts",
    "prisma/_concealedRouteModules.ts", "prisma/_finishedWallModule.ts",
    "prisma/seed-routing-v2-components.ts", "prisma/seed-routing-v2-material-roles.ts",
    "prisma/seed-routing-v2-component-materials.ts", "lib/routeResolver.ts",
  ];
  const planted = v2Surface.filter((f) =>
    STOCK_CONSTANT.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")));
  ok(planted.length === 0,
    `H  no stock length is hard-coded in ANY of the ${v2Surface.length} Routing V2 files — geometry arrives from the selection`,
    planted.join(", "));

  console.log("\n  I  THE FRESH CONTRACTOR INHERITS NO TAKEOFF ECONOMICS\n");
  const proof = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF_SLUG }, select: { id: true } });
  const elite = await prisma.contractor.findUniqueOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const freshSel = await prisma.contractorMaterial.findMany({ where: { contractorId: proof.id },
    select: { packageQuantity: true, packagePriceCents: true, unitCostCents: true, activeSupplierLinkId: true } });
  ok(freshSel.every((m) => !m.packageQuantity && !m.packagePriceCents && !m.unitCostCents && !m.activeSupplierLinkId),
    `I  no package geometry, cost or supplier link on the fresh contractor (${freshSel.length} rows)`,
    JSON.stringify(freshSel.slice(0, 3)));
  const freshSvc = await serviceFor(prisma, proof.id, "surface-mounted-outlet");
  const freshLoaded = await loadServiceForResolution(prisma, freshSvc.id);
  ok(!!freshLoaded, "I  …and its surface service still loads and routes");
  const eliteSel = await prisma.contractorMaterial.count({ where: { contractorId: elite.id } });
  ok(eliteSel > 0, `I  while Elite keeps its own ${eliteSel} material rows`);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
