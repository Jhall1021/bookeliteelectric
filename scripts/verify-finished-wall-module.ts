/**
 * ROUTING V2 — finished-wall concealed routing, and the capability gate.
 *
 * Two claims, and keeping them apart is the point of the file:
 *
 *   ROUTING     — is this physical situation predictable enough to price?
 *   AUTHORIZATION — is this contractor's scope declared, and are the components
 *                   priced yet?
 *
 * A complete recipe plus unpriced components is REVIEW and is a ROUTING SUCCESS.
 * A missing capability produces no recipe at all and is a routing OUTCOME. The
 * assertions never use one to prove the other.
 */
import { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { FINISHED_KEYS, CONCEALED_ENVELOPE_FT } from "../prisma/_finishedWallModule";
import { ACCESSIBLE_KEYS } from "../prisma/_concealedRouteModules";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { eliteService } from "../prisma/_serviceTargets";

const prisma = new PrismaClient();
const SLUG = "rv2-fixture-finished-wall-outlet";
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

/** Physical facts for a clean finished-wall route, method chosen by the caller. */
const facts = (feet: string, method: "baseboard" | "drywall_access", over: Record<string, string> = {}) => ({
  [FINISHED_KEYS.backToBack]: "no",
  [FINISHED_KEYS.feet]: feet,
  [FINISHED_KEYS.surface]: "drywall",
  [FINISHED_KEYS.obstacles]: "clear",
  [FINISHED_KEYS.method]: method,
  ...(method === "baseboard" ? { [FINISHED_KEYS.baseboard]: "yes" } : {}),
  ...over,
});

async function setCapability(contractorId: string, key: string, state: "none" | "declared" | "revoked") {
  await prisma.contractorCapability.deleteMany({ where: { contractorId, key } });
  if (state === "declared") await prisma.contractorCapability.create({ data: { contractorId, key } });
  if (state === "revoked") await prisma.contractorCapability.create({ data: { contractorId, key, revokedAt: new Date() } });
}

async function main() {
  console.log("\nROUTING V2 — FINISHED-WALL QUALIFICATION AND CAPABILITY GATE\n");
  const svc = await eliteService(prisma, SLUG);
  const CID = svc.contractorId;
  const BB = "BASEBOARD_ACCESS_REINSTALL", DW = "DRYWALL_ACCESS_RESTORATION";
  await setCapability(CID, BB, "declared");
  await setCapability(CID, DW, "declared");

  console.log("  A  THE ENVELOPE IS ROUTING, NOT VALIDATION\n");
  for (const [feet, expect] of [["1", "in"], ["18", "in"], ["20", "in"],
                                ["21", "out"], ["24", "out"], ["300", "out"]] as const) {
    const r = await walk(SLUG, facts(feet, "baseboard"));
    ok(expect === "in" ? built(r) : !built(r),
      `A  ${feet} ft ${expect === "in" ? "is within" : "exceeds"} the ${CONCEALED_ENVELOPE_FT} ft envelope`,
      `status ${r.status}, ${JSON.stringify(comps(r))}`);
    if (expect === "out") {
      // The distinction the whole feature exists for.
      ok(r.status !== "INVALID",
        `A  and ${feet} ft is a VALID measurement, not a rejected number (status ${r.status})`);
    }
  }
  {
    const bad = await walk(SLUG, facts("301", "baseboard"));
    ok(bad.status === "INVALID",
      "A  whereas 301 is invalid against the question's own 1-300 domain", `status ${bad.status}`);
  }

  console.log("\n  B  THE ENVELOPE BELONGS TO THIS MODULE ALONE\n");
  {
    const acc = await walk("rv2-fixture-accessible-outlet", { [ACCESSIBLE_KEYS.feet]: "50" });
    ok(built(acc) && qty(acc, "CONCEALED_ROUTE_FT") === 50,
      "B  50 ft accessible concealed still builds its recipe", JSON.stringify(comps(acc)));
    const surf = await walk("surface-mounted-outlet", {
      [SURFACE_KEYS.feet]: "63", [SURFACE_KEYS.inside]: "0", [SURFACE_KEYS.outside]: "0",
      [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear" });
    ok(built(surf) && qty(surf, "SURFACE_ROUTE_FT") === 63,
      "B  63 ft surface-mounted still builds its recipe", JSON.stringify(comps(surf)));
  }

  console.log("\n  C  COMPLETE RECIPES, RESTORATION NEVER OPTIONAL\n");
  for (const [method, strategy, restore] of [
    ["baseboard", "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS", "RESTORE_BASEBOARD_ACCESS"],
    ["drywall_access", "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS", "RESTORE_DRYWALL_ACCESS"],
  ] as const) {
    const r = await walk(SLUG, facts("18", method));
    ok(has(r, strategy), `C  ${method}: ${strategy}`, JSON.stringify(comps(r)));
    ok(qty(r, "CONCEALED_ROUTE_FT") === 18, `C  ${method}: CONCEALED_ROUTE_FT x18`, JSON.stringify(comps(r)));
    ok(has(r, restore), `C  ${method}: ${restore} present`, JSON.stringify(comps(r)));
    ok(comps(r).filter((c: any) => c.key === restore).length === 1,
      `C  ${method}: restoration present exactly once`, JSON.stringify(comps(r)));
    ok(has(r, "OUTLET_EXTENSION_CORE"), `C  ${method}: endpoint core`, JSON.stringify(comps(r)));
    ok(comps(r).length === 4, `C  ${method}: exactly four components`, JSON.stringify(comps(r)));
  }

  console.log("\n  D  THE CAPABILITY GATE — ALL THREE STATES\n");
  for (const [method, key] of [["baseboard", BB], ["drywall_access", DW]] as const) {
    for (const [state, shouldBuild] of [["declared", true], ["none", false], ["revoked", false]] as const) {
      await setCapability(CID, key, state);
      const r = await walk(SLUG, facts("18", method));
      ok(built(r) === shouldBuild,
        `D  ${method} + ${state === "none" ? "not-established" : state} ` +
        `${shouldBuild ? "builds" : "builds NO"} deterministic recipe`,
        `status ${r.status}, ${JSON.stringify(comps(r))}`);
      if (!shouldBuild) {
        // The failure this gate exists to prevent.
        ok(!has(r, "RESTORE_BASEBOARD_ACCESS") && !has(r, "RESTORE_DRYWALL_ACCESS"),
          `D  and it is not quoted with restoration quietly dropped`, JSON.stringify(comps(r)));
      }
    }
    await setCapability(CID, key, "declared");
  }

  console.log("\n  E  PHYSICAL FACTS THAT LOSE PREDICTABILITY\n");
  for (const [label, over] of [
    ["no continuous baseboard", { [FINISHED_KEYS.baseboard]: "no" }],
    ['"not sure" about the baseboard', { [FINISHED_KEYS.baseboard]: "unsure" }],
    ["a doorway", { [FINISHED_KEYS.obstacles]: "doorway" }],
    ["a fireplace", { [FINISHED_KEYS.obstacles]: "fireplace" }],
    ["a tiled section", { [FINISHED_KEYS.obstacles]: "tiled_section" }],
    ['"not sure" about obstacles', { [FINISHED_KEYS.obstacles]: "unsure" }],
    ["plaster", { [FINISHED_KEYS.surface]: "plaster" }],
    ["stone", { [FINISHED_KEYS.surface]: "stone" }],
    ["wallpaper", { [FINISHED_KEYS.surface]: "wallpaper" }],
    ['"not sure" about the surface', { [FINISHED_KEYS.surface]: "unsure" }],
  ] as const) {
    const r = await walk(SLUG, facts("18", "baseboard", over as Record<string, string>));
    ok(!built(r), `E  ${label} builds no deterministic recipe (status ${r.status})`, JSON.stringify(comps(r)));
  }
  {
    const m = await walk(SLUG, facts("18", "baseboard", { [FINISHED_KEYS.method]: "unsure" }));
    ok(!built(m), `E  "not sure" about the method builds no recipe (status ${m.status})`);
  }

  console.log("\n  F  BACK-TO-BACK PRECEDENCE — NO FOOTAGE, NO ENVELOPE\n");
  {
    const r = await walk(SLUG, { [FINISHED_KEYS.backToBack]: "yes" });
    ok(built(r) && has(r, "ELEC_ROUTE_BACK_TO_BACK"), "F  back-to-back builds its own recipe", JSON.stringify(comps(r)));
    ok(!has(r, "CONCEALED_ROUTE_FT"),
      "F  and carries NO footage — a wall's thickness is not a route length", JSON.stringify(comps(r)));
    ok(comps(r).length === 2, "F  exactly two components", JSON.stringify(comps(r)));
  }

  console.log("\n  G  GRAPH AND ECONOMICS\n");
  {
    const s2 = await eliteService(prisma, SLUG);
    ok((await findDanglingReferences(prisma, s2.id)).length === 0, "G  no dangling reference");
    ok((await findUnreachableQuestions(prisma, s2.id)).length === 0, "G  no unreachable question");
    const rows = await prisma.contractorComponent.findMany({
      where: { canonicalComponent: { key: { in: [
        "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS", "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS",
        "RESTORE_BASEBOARD_ACCESS", "RESTORE_DRYWALL_ACCESS"] } } },
      select: { approvedPriceCents: true } });
    ok(rows.length > 0 && rows.every((r) => r.approvedPriceCents === null),
      `G  every concealed/restoration component is unpriced (${rows.length} rows)`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
