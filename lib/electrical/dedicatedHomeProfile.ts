import type { RouteAccess } from "./mixedRouteSections";

export type DedicatedHomeStories = "one" | "two" | "three";
export type DedicatedHomeLayout = "standard" | "bi-level" | "tri-level";
export type DedicatedDestinationFloor = "first" | "second" | "third";
export type DedicatedHomeAccess = "attic" | "below" | "both" | "none";
export type DedicatedPanelLocation = "garage" | "basement" | "inside";
export type DedicatedPanelAccess = "open" | "drop" | "accessible" | "finished";
export type DedicatedGarageSize = "one" | "two" | "three";
export type DedicatedPanelFloor = "basement" | DedicatedDestinationFloor;
export type DedicatedBasementCeiling = "open" | "drop" | "finished";

export type DedicatedHomeProfile = {
  stories: DedicatedHomeStories;
  layout: DedicatedHomeLayout;
  hasGarage: boolean;
  basementCeiling: DedicatedBasementCeiling | null;
  hasCrawlSpace: boolean;
  hasAttic: boolean;
  destinationFloor: DedicatedDestinationFloor;
  homeAccess: DedicatedHomeAccess;
  panelLocation: DedicatedPanelLocation;
  panelFloor: DedicatedPanelFloor;
  panelAccess: DedicatedPanelAccess;
  garageSize: DedicatedGarageSize | null;
};

export const DEDICATED_HOME_ANSWER_KEYS = {
  stories: "dedicated_home_stories",
  layout: "dedicated_home_layout",
  hasGarage: "dedicated_home_has_garage",
  basementCeiling: "dedicated_basement_ceiling",
  hasCrawlSpace: "dedicated_home_has_crawl_space",
  hasAttic: "dedicated_home_has_attic",
  destinationFloor: "dedicated_destination_floor",
  homeAccess: "dedicated_home_access",
  panelLocation: "dedicated_panel_location",
  panelFloor: "dedicated_panel_floor",
  panelAccess: "dedicated_panel_access",
  garageSize: "dedicated_garage_size",
  surfaceConduit: "dedicated_surface_conduit",
} as const;

export const DEDICATED_GARAGE_ALLOWANCE_FEET: Record<DedicatedGarageSize, number> = {
  one: 12,
  two: 24,
  three: 36,
};

export const DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS = {
  basementPanelToCeilingFeet: 3,
  floorToFloorFeet: 9,
  splitLevelTransitionFeet: 5,
  atticToOutletFeet: 6,
} as const;

export type DedicatedVerticalRoutePlan = {
  cableFeet: number;
  platePenetrations: number;
  drywallAccessOpenings: number;
  finishedWallFishFeet: number;
};

/**
 * Builds the unmeasured vertical riser for a basement panel feeding an attic
 * route. The customer measures only the horizontal run. Each occupied story
 * contributes one standard wall cavity, two framing plates, and one retained
 * drywall access opening. The final attic-to-outlet drop is already represented
 * by the recipe's endpoint fish, but its cable footage still belongs in takeoff.
 */
export function dedicatedVerticalRoutePlan(profile: DedicatedHomeProfile): DedicatedVerticalRoutePlan {
  if (profile.panelLocation === "basement" && (profile.homeAccess === "attic" || profile.homeAccess === "both")) {
    const occupiedStories = profile.stories === "three" ? 3 : profile.stories === "two" ? 2 : 1;
    const finishedPanelRise = profile.panelAccess === "finished"
      ? DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS.basementPanelToCeilingFeet
      : 0;
    const storyRiseFeet = occupiedStories * DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS.floorToFloorFeet;
    const finishedWallFishFeet = storyRiseFeet + finishedPanelRise;
    return {
      cableFeet: DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS.basementPanelToCeilingFeet
        + storyRiseFeet
        + DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS.atticToOutletFeet,
      platePenetrations: occupiedStories * 2,
      drywallAccessOpenings: occupiedStories + (profile.panelAccess === "finished" ? 1 : 0),
      finishedWallFishFeet,
    };
  }
  if (profile.layout !== "standard" && profile.panelFloor !== "basement") {
    const floorNumber = (floor: DedicatedDestinationFloor) => floor === "third" ? 3 : floor === "second" ? 2 : 1;
    const transitions = Math.abs(floorNumber(profile.panelFloor) - floorNumber(profile.destinationFloor));
    const cableFeet = transitions * DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS.splitLevelTransitionFeet;
    const concealed = profile.homeAccess === "none" || profile.panelAccess === "finished";
    return {
      cableFeet,
      platePenetrations: transitions,
      drywallAccessOpenings: concealed ? transitions : 0,
      finishedWallFishFeet: concealed ? cableFeet : 0,
    };
  }
  return { cableFeet: 0, platePenetrations: 0, drywallAccessOpenings: 0, finishedWallFishFeet: 0 };
}

export function dedicatedGarageAllowanceFeet(profile: DedicatedHomeProfile): number {
  return profile.panelLocation === "garage" && profile.garageSize
    ? DEDICATED_GARAGE_ALLOWANCE_FEET[profile.garageSize]
    : 0;
}

