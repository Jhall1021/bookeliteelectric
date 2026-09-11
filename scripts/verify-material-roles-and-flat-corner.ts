/**
 * Stage C/D — a vendor-neutral material vocabulary, and a turn that stays on
 * the wall.
 *
 * The NECA MLU publishes a flat elbow as its own line in every raceway family,
 * separately from the internal and external elbows and at a different figure.
 * Routing V2 had no way to say "the route turns but never leaves the wall", so
 * a real fitting was invisible to any takeoff. This adds the primitive through
 * the same chain the other two turns use — question, component, material role —
 * and proves nothing about it is special-cased.
 *
 * The roles themselves name no vendor. Wiremold 2911 is a product that
 * satisfies SURFACE_RACEWAY_ELBOW_FLAT; it is never the role.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { eliteService, serviceFor } from "../prisma/_serviceTargets";
import { SURFACE_KEYS, SURFACE_BOUNDS } from "../prisma/_surfaceRouteModule";
import { OUTLET_V2_KEYS, OUTLET_SLUG } from "../prisma/seed-new-outlet-v2";
import { SURFACE_RACEWAY_ROLES, EMT_ROLES, CONDUCTOR_ROLES, FORBIDDEN_BRANDS } from "../prisma/seed-routing-v2-material-roles";
import { PROOF_SLUG } from "./provision-routing-v2-proof-contractor";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const fp = (r: unknown) => ((r as { config?: { components?: { key: string; quantity: number }[] } })?.config?.components ?? [])
  .map((c) => `${c.key}x${c.quantity}`).sort().join("|");

async function main() {
  console.log("\nMATERIAL ROLES + FLAT CORNER\n");

  console.log("  A  THE VOCABULARY NAMES NO VENDOR\n");
  const all = await prisma.canonicalMaterial.findMany({ select: { key: true, name: true, notes: true, unit: true } });
  const branded = all.filter((m) =>
    FORBIDDEN_BRANDS.some((b) => `${m.key} ${m.name}`.toLowerCase().includes(b)));
  ok(branded.length === 0, `A  no canonical role names a vendor (${all.length} roles checked)`,
    branded.map((m) => m.key).join(", "));
  const newKeys = [...SURFACE_RACEWAY_ROLES, ...EMT_ROLES, ...CONDUCTOR_ROLES].map((r) => r.key);
  const present = await prisma.canonicalMaterial.findMany({ where: { key: { in: newKeys } }, select: { key: true, unit: true } });
  ok(present.length === newKeys.length, `A  all ${newKeys.length} new roles exist (${present.length})`,
    newKeys.filter((k) => !present.some((p) => p.key === k)).join(", "));
  ok(present.filter((p) => p.unit === "ft").length >= 4 && present.filter((p) => p.unit === "each").length >= 10,
    "A  units are physical — linear roles in ft, discrete roles each",
    JSON.stringify(present.slice(0, 4)));
  // Package geometry belongs to the product, never the role.
  const pkgInRole = present.filter((p) => /_(5|6|8|10)_?FT|STICK|LENGTH/i.test(p.key));
  ok(pkgInRole.length === 0, "A  no role encodes a stock length", pkgInRole.map((p) => p.key).join(", "));

  console.log("\n  B  NO SUPPLIER IDENTITY ANYWHERE IN ROUTING V2\n");
  const v2Files = ["prisma/_surfaceRouteModule.ts", "prisma/_concealedRouteModules.ts",
    "prisma/_finishedWallModule.ts", "prisma/seed-routing-v2-components.ts",
    "prisma/seed-routing-v2-material-roles.ts", "prisma/seed-routing-v2-component-materials.ts",
    "lib/routeResolver.ts"];
  for (const f of v2Files) {
    const body = readFileSync(f, "utf8");
    // Comments may cite a source; CODE may not name a vendor. The one thing
    // that legitimately contains vendor strings is the FORBIDDEN_BRANDS list
    // itself, so that declaration is removed before scanning — a guard is
    // allowed to name what it guards against.
    const code = body
      .replace(/export const FORBIDDEN_BRANDS[\s\S]*?\];/, "")
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
      .toLowerCase();
    const hit = FORBIDDEN_BRANDS.find((b) => code.includes(b));
    ok(!hit, `B  ${f} names no vendor in code`, String(hit));
  }

  console.log("\n  C  NM CABLE AND INDIVIDUAL CONDUCTORS STAY SEPARATE\n");
  const nm = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_14_2" }, select: { key: true, unit: true } });
  const thhn = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "CONDUCTOR_THHN_14" }, select: { key: true, unit: true, notes: true } });
  ok(nm.key !== thhn.key, "C  WIRE_14_2 and CONDUCTOR_THHN_14 are different roles");
  ok(/not interchangeable/i.test(thhn.notes ?? ""), "C  …and the conductor role says so explicitly");
  const conductorCount = await prisma.canonicalMaterial.count({ where: { key: { startsWith: "CONDUCTOR_THHN_" } } });
  ok(conductorCount === CONDUCTOR_ROLES.length, `C  ${conductorCount} conductor gauges, matching the branch-circuit work the catalog performs`);

  console.log("\n  D  EMT FITTINGS ARE ATOMIC, NOT A SET\n");
  for (const kind of ["EMT_", "EMT_COUPLING_", "EMT_CONNECTOR_", "EMT_STRAP_"]) {
    const n = await prisma.canonicalMaterial.count({ where: { key: { startsWith: kind } } });
    ok(n >= 3, `D  ${kind}* exists at ${n} size(s)`);
  }
  const anySet = await prisma.canonicalMaterial.count({ where: { key: { startsWith: "EMT" }, unit: "set" } });
  ok(anySet === 0, "D  no EMT role is a 'set' — geometry cannot price an undefined bundle");

  console.log("\n  E  THE LEGACY FITTING SET IS INTACT AND UNUSED BY V2\n");
  const legacy = await prisma.canonicalMaterial.findUniqueOrThrow({
    where: { key: "CONDUIT_FITTINGS_1" }, select: { id: true, active: true } });
  ok(legacy.active, "E  CONDUIT_FITTINGS_1 is still active for its V1 consumer");
  const legacyUse = await prisma.serviceMaterial.count({ where: { canonicalMaterialId: legacy.id } });
  ok(legacyUse >= 1, `E  …and still consumed (${legacyUse} service row)`);
  const legacyInRecipes = await prisma.canonicalComponentMaterial.count({ where: { canonicalMaterialId: legacy.id } });
  ok(legacyInRecipes === 0, "E  no Routing V2 component recipe attaches to it", String(legacyInRecipes));

  console.log("\n  F  FLAT IS PHYSICALLY SEPARATE FROM INSIDE AND OUTSIDE\n");
  const turns = ["SURFACE_ROUTE_INSIDE_CORNER", "SURFACE_ROUTE_OUTSIDE_CORNER", "SURFACE_ROUTE_FLAT_CORNER"];
  const recipes: Record<string, string[]> = {};
  for (const t of turns) {
    const c = await prisma.canonicalComponent.findUniqueOrThrow({
      where: { key: t }, include: { materials: { include: { canonicalMaterial: { select: { key: true } } } } } });
    recipes[t] = c.materials.map((m) => m.canonicalMaterial.key);
  }
  ok(new Set(Object.values(recipes).flat()).size === 3,
    "F  the three turns consume three DIFFERENT material roles", JSON.stringify(recipes));
  ok(recipes["SURFACE_ROUTE_FLAT_CORNER"][0] === "SURFACE_RACEWAY_ELBOW_FLAT",
    "F  flat corner -> SURFACE_RACEWAY_ELBOW_FLAT", JSON.stringify(recipes["SURFACE_ROUTE_FLAT_CORNER"]));
  // Distinctness as DATA, not as a literal-type comparison the compiler can
  // fold away — three keys, three values, no aliasing.
  const turnKeys: string[] = [SURFACE_KEYS.inside, SURFACE_KEYS.outside, SURFACE_KEYS.flat];
  ok(new Set(turnKeys).size === 3, "F  …and three distinct question keys, no alias", turnKeys.join(", "));

  console.log("\n  G  ZERO OMITS, N BINDS EXACTLY, BOTH DOORS AGREE\n");
  const svcDirect = await eliteService(prisma, "surface-mounted-outlet");
  const svcFlow = await eliteService(prisma, OUTLET_SLUG);
  const lDirect = await loadServiceForResolution(prisma, svcDirect.id);
  const lFlow = await loadServiceForResolution(prisma, svcFlow.id);
  if (!lDirect || !lFlow) throw new Error("services not loadable");
  const settings = await loadPricingSettings(prisma, lFlow.contractorId ?? "");
  const facts = (flat: string) => ({
    [SURFACE_KEYS.feet]: "31", [SURFACE_KEYS.inside]: "2", [SURFACE_KEYS.outside]: "0",
    [SURFACE_KEYS.flat]: flat, [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear" });
  const inflow = (flat: string) => ({ outlet_load_type: "everyday", outlet_power_source: "tap_existing",
    below_above_access: "no_access", [OUTLET_V2_KEYS.method]: "surface", ...facts(flat) });

  const zero = fp(resolveRoute(lDirect, facts("0"), true, settings));
  ok(!zero.includes("SURFACE_ROUTE_FLAT_CORNER"), "G  0 flat corners omits the component entirely", zero);
  for (const n of ["1", "3"]) {
    const got = fp(resolveRoute(lDirect, facts(n), true, settings));
    ok(got.includes(`SURFACE_ROUTE_FLAT_CORNERx${n}`), `G  ${n} flat corner(s) binds exactly x${n}`, got);
  }
  for (const n of ["0", "1", "3"]) {
    const a = fp(resolveRoute(lDirect, facts(n), true, settings));
    const b = fp(resolveRoute(lFlow, inflow(n), true, settings));
    ok(a === b && a !== "", `G  direct and in-flow are byte-identical at flat=${n}`, `${a}\n         ${b}`);
  }
  const q = (lDirect.questions as unknown as { key: string; numberMin: number | null; numberMax: number | null; inputType: string }[])
    .find((x) => x.key === SURFACE_KEYS.flat);
  ok(q?.inputType === "NUMBER" && q?.numberMin === SURFACE_BOUNDS.corners.min && q?.numberMax === SURFACE_BOUNDS.corners.max,
    `G  the question is NUMBER [${SURFACE_BOUNDS.corners.min}-${SURFACE_BOUNDS.corners.max}] — the same policy as its siblings`,
    JSON.stringify(q));

  console.log("\n  H  TEMPLATE AND FRESH PROVISIONING CARRY IT\n");
  const tv = await prisma.templateVersion.findFirstOrThrow({ where: { trade: "electrical", version: 3 }, select: { id: true } });
  for (const key of [OUTLET_SLUG, "surface-mounted-outlet"]) {
    const ts = await prisma.templateService.findFirstOrThrow({ where: { templateVersionId: tv.id, key }, select: { id: true } });
    const tq = await prisma.templateQuestion.findFirst({ where: { templateServiceId: ts.id, key: SURFACE_KEYS.flat },
      select: { numberMin: true, numberMax: true } });
    ok(!!tq, `H  template ${key} carries ${SURFACE_KEYS.flat}`);
    ok(tq?.numberMin === 0 && tq?.numberMax === SURFACE_BOUNDS.corners.max, `H  …with its authored bounds`, JSON.stringify(tq));
    // The binding lives on the TERMINAL option that materialises the recipe —
    // the obstacles "clear" answer — not on the number question itself. Looked
    // for across the whole template service, which is where it actually is.
    const boundAnywhere = await prisma.templateAnswerOptionComponent.count({
      where: { quantityAnswerKey: SURFACE_KEYS.flat,
               templateAnswerOption: { templateQuestion: { templateServiceId: ts.id } } } });
    ok(boundAnywhere === 1,
      `H  …and exactly one component binds its quantity to it`, String(boundAnywhere));
  }
  const proof = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF_SLUG }, select: { id: true } });
  const pSvc = await serviceFor(prisma, proof.id, OUTLET_SLUG);
  const pq = await prisma.question.findFirst({ where: { serviceId: pSvc.id, key: SURFACE_KEYS.flat },
    select: { numberMin: true, numberMax: true, inputType: true } });
  ok(!!pq && pq.inputType === "NUMBER", "H  the fresh contractor received the question", JSON.stringify(pq));

  console.log("\n  I  NO CONTRACTOR ECONOMICS LEAKED THROUGH PROVISIONING\n");
  const elite = await prisma.contractor.findUniqueOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const freshComp = await prisma.contractorComponent.count({ where: { contractorId: proof.id } });
  const freshMat = await prisma.contractorMaterial.findMany({ where: { contractorId: proof.id }, select: { unitCostCents: true } });
  const eliteMat = await prisma.contractorMaterial.count({ where: { contractorId: elite.id } });
  ok(freshComp === 0, `I  the fresh contractor owns no component economics (${freshComp}); Elite keeps its own`);
  ok(freshMat.every((m) => !m.unitCostCents), `I  and no material unit cost (${freshMat.length} rows, Elite has ${eliteMat})`);
  const links = await prisma.materialSupplierLink.count().catch(() => 0);
  const freshLinks = await prisma.contractorMaterial.count({ where: { contractorId: proof.id, activeSupplierLinkId: { not: null } } });
  ok(freshLinks === 0, `I  and no supplier product selection (${freshLinks} of ${links} links estate-wide)`);
  const pSvcRow = await prisma.service.findUniqueOrThrow({ where: { id: pSvc.id },
    select: { basePrice: true, active: true, offered: true, publishedPriceApprovedAt: true } });
  ok(pSvcRow.basePrice === null && !pSvcRow.active && !pSvcRow.offered && pSvcRow.publishedPriceApprovedAt === null,
    "I  and nothing priced, activated, offered or approved", JSON.stringify(pSvcRow));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
