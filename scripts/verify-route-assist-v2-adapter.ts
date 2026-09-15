/**
 * Route Assist -> Routing V2: one pure adapter, two routing worlds, nothing lost.
 *
 * The integration had bound a camera measurement to `outlet_run_distance` and
 * collapsed it into under_10 / 10_to_20 / over_20 — the exact access x distance
 * model Routing V2 exists to replace. A V2 tenant asks NUMBER questions whose
 * authored ranges decide what a measurement means, so banding throws away the
 * only thing the tree needs.
 *
 * Both worlds have to work at once and for a long time: production and every
 * unmigrated tenant still author the V1 question. The registry therefore
 * chooses by the AUTHORED question, never by tenant name, list membership or
 * database order.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import {
  adaptRouteAssistResult, FIELD_CLASSIFICATION,
} from "../lib/electrical/routeAssistAdapter";
import { getRouteAssistInvocation } from "../lib/visual-assist/route-assist/guidedFlowInvocation";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";
import { applyConfirmation } from "../lib/visual-assist/route-assist/confirmation";
import {
  isRouteAssistIncomplete,
  type RouteAssistResult,
  type RoutePoint,
  type RouteSegment,
} from "../lib/visual-assist/route-assist/types";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { eliteService } from "../prisma/_serviceTargets";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { ACCESSIBLE_KEYS } from "../prisma/_concealedRouteModules";
import { FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { OUTLET_V2_KEYS, OUTLET_SLUG } from "../prisma/seed-new-outlet-v2";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/**
 * A real domain-built surface capture with two explicitly observed PHYSICAL
 * inside turns. `over` is intentionally allowed to make synthetic boundary
 * probes (fractional transport, alternate mode, malformed legacy aggregates)
 * without pretending those probes are valid persisted task completions.
 */
function capture(over: Partial<RouteAssistResult> = {}): RouteAssistResult {
  const points: RoutePoint[] = [
    { id: "A", x: 0.1, y: 0.6, imageId: "room", kind: "SOURCE" },
    { id: "W1", x: 0.35, y: 0.6, imageId: "room", kind: "WAYPOINT", physicalTurn: "INSIDE" },
    { id: "W2", x: 0.6, y: 0.35, imageId: "room", kind: "WAYPOINT", physicalTurn: "INSIDE" },
    { id: "B", x: 0.9, y: 0.35, imageId: "room", kind: "DESTINATION" },
  ];
  const segments: RouteSegment[] = [
    { id: "S1", fromPointId: "A", toPointId: "W1", surface: "WALL", estimatedLengthFt: 10 },
    { id: "S2", fromPointId: "W1", toPointId: "W2", surface: "WALL", estimatedLengthFt: 10 },
    { id: "S3", fromPointId: "W2", toPointId: "B", surface: "WALL", estimatedLengthFt: 11 },
  ];
  const built = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    drywallAccessAllowed: null,
    captureArtifacts: { imageIds: ["room"], overlayImageIds: [] },
  });
  if (isRouteAssistIncomplete(built)) throw new Error(`adapter fixture unexpectedly incomplete: ${built.reason}`);
  return { ...applyConfirmation(built, "ACCEPTED"), ...over };
}

const answerFor = (q: string, r: RouteAssistResult) =>
  getRouteAssistInvocation(OUTLET_SLUG, q)?.resolveAnswerValue(r) ?? null;

