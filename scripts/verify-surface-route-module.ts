/**
 * ROUTING V2 — the shared surface-mounted module, proven against a real tree.
 *
 * The claim under test is not "a quantity can come from a number" — that is
 * proven purely elsewhere. It is that ONE module, walked with real answers,
 * materializes the right physical recipe for three different endpoints, and
 * that the route half of that recipe is literally the same rows.
 *
 * Distance determines QUANTITY. Predictability determines PRICEABILITY. Both
 * halves are asserted here: 40 ft is priced as 40 ft, and a fireplace in the way
 * is not priced at all.
 */
import { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { SURFACE_KEYS, SURFACE_ENDPOINT_RECIPE, SURFACE_ROUTE_COMPONENTS } from "../prisma/_surfaceRouteModule";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { eliteService } from "../prisma/_serviceTargets";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const SLUGS = {
  OUTLET: "surface-mounted-outlet",
  SWITCH: "surface-mounted-switch",
  FIXTURE_BOX: "surface-mounted-fixture-box",
} as const;

const clear = (feet: string, inside = "0", outside = "0", surface = "drywall") => ({
  [SURFACE_KEYS.feet]: feet,
  [SURFACE_KEYS.inside]: inside,
  [SURFACE_KEYS.outside]: outside,
  // Zero flat corners: the component is omitted, so every expectation below is unchanged.
  [SURFACE_KEYS.flat]: "0",
  [SURFACE_KEYS.surface]: surface,
  [SURFACE_KEYS.obstacles]: "clear",
});

async function walk(slug: string, answers: Record<string, string>) {
  const svc = await eliteService(prisma, slug);
  const loaded = await loadServiceForResolution(prisma, svc.id);
  // Null means the service could not be loaded for resolution at all. Throwing
  // beats a null-check that quietly reports every walk as unresolved.
  if (!loaded) throw new Error(`${slug} could not be loaded for resolution`);
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  return resolveRoute(loaded, answers, true, settings);
}
/**
 * The resolved recipe lives on `config.components` as `{ key, label, quantity }`
 * — present whatever the status. That matters here: these services are
 * deliberately UNPRICED, so every walk ends REVIEW with
 * `awaitingComponentApproval`. The physical recipe is still fully resolved, and
 * it is the recipe this module is responsible for.
 */
const comps = (r: any): { key: string; quantity: number }[] =>
  (r?.config?.components ?? []).map((c: any) => ({ key: c.key, quantity: c.quantity }));
/** Did the walk reach the priced terminal, as opposed to a review exit? */
const reachedTerminal = (r: any) => comps(r).length > 0;
const qty = (r: any, key: string) => comps(r).find((c) => c.key === key)?.quantity;
const has = (r: any, key: string) => comps(r).some((c) => c.key === key);

async function main() {
  console.log("\nROUTING V2 — SHARED SURFACE-MOUNTED MODULE\n");

  console.log("  1-2  LENGTH IS A QUANTITY, AT ANY LENGTH\n");
  for (const feet of ["8", "14.625", "18", "40", "63"]) {
    const r = await walk(SLUGS.OUTLET, clear(feet));
    ok(qty(r, "SURFACE_ROUTE_FT") === Number(feet),
      `${feet} ft materializes SURFACE_ROUTE_FT x${feet}`, JSON.stringify(comps(r)));
    ok(r.status !== "INVALID" && reachedTerminal(r),
      `and ${feet} ft reaches the priced terminal — not refused for its length`,
      `status ${r.status}, ${JSON.stringify(comps(r))}`);
  }
  {
    const a = await walk(SLUGS.OUTLET, clear("8"));
    const b = await walk(SLUGS.OUTLET, clear("40"));
    ok(comps(a).map((c) => c.key).sort().join() === comps(b).map((c) => c.key).sort().join(),
      "1-2  8 ft and 40 ft select the SAME components — only the quantity differs",
      `${JSON.stringify(comps(a))} vs ${JSON.stringify(comps(b))}`);
  }

  console.log("\n  3-5  CORNERS ARE COUNTED, AND ZERO MEANS ABSENT\n");
  {
    const none = await walk(SLUGS.OUTLET, clear("20", "0", "0"));
    ok(!has(none, "SURFACE_ROUTE_INSIDE_CORNER"), "3  zero inside corners emits no inside-corner component");
    ok(!has(none, "SURFACE_ROUTE_OUTSIDE_CORNER"), "4  zero outside corners emits no outside-corner component");
    const some = await walk(SLUGS.OUTLET, clear("27", "2", "1"));
    ok(qty(some, "SURFACE_ROUTE_INSIDE_CORNER") === 2, "5  two inside corners is x2", JSON.stringify(comps(some)));
    ok(qty(some, "SURFACE_ROUTE_OUTSIDE_CORNER") === 1, "5  one outside corner is x1", JSON.stringify(comps(some)));
    const mixed = await walk(SLUGS.OUTLET, clear("27", "3", "0"));
    ok(qty(mixed, "SURFACE_ROUTE_INSIDE_CORNER") === 3 && !has(mixed, "SURFACE_ROUTE_OUTSIDE_CORNER"),
      "5  and the two counts are independent — 3 inside, no outside", JSON.stringify(comps(mixed)));
  }

  console.log("\n  6  A NUMBER THAT CANNOT BE TRUSTED CANNOT PRICE\n");
  for (const [label, feet] of [["zero feet", "0"], ["negative", "-4"],
                               ["words", "about twenty"], ["beyond the authored max", "5000"]] as const) {
    const r = await walk(SLUGS.OUTLET, clear(feet));
    ok(r.status === "INVALID", `6  ${label} does not price (status ${r.status})`,
      (r as any).reason ?? JSON.stringify(comps(r)));
  }

  console.log("\n  7  UNCERTAINTY GOES TO REVIEW, NOT TO A PRICE\n");
  for (const [label, ans] of [
    ["a fireplace in the way", { ...clear("20"), [SURFACE_KEYS.obstacles]: "fireplace" }],
    ["a doorway in the way", { ...clear("20"), [SURFACE_KEYS.obstacles]: "doorway" }],
    ['"not sure" about obstacles', { ...clear("20"), [SURFACE_KEYS.obstacles]: "unsure" }],
    ['"not sure" about the surface', { ...clear("20", "0", "0", "unsure") }],
    ["tile", { ...clear("20", "0", "0", "tile") }],
  ] as const) {
    const r = await walk(SLUGS.OUTLET, ans as Record<string, string>);
    // Status alone proves nothing here: an unpriced service reports REVIEW even
    // on a good route. What must be true is that the recipe was never built.
    ok(!reachedTerminal(r),
      `7  ${label} never reaches the priced terminal (status ${r.status})`, JSON.stringify(comps(r)));
  }

  console.log("\n  8-9  ONE MODULE, THREE ENDPOINTS\n");
  {
    const walks = {
      OUTLET: await walk(SLUGS.OUTLET, clear("27", "2", "1")),
      SWITCH: await walk(SLUGS.SWITCH, clear("27", "2", "1")),
      FIXTURE_BOX: await walk(SLUGS.FIXTURE_BOX, clear("27", "2", "1")),
    };
    const routeOf = (r: any) => comps(r).filter((c) => (SURFACE_ROUTE_COMPONENTS as readonly string[]).includes(c.key))
      .map((c) => `${c.key}x${c.quantity}`).sort().join(",");
    ok(routeOf(walks.OUTLET) === routeOf(walks.SWITCH) &&
       routeOf(walks.SWITCH) === routeOf(walks.FIXTURE_BOX),
      "8  all three endpoints produce the IDENTICAL route recipe for identical facts",
      Object.entries(walks).map(([k, v]) => `${k}: ${routeOf(v)}`).join(" | "));
    for (const [ep, r] of Object.entries(walks)) {
      const want = SURFACE_ENDPOINT_RECIPE[ep as keyof typeof SURFACE_ENDPOINT_RECIPE];
      ok(has(r, want.core) && has(r, want.box),
        `9  ${ep} carries its own endpoint (${want.core} + ${want.box})`, JSON.stringify(comps(r)));
      const others = Object.entries(SURFACE_ENDPOINT_RECIPE).filter(([k]) => k !== ep);
      ok(others.every(([, o]) => !has(r, o.core)),
        `9  and no other endpoint's core leaks into it`, JSON.stringify(comps(r)));
    }
  }

  console.log("\n  10  GRAPH INTEGRITY\n");
  for (const [ep, slug] of Object.entries(SLUGS)) {
    const svc = await eliteService(prisma, slug);
    const dangling = await findDanglingReferences(prisma, svc.id);
    const unreachable = await findUnreachableQuestions(prisma, svc.id);
    ok(dangling.length === 0, `10  ${ep}: no dangling nextQuestionId`, JSON.stringify(dangling));
    ok(unreachable.length === 0, `10  ${ep}: no unreachable question`, JSON.stringify(unreachable));
  }

  console.log("\n  11-12  ECONOMICS ABSENT, LEGACY KEYS ABSENT\n");
  {
    const rows = await prisma.contractorComponent.findMany({
      where: { canonicalComponent: { key: { in: [
        ...SURFACE_ROUTE_COMPONENTS,
        ...Object.values(SURFACE_ENDPOINT_RECIPE).flatMap((r) => [r.core, r.box])] } } },
      select: { approvedPriceCents: true, canonicalComponent: { select: { key: true } } },
    });
    ok(rows.length > 0 && rows.every((r) => r.approvedPriceCents === null),
      `11  every component the module uses is unpriced (${rows.length} rows)`,
      rows.filter((r) => r.approvedPriceCents !== null).map((r) => r.canonicalComponent.key).join(", "));

    const legacy = await prisma.answerOptionComponent.findMany({
      where: {
        answerOption: { question: { service: { slug: { in: Object.values(SLUGS) } } } },
        canonicalComponent: { key: { startsWith: "OUTLET_RUN_" } },
      },
      select: { id: true },
    });
    const legacySwitch = await prisma.answerOptionComponent.findMany({
      where: {
        answerOption: { question: { service: { slug: { in: Object.values(SLUGS) } } } },
        canonicalComponent: { key: { startsWith: "SWITCHLEG_" } },
      },
      select: { id: true },
    });
    ok(legacy.length === 0 && legacySwitch.length === 0,
      "12  the module uses no OUTLET_RUN_* or SWITCHLEG_* key",
      `outlet=${legacy.length} switchleg=${legacySwitch.length}`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
