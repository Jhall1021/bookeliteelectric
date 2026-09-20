/**
 * ROUTING V2 — accessible concealed, and back to back.
 *
 * The claim under test is the governing rule itself: DISTANCE DETERMINES
 * QUANTITY, OBSERVATION AUTHORITY DETERMINES PRICEABILITY. An accessible 50 ft
 * route is not a different kind of work from an 8 ft one, but a homeowner's
 * estimate of the hidden path remains review context until the contractor
 * confirms it.
 *
 * As with the surface module, the components are deliberately unpriced, so
 * every walk ends REVIEW on awaitingComponentApproval. The physical recipe is
 * what these modules are responsible for, and it is read from config directly.
 */
import { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { ACCESSIBLE_KEYS, BACK_TO_BACK_KEYS } from "../prisma/_concealedRouteModules";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { eliteService } from "../prisma/_serviceTargets";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function walk(slug: string, answers: Record<string, string>) {
  const svc = await eliteService(prisma, slug);
  const loaded = await loadServiceForResolution(prisma, svc.id);
  if (!loaded) throw new Error(`${slug} could not be loaded`);
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  return resolveRoute(loaded, answers, true, settings);
}
const comps = (r: any): { key: string; quantity: number }[] =>
  (r?.config?.components ?? []).map((c: any) => ({ key: c.key, quantity: c.quantity }));
const qty = (r: any, k: string) => comps(r).find((c) => c.key === k)?.quantity;
const has = (r: any, k: string) => comps(r).some((c) => c.key === k);
const built = (r: any) => comps(r).length > 0;

async function main() {
  console.log("\nROUTING V2 — ACCESSIBLE CONCEALED AND BACK TO BACK\n");

  console.log("  A  ACCESSIBLE CONCEALED: LENGTH IS A QUANTITY, NOT A CLASS\n");
  const recipes: Record<string, string> = {};
  for (const feet of ["8", "14.625", "18", "50", "120", "300"]) {
    const r = await walk("rv2-fixture-accessible-outlet", { [ACCESSIBLE_KEYS.feet]: feet });
    ok(built(r), `A  ${feet} ft builds a deterministic physical recipe (status ${r.status})`,
      JSON.stringify(comps(r)));
    ok(has(r, "ELEC_ROUTE_ACCESSIBLE_CONCEALED"), `A  ${feet} ft uses the accessible-concealed strategy`);
    ok(qty(r, "CONCEALED_ROUTE_FT") === Number(feet),
      `A  ${feet} ft materializes CONCEALED_ROUTE_FT x${feet}`, JSON.stringify(comps(r)));
    recipes[feet] = comps(r).map((c) => c.key).sort().join(",");
  }
  ok(new Set(Object.values(recipes)).size === 1,
    "A  8, 18, 50, 120 and 300 ft select the IDENTICAL component set — only quantity differs",
    JSON.stringify(recipes));

  {
    // The specific regression the old matrix caused.
    const r50 = await walk("rv2-fixture-accessible-outlet", { [ACCESSIBLE_KEYS.feet]: "50" });
    ok(built(r50) && r50.status === "REVIEW",
      "A  50 ft preserves the recipe but waits for contractor measurement authority", `status ${r50.status}`);
    ok(!has(r50, "ELEC_ROUTE_SURFACE_MOUNTED") && !has(r50, "ELEC_ROUTE_BACK_TO_BACK"),
      "A  and it is not quietly re-classified as another strategy", JSON.stringify(comps(r50)));
  }

  console.log("\n  B  ACCESSIBLE CONCEALED: A BAD MEASUREMENT STILL CANNOT PRICE\n");
  for (const [label, feet] of [["zero", "0"], ["negative", "-3"],
                               ["words", "fifty"], ["beyond the authored max", "301"]] as const) {
    const r = await walk("rv2-fixture-accessible-outlet", { [ACCESSIBLE_KEYS.feet]: feet });
    ok(!built(r), `B  ${label} builds no recipe (status ${r.status})`, JSON.stringify(comps(r)));
  }

  console.log("\n  C  BACK TO BACK CARRIES NO FOOTAGE, BY DESIGN\n");
  {
    const yes = await walk("rv2-fixture-back-to-back-outlet", { [BACK_TO_BACK_KEYS.confirm]: "yes" });
    ok(built(yes) && has(yes, "ELEC_ROUTE_BACK_TO_BACK"),
      "C  a supported back-to-back builds its recipe", JSON.stringify(comps(yes)));
    ok(has(yes, "OUTLET_EXTENSION_CORE"), "C  with the endpoint core", JSON.stringify(comps(yes)));
    // The point: no invented per-foot line for symmetry with other strategies.
    ok(!has(yes, "CONCEALED_ROUTE_FT") && !has(yes, "SURFACE_ROUTE_FT"),
      "C  and NO footage component — there is no run to measure", JSON.stringify(comps(yes)));
    ok(comps(yes).length === 2,
      "C  exactly two components: the strategy and the endpoint", JSON.stringify(comps(yes)));

    for (const v of ["no", "unsure"]) {
      const r = await walk("rv2-fixture-back-to-back-outlet", { [BACK_TO_BACK_KEYS.confirm]: v });
      ok(!built(r), `C  "${v}" builds no recipe — it is not a back-to-back route (status ${r.status})`,
        JSON.stringify(comps(r)));
    }
  }

  console.log("\n  D  THE ENDPOINT IS THE ONLY THING THAT VARIES\n");
  {
    const o = await walk("rv2-fixture-accessible-outlet", { [ACCESSIBLE_KEYS.feet]: "27" });
    const s = await walk("rv2-fixture-accessible-switch", { [ACCESSIBLE_KEYS.feet]: "27" });
    const routeOf = (r: any) => comps(r).filter((c) => c.key.startsWith("ELEC_ROUTE_") || c.key.endsWith("_ROUTE_FT"))
      .map((c) => `${c.key}x${c.quantity}`).sort().join(",");
    ok(routeOf(o) === routeOf(s),
      "D  outlet and switch share an identical route recipe", `${routeOf(o)} vs ${routeOf(s)}`);
    ok(has(o, "OUTLET_EXTENSION_CORE") && !has(o, "SWITCH_ENDPOINT_CORE"), "D  outlet carries only its own core");
    ok(has(s, "SWITCH_ENDPOINT_CORE") && !has(s, "OUTLET_EXTENSION_CORE"), "D  switch carries only its own core");
  }

  console.log("\n  E  GRAPH AND ECONOMICS\n");
  for (const slug of ["rv2-fixture-accessible-outlet", "rv2-fixture-accessible-switch",
                      "rv2-fixture-back-to-back-outlet"]) {
    const svc = await eliteService(prisma, slug);
    ok((await findDanglingReferences(prisma, svc.id)).length === 0, `E  ${slug}: no dangling reference`);
    ok((await findUnreachableQuestions(prisma, svc.id)).length === 0, `E  ${slug}: no unreachable question`);
  }
  {
    const rows = await prisma.contractorComponent.findMany({
      where: { canonicalComponent: { key: { in: [
        "ELEC_ROUTE_ACCESSIBLE_CONCEALED", "ELEC_ROUTE_BACK_TO_BACK", "CONCEALED_ROUTE_FT"] } } },
      select: { approvedPriceCents: true, canonicalComponent: { select: { key: true } } } });
    ok(rows.length > 0 && rows.every((r) => r.approvedPriceCents === null),
      `E  every component these modules use is unpriced (${rows.length} rows)`,
      rows.filter((r) => r.approvedPriceCents !== null).map((r) => r.canonicalComponent.key).join(", "));
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
