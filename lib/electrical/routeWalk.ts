/**
 * Route Walk — a prototype customer intake for dedicated circuits.
 *
 * The customer describes two places they can stand in (where the panel is,
 * where the new outlet goes), answers yes/no questions about the open spaces
 * next to those two places, and walks one distance. The software builds the
 * wire route, counts floor changes, and maps everything onto the answer keys
 * the existing dedicated-circuit package already prices.
 *
 * Nothing here changes pricing. When the route the customer described needs
 * more vertical work than the existing engine can represent, the adapter
 * fails closed to REVIEW instead of handing the engine a cheaper route.
 *
 * Pure and dependency-light on purpose: the browser prototype bundles this
 * same file, so the wording customers see and the mapping the engine gets
 * come from one place.
 */
import {
  DEDICATED_HOME_ANSWER_KEYS,
  dedicatedHomeProfileRouteAccess,
  dedicatedVerticalRoutePlan,
  parseDedicatedHomeProfile,
  type DedicatedHomeProfile,
} from "./dedicatedHomeProfile";
import {
  parseMixedRouteSections,
  routeExteriorAnswerKey,
  routeSectionsAnswerKey,
  summarizeMixedRouteSections,
  type MixedRouteSection,
} from "./mixedRouteSections";

export type RwShape = "one" | "two" | "three" | "bi-level" | "tri-level";
export type RwBelow = "basement" | "crawl" | "slab" | "unsure";
export type RwBasementCeiling = "open" | "drop" | "finished" | "mixed";
export type RwPanelPlace = "basement" | "garage" | "inside" | "outside" | "unsure";
export type RwYesNoUnsure = "yes" | "no" | "unsure";
export type RwGarageWall = "house" | "near" | "far";
export type RwWall = "drywall" | "concrete" | "masonry" | "plaster" | "unsure";
export type RwDistanceMethod = "feet" | "steps" | "estimate";
export type RwEstimate = "near" | "across" | "far";
/** 0 = basement, 1..3 = living levels counted from the lowest, "garage" = in the garage. */
export type RwOutletPlace = "0" | "1" | "2" | "3" | "garage";

export type RouteWalkAnswers = Partial<{
  equipment: "fridge_freezer" | "sump_pump" | "microwave" | "electric_fireplace" | "knows_size";
  amperage: "15a_120v" | "20a_120v" | "240v" | "unsure";
  fireplaceAmperage: "15a" | "20a" | "unsure";
  shape: RwShape;
  below: RwBelow;
  basementCeiling: RwBasementCeiling;
  hasGarage: "yes" | "no";
  garageSize: "one" | "two" | "three";
  outletPlace: RwOutletPlace;
  wall: RwWall;
  panelPlace: RwPanelPlace;
  panelLevel: "1" | "2" | "3";
  garageWall: RwGarageWall;
  garageFinished: RwYesNoUnsure;
  openBelowOutlet: RwYesNoUnsure;
  belowCoverage: "all" | "partial";
  belowPosition: "panel" | "middle" | "outlet";
  belowFeet: string;
  atticOverOutlet: RwYesNoUnsure;
  openNearPanel: RwYesNoUnsure;
  distanceMethod: RwDistanceMethod;
  distanceFeet: string;
  distanceSteps: string;
  distanceEstimate: RwEstimate;
  estimateAck: "accepted" | "measure";
  doorways: "0" | "1" | "2" | "3";
  exterior: RwYesNoUnsure;
  finishAck: "accepted";
}>;

export type RwKey = keyof RouteWalkAnswers;

// ---------------------------------------------------------------------------
// Assumptions the software owns (never asked of the customer)
// ---------------------------------------------------------------------------

/** A normal walking step, rounded up so step counts never shorten the route. */
export const RW_FEET_PER_STEP = 2.5;
export const RW_GARAGE_WIDTH_FEET = { one: 12, two: 24, three: 36 } as const;
export const RW_GARAGE_WALL_RATIO: Record<RwGarageWall, number> = { house: 0, near: 0.5, far: 1 };

// ---------------------------------------------------------------------------
// Home levels
// ---------------------------------------------------------------------------

export type RwLevel = { value: "1" | "2" | "3"; label: string };

export function rwLevels(shape: RwShape | undefined): RwLevel[] {
  switch (shape) {
    case "one": return [{ value: "1", label: "Main floor" }];
    case "two": return [{ value: "1", label: "First floor" }, { value: "2", label: "Second floor" }];
    case "three": return [{ value: "1", label: "First floor" }, { value: "2", label: "Second floor" }, { value: "3", label: "Third floor" }];
    case "bi-level": return [{ value: "1", label: "Lower level" }, { value: "2", label: "Upper level" }];
    case "tri-level": return [{ value: "1", label: "Lower level" }, { value: "2", label: "Middle level (front door)" }, { value: "3", label: "Upper level (bedrooms)" }];
    default: return [];
  }
}

const topLevel = (a: RouteWalkAnswers) => rwLevels(a.shape).length;
const hasBasement = (a: RouteWalkAnswers) => a.below === "basement";
/** The garage sits on the lowest living level, including in a tri-level (owner decision, 20 Oct 2026). */
const garageLevel = (_a: RouteWalkAnswers) => 1;

const outletLevel = (a: RouteWalkAnswers): number | null =>
  a.outletPlace === undefined ? null : a.outletPlace === "garage" ? garageLevel(a) : Number(a.outletPlace);

