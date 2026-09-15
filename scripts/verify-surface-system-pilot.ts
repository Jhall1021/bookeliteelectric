/**
 * One straight route, completely resolved — and a turned one that still is not.
 *
 * The chain under test runs end to end: Routing V2 produces the physical
 * components, canonical recipes turn them into material roles, the contractor's
 * declared material system supplies the physical facts Routing V2 must not
 * invent, the contractor's policies supply the work-practice choices the
 * template must not invent, and their product selections supply the package
 * geometry nobody else may supply. Only then is the takeoff complete.
 *
 * The control is the same 31 feet with three corners. It must stay incomplete,
 * because no amount of configuration tells you how a run divides into legs.
 * If configuring the system ever completed the turned route too, the pilot
 * would have proved the opposite of what it claims.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { loadSurfaceTakeoff } from "../lib/electrical/loadSurfaceTakeoff";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { POLICY_KEYS, supportCount } from "../lib/electrical/surfaceSystemConfiguration";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { serviceFor } from "../prisma/_serviceTargets";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { REHEARSAL_SLUG } from "./configure-surface-raceway-rehearsal";
import { PROOF_SLUG } from "./provision-routing-v2-proof-contractor";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const ROUTE_FEET = 31;

async function componentsFor(contractorId: string, inside: string, flat: string) {
  const svc = await serviceFor(prisma, contractorId, "surface-mounted-outlet");
  const loaded = await loadServiceForResolution(prisma, svc.id);
  if (!loaded) throw new Error("service not loadable");
  const settings = await loadPricingSettings(prisma, contractorId);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = resolveRoute(loaded, {
    [SURFACE_KEYS.feet]: String(ROUTE_FEET), [SURFACE_KEYS.inside]: inside,
    [SURFACE_KEYS.outside]: "0", [SURFACE_KEYS.flat]: flat,
    [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear",
  }, true, settings) as any;
  return ((r?.config?.components ?? []) as { key: string; quantity: number }[]);
}

async function main() {
  console.log("\nSURFACE RACEWAY SYSTEM CONFIGURATION — PILOT\n");

  const rehearsal = await prisma.contractor.findUniqueOrThrow({
    where: { slug: REHEARSAL_SLUG }, select: { id: true } });
  const fresh = await prisma.contractor.findUniqueOrThrow({
    where: { slug: PROOF_SLUG }, select: { id: true } });

  const straightComponents = await componentsFor(rehearsal.id, "0", "0");
  const turnedComponents = await componentsFor(rehearsal.id, "2", "1");

  const straight = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: straightComponents, routeFeet: ROUTE_FEET, turnCount: 0 });
  const turned = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: turnedComponents, routeFeet: ROUTE_FEET, turnCount: 3 });

  const buy = (t: typeof straight, role: string) => t.purchaseRequirements.find((p) => p.role === role);
  const phys = (t: typeof straight, role: string) => t.physicalRequirements.find((p) => p.role === role)?.quantity;
  const cls = (t: typeof straight, k: string) => t.classStatuses.find((c) => c.classKey === k);
  const codes = (t: typeof straight) => t.unresolvedRequirements.map((u) => u.code);

  console.log("  A  THE STRAIGHT ROUTE IS MATERIALLY COMPLETE\n");
  ok(straight.purchaseComplete,
    "A  31 ft straight surface outlet is purchaseComplete",
    JSON.stringify(straight.unresolvedRequirements.map((u) => [u.code, u.role])));
  ok(straight.unresolvedRequirements.length === 0,
    "A  …with nothing at all unresolved", JSON.stringify(codes(straight)));
  ok(straight.classStatuses.every((c) => c.status === "RESOLVED"),
    "A  …and every declared class resolved",
    JSON.stringify(straight.classStatuses.filter((c) => c.status !== "RESOLVED").map((c) => c.classKey)));

  console.log("\n  B  EACH QUANTITY CAME FROM ITS OWN AUTHORITY\n");
  ok(buy(straight, SURFACE_ROLES.channel)?.packages === 7,
    "B  channel: 31 ft / 5 ft stock -> 7 sticks  [PRODUCT_DERIVED]", String(buy(straight, SURFACE_ROLES.channel)?.packages));
  ok(phys(straight, SURFACE_ROLES.joint) === 6,
    "B  joints: 7 pieces end to end -> 6  [ROUTE_GEOMETRY + PRODUCT_DERIVED]", String(phys(straight, SURFACE_ROLES.joint)));
  ok(phys(straight, SURFACE_ROLES.supportClip) === supportCount(31, 5, true) && phys(straight, SURFACE_ROLES.supportClip) === 8,
    "B  supports: floor(31/5)=6 intermediate + 2 termini -> 8  [PRODUCT_DERIVED]", String(phys(straight, SURFACE_ROLES.supportClip)));
  ok(phys(straight, SURFACE_ROLES.transition) === 1,
    "B  source terminus: 1 entrance fitting  [PRODUCT_DERIVED]", String(phys(straight, SURFACE_ROLES.transition)));
  ok(phys(straight, SURFACE_ROLES.end) === undefined,
    "B  destination: DIRECT_ENTRY, so no end fitting — a declared none",
    String(phys(straight, SURFACE_ROLES.end)));
  ok(phys(straight, "CONDUCTOR_THHN_12_UNGROUNDED") === 32,
    "B  conductors: 31 ft route + 2 x 0.5 ft declared slack -> 32 ft  [CONTRACTOR_POLICY]",
    String(phys(straight, "CONDUCTOR_THHN_12_UNGROUNDED")));
  ok(phys(straight, SURFACE_ROLES.deviceBox) === 1, "B  one device box  [CANONICAL_PHYSICAL]");

  console.log("\n  C  THE SUPPORT RULE IS NOT ceil(feet / spacing)\n");
  // 31/5 = 6.2. ceil is 7; the declared rule gives 6 intermediate plus 2 ends.
  ok(supportCount(31, 5, true) === 8 && Math.ceil(31 / 5) === 7,
    "C  the declared rule and the blind rounding give different answers (8 vs 7)",
    `${supportCount(31, 5, true)} vs ${Math.ceil(31 / 5)}`);
  ok(supportCount(31, 5, false) === 6,
    "C  and the terminus rule alone moves it by exactly two", String(supportCount(31, 5, false)));
  const derSrc = readFileSync("lib/electrical/surfaceSystemConfiguration.ts", "utf8");
  ok(!/Math\.ceil\(\s*feet/.test(derSrc), "C  no ceil(feet / …) appears in the derivation at all");

  console.log("\n  D  GROUNDING IS EXPLICIT, AND IT DECIDES THE CONDUCTOR COUNT\n");
  const sys = await prisma.contractorMaterialSystem.findUniqueOrThrow({
    where: { contractorId_systemKey: { contractorId: rehearsal.id, systemKey: "SURFACE_RACEWAY" } },
    select: { groundingStrategy: true, declaredAt: true, declaredSystemLabel: true } });
  ok(sys.groundingStrategy === "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR",
    "D  the contractor declared a separate equipment grounding conductor", String(sys.groundingStrategy));
  ok(sys.declaredAt !== null, "D  …and the declaration is timestamped, not implied");
  const egc = phys(straight, "CONDUCTOR_THHN_12_EQUIPMENT_GROUND");
  ok(egc === 32, "D  so an equipment grounding conductor IS in the takeoff", String(egc));
  // The other strategy must actually change the answer, or the field is decoration.
  await prisma.contractorMaterialSystem.update({
    where: { contractorId_systemKey: { contractorId: rehearsal.id, systemKey: "SURFACE_RACEWAY" } },
    data: { groundingStrategy: "SYSTEM_PROVIDES_GROUNDING_PATH" } });
  const grounded = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: straightComponents, routeFeet: ROUTE_FEET, turnCount: 0 });
  ok(grounded.physicalRequirements.find((p) => p.role === "CONDUCTOR_THHN_12_EQUIPMENT_GROUND") === undefined,
    "D  …and declaring the system grounds instead removes it",
    JSON.stringify(grounded.physicalRequirements.filter((p) => /CONDUCTOR/.test(p.role)).map((p) => p.role)));
  ok(grounded.purchaseComplete, "D  …while that route is still complete — two conductors, not three");
  await prisma.contractorMaterialSystem.update({
    where: { contractorId_systemKey: { contractorId: rehearsal.id, systemKey: "SURFACE_RACEWAY" } },
    data: { groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR" } });

  console.log("\n  E  NO HOMEOWNER BREAKER QUESTION EXISTS OR IS NEEDED\n");
  const svc = await serviceFor(prisma, rehearsal.id, "surface-mounted-outlet");
  const qs = await prisma.question.findMany({ where: { serviceId: svc.id }, select: { key: true, prompt: true } });
  ok(!qs.some((q) => /amp|breaker|15a|20a|circuit_rating/i.test(`${q.key} ${q.prompt}`)),
    "E  no question asks the homeowner about amperage or a breaker",
    JSON.stringify(qs.filter((q) => /amp|breaker/i.test(`${q.key} ${q.prompt}`)).map((q) => q.key)));
  ok(straight.purchaseComplete, "E  …and the takeoff completes anyway, from the contractor's declaration");
  const spec = await prisma.contractorPolicyValue.findUniqueOrThrow({
    where: { contractorId_key: { contractorId: rehearsal.id, key: POLICY_KEYS.conductorSpec } },
    select: { choice: true, resolvedAt: true } });
  ok(spec.choice === "12" && spec.resolvedAt !== null,
    "E  the gauge is a contractor policy value, explicitly resolved", JSON.stringify(spec));

  console.log("\n  F  THE SPECIFICATION IS NOT INFERRED FROM ANYTHING\n");
  const cfgSrc = readFileSync("lib/electrical/surfaceSystemConfiguration.ts", "utf8");
  // Comments stripped, and the template's OFFERED SET removed: listing which
  // gauges exist is trade knowledge and belongs here. What must not exist is a
  // gauge being assigned, defaulted or fallen back to.
  const codeOnly = cfgSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
                         .replace(/CONDUCTOR_SPEC_CHOICES[^;]*;/, "");
  ok(!/\?\?\s*["'](?:14|12|10)["']|\|\|\s*["'](?:14|12|10)["']|gauge\s*=\s*["']/.test(codeOnly),
    "F  no gauge is defaulted, fallen back to, or assigned in the derivation",
    "a gauge assignment is present");
  // String literals blanked too: the reason text legitimately EXPLAINS the
  // envelope, and an explanation naming `everyday` is not a derivation from it.
  const noStrings = codeOnly.replace(/`[^`]*`|"[^"]*"|'[^']*'/g, '""');
  ok(!/everyday|tap_existing|outlet_load_type|outlet_power_source/.test(noStrings),
    "F  and no code path reads the load or power-source answers at all",
    "the derivation branches on a homeowner answer");
  ok(/spec\.choice/.test(codeOnly),
    "F  the gauge's only source is the contractor's declared policy choice");
  // Remove the declaration and the takeoff must stop, not fall back.
  await prisma.contractorPolicyValue.update({
    where: { contractorId_key: { contractorId: rehearsal.id, key: POLICY_KEYS.conductorSpec } },
    data: { resolvedAt: null } });
  const noSpec = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: straightComponents, routeFeet: ROUTE_FEET, turnCount: 0 });
  ok(!noSpec.purchaseComplete && codes(noSpec).includes("CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED"),
    "F  withdrawing the declaration makes the takeoff incomplete again", JSON.stringify(codes(noSpec)));
  ok(noSpec.physicalRequirements.every((p) => !/CONDUCTOR/.test(p.role)),
    "F  …and no conductor is claimed in the meantime");
  await prisma.contractorPolicyValue.update({
    where: { contractorId_key: { contractorId: rehearsal.id, key: POLICY_KEYS.conductorSpec } },
    data: { resolvedAt: new Date() } });

  console.log("\n  G  THE THREE CONDUCTOR FUNCTIONS STAY DISTINCT PRODUCTS\n");
  const condBuys = straight.purchaseRequirements.filter((p) => /CONDUCTOR/.test(p.role));
  ok(condBuys.length === 3, "G  three separate purchase requirements", String(condBuys.length));
  ok(new Set(condBuys.map((p) => p.role)).size === 3, "G  …with three distinct canonical roles");
  const condRows = await prisma.contractorMaterial.findMany({
    where: { contractorId: rehearsal.id, canonicalMaterial: { key: { startsWith: "CONDUCTOR_THHN_12_" } } },
    select: { id: true, canonicalMaterialId: true } });
  ok(condRows.length === 3 && new Set(condRows.map((r) => r.canonicalMaterialId)).size === 3,
    "G  …backed by three distinct ContractorMaterial rows — one product each", String(condRows.length));
  ok(condBuys.find((p) => /EQUIPMENT_GROUND/.test(p.role))!.costCents !== condBuys.find((p) => /UNGROUNDED/.test(p.role))!.costCents,
    "G  …and they are not silently the same product wearing three names");

  console.log("\n  H  SLACK HAS NO DEFAULT\n");
  const slackSrc = readFileSync("lib/electrical/surfaceSystemConfiguration.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok(!/slack[^\n]*\?\?\s*0|measurement\s*\?\?\s*0/.test(slackSrc), "H  no `?? 0` on the slack value");
  await prisma.contractorPolicyValue.update({
    where: { contractorId_key: { contractorId: rehearsal.id, key: POLICY_KEYS.terminationSlack } },
    data: { resolvedAt: null, measurement: null } });
  const noSlack = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: straightComponents, routeFeet: ROUTE_FEET, turnCount: 0 });
  ok(!noSlack.purchaseComplete && codes(noSlack).includes("TERMINATION_SLACK_NOT_ESTABLISHED"),
    "H  an unestablished allowance blocks completion", JSON.stringify(codes(noSlack)));
  // …and an explicit zero is a real answer, not the same thing.
  await prisma.contractorPolicyValue.update({
    where: { contractorId_key: { contractorId: rehearsal.id, key: POLICY_KEYS.terminationSlack } },
    data: { resolvedAt: new Date(), measurement: 0 } });
  const zeroSlack = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: straightComponents, routeFeet: ROUTE_FEET, turnCount: 0 });
  ok(zeroSlack.purchaseComplete, "H  …while an explicit 0 completes it", JSON.stringify(codes(zeroSlack)));
  ok(zeroSlack.physicalRequirements.find((p) => p.role === "CONDUCTOR_THHN_12_UNGROUNDED")?.quantity === 31,
    "H  …and an explicit 0 means 31 ft, where 0.5 meant 32 — null meant neither",
    String(zeroSlack.physicalRequirements.find((p) => p.role === "CONDUCTOR_THHN_12_UNGROUNDED")?.quantity));
  await prisma.contractorPolicyValue.update({
    where: { contractorId_key: { contractorId: rehearsal.id, key: POLICY_KEYS.terminationSlack } },
    data: { resolvedAt: new Date(), measurement: 0.5 } });

  console.log("\n  I  TRANSITION AND END MATERIAL CANNOT SILENTLY DISAPPEAR\n");
  ok(cls(straight, "RACEWAY_TERMINATION")?.status === "RESOLVED",
    "I  the termination class resolves once declared");
  ok(buy(straight, SURFACE_ROLES.transition)?.packages === 1,
    "I  …and the entrance fitting is actually purchased", String(buy(straight, SURFACE_ROLES.transition)?.packages));
  await prisma.contractorMaterialSystem.update({
    where: { contractorId_systemKey: { contractorId: rehearsal.id, systemKey: "SURFACE_RACEWAY" } },
    data: { sourceTermination: null } });
  const noTerm = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: straightComponents, routeFeet: ROUTE_FEET, turnCount: 0 });
  ok(!noTerm.purchaseComplete && codes(noTerm).includes("TERMINATION_ASSEMBLY_NOT_ESTABLISHED"),
    "I  withdrawing the source declaration blocks completion — it does not just vanish",
    JSON.stringify(codes(noTerm)));
  await prisma.contractorMaterialSystem.update({
    where: { contractorId_systemKey: { contractorId: rehearsal.id, systemKey: "SURFACE_RACEWAY" } },
    data: { sourceTermination: "FITTING_REQUIRED" } });

  console.log("\n  J  THE TURNED CONTROL STAYS INCOMPLETE\n");
  ok(!turned.purchaseComplete, "J  the same 31 ft with three corners is NOT complete");
  ok(codes(turned).includes("SEGMENT_GEOMETRY_REQUIRED") && codes(turned).includes("OFFCUT_POLICY_REQUIRED"),
    "J  …for segmentation and offcut reasons specifically", JSON.stringify(codes(turned)));
  ok(buy(turned, SURFACE_ROLES.channel) === undefined, "J  no channel piece count is claimed");
  ok(phys(turned, SURFACE_ROLES.channel) === 31, "J  …while 31 physical feet is still known");
  ok(phys(turned, SURFACE_ROLES.insideElbow) === 2 && phys(turned, SURFACE_ROLES.flatElbow) === 1,
    "J  the corners are exact");
  ok(phys(turned, SURFACE_ROLES.supportClip) === 8, "J  supports still derive from the declared rule");
  ok(phys(turned, "CONDUCTOR_THHN_12_UNGROUNDED") === 32, "J  conductors still exact — a corner bends wire");
  const offcut = await prisma.contractorPolicyValue.findUnique({
    where: { contractorId_key: { contractorId: rehearsal.id, key: POLICY_KEYS.offcutReuse } },
    select: { resolvedAt: true } });
  ok(offcut !== null && offcut.resolvedAt === null,
    "J  the offcut policy exists as an unanswered question, left deliberately unresolved",
    JSON.stringify(offcut));

  console.log("\n  K  THE FRESH CONTRACTOR RECEIVES NONE OF IT\n");
  const freshComponents = await componentsFor(fresh.id, "0", "0");
  const freshTakeoff = await loadSurfaceTakeoff(prisma, fresh.id,
    { components: freshComponents, routeFeet: ROUTE_FEET, turnCount: 0 });
  ok(!freshTakeoff.purchaseComplete, "K  a freshly provisioned contractor cannot complete the takeoff");
  const freshSystem = await prisma.contractorMaterialSystem.findFirst({ where: { contractorId: fresh.id } });
  ok(freshSystem === null, "K  no material system was inherited");
  const freshPolicies = await prisma.contractorPolicyValue.findMany({
    where: { contractorId: fresh.id, key: { in: Object.values(POLICY_KEYS) } },
    select: { key: true, choice: true, measurement: true, resolvedAt: true } });
  ok(freshPolicies.length === 3,
    "K  …but all three policy QUESTIONS did arrive", JSON.stringify(freshPolicies.map((p) => p.key)));
  ok(freshPolicies.every((p) => p.resolvedAt === null && p.choice === null && p.measurement === null),
    "K  …every one of them unresolved, and none carrying an answer",
    JSON.stringify(freshPolicies));
  const freshProducts = await prisma.contractorMaterial.count({
    where: { contractorId: fresh.id, packageQuantity: { not: null } } });
  ok(freshProducts === 0, "K  no package geometry, no product selection", String(freshProducts));
  // The gaps must be SPECIFIC — the whole point of naming them.
  const freshCodes = new Set(codes(freshTakeoff));
  for (const expected of ["MATERIAL_SYSTEM_NOT_SELECTED", "GROUNDING_STRATEGY_NOT_ESTABLISHED",
                          "CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED", "NO_CONTRACTOR_PRODUCT"]) {
    ok(freshCodes.has(expected as never), `K  it is told specifically: ${expected}`, JSON.stringify([...freshCodes]));
  }
  ok(freshTakeoff.unresolvedRequirements.every((u) => u.reason.length > 40),
    "K  …and every gap carries a reason a contractor could act on");

  console.log("\n  L  MATERIAL COMPLETENESS DOES NOT TOUCH LABOR READINESS\n");
  // Read from the real resolver, not from a count: ContractorComponent rows
  // are created lazily, so "no rows" and "no labor" look identical in a count
  // and the gate is what actually decides.
  const svcL = await serviceFor(prisma, rehearsal.id, "surface-mounted-outlet");
  const loadedL = await loadServiceForResolution(prisma, svcL.id);
  const settingsL = await loadPricingSettings(prisma, rehearsal.id);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const resolvedL = resolveRoute(loadedL!, {
    [SURFACE_KEYS.feet]: String(ROUTE_FEET), [SURFACE_KEYS.inside]: "0",
    [SURFACE_KEYS.outside]: "0", [SURFACE_KEYS.flat]: "0",
    [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear",
  }, true, settingsL) as any;
  ok(resolvedL?.config?.awaitingComponentLabor === true,
    "L  the route still reports awaitingComponentLabor", String(resolvedL?.config?.awaitingComponentLabor));
  ok(resolvedL?.status === "REVIEW",
    "L  …so the route resolves to REVIEW, not a price", String(resolvedL?.status));
  ok(straight.purchaseComplete,
    "L  …while its material takeoff is complete — the two axes are independent");
  ok(resolvedL?.config?.awaitingComponentApproval === true,
    "L  component approval is likewise untouched by material completeness");
  const takeoffSrc = readFileSync("lib/electrical/loadSurfaceTakeoff.ts", "utf8") +
                     readFileSync("lib/electrical/materialTakeoff.ts", "utf8") +
                     readFileSync("lib/electrical/surfaceSystemConfiguration.ts", "utf8");
  ok(!/awaitingComponentLabor|addFieldLaborHours|awaitingComponentApproval/.test(takeoffSrc),
    "L  the takeoff chain cannot even see the labor gates, let alone clear one");
  const pricingSrc = readFileSync("lib/pricing.ts", "utf8");
  ok(!/purchaseComplete|MaterialTakeoff/.test(pricingSrc),
    "L  …and pricing's labor gate does not consult material completeness");

  console.log("\n  M  NO SUPPLIER OR PRODUCT METADATA ENTERS ROUTING V2\n");
  for (const f of ["lib/electrical/materialTakeoff.ts", "lib/electrical/surfaceRacewayTakeoff.ts",
                   "lib/electrical/surfaceSystemConfiguration.ts", "prisma/_surfaceRouteModule.ts",
                   "prisma/seed-routing-v2-policies.ts"]) {
    const b = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    ok(!/wiremold|legrand|supplierProductId|supplierUpc|supplierModelNumber|MaterialSupplierLink/i.test(b),
      `M  ${f} carries no supplier or product identity`);
  }
  const sysRow = await prisma.contractorMaterialSystem.findFirstOrThrow({
    where: { contractorId: rehearsal.id }, select: { declaredSystemLabel: true } });
  ok(!/wiremold|legrand|panduit/i.test(sysRow.declaredSystemLabel ?? ""),
    "M  even the contractor's own system label names no vendor in this fixture",
    String(sysRow.declaredSystemLabel));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
