import type { RouteAccess } from "./mixedRouteSections";

export type DedicatedHomeStories = "one" | "two";
export type DedicatedDestinationFloor = "first" | "second";
export type DedicatedHomeAccess = "attic" | "below" | "both" | "none";
export type DedicatedPanelLocation = "garage" | "basement" | "inside";
export type DedicatedPanelAccess = "open" | "drop" | "accessible" | "finished";

export type DedicatedHomeProfile = {
  stories: DedicatedHomeStories;
  destinationFloor: DedicatedDestinationFloor;
  homeAccess: DedicatedHomeAccess;
  panelLocation: DedicatedPanelLocation;
  panelAccess: DedicatedPanelAccess;
};

export const DEDICATED_HOME_ANSWER_KEYS = {
  stories: "dedicated_home_stories",
  destinationFloor: "dedicated_destination_floor",
  homeAccess: "dedicated_home_access",
  panelLocation: "dedicated_panel_location",
  panelAccess: "dedicated_panel_access",
  surfaceConduit: "dedicated_surface_conduit",
} as const;

export function parseDedicatedHomeProfile(answers: Record<string, string | undefined>): DedicatedHomeProfile | null {
  const stories = answers[DEDICATED_HOME_ANSWER_KEYS.stories];
  const destinationFloor = answers[DEDICATED_HOME_ANSWER_KEYS.destinationFloor];
  const homeAccess = answers[DEDICATED_HOME_ANSWER_KEYS.homeAccess];
  const panelLocation = answers[DEDICATED_HOME_ANSWER_KEYS.panelLocation];
  const panelAccess = answers[DEDICATED_HOME_ANSWER_KEYS.panelAccess];
  if ((stories !== "one" && stories !== "two")
    || (destinationFloor !== "first" && destinationFloor !== "second")
    || !["attic", "below", "both", "none"].includes(homeAccess ?? "")
    || !["garage", "basement", "inside"].includes(panelLocation ?? "")
    || !["open", "drop", "accessible", "finished"].includes(panelAccess ?? "")) return null;
  return { stories, destinationFloor, homeAccess, panelLocation, panelAccess } as DedicatedHomeProfile;
}

/**
 * The current dedicated package supports open-access and concealed footage.
 * If either the home route or the panel area is closed, choose the conservative
 * concealed package. A finished garage is separately marked for review because
 * its visible EMT segment has different labor and materials.
 */
export function dedicatedHomeProfileRouteAccess(profile: DedicatedHomeProfile): RouteAccess {
  return profile.homeAccess === "none" || profile.panelAccess === "finished" ? "finished" : "accessible";
}

export function dedicatedHomeProfileUsesSurfaceConduit(profile: DedicatedHomeProfile): boolean {
  return profile.panelLocation === "garage" && profile.panelAccess === "finished";
}