const panelLevel = (a: RouteWalkAnswers): number | null =>
  a.panelPlace === "basement" ? 0
    : a.panelPlace === "garage" ? garageLevel(a)
      : a.panelPlace === "inside" && topLevel(a) === 1 ? 1
        : a.panelPlace === "inside" && a.panelLevel ? Number(a.panelLevel)
          : null;

const levelName = (a: RouteWalkAnswers, level: number) =>
  level === 0 ? "basement" : (rwLevels(a.shape)[level - 1]?.label ?? `level ${level}`).replace(/ \(.*\)$/, "").toLowerCase();

const basementCeilingOpen = (a: RouteWalkAnswers) => a.basementCeiling === "open" || a.basementCeiling === "drop" || a.basementCeiling === "mixed";
const openSpaceBelow = (a: RouteWalkAnswers) => (hasBasement(a) && basementCeilingOpen(a)) || a.below === "crawl";
const belowWord = (a: RouteWalkAnswers) => a.below === "crawl" ? "crawl space" : "basement";

// ---------------------------------------------------------------------------
// The question flow. Visibility is the only branching mechanism.
// ---------------------------------------------------------------------------

export type RwOption = { value: string; label: string; detail?: string; picture?: string };
export type RwStep = {
  key: RwKey;
  section: "Your project" | "Your home" | "The new outlet" | "Your panel" | "Open spaces" | "One measurement" | "Check and confirm";
  prompt: string;
  help?: string;
  kind: "choice" | "distance" | "feet" | "ack";
  options?: RwOption[];
};

const YES_NO_UNSURE = (yes: string, no: string): RwOption[] => [
  { value: "yes", label: yes },
  { value: "no", label: no },
  { value: "unsure", label: "I’m not sure" },
];

