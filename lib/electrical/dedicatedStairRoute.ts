import {
  DEDICATED_HOME_ANSWER_KEYS,
  DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS,
  type DedicatedVerticalRoutePlan,
} from "./dedicatedHomeProfile";

/**
 * Vertical work described directly as the floor changes the customer walked,
 * instead of reconstructed from a home profile. The Stair Walk intake sends
 * these keys after removing the basement-ceiling case (a basement panel
 * feeding a first-floor outlet through the basement ceiling has no riser).
 */
export const DEDICATED_STAIR_ROUTE_KEYS = {
  fullFlights: "dedicated_floor_changes_full",
  halfFlights: "dedicated_floor_changes_half",
  attic: "dedicated_vertical_attic",
  fromBasement: "dedicated_vertical_from_basement",
  panelEnd: "dedicated_panel_end",
} as const;

export type DedicatedStairRoute = {
  fullFlights: number;
  halfFlights: number;
  attic: boolean;
  fromBasement: boolean;
  panelEndFinished: boolean;
};

const MAX_FLOOR_CHANGES = 3;
const count = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_FLOOR_CHANGES ? parsed : null;
};

/**
 * Returns null when no stair-route keys are present, and "invalid" when any
 * are present but malformed, or when a home profile is also present (two
 * descriptions of the same riser must never be added together or picked
 * between silently).
 */
export function parseDedicatedStairRoute(answers: Record<string, string | undefined>): DedicatedStairRoute | "invalid" | null {
  const keys = Object.values(DEDICATED_STAIR_ROUTE_KEYS);
  if (!keys.some((key) => answers[key] !== undefined)) return null;
  if (Object.values(DEDICATED_HOME_ANSWER_KEYS).some((key) => key !== DEDICATED_HOME_ANSWER_KEYS.surfaceConduit && answers[key] !== undefined)) return "invalid";
  const fullFlights = count(answers[DEDICATED_STAIR_ROUTE_KEYS.fullFlights]);
  const halfFlights = count(answers[DEDICATED_STAIR_ROUTE_KEYS.halfFlights]);
  const attic = answers[DEDICATED_STAIR_ROUTE_KEYS.attic];
  const fromBasement = answers[DEDICATED_STAIR_ROUTE_KEYS.fromBasement];
  const panelEnd = answers[DEDICATED_STAIR_ROUTE_KEYS.panelEnd];
  if (fullFlights === null || halfFlights === null || fullFlights + halfFlights < 1 || fullFlights + halfFlights > MAX_FLOOR_CHANGES) return "invalid";
  if ((attic !== "yes" && attic !== "no") || (fromBasement !== "yes" && fromBasement !== "no")) return "invalid";
  if (fromBasement === "yes" && panelEnd !== "open" && panelEnd !== "finished") return "invalid";
  return {
    fullFlights,
    halfFlights,
    attic: attic === "yes",
    fromBasement: fromBasement === "yes",
    panelEndFinished: fromBasement === "yes" && panelEnd === "finished",
  };
}

/**
 * Same unit costs as the approved basement-to-attic plan: every floor change
 * runs inside finished walls (a full story is 9 ft, two plates and one opening;
 * a split-level half-flight is 5 ft, one plate and one opening), a basement
 * panel adds the 3 ft rise to its ceiling, and an attic route adds the 6 ft
 * drop to the outlet. A basement panel under a finished ceiling adds that rise
 * as concealed fish plus one opening.
 */
export function dedicatedStairRoutePlan(route: DedicatedStairRoute): DedicatedVerticalRoutePlan {
  const { floorToFloorFeet, splitLevelTransitionFeet, basementPanelToCeilingFeet, atticToOutletFeet } = DEDICATED_VERTICAL_ROUTE_ASSUMPTIONS;
  const riserFeet = route.fullFlights * floorToFloorFeet + route.halfFlights * splitLevelTransitionFeet;
  const panelRise = route.fromBasement ? basementPanelToCeilingFeet : 0;
  return {
    cableFeet: riserFeet + panelRise + (route.attic ? atticToOutletFeet : 0),
    floorTransitions: route.fullFlights + route.halfFlights,
    platePenetrations: route.fullFlights * 2 + route.halfFlights,
    drywallAccessOpenings: route.fullFlights + route.halfFlights + (route.panelEndFinished ? 1 : 0),
    finishedWallFishFeet: riserFeet + (route.panelEndFinished ? panelRise : 0),
  };
}