async function main() {
  console.log("\nROUTE ASSIST -> ROUTING V2 ADAPTER\n");

  console.log("  A  THE FIELD INVENTORY IS EXHAUSTIVE\n");
  const probe = capture();
  const all = Object.keys(probe) as (keyof RouteAssistResult)[];
  const classified = Object.keys(FIELD_CLASSIFICATION);
  ok(all.every((k) => classified.includes(k)),
    `A  all ${all.length} RouteAssistResult fields are classified`,
    all.filter((k) => !classified.includes(k)).join(", "));
  ok(classified.length === all.length,
    `A  …and nothing is classified that is not a field (${classified.length})`,
    classified.filter((k) => !all.includes(k as keyof RouteAssistResult)).join(", "));
  const mapped = classified.filter((k) => FIELD_CLASSIFICATION[k as keyof RouteAssistResult].classification === "MAPPED");
  const intentional = classified.filter((k) => FIELD_CLASSIFICATION[k as keyof RouteAssistResult].classification === "UNMAPPED_INTENTIONALLY");
  console.log(`         ${mapped.length} MAPPED, ${intentional.length} UNMAPPED_INTENTIONALLY`);
  ok(intentional.every((k) => (FIELD_CLASSIFICATION[k as keyof RouteAssistResult].reason ?? "").length > 30),
    "A  every deliberate omission carries a real reason, not a shrug");
  ok(FIELD_CLASSIFICATION.insideCornersCount.classification === "UNMAPPED_INTENTIONALLY" &&
     FIELD_CLASSIFICATION.outsideCornersCount.classification === "UNMAPPED_INTENTIONALLY",
    "A  legacy image-space corner aggregates are explicitly non-authoritative");

  console.log("\n  B  REGISTRY KEYS MATCH THE AUTHORING MODULES\n");
  const src = readFileSync("lib/visual-assist/route-assist/guidedFlowInvocation.ts", "utf8");
  for (const [label, key] of [
    ["surface feet", SURFACE_KEYS.feet], ["surface inside", SURFACE_KEYS.inside],
    ["surface outside", SURFACE_KEYS.outside], ["surface flat", SURFACE_KEYS.flat],
    ["concealed feet", FINISHED_KEYS.feet],
  ] as const) {
    ok(src.includes(`"${key}"`), `B  registry binds the authored ${label} key (${key})`);
    ok(getRouteAssistInvocation(OUTLET_SLUG, key) !== null, `B  …and getRouteAssistInvocation resolves it`);
  }

  /**
   * OBSERVATION AUTHORITY. An accessible concealed route runs through an attic,
   * crawlspace or unfinished basement. A camera capture of the ROOM has not
   * observed that path, so it must not produce a number for it — estimated room
   * geometry is not measured accessible-path footage.
   */
  ok(getRouteAssistInvocation(OUTLET_SLUG, ACCESSIBLE_KEYS.feet) === null,
    `B  ${ACCESSIBLE_KEYS.feet} has NO camera auto-answer — the room capture never saw that path`);
  ok(!src.includes(`"${ACCESSIBLE_KEYS.feet}"`),
    "B  …and the registry does not name the key at all");

  console.log("\n  C  V1 COMPATIBILITY IS UNTOUCHED\n");
  const v1 = getRouteAssistInvocation(OUTLET_SLUG, "outlet_run_distance");
  ok(v1 !== null, "C  outlet_run_distance still has an invocation — unmigrated tenants keep working");
  for (const [ft, band] of [[8, "under_10"], [15, "10_to_20"], [45, "over_20"]] as const) {
    ok(v1?.resolveAnswerValue(capture({ estimatedTotalRouteLengthFt: ft })) === band,
      `C  ${ft} ft -> ${band} on the LEGACY question`,
      String(v1?.resolveAnswerValue(capture({ estimatedTotalRouteLengthFt: ft }))));
  }
  ok(/DEPRECATED|LEGACY/i.test(src), "C  …and it is marked legacy in the registry");

  console.log("\n  D  V2 MEASUREMENTS + PHYSICAL TURNS ARRIVE UNBANDED\n");
  for (const ft of [8, 20, 21, 45, 300]) {
    const a = answerFor(SURFACE_KEYS.feet, capture({ estimatedTotalRouteLengthFt: ft }));
    ok(a === String(ft), `D  surface ${ft} ft -> "${ft}" (not a band)`, String(a));
  }
  const banded = ["under_10", "10_to_20", "over_20"];
  ok(!banded.includes(String(answerFor(SURFACE_KEYS.feet, capture({ estimatedTotalRouteLengthFt: 45 })))),
    "D  a V2 answer is NEVER one of the V1 band values");
  ok(answerFor(FINISHED_KEYS.feet, capture({ mode: "CONCEALED", estimatedTotalRouteLengthFt: 18 })) === "18",
    "D  concealed 18 ft reaches the finished-wall question");
  for (const mode of ["SURFACE", "CONCEALED", "UNSURE"] as const) {
    ok(answerFor(ACCESSIBLE_KEYS.feet, capture({ mode, estimatedTotalRouteLengthFt: 50 })) === null,
      `D  an ordinary ${mode} capture cannot populate ${ACCESSIBLE_KEYS.feet}`);
  }

  ok(answerFor(SURFACE_KEYS.inside, capture()) === "2",
    "D  two explicit PHYSICAL inside turns arrive as 2");
  ok(answerFor(SURFACE_KEYS.outside, capture()) === "0",
    "D  complete physical evidence establishes exact zero outside turns");
  ok(answerFor(SURFACE_KEYS.flat, capture()) === "0",
    "D  complete physical evidence establishes exact zero flat turns");

  const legacyLie = capture({ insideCornersCount: 99, outsideCornersCount: 88 });
  ok(answerFor(SURFACE_KEYS.inside, legacyLie) === "2" && answerFor(SURFACE_KEYS.outside, legacyLie) === "0",
    "D  legacy 2-D corner aggregates cannot change physical fitting answers",
    JSON.stringify(adaptRouteAssistResult(legacyLie).mapped));

  const unresolved = capture({
    points: capture().points.map((point) => point.id === "W1" ? { ...point, physicalTurn: null } : point),
  });
  ok(answerFor(SURFACE_KEYS.inside, unresolved) === null &&
     answerFor(SURFACE_KEYS.outside, unresolved) === null &&
     answerFor(SURFACE_KEYS.flat, unresolved) === null,
    "D  one unresolved interior waypoint makes every exact fitting count unavailable");

  ok(answerFor(FINISHED_KEYS.feet, capture({ mode: "SURFACE", estimatedTotalRouteLengthFt: 18 })) === null,
    "D  a SURFACE capture may not answer a CONCEALED question");
  ok(answerFor(SURFACE_KEYS.feet, capture({ needsContractorReview: true })) === null,
    "D  a capture that asked for a human auto-answers nothing");
  ok(answerFor(SURFACE_KEYS.feet, capture({ customerConfirmedRoute: false })) === null,
    "D  an unconfirmed route auto-answers nothing");
  ok(answerFor(SURFACE_KEYS.feet, capture({ estimatedTotalRouteLengthFt: 14.625 })) === "14.625",
    "D  downstream binding preserves a future canonical 14.625 exactly — capture precision is a separate gate");

  console.log("\n  E  sameWall IS NEVER back_to_back\n");
  const sw = adaptRouteAssistResult(capture({ mode: "CONCEALED", sameWall: true }));
  ok(!("backToBack" in sw.mapped) && !JSON.stringify(sw.mapped).toLowerCase().includes("back"),
    "E  no back-to-back fact exists in the mapped output at all", JSON.stringify(sw.mapped));
  ok(sw.unmapped.some((u) => u.field === "sameWall"),
    "E  sameWall is present as an explicit unmapped observation");
  ok(getRouteAssistInvocation(OUTLET_SLUG, FINISHED_KEYS.backToBack) === null,
    "E  the back-to-back question has NO Route Assist binding — a camera cannot answer it");
  const adapterSrc = readFileSync("lib/electrical/routeAssistAdapter.ts", "utf8");
  ok(!/sameWall[\s\S]{0,120}back_to_back/i.test(adapterSrc.replace(/\/\*[\s\S]*?\*\//g, "")),
    "E  …and no code path relates the two");

  console.log("\n  F  ACCESS OPENINGS — EXACT AND UNCERTAIN ARE DIFFERENT FACTS\n");
  const exact = adaptRouteAssistResult(capture({ mode: "CONCEALED", suggestedAccessOpeningsMin: 3, suggestedAccessOpeningsMax: 3 }));
  ok(exact.mapped.accessOpeningsExact === 3 && exact.mapped.accessOpeningsRange === null,
    "F  min === max is preserved as an EXACT count", JSON.stringify(exact.mapped.accessOpeningsExact));
  const range = adaptRouteAssistResult(capture({ mode: "CONCEALED", suggestedAccessOpeningsMin: 2, suggestedAccessOpeningsMax: 4 }));
  ok(range.mapped.accessOpeningsRange?.min === 2 && range.mapped.accessOpeningsRange?.max === 4,
    "F  a range is preserved AS a range", JSON.stringify(range.mapped.accessOpeningsRange));
  ok(range.mapped.accessOpeningsExact === null,
    "F  …and never collapsed to an exact count");
  ok(!JSON.stringify(range.mapped).includes('"3"') && range.mapped.accessOpeningsExact !== 3,
    "F  not averaged to 3");
  ok(getRouteAssistInvocation(OUTLET_SLUG, FINISHED_KEYS.method) === null,
    "F  no restoration question is auto-answered from an opening observation");

  console.log("\n  G  THE ADAPTER CARRIES NO ECONOMICS\n");
  const body = adapterSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  for (const forbidden of ["PrismaClient", "approvedPriceCents", "addFieldLaborHours", "unitCostCents", "materialCost", "crewHourRate"]) {
    ok(!body.includes(forbidden), `G  no ${forbidden} anywhere in the adapter`);
  }
  ok(!/\bimport\b[^;]*prisma/i.test(body), "G  the adapter imports nothing from prisma");
  const facts = JSON.stringify(adaptRouteAssistResult(capture()).mapped);
  ok(!/price|cost|labor|hour|cents/i.test(facts), "G  and emits no priced field", facts);

  console.log("\n  H  UNMAPPED FACTS ARE SURFACED, NOT DROPPED\n");
  const rich = adaptRouteAssistResult(capture({
    doorwayBypassesCount: 2, windowBypassesCount: 1, wallTransitionsCount: 3,
    verticalTransitionsCount: 1, visibleObstacleDetoursCount: 1, concealedRouteComplexity: "COMPLEX",
  }));
  for (const f of ["doorwayBypassesCount", "windowBypassesCount", "wallTransitionsCount",
                   "verticalTransitionsCount", "visibleObstacleDetoursCount", "concealedRouteComplexity",
                   "insideCornersCount", "outsideCornersCount"]) {
    ok(rich.unmapped.some((u) => u.field === f), `H  ${f} is reported unmapped, with a reason`);
  }
  ok(rich.invalid.length === 0, "H  …and none of them is treated as invalid", JSON.stringify(rich.invalid));

  console.log("\n  I  END TO END ON THE REAL PROVISIONED V2 TREE\n");
  const svc = await eliteService(prisma, OUTLET_SLUG);
  const loaded = await loadServiceForResolution(prisma, svc.id);
  if (!loaded) throw new Error("outlet not loadable");
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  const base = { outlet_load_type: "everyday", outlet_power_source: "tap_existing" };

  const surfaceAnswers = (r: RouteAssistResult) => ({
    ...base, below_above_access: "no_access", [OUTLET_V2_KEYS.method]: "surface",
    [SURFACE_KEYS.feet]: answerFor(SURFACE_KEYS.feet, r) ?? "",
    [SURFACE_KEYS.inside]: answerFor(SURFACE_KEYS.inside, r) ?? "",
    [SURFACE_KEYS.outside]: answerFor(SURFACE_KEYS.outside, r) ?? "",
    [SURFACE_KEYS.flat]: answerFor(SURFACE_KEYS.flat, r) ?? "",
    [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear",
  });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const comps = (r: any) => ((r?.config?.components ?? []) as { key: string; quantity: number }[]);
  const r31 = resolveRoute(loaded, surfaceAnswers(capture()), true, settings);
  const q = (k: string) => comps(r31).find((c) => c.key === k)?.quantity;
  ok(q("SURFACE_ROUTE_FT") === 31 && q("SURFACE_ROUTE_INSIDE_CORNER") === 2,
    "I  a 31 ft / 2-physical-inside-turn capture reaches the resolver as 31 and 2",
    JSON.stringify(comps(r31)));
  ok(!comps(r31).some((c) => c.key === "SURFACE_ROUTE_OUTSIDE_CORNER"),
    "I  …and an exact zero outside-turn count omits the component");
  ok(!comps(r31).some((c) => c.key === "SURFACE_ROUTE_FLAT_CORNER"),
    "I  …and an exact zero flat-turn count omits the component");

  for (const [ft, shouldBuild] of [[20, true], [21, false], [45, false]] as const) {
    const r = resolveRoute(loaded, {
      ...base, below_above_access: "no_access", [OUTLET_V2_KEYS.method]: "concealed",
      [FINISHED_KEYS.backToBack]: "no",
      [FINISHED_KEYS.feet]: answerFor(FINISHED_KEYS.feet, capture({ mode: "CONCEALED", estimatedTotalRouteLengthFt: ft })) ?? "",
      [FINISHED_KEYS.surface]: "drywall", [FINISHED_KEYS.obstacles]: "clear",
      [FINISHED_KEYS.method]: "drywall_access",
    }, true, settings);
    ok((comps(r).length > 0) === shouldBuild,
      `I  ${ft} ft via Route Assist ${shouldBuild ? "continues" : "routes to Guided Estimate"} — numeric routing survives the adapter`,
      `${r.status} components=${comps(r).length}`);
  }
  // The canonical question and its Routing V2 support are UNTOUCHED — only the
  // camera auto-answer is gone. A homeowner typing 50 in the ordinary Guided
  // Pricing UI still routes exactly as before.
  const accTyped = resolveRoute(loaded, {
    ...base, below_above_access: "has_access", [ACCESSIBLE_KEYS.feet]: "50",
  }, true, settings);
  ok(comps(accTyped).find((c) => c.key === "CONCEALED_ROUTE_FT")?.quantity === 50,
    "I  a HOMEOWNER-typed accessible 50 ft still resolves intact — the question is not disabled",
    JSON.stringify(comps(accTyped)));
  const accCam = answerFor(ACCESSIBLE_KEYS.feet, capture({ mode: "CONCEALED", estimatedTotalRouteLengthFt: 50 }));
  ok(accCam === null,
    "I  …while the camera contributes nothing to it", String(accCam));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