/**
 * Estimates the portion of a standard garage width between the panel and the
 * inside garage wall. A ratio of 1 is the exterior wall, 0.5 is the middle of
 * the garage, and 0 is the inside wall.
 */
export function dedicatedGarageRouteFeet(profile: DedicatedHomeProfile, distanceRatio: number): number {
  const standardWidth = dedicatedGarageAllowanceFeet(profile);
  const boundedRatio = Math.max(0, Math.min(1, distanceRatio));
  return Math.round(standardWidth * boundedRatio);
}

export function parseDedicatedHomeProfile(answers: Record<string, string | undefined>): DedicatedHomeProfile | null {
  const stories = answers[DEDICATED_HOME_ANSWER_KEYS.stories];
  const savedLayout = answers[DEDICATED_HOME_ANSWER_KEYS.layout];
  const savedHasGarage = answers[DEDICATED_HOME_ANSWER_KEYS.hasGarage];
  const savedBasementCeiling = answers[DEDICATED_HOME_ANSWER_KEYS.basementCeiling];
  const savedHasCrawlSpace = answers[DEDICATED_HOME_ANSWER_KEYS.hasCrawlSpace];
  const savedHasAttic = answers[DEDICATED_HOME_ANSWER_KEYS.hasAttic];
  const destinationFloor = answers[DEDICATED_HOME_ANSWER_KEYS.destinationFloor];
  const homeAccess = answers[DEDICATED_HOME_ANSWER_KEYS.homeAccess];
  const panelLocation = answers[DEDICATED_HOME_ANSWER_KEYS.panelLocation];
  const savedPanelFloor = answers[DEDICATED_HOME_ANSWER_KEYS.panelFloor];
  const panelAccess = answers[DEDICATED_HOME_ANSWER_KEYS.panelAccess];
  const garageSize = answers[DEDICATED_HOME_ANSWER_KEYS.garageSize];
  const layout: DedicatedHomeLayout = ["bi-level", "tri-level"].includes(savedLayout ?? "")
    ? savedLayout as DedicatedHomeLayout
    : "standard";
  const panelFloor = savedPanelFloor ?? (panelLocation === "basement" ? "basement" : panelLocation === "garage" && layout === "tri-level" ? "second" : "first");
  const hasGarage = savedHasGarage === "yes" || panelLocation === "garage";
  const basementCeiling = ["open", "drop", "finished"].includes(savedBasementCeiling ?? "")
    ? savedBasementCeiling as DedicatedBasementCeiling
    : panelLocation === "basement" && ["open", "drop", "finished"].includes(panelAccess ?? "")
      ? panelAccess as DedicatedBasementCeiling
      : savedHasCrawlSpace === undefined && (homeAccess === "below" || homeAccess === "both") ? "open" : null;
  const hasCrawlSpace = savedHasCrawlSpace === "yes";
  const hasAttic = savedHasAttic === "yes" || homeAccess === "attic" || homeAccess === "both";
  if (!["one", "two", "three"].includes(stories ?? "")
    || !["standard", "bi-level", "tri-level"].includes(layout)
    || (layout === "bi-level" && stories !== "two")
    || (layout === "tri-level" && stories !== "three")
    || !["first", "second", "third"].includes(destinationFloor ?? "")
    || (stories === "one" && destinationFloor !== "first")
    || (stories === "two" && destinationFloor === "third")
    || !["attic", "below", "both", "none"].includes(homeAccess ?? "")
    || !["garage", "basement", "inside"].includes(panelLocation ?? "")
    || (panelLocation === "garage" && !hasGarage)
    || (panelLocation === "basement" && basementCeiling === null)
    || !["basement", "first", "second", "third"].includes(panelFloor)
    || (panelLocation === "basement" && panelFloor !== "basement")
    || (panelLocation === "garage" && panelFloor !== (layout === "tri-level" ? "second" : "first"))
    || (panelLocation === "inside" && (panelFloor === "basement" || (stories === "one" && panelFloor !== "first") || (stories === "two" && panelFloor === "third")))
    || !["open", "drop", "accessible", "finished"].includes(panelAccess ?? "")
    || (hasGarage && !["one", "two", "three"].includes(garageSize ?? ""))) return null;
  return {
    stories,
    layout,
    hasGarage,
    basementCeiling,
    hasCrawlSpace,
    hasAttic,
    destinationFloor,
    homeAccess,
    panelLocation,
    panelFloor,
    panelAccess,
    garageSize: hasGarage ? garageSize : null,
  } as DedicatedHomeProfile;
}

/**
 * The current dedicated package supports open-access and concealed footage.
 * If either the home route or the panel area is closed, choose the conservative
 * concealed package. Garage panels are treated as exterior starting points;
 * the garage width is included separately from the selected home route.
 */
export function dedicatedHomeProfileRouteAccess(profile: DedicatedHomeProfile): RouteAccess {
  return profile.homeAccess === "none" || profile.panelAccess === "finished" ? "finished" : "accessible";
}

export function dedicatedHomeProfileUsesSurfaceConduit(profile: DedicatedHomeProfile): boolean {
  return profile.panelLocation === "garage" && profile.panelAccess === "finished";
}
