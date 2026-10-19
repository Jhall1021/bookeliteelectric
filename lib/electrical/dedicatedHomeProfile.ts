import type { RouteAccess } from "./mixedRouteSections";

export type DedicatedHomeStories = "one" | "two";
export type DedicatedDestinationFloor = "first" | "second";
export type DedicatedHomeAccess = "attic" | "below" | "both" | "none";
export type DedicatedPanelLocation = "garage" | "basement" | "inside";
export type DedicatedPanelAccess = "open" | "drop" | "accessible" | "finished";
export type DedicatedGarageSize = "one" | "two" | "three";

export type DedicatedHomeProfile = {
  stories: DedicatedHomeStories;
  destinationFloor: DedicatedDestinationFloor;
  homeAccess: DedicatedHomeAccess;
  panelLocation: DedicatedPanelLocation;
  panelAccess: DedicatedPanelAccess;
  garageSize: DedicatedGarageSize | null;
};

export const DEDICATED_HOME_ANSWER_KEYS = {
  stories: "dedicated_home_stories",
  destinationFloor: "dedicated_destination_floor",
  homeAccess: "dedicated_home_access",
  panelLocation: "dedicated_panel_location",
  panelAccess: "dedicated_panel_access",
  garageSize: "dedicated_garage_size",
  surfaceConduit: "dedicated_surface_conduit",
} as const;

export const DEDICATED_GARAGE_ALLOWANCE_FEET: Record<DedicatedGarageSize, number> = {
  one: 12,
  two: 24,
  three: 36,
};

export function dedicatedGarageAllowanceFeet(profile: DedicatedHomeProfile): number {
  return profile.panelLocation === "garage" && profile.garageSize
    ? DEDICATED_GARAGE_ALLOWANCE_FEET[profile.garageSize]
    : 0;
}

export function parseDedicatedHomeProfile(answers: Record<string, string | undefined>): DedicatedHomeProfile | null {
  const stories = answers[DEDICATED_HOME_ANSWER_KEYS.stories];
  const destinationFloor = answers[DEDICATED_HOME_ANSWER_KEYS.destinationFloor];
  const homeAccess = answers[DEDICATED_HOME_ANSWER_KEYS.homeAccess];
  const panelLocation = answers[DEDICATED_HOME_ANSWER_KEYS.panelLocation];
  const panelAccess = answers[DEDICATED_HOME_ANSWER_KEYS.panelAccess];
  const garageSize = answers[DEDICATED_HOME_ANSWER_KEYS.garageSize];
  if ((stories !== "one" && stories !== "two")
    || (destinationFloor !== "first" && destinationFloor !== "second")
    || !["attic", "below", "both", "none"].includes(homeAccess ?? "")
    || !["garage", "basement", "inside"].includes(panelLocation ?? "")
    || !["open", "drop", "accessible", "finished"].includes(panelAccess ?? "")
    || (panelLocation === "garage" && !["one", "two", "three"].includes(garageSize ?? ""))) return null;
  return {
    stories,
    destinationFloor,
    homeAccess,
    panelLocation,
    panelAccess,
    garageSize: panelLocation === "garage" ? garageSize : null,
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
