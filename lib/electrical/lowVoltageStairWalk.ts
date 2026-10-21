import {
  stairWalkFacts,
  stairWalkInferences,
  stairWalkPlane,
  stairWalkRouteFeet,
  stairWalkScreenDone,
  stairWalkScreens,
  type StairWalkResult,
  type SwAnswers,
  type SwMode,
} from "./stairWalk";
import { routeSectionsAnswerKey, type MixedRouteSection } from "./mixedRouteSections";

export type LowVoltageStairWalkSlug = "new-ethernet-line" | "new-coax-line";

export function lowVoltageStairWalkMode(serviceSlug: LowVoltageStairWalkSlug): SwMode {
  return { routeOnly: true, routeKind: serviceSlug === "new-ethernet-line" ? "ethernet" : "coax" };
}

const number = (value: string | undefined) => Number(value ?? 0) || 0;

function mixedFoundationSections(answers: SwAnswers, routeFeet: number): MixedRouteSection[] | null {
  if (answers.openSpace !== "below" || answers.belowCoverage !== "partial" || !answers.belowPosition) return null;
  const openFeet = number(answers.belowFeet);
  if (openFeet <= 0 || openFeet >= routeFeet) return null;
  const finishedFeet = routeFeet - openFeet;
  const doorways = number(answers.doorways);
  const open = (id: number): MixedRouteSection => ({ id, feet: openFeet, access: "accessible", doorways: 0 });
  const finished = (id: number, feet: number, doorwayCount = 0): MixedRouteSection => ({ id, feet, access: "finished", doorways: doorwayCount });
  if (answers.belowPosition === "panel") return [open(1), finished(2, finishedFeet, doorways)];
  if (answers.belowPosition === "outlet") return [finished(1, finishedFeet, doorways), open(2)];
  return [finished(1, finishedFeet / 2, doorways), open(2), finished(3, finishedFeet / 2)];
}

function accessFor(answers: SwAnswers): "accessible" | "finished" | "exposed_baseboard" {
  const plane = stairWalkPlane(answers);
  if (plane === "surface") return "exposed_baseboard";
  if (plane === "below" || plane === "attic" || plane === "garage") return "accessible";
  return "finished";
}

/** Translate the shared walk into the existing coax/Ethernet pricing contract. */
export function stairWalkToLowVoltageAnswers(answers: SwAnswers, serviceSlug: LowVoltageStairWalkSlug): StairWalkResult {
  const mode = lowVoltageStairWalkMode(serviceSlug);
  const facts = stairWalkFacts(answers, mode);
  const inferred = stairWalkInferences(answers, mode);
  const review = (code: string, reason: string): StairWalkResult => ({ kind: "REVIEW", code, reason, facts, inferred });

  if (answers.panelPlace === "outside") return review("SOURCE_OUTSIDE", "An outdoor cable source needs a quick photo review before we can price the route.");
  if (answers.panelPlace === "unsure") return review("SOURCE_NOT_FOUND", "We’ll help identify where the new cable should start from a couple of photos.");
  if (answers.wall === "concrete") return review("SURFACE_MOUNT_REVIEW", "Concrete or block walls need a quick photo review so we can choose the right wall plate method.");
  if (answers.wall === "masonry") return review("WALL_NOT_DRYWALL", "Brick, stone, tile and plaster walls need a different mounting method; we’ll price it from a photo.");
  if (answers.distanceEstimate === "far" && answers.outletOverBasement !== "over") return review("ROUTE_TOO_LONG_TO_ESTIMATE", "For a long cable run we need a measurement or a photo walk-through.");
  if (answers.openSpace === "surface" && answers.distanceMethod === "estimate" && answers.outletOverBasement !== "over") return review("SURFACE_ROUTE_NEEDS_MEASUREMENT", "A visible baseboard route needs a measured distance so we can include the correct cable supports.");

  const screens = stairWalkScreens(answers, mode);
  if (screens.some((screen) => !stairWalkScreenDone(screen, answers))) return { kind: "INCOMPLETE", facts, inferred };

  const routeFeet = stairWalkRouteFeet(answers);
  if (!routeFeet) return { kind: "INCOMPLETE", facts, inferred };
  const access = accessFor(answers);
  const sections = mixedFoundationSections(answers, routeFeet);
  const doorwayCount = sections ? 0 : access === "finished" ? number(answers.doorways) : 0;
  if (routeFeet + doorwayCount * 14 > 75) return review("ROUTE_OVER_75_FEET", "Cable routes over 75 feet need a quick photo review before we can confirm the price.");

  const distanceKey = access === "exposed_baseboard" ? `${serviceSlug}_exposed_route_feet` : `${serviceSlug}_distance`;
  const mapped: Record<string, string> = {
    [`${serviceSlug}_route_access`]: access,
    [distanceKey]: String(routeFeet),
  };
  if (sections) mapped[routeSectionsAnswerKey(`${serviceSlug}_distance`)] = JSON.stringify(sections);
  else if (access === "finished" && doorwayCount > 0) mapped[`${serviceSlug}_distance_doorway`] = String(doorwayCount);

  const flags: string[] = [];
  if (sections) flags.push("PARTIAL_FOUNDATION_MIXED_ROUTE");
  if (answers.wall === "unsure") flags.push("WALL_TYPE_ASSUMED_DRYWALL");
  if (answers.outletOverBasement === "over" && answers.directDistanceMethod === "near") flags.push("DISTANCE_ESTIMATED");
  if (answers.distanceMethod === "estimate") flags.push("DISTANCE_ESTIMATED");
  return { kind: "PRICE_INPUTS", answers: mapped, facts, inferred, flags };
}

/** Values that deliberately route an unsupported walk into the existing review branch. */
export function lowVoltageReviewAnswers(answers: SwAnswers, serviceSlug: LowVoltageStairWalkSlug, code: string): Record<string, string> {
  const access = accessFor(answers);
  const routeFeet = stairWalkRouteFeet(answers);
  return {
    [`${serviceSlug}_route_access`]: access,
    [access === "exposed_baseboard" ? `${serviceSlug}_exposed_route_feet` : `${serviceSlug}_distance`]: routeFeet ? String(Math.max(76, routeFeet)) : "__unknown__",
    [`${serviceSlug}_stair_walk`]: `review:${code}`,
  };
}