export function routeWalkSteps(a: RouteWalkAnswers): RwStep[] {
  const steps: RwStep[] = [];
  const add = (when: boolean, step: RwStep) => { if (when) steps.push(step); };
  const outlet = outletLevel(a);
  const panel = panelLevel(a);
  const top = topLevel(a);

  add(true, {
    key: "equipment", section: "Your project", kind: "choice",
    prompt: "What will the new outlet power?",
    help: "Pick the closest match. We’ll choose the right breaker and wire.",
    options: [
      { value: "fridge_freezer", label: "Refrigerator or freezer" },
      { value: "sump_pump", label: "Sump pump" },
      { value: "microwave", label: "Microwave or window air conditioner" },
      { value: "electric_fireplace", label: "Electric fireplace" },
      { value: "knows_size", label: "Something else" },
    ],
  });
  add(a.equipment === "electric_fireplace", {
    key: "fireplaceAmperage", section: "Your project", kind: "choice",
    prompt: "What does the fireplace’s label or manual say it needs?",
    help: "Look for “15 A” or “20 A” on the sticker or in the instructions.",
    options: [{ value: "15a", label: "15 amp" }, { value: "20a", label: "20 amp" }, { value: "unsure", label: "I can’t find it" }],
  });
  add(a.equipment === "knows_size", {
    key: "amperage", section: "Your project", kind: "choice",
    prompt: "What does the equipment’s label or manual say it needs?",
    options: [
      { value: "15a_120v", label: "15 amp, 120 volt", detail: "A regular-looking plug" },
      { value: "20a_120v", label: "20 amp, 120 volt", detail: "One prong of the plug is turned sideways" },
      { value: "240v", label: "240 volt, or a large round plug" },
      { value: "unsure", label: "I’m not sure" },
    ],
  });

  add(true, {
    key: "shape", section: "Your home", kind: "choice",
    prompt: "Which of these looks most like your home from the street?",
    help: "Count only floors people live on. Don’t count the basement or attic.",
    options: [
      { value: "one", label: "One floor", detail: "Ranch or single-story", picture: "one" },
      { value: "two", label: "Two floors", detail: "One staircase between floors", picture: "two" },
      { value: "three", label: "Three floors", picture: "three" },
      { value: "bi-level", label: "Front door between two floors", detail: "You walk in and go a half-flight up or a half-flight down", picture: "bi-level" },
      { value: "tri-level", label: "Three staggered levels", detail: "Short stairways up and down from the front-door level", picture: "tri-level" },
    ],
  });
  add(Boolean(a.shape), {
    key: "below", section: "Your home", kind: "choice",
    prompt: a.shape === "bi-level" || a.shape === "tri-level"
      ? "Is there anything below your lowest level?"
      : "What’s under your first floor?",
    options: [
      { value: "basement", label: "A basement", detail: "A room you can walk down stairs into" },
      { value: "crawl", label: "A crawl space", detail: "A low space you’d have to crouch or crawl in" },
      { value: "slab", label: "Nothing — the floor sits on the ground" },
      { value: "unsure", label: "I’m not sure" },
    ],
  });
  add(hasBasement(a), {
    key: "basementCeiling", section: "Your home", kind: "choice",
    prompt: "Look up in the basement. What does the ceiling look like?",
    options: [
      { value: "open", label: "I can see wooden beams", picture: "ceiling-open" },
      { value: "drop", label: "Ceiling tiles that lift out", picture: "ceiling-drop" },
      { value: "finished", label: "Smooth painted ceiling", picture: "ceiling-finished" },
      { value: "mixed", label: "Some of each" },
    ],
  });
  add(Boolean(a.below), {
    key: "hasGarage", section: "Your home", kind: "choice",
    prompt: "Is there a garage attached to the house?",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
  });
  add(a.hasGarage === "yes", {
    key: "garageSize", section: "Your home", kind: "choice",
    prompt: "How many cars fit side by side in the garage?",
    options: [{ value: "one", label: "One car" }, { value: "two", label: "Two cars" }, { value: "three", label: "Three cars" }],
  });

  add(Boolean(a.hasGarage), {
    key: "outletPlace", section: "The new outlet", kind: "choice",
    prompt: "Where will the new outlet go?",
    help: "Pick the floor of the room where you’ll plug the equipment in.",
    options: [
      ...(hasBasement(a) ? [{ value: "0", label: "Basement" }] : []),
      ...rwLevels(a.shape).map((level) => ({ value: level.value, label: level.label })),
      ...(a.hasGarage === "yes" ? [{ value: "garage", label: "In the garage" }] : []),
    ],
  });
  add(a.outletPlace !== undefined, {
    key: "wall", section: "The new outlet", kind: "choice",
    prompt: "Knock on the wall where the outlet will go. What is it?",
    options: [
      { value: "drywall", label: "Sounds hollow", detail: "Ordinary drywall — most homes" },
      { value: "concrete", label: "Solid concrete or block", detail: "Common on basement walls" },
      { value: "masonry", label: "Brick, stone, or tile" },
      { value: "plaster", label: "Hard and solid, in an older home", detail: "Often plaster in homes built before about 1950" },
      { value: "unsure", label: "I’m not sure" },
    ],
  });

  add(Boolean(a.wall), {
    key: "panelPlace", section: "Your panel", kind: "choice",
    prompt: "Where is your electrical panel?",
    help: "It’s a gray metal door, about the size of a medicine cabinet, with switches (breakers) inside. Common spots: garage, basement, laundry room, hallway or closet.",
    options: [
      ...(hasBasement(a) ? [{ value: "basement", label: "In the basement" }] : []),
      ...(a.hasGarage === "yes" ? [{ value: "garage", label: "In the garage" }] : []),
      { value: "inside", label: "Somewhere else inside the house" },
      { value: "outside", label: "Outside the house" },
      { value: "unsure", label: "I can’t find it" },
    ],
  });
  add(a.panelPlace === "inside" && top > 1, {
    key: "panelLevel", section: "Your panel", kind: "choice",
    prompt: "Which floor is the panel on?",
    options: rwLevels(a.shape).map((level) => ({ value: level.value, label: level.label })),
  });
  add(a.panelPlace === "garage", {
    key: "garageWall", section: "Your panel", kind: "choice",
    prompt: "Which garage wall is the panel on?",
    options: [
      { value: "house", label: "The wall shared with the house", picture: "garage-house" },
      { value: "near", label: "Another wall, on the half closer to the house", picture: "garage-near" },
      { value: "far", label: "Another wall, on the half farther from the house", picture: "garage-far" },
    ],
  });
  add(a.panelPlace === "garage" || a.outletPlace === "garage", {
    key: "garageFinished", section: "Your panel", kind: "choice",
    prompt: "Are the garage walls and ceiling covered (drywall), or can you see the wooden studs?",
    options: [
      { value: "no", label: "I can see the wooden studs" },
      { value: "yes", label: "Covered with drywall" },
      { value: "unsure", label: "I’m not sure" },
    ],
  });

  // Open spaces: split-level foundations are not necessarily under the whole
  // floor. Ask about any usable portion of the actual walk instead of assuming
  // that a basement or crawlspace covers the complete route.
  const panelKnown = panel !== null || a.panelPlace === "outside" || a.panelPlace === "unsure";
  const outletOnLowSide = outlet !== null && outlet <= 1 && a.outletPlace !== "garage";
  const splitLevel = a.shape === "bi-level" || a.shape === "tri-level";
  add(panelKnown && openSpaceBelow(a) && a.outletPlace !== "garage" && (splitLevel || outletOnLowSide) && !(a.outletPlace === "0" && a.basementCeiling !== "mixed"), {
    key: "openBelowOutlet", section: "Open spaces",
    kind: "choice",
    prompt: splitLevel
      ? `Can the wire use the open ${belowWord(a)} below for any part of this walk?`
      : a.outletPlace === "0"
      ? "Can you see wooden beams or lift-out tiles in the ceiling near where the outlet goes?"
      : `Is the open part of the ${belowWord(a)} directly under the room where the outlet goes?`,
    help: splitLevel
      ? `Choose Yes even if the ${belowWord(a)} is under only one section of the house. We’ll separate that open part from the slab or finished part.`
      : a.outletPlace === "0" ? undefined : `Stand in the ${belowWord(a)} under that room. If you can see wooden beams or lift-out tiles above you there, choose Yes.`,
    options: YES_NO_UNSURE("Yes", "No"),
  });
  add(splitLevel && a.openBelowOutlet === "yes", {
    key: "belowCoverage", section: "Open spaces", kind: "choice",
    prompt: `How much of the walk has the open ${belowWord(a)} below it?`,
    help: "A split-level may have open space under one section and a slab or finished space under the rest.",
    options: [
      { value: "all", label: "The whole walk" },
      { value: "partial", label: "Only part of the walk", detail: "The rest is over a slab or finished space" },
    ],
  });
  add(a.belowCoverage === "partial", {
    key: "belowPosition", section: "Open spaces", kind: "choice",
    prompt: `Which part of the walk has the open ${belowWord(a)} below it?`,
    options: [
      { value: "panel", label: "Panel side" },
      { value: "middle", label: "Middle section" },
      { value: "outlet", label: "Outlet side" },
    ],
  });
  const belowOpen = a.openBelowOutlet === "yes" || (a.outletPlace === "0" && (a.basementCeiling === "open" || a.basementCeiling === "drop"));
  add(panelKnown && outlet !== null && outlet === top && a.outletPlace !== "garage" && !belowOpen && (a.openBelowOutlet !== undefined || !outletOnLowSide || !openSpaceBelow(a) || a.outletPlace === "0"), {
    key: "atticOverOutlet", section: "Open spaces", kind: "choice",
    prompt: "Is there an attic above the room where the outlet goes that someone can get into?",
    help: "Look for a hatch or pull-down stairs in a ceiling, often in a hallway or closet. If the attic is packed with insulation to the roof or has no way in, choose No.",
    options: YES_NO_UNSURE("Yes, there’s a way in", "No"),
  });
  const plane = routePlane(a);
  add(
    a.panelPlace === "inside" && panel !== null
      && ((plane === "below" && panel === 1) || (plane === "above" && panel === top)),
    {
      key: "openNearPanel", section: "Open spaces", kind: "choice",
      prompt: plane === "below"
        ? `Is that open ${belowWord(a)} space also under the panel?`
        : "Does that attic also reach over the panel?",
      options: YES_NO_UNSURE("Yes", "No"),
    },
  );
  add(a.panelPlace === "basement" && a.basementCeiling === "mixed", {
    key: "openNearPanel", section: "Open spaces", kind: "choice",
    prompt: "Look at the basement ceiling right above the panel. Can you see wooden beams or lift-out tiles?",
    options: YES_NO_UNSURE("Yes", "No"),
  });

  const readyToMeasure = panelKnown && a.outletPlace !== undefined
    && (a.panelPlace !== "garage" || Boolean(a.garageWall));
  add(readyToMeasure, {
    key: "distanceMethod", section: "One measurement", kind: "distance",
    prompt: measurementPrompt(a),
    help: measurementHelp(a),
  });
  // An estimate books directly only once the customer approves pricing it at
  // the top of its range (owner decision, 20 Oct 2026).
  add(readyToMeasure && a.distanceMethod === "estimate" && a.distanceEstimate !== "far", {
    key: "estimateAck", section: "One measurement", kind: "choice",
    prompt: "Okay to price from your estimate?",
    help: `We’ll price the top of the range for “${a.distanceEstimate === "near" ? "Same room or the next room over" : "Across the house"}”. If the electrician finds the run is longer, they’ll show you any added price before starting work. Measuring usually gives a lower price.`,
    options: [
      { value: "accepted", label: "Yes, price it from my estimate" },
      { value: "measure", label: "I’ll measure instead" },
    ],
  });
  const measured = walkedFeet(a);
  add(readyToMeasure && a.belowCoverage === "partial" && measured !== null, {
    key: "belowFeet", section: "One measurement", kind: "feet",
    prompt: `How many of those ${measured ?? ""} feet have the open ${belowWord(a)} below?`,
    help: "Enter only the open-access part. We’ll price the rest as slab or finished space.",
  });
  add(readyToMeasure && Boolean(a.distanceMethod) && (plane === "walls" || a.belowCoverage === "partial"), {
    key: "doorways", section: "One measurement", kind: "choice",
    prompt: "On that walk, how many doorways or open archways did you pass through?",
    help: "Wire can’t go straight across a doorway inside a finished wall, so it has to go around.",
    options: [{ value: "0", label: "None" }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3 or more" }],
  });
  add(readyToMeasure && Boolean(a.distanceMethod), {
    key: "exterior", section: "Check and confirm", kind: "choice",
    prompt: "Is the outlet going on a wall that has the outdoors on the other side?",
    options: YES_NO_UNSURE("Yes", "No"),
  });
  add(Boolean(a.exterior), {
    key: "finishAck", section: "Check and confirm", kind: "ack",
    prompt: "Here’s what we’ll do",
  });
  return steps;
}

const DISTANCE_DETAIL_KEYS: readonly RwKey[] = ["distanceFeet", "distanceSteps", "distanceEstimate"];

/**
 * Drops answers to questions that are no longer asked. Without this, changing
 * an earlier answer (say, the outlet floor) could leave a stale "yes, there's
 * an open attic" steering the route.
 */
export function pruneRouteWalkAnswers(a: RouteWalkAnswers): RouteWalkAnswers {
  let current = { ...a };
  for (let pass = 0; pass < 6; pass += 1) {
    const visible = new Set<RwKey>(routeWalkSteps(current).map((step) => step.key));
    if (visible.has("distanceMethod")) DISTANCE_DETAIL_KEYS.forEach((key) => visible.add(key));
    const next = Object.fromEntries(Object.entries(current).filter(([key]) => visible.has(key as RwKey))) as RouteWalkAnswers;
    if (Object.keys(next).length === Object.keys(current).length) return next;
    current = next;
  }
  return current;
}

function measurementPrompt(a: RouteWalkAnswers): string {
  if (a.panelPlace === "garage" && a.outletPlace === "garage") return "Walk from the panel to where the outlet will go, along the garage walls.";
  if (a.panelPlace === "garage") return "Walk from the door between the garage and the house to where the outlet will go.";
  return "Walk from your panel to where the outlet will go.";
}

function measurementHelp(a: RouteWalkAnswers): string {
  const panel = panelLevel(a);
  const outlet = outletLevel(a);
  if (a.panelPlace === "garage" && a.outletPlace === "garage") {
    return "Follow the garage walls from the panel to the new outlet. Close is fine.";
  }
  if (a.panelPlace === "garage") {
    return "Start at the door from the garage into the house. Walk through the house to the outlet wall. We add the garage distance and everything up or down.";
  }
  if (panel !== null && outlet !== null && panel !== outlet) {
    return "Measure only across the house. Start at the closest spot directly above or below the panel, then walk through hallways to the outlet wall. Don’t measure stairs—we add everything up or down.";
  }
  return "Walk from the panel to the outlet wall using hallways and doorways. Don’t cut through walls. Close is fine.";
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

export type RwPlane = "below" | "above" | "walls";

/** Which horizontal space the wire travels through. Unsure always means walls. */
export function routePlane(a: RouteWalkAnswers): RwPlane {
  if (a.outletPlace === "garage") return a.garageFinished === "no" ? "below" : "walls";
  const outletInOpenBasement = a.outletPlace === "0" && (a.basementCeiling === "open" || a.basementCeiling === "drop");
  if (outletInOpenBasement || a.openBelowOutlet === "yes") return "below";
  if (a.atticOverOutlet === "yes") return "above";
  return "walls";
}

/**
 * Floor changes the wire must make. Counted independently of the pricing engine
 * so the adapter can refuse routes the engine would under-count.
 *  - A route that stays at or below the lowest living level has none: the
 *    basement ceiling is the normal way into a first-floor wall.
 *  - Otherwise every floor between the panel and the outlet counts, with the
 *    basement as floor 0 (matches the approved tri-level example: 3).
 */
export function requiredFloorTransitions(a: RouteWalkAnswers): number | null {
  const panel = panelLevel(a);
  const outlet = outletLevel(a);
  if (panel === null || outlet === null) return null;
  const plane = routePlane(a);
  if (plane !== "above" && panel <= 1 && outlet <= 1) return 0;
  if (a.panelPlace === "garage" && a.outletPlace === "garage") return 0;
  return Math.abs(outlet - panel);
}

export function walkedFeet(a: RouteWalkAnswers): number | null {
  if (a.distanceMethod === "feet") {
    const feet = Number(a.distanceFeet);
    return Number.isFinite(feet) && feet > 0 ? Math.ceil(feet) : null;
  }
  if (a.distanceMethod === "steps") {
    const steps = Number(a.distanceSteps);
    return Number.isInteger(steps) && steps > 0 ? Math.ceil(steps * RW_FEET_PER_STEP) : null;
  }
  return null;
}

export function garageCrossingFeet(a: RouteWalkAnswers): number {
  if (a.panelPlace !== "garage" || a.outletPlace === "garage" || !a.garageSize || !a.garageWall) return 0;
  return Math.round(RW_GARAGE_WIDTH_FEET[a.garageSize] * RW_GARAGE_WALL_RATIO[a.garageWall]);
}

function partialFoundationSections(a: RouteWalkAnswers, walked: number): MixedRouteSection[] | null {
  if (a.belowCoverage !== "partial" || !a.belowPosition) return null;
  const accessibleFeet = Number(a.belowFeet);
  if (!Number.isFinite(accessibleFeet) || accessibleFeet <= 0 || accessibleFeet >= walked) return null;
  const finishedFeet = walked - accessibleFeet;
  const doorways = Number(a.doorways ?? 0);
  const accessible = (id: number): MixedRouteSection => ({ id, feet: accessibleFeet, access: "accessible", doorways: 0 });
  const finished = (id: number, feet: number, doorwayCount = 0): MixedRouteSection => ({ id, feet, access: "finished", doorways: doorwayCount });
  if (a.belowPosition === "panel") return [accessible(1), finished(2, finishedFeet, doorways)];
  if (a.belowPosition === "outlet") return [finished(1, finishedFeet, doorways), accessible(2)];
  const firstFinished = finishedFeet / 2;
  return [finished(1, firstFinished, doorways), accessible(2), finished(3, finishedFeet - firstFinished)];
}

// ---------------------------------------------------------------------------
// Adapter to the existing dedicated-circuit answer keys
// ---------------------------------------------------------------------------

export type RwFact = { label: string; value: string };
export type RwInference = { label: string; value: string; basis: string };

export type RouteWalkResult =
  | { kind: "PRICE_INPUTS"; answers: Record<string, string>; facts: RwFact[]; inferred: RwInference[]; flags: string[] }
  | { kind: "REVIEW"; code: string; reason: string; facts: RwFact[]; inferred: RwInference[] }
  | { kind: "INCOMPLETE"; facts: RwFact[]; inferred: RwInference[] };

const review = (code: string, reason: string, facts: RwFact[], inferred: RwInference[]): RouteWalkResult =>
  ({ kind: "REVIEW", code, reason, facts, inferred });

export function customerFacts(a: RouteWalkAnswers): RwFact[] {
  const facts: RwFact[] = [];
  for (const step of routeWalkSteps(a)) {
    const value = a[step.key];
    if (value === undefined || step.kind === "ack") continue;
    if (step.kind === "distance") {
      facts.push({
        label: "Your walk",
        value: a.distanceMethod === "feet" ? `${a.distanceFeet} ft (measured)`
          : a.distanceMethod === "steps" ? `${a.distanceSteps} steps`
            : a.distanceEstimate === "near" ? "Same or next room (estimate)"
              : a.distanceEstimate === "across" ? "Across the house (estimate)"
                : a.distanceEstimate === "far" ? "Far end of a large house (estimate)" : "—",
      });
      continue;
    }
    if (step.kind === "feet") {
      facts.push({ label: step.prompt, value: `${value} ft` });
      continue;
    }
    const option = step.options?.find((candidate) => candidate.value === value);
    facts.push({ label: step.prompt, value: option?.label ?? String(value) });
  }
  return facts;
}

export function routeWalkInferences(a: RouteWalkAnswers): RwInference[] {
  const inferred: RwInference[] = [];
  const panel = panelLevel(a);
  const outlet = outletLevel(a);
  if (a.equipment) {
    const amps = a.equipment === "fridge_freezer" ? 15
      : a.equipment === "electric_fireplace" ? (a.fireplaceAmperage === "20a" ? 20 : a.fireplaceAmperage === "15a" ? 15 : null)
        : a.equipment === "knows_size" ? (a.amperage === "20a_120v" ? 20 : a.amperage === "15a_120v" ? 15 : null)
          : 20;
    if (amps) inferred.push({ label: "Circuit", value: `${amps} amp, 120 volt${a.equipment === "sump_pump" ? " with GFCI protection" : ""}`, basis: "From the equipment you chose" });
  }
  if (a.shape && a.below) {
    const levels = rwLevels(a.shape).length + (hasBasement(a) ? 1 : 0);
    inferred.push({ label: "House model", value: `${levels} level${levels === 1 ? "" : "s"}${a.hasGarage === "yes" && a.garageSize ? `, ${a.garageSize}-car garage (${RW_GARAGE_WIDTH_FEET[a.garageSize]} ft wide)` : ""}`, basis: "Standard dimensions for the home style you picked" });
  }
  if (panel !== null && outlet !== null && (a.atticOverOutlet !== undefined || a.openBelowOutlet !== undefined || routeWalkSteps(a).every((step) => step.key !== "atticOverOutlet" && step.key !== "openBelowOutlet"))) {
    const plane = routePlane(a);
    const walked = walkedFeet(a);
    const partial = walked ? partialFoundationSections(a, walked) : null;
    const summary = partial ? summarizeMixedRouteSections(partial) : null;
    inferred.push({
      label: "Wire path",
      value: summary ? `${summary.accessibleFeet} ft through open ${belowWord(a)}, ${summary.finishedMeasuredFeet} ft over slab or finished space`
        : plane === "below" ? (a.outletPlace === "garage" ? "Along the open garage framing" : `Through the open ${belowWord(a)} ceiling`)
        : plane === "above" ? "Through the attic, then down to the outlet"
          : "Inside finished walls and ceilings",
      basis: summary ? "The open and closed parts are priced separately"
        : plane === "walls" && (a.openBelowOutlet === "unsure" || a.atticOverOutlet === "unsure")
        ? "You weren’t sure about open space, so we priced the harder path"
        : "From the open spaces you told us about",
    });
    const transitions = requiredFloorTransitions(a);
    if (transitions !== null) {
      inferred.push({
        label: "Floor changes",
        value: transitions === 0 ? "None — panel and outlet connect on the same level" : `${transitions} (${levelName(a, panel)} → ${levelName(a, outlet)})`,
        basis: transitions === 0 ? "No riser labor added" : "One hour of riser labor per floor change; vertical wire, drilling and wall openings counted for you",
      });
    }
  }
  const garage = garageCrossingFeet(a);
  if (garage > 0) inferred.push({ label: "Across the garage", value: `about ${garage} ft`, basis: `Standard ${a.garageSize}-car width and the wall you picked` });
  const walked = walkedFeet(a);
  if (a.wall === "unsure") inferred.push({ label: "Wall", value: "Ordinary drywall", basis: "You weren’t sure, so we priced the most common wall; any change is shown to you before work starts" });
  if (a.distanceMethod === "estimate" && a.distanceEstimate && a.distanceEstimate !== "far") inferred.push({ label: "Distance", value: a.distanceEstimate === "near" ? "Top of the short range" : "Top of the medium range", basis: "Priced from your estimate at the top of its range" });
  if (a.distanceMethod === "steps" && walked) inferred.push({ label: "Your steps in feet", value: `${walked} ft`, basis: `${RW_FEET_PER_STEP} ft per step, rounded up` });
  if (a.doorways && a.doorways !== "0") inferred.push({ label: "Going around doorways", value: `${Number(a.doorways) * 14} ft extra`, basis: "14 ft per doorway inside finished walls" });
  return inferred;
}

export function routeWalkToDedicatedAnswers(a: RouteWalkAnswers): RouteWalkResult {
  const facts = customerFacts(a);
  const inferred = routeWalkInferences(a);
  const flags: string[] = [];

  // Hard stops the customer can trigger before the walk is complete.
  if (a.amperage === "240v") return review("NOT_THIS_SERVICE", "240-volt equipment is priced as a different service.", facts, inferred);
  if (a.amperage === "unsure" || a.fireplaceAmperage === "unsure") return review("EQUIPMENT_UNKNOWN", "Send a photo of the equipment label and we’ll confirm the circuit size.", facts, inferred);
  if (a.panelPlace === "outside") return review("PANEL_OUTSIDE", "Outdoor panels need a quick photo review before we can price the route.", facts, inferred);
  if (a.panelPlace === "unsure") return review("PANEL_NOT_FOUND", "We’ll help you find the panel from a couple of photos.", facts, inferred);
  if (a.below === "unsure") return review("FOUNDATION_UNKNOWN", "Send a photo of the lowest floor or the outside foundation and we’ll take it from there.", facts, inferred);
  // Concrete gets a surface-mounted box (owner decision, 20 Oct 2026). The engine
  // will read dedicated_outlet_mount=surface_concrete; until that package lands,
  // pricing it as an old-work drywall box would undercharge, so it stays in review.
  if (a.wall === "concrete") return review("SURFACE_MOUNT_PENDING_ENGINE", "Outlets on concrete or block get a box mounted on the wall surface. We’ll confirm that price from your answers.", facts, inferred);
  if (a.wall === "masonry" || a.wall === "plaster") return review("WALL_NOT_DRYWALL", "Concrete, masonry and plaster walls need a different mounting method; we’ll price it from a photo.", facts, inferred);
  if (a.garageFinished === "yes") return review("GARAGE_SURFACE_CONDUIT", "Covered garage walls usually get wire in metal conduit on the wall surface, which we price separately.", facts, inferred);
  if (a.garageFinished === "unsure") return review("GARAGE_FINISH_UNKNOWN", "A photo of the garage wall will tell us which method fits.", facts, inferred);
  if (a.outletPlace === "garage" && a.panelPlace !== "garage" && a.panelPlace !== undefined) return review("GARAGE_OUTLET_FROM_HOUSE", "Bringing a circuit from inside the house into the garage needs a quick photo review.", facts, inferred);
  if (a.distanceEstimate === "far") return review("ROUTE_TOO_LONG_TO_ESTIMATE", "For a long run we need a measurement or a photo walk-through.", facts, inferred);
  if (a.belowCoverage === "partial" && a.distanceMethod === "estimate") return review("PARTIAL_FOUNDATION_NEEDS_MEASUREMENT", "A partial basement or crawlspace route needs a measured distance. Count your steps or use a tape measure so we can separate the open and finished parts.", facts, inferred);
  if (a.belowCoverage === "partial" && a.panelPlace === "garage") return review("GARAGE_MIXED_FOUNDATION_REVIEW", "A route that combines a garage crossing with a partial basement or crawlspace needs a quick photo review.", facts, inferred);

  // Check the geometry as soon as the route is known, before asking the
  // customer to measure anything we would only send to review.
  const garageToGarage = a.panelPlace === "garage" && a.outletPlace === "garage";
  const visible = routeWalkSteps(a).map((step) => step.key);
  const geometryReady = !garageToGarage && visible.includes("distanceMethod")
    && GEOMETRY_KEYS.every((key) => !visible.includes(key) || a[key] !== undefined);
  const geometry = geometryReady ? engineGeometry(a) : null;
  // The engine silently drops all vertical work when the profile does not
  // parse, so an unparseable profile must never reach it.
  if (geometry && !geometry.profile) return review("PROFILE_NOT_REPRESENTABLE", "This combination of levels needs a quick review before we can price it.", facts, inferred);
  if (geometry && geometry.engineTransitions < geometry.required) {
    return review(
      "RISER_NOT_MODELLED",
      `This route changes floors ${geometry.required} time${geometry.required === 1 ? "" : "s"}, which our instant pricing can’t include yet. We’ll confirm the price from your answers.`,
      facts, inferred,
    );
  }

  if (!a.equipment || !a.shape || !a.below || !a.hasGarage || !a.outletPlace || !a.wall || !a.panelPlace
    || !a.distanceMethod || !a.exterior || a.finishAck !== "accepted") return { kind: "INCOMPLETE", facts, inferred };
  if (a.distanceMethod === "estimate" && a.estimateAck !== "accepted") return { kind: "INCOMPLETE", facts, inferred };
  if (routeWalkSteps(a).some((step) => a[step.key] === undefined)) return { kind: "INCOMPLETE", facts, inferred };
  if (a.wall === "unsure") flags.push("WALL_TYPE_ASSUMED_DRYWALL");

  const plane = routePlane(a);
  const answers: Record<string, string> = {
    dedicated_equipment: a.equipment,
    dedicated_finish_ack: "accepted",
    [routeExteriorAnswerKey("dedicated_distance")]: a.exterior,
  };
  if (a.equipment === "knows_size" && a.amperage) answers.dedicated_amperage = a.amperage;
  if (a.equipment === "electric_fireplace" && a.fireplaceAmperage) answers.dedicated_fireplace_amperage = a.fireplaceAmperage;

  // Garage-to-garage: no home geometry involved; price the open garage run directly.
  if (garageToGarage) {
    const walked = walkedFeet(a);
    answers.dedicated_route_access = "accessible";
    answers.dedicated_distance = walked !== null ? String(walked) : a.distanceEstimate === "near" ? "under_25" : "25_to_50";
    if (walked === null) flags.push("DISTANCE_ESTIMATED");
    return { kind: "PRICE_INPUTS", answers, facts, inferred, flags };
  }
  if (!geometry?.profile) return { kind: "INCOMPLETE", facts, inferred };

  const walked = walkedFeet(a);
  const garage = garageCrossingFeet(a);
  const partialSections = walked !== null ? partialFoundationSections(a, walked) : null;
  if (a.belowCoverage === "partial" && !partialSections) return { kind: "INCOMPLETE", facts, inferred };
  if (walked !== null) {
    answers.dedicated_distance = String(walked + garage);
  } else {
    // Estimates reuse the contractor's own distance bands (the package prices
    // a band at its ceiling). A garage crossing pushes a short estimate up a band.
    if (a.distanceEstimate === "near" && garage === 0) answers.dedicated_distance = "under_25";
    else if (a.distanceEstimate === "near" || (a.distanceEstimate === "across" && garage === 0)) answers.dedicated_distance = "25_to_50";
    else return review("ROUTE_TOO_LONG_TO_ESTIMATE", "For a long run we need a measurement or a photo walk-through.", facts, inferred);
    flags.push("DISTANCE_ESTIMATED");
  }
  if (partialSections) {
    answers[routeSectionsAnswerKey("dedicated_distance")] = JSON.stringify(partialSections);
    flags.push("PARTIAL_FOUNDATION_MIXED_ROUTE");
  } else if (plane === "walls" && a.doorways && a.doorways !== "0") answers.dedicated_distance_doorway = a.doorways;
  answers.dedicated_route_access = dedicatedHomeProfileRouteAccess(geometry.profile);
  Object.assign(answers, geometry.profileAnswers);
  if (a.openBelowOutlet === "unsure" || a.atticOverOutlet === "unsure" || a.openNearPanel === "unsure") flags.push("ACCESS_UNSURE_PRICED_CONCEALED");
  return { kind: "PRICE_INPUTS", answers, facts, inferred, flags };
}

const GEOMETRY_KEYS: readonly RwKey[] = ["panelLevel", "garageWall", "garageFinished", "openBelowOutlet", "atticOverOutlet", "openNearPanel"];

/** Builds the home-profile answers the existing engine reads, and checks its riser count. */
function engineGeometry(a: RouteWalkAnswers) {
  const plane = routePlane(a);
  const panel = panelLevel(a)!;
  const outlet = outletLevel(a)!;
  const stories = a.shape === "bi-level" ? "two" : a.shape === "tri-level" ? "three" : a.shape;
  const layout = a.shape === "bi-level" || a.shape === "tri-level" ? a.shape : "standard";
  const nearPanelOpen = a.openNearPanel === "yes";
  const basementPanelAccess = a.basementCeiling === "mixed" ? (nearPanelOpen ? "open" : "finished") : a.basementCeiling;
  const panelAccess = a.panelPlace === "basement" ? basementPanelAccess
    : a.panelPlace === "garage" ? "accessible"
      : nearPanelOpen ? "accessible" : "finished";
  const destinationFloor = outlet <= 1 ? "first" : outlet === 2 ? "second" : "third";
  const panelFloor = a.panelPlace === "basement" ? "basement" : panel === 1 ? "first" : panel === 2 ? "second" : "third";
  const profileAnswers: Record<string, string> = {
    [DEDICATED_HOME_ANSWER_KEYS.stories]: stories!,
    [DEDICATED_HOME_ANSWER_KEYS.layout]: layout,
    [DEDICATED_HOME_ANSWER_KEYS.hasGarage]: a.hasGarage!,
    ...(hasBasement(a) ? { [DEDICATED_HOME_ANSWER_KEYS.basementCeiling]: a.basementCeiling === "mixed" ? basementPanelAccess! : a.basementCeiling! } : {}),
    [DEDICATED_HOME_ANSWER_KEYS.hasCrawlSpace]: a.below === "crawl" ? "yes" : "no",
    [DEDICATED_HOME_ANSWER_KEYS.hasAttic]: a.atticOverOutlet === "yes" ? "yes" : "no",
    [DEDICATED_HOME_ANSWER_KEYS.destinationFloor]: destinationFloor,
    [DEDICATED_HOME_ANSWER_KEYS.homeAccess]: plane === "below" ? "below" : plane === "above" ? "attic" : "none",
    [DEDICATED_HOME_ANSWER_KEYS.panelLocation]: a.panelPlace!,
    [DEDICATED_HOME_ANSWER_KEYS.panelFloor]: panelFloor,
    [DEDICATED_HOME_ANSWER_KEYS.panelAccess]: panelAccess!,
    ...(a.hasGarage === "yes" && a.garageSize ? { [DEDICATED_HOME_ANSWER_KEYS.garageSize]: a.garageSize } : {}),
    [DEDICATED_HOME_ANSWER_KEYS.surfaceConduit]: "no",
  };
  const profile: DedicatedHomeProfile | null = parseDedicatedHomeProfile(profileAnswers);
  return {
    profileAnswers,
    profile,
    required: requiredFloorTransitions(a) ?? 0,
    engineTransitions: profile ? dedicatedVerticalRoutePlan(profile).floorTransitions : 0,
  };
}

/**
 * What the existing package will derive from the mapped answers, for display
 * only. scripts/verify-route-walk-adapter.ts asserts this matches
 * circuitPackageFor on every priced scenario.
 */
export function routeWalkEnginePreview(answers: Record<string, string>) {
  const profile = parseDedicatedHomeProfile(answers);
  const vertical = profile
    ? dedicatedVerticalRoutePlan(profile)
    : { cableFeet: 0, floorTransitions: 0, platePenetrations: 0, drywallAccessOpenings: 0, finishedWallFishFeet: 0 };
  const distance = answers.dedicated_distance;
  const measured = distance === "under_25" ? 25 : distance === "25_to_50" ? 50 : Number(distance);
  const sections = parseMixedRouteSections(answers[routeSectionsAnswerKey("dedicated_distance")]);
  const summary = sections ? summarizeMixedRouteSections(sections) : null;
  const doorwayFeet = summary ? summary.doorwayCount * 14 : answers.dedicated_route_access === "finished" ? Number(answers.dedicated_distance_doorway ?? 0) * 14 : 0;
  return {
    measuredFeet: measured,
    bandCeiling: distance === "under_25" || distance === "25_to_50",
    doorwayFeet,
    verticalFeet: vertical.cableFeet,
    routeFeet: measured + doorwayFeet + vertical.cableFeet,
    floorTransitions: vertical.floorTransitions,
    verticalOpenings: vertical.drywallAccessOpenings,
    access: answers.dedicated_route_access as "accessible" | "finished",
  };
}
