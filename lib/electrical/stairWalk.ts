/**
 * Stair Walk — a shorter dedicated-circuit intake (prototype).
 *
 * Route Walk asked the customer to describe their house (style, foundation,
 * basement ceiling, garage size and wall, panel floor, outlet floor) so the
 * software could rebuild the route. Stair Walk asks for what the customer
 * experiences instead: where the panel is, and a single walk from the panel
 * to the outlet — how far, how many staircases, how many doorways. Floor
 * changes come straight from the stairs, so split-levels need no picture.
 *
 * Floor changes reach the engine directly as stair counts
 * (lib/electrical/dedicatedStairRoute.ts), so no home profile is invented.
 */
import { DEDICATED_STAIR_ROUTE_KEYS, dedicatedStairRoutePlan, parseDedicatedStairRoute } from "./dedicatedStairRoute";
import {
  parseMixedRouteSections,
  routeExteriorAnswerKey,
  routeSectionsAnswerKey,
  summarizeMixedRouteSections,
  type MixedRouteSection,
} from "./mixedRouteSections";

export type SwYesNoUnsure = "yes" | "no" | "unsure";
export type SwAnswers = Partial<{
  equipment: "fridge_freezer" | "sump_pump" | "microwave" | "electric_fireplace" | "knows_size";
  amperage: "15a_120v" | "20a_120v" | "240v" | "unsure";
  fireplaceAmperage: "15a" | "20a" | "unsure";
  panelPlace: "basement" | "garage" | "inside" | "outside" | "unsure";
  garageStuds: "open" | "drywall" | "unsure";
  panelCeiling: "open" | "finished" | "unsure";
  garageRun: "near" | "one" | "two" | "three";
  garageAttic: SwYesNoUnsure;
  outletOverBasement: "over" | "beside" | "unsure";
  distanceMethod: "feet" | "steps" | "estimate";
  distanceFeet: string;
  distanceSteps: string;
  distanceEstimate: "near" | "across" | "far";
  estimateAck: "accepted";
  directDistanceMethod: "near" | "feet" | "steps";
  directDistanceFeet: string;
  directDistanceSteps: string;
  panelPosition: string;
  outletPosition: string;
  fullFlights: string;
  halfFlights: string;
  direction: "up" | "down" | "basement";
  doorways: string;
  openSpace: "below" | "attic" | "garage" | "surface" | "neither";
  belowCoverage: "all" | "partial";
  belowPosition: "panel" | "middle" | "outlet";
  belowFeet: string;
  wall: "hollow" | "concrete" | "masonry" | "unsure";
  exterior: SwYesNoUnsure;
  finishAck: "accepted";
}>;
export type SwKey = keyof SwAnswers;

/** A normal walking step, rounded up so step counts never shorten the route. */
export const SW_FEET_PER_STEP = 2.5;
/** Conduit length across a finished garage, from the customer's tap choice. */
export const SW_GARAGE_RUN_FEET = { near: 5, one: 12, two: 24, three: 36 } as const;
/** Conduit rise from the top of the panel to the garage ceiling, when the route continues through the attic. */
export const SW_GARAGE_CONDUIT_RISE_FEET = 4;
const conduitGarage = (a: SwAnswers) => a.panelPlace === "garage" && (a.garageStuds === "drywall" || a.garageStuds === "unsure");
/** Garage panel whose garage stretch is open: studs showing, or an attic above the garage. */
const openGarage = (a: SwAnswers) => a.panelPlace === "garage" && (a.garageStuds === "open" || a.garageAttic === "yes");
/** The panel-to-door distance sizes the garage stretch: conduit across a covered garage, or the open stretch ahead of a finished house route. Garage panels only. */
const needsGarageRun = (a: SwAnswers) => a.panelPlace === "garage" && Boolean(a.garageStuds) && Boolean(a.garageAttic);
/**
 * A basement panel and exactly one short half-flight up: the outlet room may
 * sit over the basement (wire comes up through its floor) or beside it on a
 * slab (wire has to climb into the next level's wall). Asked only then.
 */
const needsOverBasement = (a: SwAnswers) => a.panelPlace === "basement";
const directBasementRoute = (a: SwAnswers) => a.panelPlace === "basement" && a.outletOverBasement === "over";

// ---------------------------------------------------------------------------
// Screens. Each screen can hold more than one small question.
// ---------------------------------------------------------------------------

export type SwOption = { value: string; label: string; detail?: string };
export type SwField =
  | { key: SwKey; kind: "choice"; label?: string; options: SwOption[] }
  | { key: SwKey; kind: "stepper"; label: string; detail?: string; max: number }
  | { key: "belowFeet"; kind: "feet"; label: string; detail?: string }
  | { key: "distanceMethod"; kind: "distance" }
  | { key: "directDistanceMethod"; kind: "directDistance" };
export type SwScreen = {
  id: "project" | "panel" | "walk" | "stairs" | "projection" | "space" | "measure" | "foundation" | "wall" | "confirm";
  title: string;
  help?: string;
  fields: SwField[];
};

const n = (value: string | undefined) => Number(value ?? 0) || 0;
const flights = (a: SwAnswers) => n(a.fullFlights) + n(a.halfFlights);
const needsDirection = (a: SwAnswers) => a.panelPlace !== "basement" && flights(a) > 0;

/**
 * Two real half-level walks can still connect spaces one full story apart:
 * basement -> entrance foyer -> middle level directly above the basement.
 * Preserve what the customer walked, but give the wire one full vertical
 * transition instead of making it follow the foyer stairs.
 */
export function stairWalkVerticalCounts(a: SwAnswers): { fullFlights: number; halfFlights: number } {
  if (a.panelPlace === "basement" && n(a.fullFlights) === 0 && n(a.halfFlights) === 2 && a.outletOverBasement === "over") {
    return { fullFlights: 1, halfFlights: 0 };
  }
  return { fullFlights: n(a.fullFlights), halfFlights: n(a.halfFlights) };
}

/** Levels counted from the lowest living level (1); the basement is 0. */
function levels(a: SwAnswers): { panel: number; outlet: number } | null {
  if (!a.panelPlace || a.panelPlace === "outside" || a.panelPlace === "unsure") return null;
  const vertical = stairWalkVerticalCounts(a);
  const total = vertical.fullFlights + vertical.halfFlights;
  if (a.panelPlace === "basement") return { panel: 0, outlet: directBasementRoute(a) ? Math.max(1, total) : total };
  if (total === 0) return { panel: 1, outlet: 1 };
  if (!a.direction) return null;
  if (a.direction === "basement") return { panel: total, outlet: 0 };
  return a.direction === "up" ? { panel: 1, outlet: 1 + total } : { panel: 1 + total, outlet: 1 };
}

export type SwRouteKind = "dedicated" | "ethernet" | "coax";
const routeKind = (mode: SwMode): SwRouteKind => mode.routeKind ?? "dedicated";
const lowVoltageMode = (mode: SwMode) => routeKind(mode) !== "dedicated";
export const stairWalkRouteCopy = (mode: SwMode) => routeKind(mode) === "ethernet"
  ? { source: "router or network source", sourceShort: "Network source", target: "Ethernet wall plate", cable: "network cable" }
  : routeKind(mode) === "coax"
    ? { source: "router or existing coax source", sourceShort: "Coax source", target: "coax wall plate", cable: "coax cable" }
    : { source: "electrical panel", sourceShort: "Electrical panel", target: "outlet", cable: "wire" };

export function stairWalkSpaceOptions(a: SwAnswers, mode: SwMode = {}): SwOption[] {
  const lv = levels(a);
  if (!lv) return [];
  const total = flights(a);
  const options: SwOption[] = [];
  const raisedSplitCrawlspace = n(a.fullFlights) === 0 && n(a.halfFlights) === 1 && a.direction === "up";
  if (a.panelPlace === "garage" && a.garageStuds && total === 0) {
    options.push({ value: "garage", label: "The outlet is in the garage too", detail: a.garageStuds === "open" ? "Along the open garage studs" : "In metal conduit on the garage wall" });
  }
  const outletCouldBeTop = a.panelPlace === "basement" ? total >= 1 : total === 0 || a.direction === "up";
  // A basement panel's open space is the ceiling above the customer. For any
  // other panel, a basement or crawlspace can only carry the wire when the
  // outlet is on the lowest level, never after walking up a floor.
  if (a.panelPlace === "basement") {
    options.push({ value: "below", label: "Open basement ceiling along the way", detail: "Wooden beams or lift-out tiles above you for all or part of the way" });
  } else if (total === 0 || a.direction === "down" || a.direction === "basement" || raisedSplitCrawlspace) {
    options.push(raisedSplitCrawlspace
      ? { value: "below", label: "Open crawlspace under the raised section", detail: "The half-level you walked up to has an open crawlspace underneath it." }
      : { value: "below", label: "Open basement ceiling or crawlspace under the walk", detail: "From below you can see wooden beams or lift-out tiles. A smooth, painted basement ceiling doesn’t count." });
  }
  if (outletCouldBeTop) options.push({ value: "attic", label: `Attic right above the ${stairWalkRouteCopy(mode).target}`, detail: "With a hatch or pull-down stairs you can get through" });
  if (lowVoltageMode(mode)) options.push({ value: "surface", label: "Visible along the baseboard", detail: `Fastened neatly from the ${stairWalkRouteCopy(mode).source} to the new wall plate` });
  if (options.length) options.push({ value: "neither", label: "Neither, or I’m not sure" });
  return options;
}

const distanceDone = (a: SwAnswers) =>
  a.distanceMethod === "feet" ? n(a.distanceFeet) > 0
    : a.distanceMethod === "steps" ? Number.isInteger(n(a.distanceSteps)) && n(a.distanceSteps) > 0
      : a.distanceMethod === "estimate" ? a.distanceEstimate === "far" || (Boolean(a.distanceEstimate) && a.estimateAck === "accepted")
        : false;

const directDistanceDone = (a: SwAnswers) =>
  a.directDistanceMethod === "near"
    || (a.directDistanceMethod === "feet" && n(a.directDistanceFeet) > 0)
    || (a.directDistanceMethod === "steps" && Number.isInteger(n(a.directDistanceSteps)) && n(a.directDistanceSteps) > 0);

/**
 * In the storefront the dedicated-circuit tree asks "What will this power?"
 * itself, after the route question, so the live component runs route-only:
 * no equipment screen, and route answers that price once equipment arrives.
 */
export type SwMode = {
  routeOnly?: boolean;
  routeKind?: SwRouteKind;
  /**
   * Dedicated circuits no longer ask the homeowner to reconstruct every
   * finished and unfinished room. Once geometry is measured, pricing compares
   * the same route as fully accessible versus fully concealed.
   */
  priceRange?: boolean;
};

/** Every answer key the route-only component hands the flow engine. */
export const STAIR_WALK_ROUTE_ANSWER_KEYS = [
  "dedicated_stair_walk",
  "dedicated_price_range",
  "dedicated_distance",
  "dedicated_distance_doorway",
  "dedicated_finish_ack",
  routeExteriorAnswerKey("dedicated_distance"),
  routeSectionsAnswerKey("dedicated_distance"),
  "dedicated_surface_conduit",
  "dedicated_garage_emt_feet",
  "dedicated_garage_emt_outlet",
  ...Object.values(DEDICATED_STAIR_ROUTE_KEYS),
] as const;

export function stairWalkScreens(a: SwAnswers, mode: SwMode = {}): SwScreen[] {
  const screens: SwScreen[] = [];
  const copy = stairWalkRouteCopy(mode);
  if (!mode.routeOnly) screens.push({
    id: "project",
    title: "What will the new outlet power?",
    help: "Pick the closest match. We’ll choose the right breaker and wire.",
    fields: [
      { key: "equipment", kind: "choice", options: [
        { value: "fridge_freezer", label: "Refrigerator or freezer" },
        { value: "sump_pump", label: "Sump pump" },
        { value: "microwave", label: "Microwave or window air conditioner" },
        { value: "electric_fireplace", label: "Electric fireplace" },
        { value: "knows_size", label: "Something else" },
      ] },
      ...(a.equipment === "electric_fireplace" ? [{ key: "fireplaceAmperage" as const, kind: "choice" as const, label: "What does its label or manual say it needs?", options: [
        { value: "15a", label: "15 amp" }, { value: "20a", label: "20 amp" }, { value: "unsure", label: "I can’t find it" },
      ] }] : []),
      ...(a.equipment === "knows_size" ? [{ key: "amperage" as const, kind: "choice" as const, label: "What does its label or manual say it needs?", options: [
        { value: "15a_120v", label: "15 amp, 120 volt", detail: "A regular-looking plug" },
        { value: "20a_120v", label: "20 amp, 120 volt", detail: "One prong is turned sideways" },
        { value: "240v", label: "240 volt, or a large round plug" },
        { value: "unsure", label: "I’m not sure" },
      ] }] : []),
    ],
  });
  screens.push({
    id: "panel",
    title: `Where is your ${copy.source}?`,
    help: lowVoltageMode(mode) ? `Start at the place the new ${copy.cable} will connect.` : "It’s a gray metal door about the size of a medicine cabinet, with switches inside.",
    fields: [
      { key: "panelPlace", kind: "choice", options: [
        { value: "basement", label: "Basement" },
        { value: "garage", label: "Garage" },
        { value: "inside", label: "Somewhere else inside", detail: "Laundry, hallway, closet…" },
        { value: "outside", label: "Outside the house" },
        { value: "unsure", label: "I can’t find it" },
      ] },
      ...(a.panelPlace === "basement" ? [{ key: "panelCeiling" as const, kind: "choice" as const, label: `Look up above the ${lowVoltageMode(mode) ? "source" : "panel"}. What’s there?`, options: [
        { value: "open", label: "Wooden beams or lift-out tiles" }, { value: "finished", label: "A smooth painted ceiling" }, { value: "unsure", label: "I’m not sure" },
      ] }] : []),
      ...(a.panelPlace === "garage" ? [{ key: "garageStuds" as const, kind: "choice" as const, label: "Can you see wooden studs on the garage walls?", options: [
        { value: "open", label: "Yes, the studs show" }, { value: "drywall", label: "No, the walls are covered" }, { value: "unsure", label: "I’m not sure" },
      ] }] : []),
      ...(a.panelPlace === "garage" ? [{ key: "garageAttic" as const, kind: "choice" as const, label: `Is there accessible attic space above the garage that runs from the ${lowVoltageMode(mode) ? "source" : "panel"} side toward the house?`, options: [
        { value: "yes", label: "Yes", detail: "There is a hatch or pull-down access, and the attic continues toward the house" }, { value: "no", label: "No" }, { value: "unsure", label: "I’m not sure" },
      ] }] : []),
      ...(needsGarageRun(a) ? [{ key: "garageRun" as const, kind: "choice" as const, label: "How far is the panel from the door into the house?", options: [
        { value: "near", label: "A few feet", detail: "Same wall as the door" },
        { value: "one", label: "Across a one-car garage" },
        { value: "two", label: "Across a two-car garage" },
        { value: "three", label: "Across a three-car garage" },
      ] }] : []),
    ],
  });
  // Older saved walks already have a measured route but no answer to this new
  // shortcut question. Let those continue as the conservative non-direct path.
  if (a.panelPlace === "basement" && (a.outletOverBasement !== undefined || !distanceDone(a))) {
    screens.push({
      id: "projection",
      title: `Is the new ${copy.target} on the first floor directly above the basement?`,
      help: `If it is, we can measure the ${copy.cable} path from below instead of making you walk to the stairs and back.`,
      fields: [
        { key: "outletOverBasement", kind: "choice", options: [
          { value: "over", label: "Yes, it’s above the basement" },
          { value: "beside", label: "No, it’s somewhere else" },
          { value: "unsure", label: "I’m not sure" },
        ] },
      ],
    });
    if (a.outletOverBasement === "over") {
      screens.push({
        id: "measure",
        title: `Place the ${lowVoltageMode(mode) ? "source" : "panel"} and ${copy.target}, then measure the blue section`,
        help: `Move both markers left or right until the sketch resembles your home. Then measure along the basement ceiling directly beneath the ${copy.target}.`,
        fields: [{ key: "directDistanceMethod", kind: "directDistance" }],
      });
      screens.push({ id: "confirm", title: mode.priceRange ? "Your route is ready" : "Here’s what we’ll do", fields: [] });
      return screens;
    }
  }
  screens.push({
    id: "walk",
    title: `Walk from the ${copy.source} to the new ${copy.target} location`,
    help: `Start at the ${copy.source} and follow the normal indoor path to the exact wall where the ${copy.target} will go. Don’t measure the stairs or the up-and-down distance. Next, tell us which staircases you used; after that, the sketch will show the blue horizontal section to measure.`,
    fields: [],
  });
  screens.push({
    id: "stairs",
    title: "Did that walk take you up or down any stairs?",
    help: "Count each distinct level you arrive at. A turn at a landing is still one staircase; an entrance level between two short flights is two.",
    fields: [
      { key: "fullFlights", kind: "stepper", label: "Full staircases", detail: "About 12 or more steps to one level, including a turn at a landing", max: 3 },
      { key: "halfFlights", kind: "stepper", label: "Short half-flights", detail: "About 5 to 8 steps ending at a separate level — count both if an entrance level is between them", max: 3 },
      ...(needsDirection(a) ? [{ key: "direction" as const, kind: "choice" as const, label: "Where did the stairs take you?", options: [
        { value: "up", label: "Up" }, { value: "down", label: "Down to another floor" }, { value: "basement", label: "Down to the basement" },
      ] }] : []),
    ],
  });
  if (mode.priceRange) {
    screens.push({
      id: "measure",
      title: `Place the panel and ${copy.target}, then measure the blue section`,
      help: "Move both markers left or right until the sketch resembles your home. Measure only the blue horizontal section—we add the up-and-down wire automatically.",
      fields: [{ key: "distanceMethod", kind: "distance" }],
    });
    screens.push({ id: "confirm", title: "Your route is ready", fields: [] });
    return screens;
  }
  const spaceOptions = stairWalkSpaceOptions(a, mode);
  if (spaceOptions.length) {
    screens.push({
      id: "space",
      title: `Can the ${copy.cable} travel through an open space?`,
      help: "Pick one only if it’s really there. If it covers only part of the way, you’ll mark that next. Not sure? Choose the last option and we’ll price the harder path.",
      fields: [{ key: "openSpace", kind: "choice", options: spaceOptions }],
    });
  }
  screens.push({
    id: "measure",
    title: `Place the ${lowVoltageMode(mode) ? "source" : "panel"} and ${copy.target}, then measure the blue section`,
    help: "Move both markers left or right until the sketch resembles your home. Measure only the blue horizontal section—we add the up-and-down wire automatically.",
    fields: [
      { key: "distanceMethod", kind: "distance" },
      { key: "doorways", kind: "stepper", label: "Doorways along the blue route", detail: "Count open archways too", max: 3 },
    ],
  });
  if (a.openSpace === "below") {
    const basementPanel = a.panelPlace === "basement";
    screens.push({
      id: "foundation",
      title: basementPanel ? "How much of the way is the basement ceiling open?" : "How much of the walk has an open ceiling or crawlspace under it?",
      help: basementPanel
        ? "Finished basements often have open beams or a drop ceiling only in part. Lift-out tiles count as open. We price the open and finished parts separately."
        : "Split-level homes often have a basement or crawlspace under only part of the floor. We price the open and finished parts separately.",
      fields: [
        { key: "belowCoverage", kind: "choice", options: basementPanel ? [
          { value: "all", label: "All the way", detail: "Beams or lift-out tiles until you’re under the outlet" },
          { value: "partial", label: "Only part of the way", detail: "The rest is a smooth, finished ceiling" },
        ] : [
          { value: "all", label: "All of it", detail: "Beams, lift-out tiles or crawlspace under the whole walk" },
          { value: "partial", label: "Only part of it", detail: "The rest is over a slab or a finished basement ceiling" },
        ] },
        ...(a.belowCoverage === "partial" ? [
          { key: "belowPosition" as const, kind: "choice" as const, label: basementPanel ? "Where is the ceiling open?" : "Which part has open space under it?", options: [
            { value: "panel", label: "Near the panel" },
            { value: "middle", label: "In the middle" },
            { value: "outlet", label: "Near the outlet" },
          ] },
          { key: "belowFeet" as const, kind: "feet" as const, label: basementPanel ? "About how many feet of the way is open?" : "About how many feet have an open ceiling or crawlspace under them?", detail: "Count only the open part. Drop ceilings with lift-out tiles count as open." },
        ] : []),
      ],
    });
  }
  screens.push({
    id: "wall",
    title: `About the wall where the ${copy.target} goes`,
    fields: [
      { key: "wall", kind: "choice", label: "Knock on it. How does it sound?", options: [
        { value: "hollow", label: "Hollow", detail: "Ordinary drywall" },
        { value: "concrete", label: "Solid concrete or block" },
        { value: "masonry", label: "Brick, stone, tile, or old plaster" },
        { value: "unsure", label: "I’m not sure" },
      ] },
      { key: "exterior", kind: "choice", label: "Is it an outside wall — outdoors on the other side?", options: [
        { value: "no", label: "No" }, { value: "yes", label: "Yes" }, { value: "unsure", label: "I’m not sure" },
      ] },
    ],
  });
  screens.push({ id: "confirm", title: "Here’s what we’ll do", fields: [] });
  return screens;
}

export function stairWalkScreenDone(screen: SwScreen, a: SwAnswers): boolean {
  if (screen.id === "confirm") return a.finishAck === "accepted";
  return screen.fields.every((field) =>
    field.kind === "stepper" ? true
      : field.kind === "distance" ? distanceDone(a)
        : field.kind === "directDistance" ? directDistanceDone(a)
        : field.kind === "feet" ? n(a[field.key]) > 0 && n(a[field.key]) < (stairWalkRouteFeet(a) ?? 0)
        : a[field.key] !== undefined);
}

/** Drops answers that no longer apply after an earlier answer changes. */
export function pruneStairWalkAnswers(a: SwAnswers, mode: SwMode = {}): SwAnswers {
  const next = { ...a };
  if (next.equipment !== "electric_fireplace") delete next.fireplaceAmperage;
  if (next.equipment !== "knows_size") delete next.amperage;
  if (next.panelPlace !== "garage") delete next.garageStuds;
  if (next.panelPlace !== "garage") delete next.garageAttic;
  if (!needsGarageRun(next)) delete next.garageRun;
  if (!needsOverBasement(next)) delete next.outletOverBasement;
  if (next.outletOverBasement !== "over") {
    delete next.directDistanceMethod;
    delete next.directDistanceFeet;
    delete next.directDistanceSteps;
  }
  if (next.directDistanceMethod !== "feet") delete next.directDistanceFeet;
  if (next.directDistanceMethod !== "steps") delete next.directDistanceSteps;
  if (next.panelPlace !== "basement") delete next.panelCeiling;
  if (!needsDirection(next)) delete next.direction;
  if (next.distanceMethod !== "estimate") { delete next.distanceEstimate; delete next.estimateAck; }
  if (next.openSpace && !stairWalkSpaceOptions(next, mode).some((option) => option.value === next.openSpace)) delete next.openSpace;
  if (next.openSpace !== "below") delete next.belowCoverage;
  if (next.belowCoverage !== "partial") { delete next.belowPosition; delete next.belowFeet; }
  if (mode.priceRange) {
    delete next.openSpace;
    delete next.belowCoverage;
    delete next.belowPosition;
    delete next.belowFeet;
    delete next.doorways;
    delete next.wall;
    delete next.exterior;
  }
  return next;
}

/** Garage panel with an open garage stretch, ahead of a house route priced in finished walls. */
function openGarageSections(a: SwAnswers, walked: number): MixedRouteSection[] | null {
  if (!openGarage(a) || stairWalkPlane(a) !== "walls" || !a.garageRun) return null;
  const garageFeet = Math.min(SW_GARAGE_RUN_FEET[a.garageRun], walked - 1);
  if (garageFeet < 1) return null;
  return [
    { id: 1, feet: garageFeet, access: "accessible", doorways: 0 },
    { id: 2, feet: walked - garageFeet, access: "finished", doorways: n(a.doorways) },
  ];
}

function partialFoundationSections(a: SwAnswers, walked: number): MixedRouteSection[] | null {
  if (a.openSpace !== "below" || a.belowCoverage !== "partial" || !a.belowPosition) return null;
  const accessibleFeet = n(a.belowFeet);
  if (!Number.isFinite(accessibleFeet) || accessibleFeet <= 0 || accessibleFeet >= walked) return null;
  const finishedFeet = walked - accessibleFeet;
  const doorways = n(a.doorways);
  const accessible = (id: number): MixedRouteSection => ({ id, feet: accessibleFeet, access: "accessible", doorways: 0 });
  const finished = (id: number, feet: number, doorwayCount = 0): MixedRouteSection => ({ id, feet, access: "finished", doorways: doorwayCount });
  if (a.belowPosition === "panel") return [accessible(1), finished(2, finishedFeet, doorways)];
  if (a.belowPosition === "outlet") return [finished(1, finishedFeet, doorways), accessible(2)];
  const firstFinished = finishedFeet / 2;
  return [finished(1, firstFinished, doorways), accessible(2), finished(3, finishedFeet - firstFinished)];
}

// ---------------------------------------------------------------------------
// Inference and the engine adapter
// ---------------------------------------------------------------------------

export type SwPlane = "below" | "attic" | "garage" | "surface" | "walls";
export const stairWalkPlane = (a: SwAnswers): SwPlane =>
  directBasementRoute(a) && a.panelCeiling === "open" ? "below" :
  a.openSpace === "below" || a.openSpace === "attic" || a.openSpace === "garage" || a.openSpace === "surface" ? a.openSpace : "walls";

export function stairWalkFloorChanges(a: SwAnswers): number | null {
  const lv = levels(a);
  if (!lv) return null;
  const plane = stairWalkPlane(a);
  // Through the basement ceiling into a room sitting on top of the basement is
  // not a floor change. A room beside the basement (a split-level half-flight
  // up onto a slab) is: the wire climbs into that level's wall.
  const besideBasement = needsOverBasement(a) && a.outletOverBasement !== "over";
  if (plane !== "attic" && lv.panel <= 1 && lv.outlet <= 1 && !besideBasement) return 0;
  return Math.abs(lv.outlet - lv.panel);
}

export function stairWalkWalkedFeet(a: SwAnswers): number | null {
  if (a.distanceMethod === "feet" && n(a.distanceFeet) > 0) return Math.ceil(n(a.distanceFeet));
  if (a.distanceMethod === "steps" && n(a.distanceSteps) > 0) return Math.ceil(n(a.distanceSteps) * SW_FEET_PER_STEP);
  return null;
}

/** Horizontal wire run. For a room over the basement this is the direct
 * ceiling projection, not the customer's doubled-back walking route. */
export function stairWalkRouteFeet(a: SwAnswers): number | null {
  if (a.outletOverBasement === "over") {
    if (a.directDistanceMethod === "near") return 5;
    if (a.directDistanceMethod === "feet" && n(a.directDistanceFeet) > 0) return Math.ceil(n(a.directDistanceFeet));
    if (a.directDistanceMethod === "steps" && n(a.directDistanceSteps) > 0) return Math.ceil(n(a.directDistanceSteps) * SW_FEET_PER_STEP);
  }
  return stairWalkWalkedFeet(a);
}

export type SwFact = { label: string; value: string; screen: SwScreen["id"] };
export type SwInference = { label: string; value: string; basis: string };
export type StairWalkResult =
  | { kind: "PRICE_INPUTS"; answers: Record<string, string>; facts: SwFact[]; inferred: SwInference[]; flags: string[] }
  | { kind: "REVIEW"; code: string; reason: string; facts: SwFact[]; inferred: SwInference[] }
  | { kind: "INCOMPLETE"; facts: SwFact[]; inferred: SwInference[] };

export function stairWalkFacts(a: SwAnswers, mode: SwMode = {}): SwFact[] {
  const facts: SwFact[] = [];
  for (const screen of stairWalkScreens(a, mode)) {
    for (const field of screen.fields) {
      if (field.kind === "distance") {
        if (!distanceDone(a)) continue;
        facts.push({ screen: screen.id, label: "Distance", value: a.distanceMethod === "feet" ? `${a.distanceFeet} ft (measured)` : a.distanceMethod === "steps" ? `${a.distanceSteps} steps`
          : a.distanceEstimate === "near" ? "Same or next room (estimate)" : a.distanceEstimate === "across" ? "Across the house (estimate)" : "Far end of a large house (estimate)" });
      } else if (field.kind === "directDistance") {
        if (!directDistanceDone(a)) continue;
        facts.push({ screen: screen.id, label: `Direct ${lowVoltageMode(mode) ? "cable" : "wire"} distance`, value: a.directDistanceMethod === "near" ? "Within 5 ft" : a.directDistanceMethod === "feet" ? `${a.directDistanceFeet} ft (measured)` : `${a.directDistanceSteps} basement steps` });
      } else if (field.kind === "stepper") {
        if (distanceDone(a)) facts.push({ screen: screen.id, label: field.label, value: String(n(a[field.key] as string)) });
      } else if (field.kind === "feet") {
        if (n(a[field.key]) > 0) facts.push({ screen: screen.id, label: field.label, value: `${n(a[field.key])} ft` });
      } else {
        const value = a[field.key];
        if (value === undefined) continue;
        const option = field.options.find((candidate) => candidate.value === value);
        facts.push({ screen: screen.id, label: field.label ?? screen.title, value: option?.label ?? String(value) });
      }
    }
  }
  return facts;
}

export function stairWalkInferences(a: SwAnswers, mode: SwMode = {}): SwInference[] {
  const inferred: SwInference[] = [];
  const copy = stairWalkRouteCopy(mode);
  if (a.equipment) {
    const amps = a.equipment === "fridge_freezer" ? 15
      : a.equipment === "electric_fireplace" ? (a.fireplaceAmperage === "20a" ? 20 : a.fireplaceAmperage === "15a" ? 15 : null)
        : a.equipment === "knows_size" ? (a.amperage === "20a_120v" ? 20 : a.amperage === "15a_120v" ? 15 : null)
          : 20;
    if (amps) inferred.push({ label: "Circuit", value: `${amps} amp, 120 volt${a.equipment === "sump_pump" ? " with GFCI protection" : ""}`, basis: "From the equipment you chose" });
  }
  const changes = distanceDone(a) || directDistanceDone(a) ? stairWalkFloorChanges(a) : null;
  if (changes !== null) {
    inferred.push({
      label: "Floor changes",
      value: changes === 0 ? "None" : String(changes),
      basis: changes === 0
        ? (directBasementRoute(a) ? `The ${copy.cable} comes straight up from the basement into the first floor, so no stair-route riser is needed` : flights(a) > 0 ? `The ${copy.cable} comes up through the floor from the basement, so the stairs don’t add a riser` : `${copy.sourceShort} and ${copy.target} are on the same level`)
        : needsOverBasement(a) && a.outletOverBasement !== "over"
          ? `The ${copy.target} room is beside the basement, so the ${copy.cable} climbs into that level’s wall; the vertical route is included`
          : `One per staircase you counted; the vertical ${copy.cable} route is included`,
    });
  }
  if (a.openSpace || directBasementRoute(a) || (distanceDone(a) && stairWalkSpaceOptions(a, mode).length === 0)) {
    const plane = stairWalkPlane(a);
    const routeFeet = stairWalkRouteFeet(a);
    const partial = routeFeet ? partialFoundationSections(a, routeFeet) : null;
    const garageOpen = routeFeet && !partial ? openGarageSections(a, routeFeet) : null;
    const summary = partial ? summarizeMixedRouteSections(partial) : null;
    const garageSummary = garageOpen ? summarizeMixedRouteSections(garageOpen) : null;
    inferred.push({
      label: lowVoltageMode(mode) ? "Cable path" : "Wire path",
      value: garageSummary
        ? `${garageSummary.accessibleFeet} ft open in the garage${a.garageAttic === "yes" ? " attic" : ""}, ${garageSummary.finishedMeasuredFeet} ft inside finished walls and ceilings`
        : summary
        ? `${summary.accessibleFeet} ft ${a.panelPlace === "basement" ? "along the open basement ceiling" : "over open basement or crawlspace"}, ${summary.finishedMeasuredFeet} ft ${a.panelPlace === "basement" ? "behind finished ceilings and walls" : "over a slab or finished room"}`
        : plane === "below" ? "Through the open space below" : plane === "attic" ? `Through the attic, then down to the ${copy.target}` : plane === "surface" ? "Visible and neatly fastened along the baseboard" : plane === "garage" ? (lowVoltageMode(mode) ? "Along the garage wall" : conduitGarage(a) ? "In metal conduit along the garage wall" : "Along the open garage studs") : "Inside finished walls and ceilings",
      basis: summary || garageSummary ? "The open and finished parts are priced separately" : directBasementRoute(a) ? `From the basement ceiling directly below the ${copy.target}` : plane === "walls" ? "No open space you were sure of, so we priced the harder path" : "From the open space you picked",
    });
  }
  const walked = stairWalkWalkedFeet(a);
  const routeFeet = stairWalkRouteFeet(a);
  if (walked && routeFeet && a.outletOverBasement === "over" && routeFeet < walked) inferred.push({
    label: "Distance used for wire",
    value: `${routeFeet} ft instead of ${walked} ft walked`,
    basis: "The walk doubles back at the stairs, so only the direct basement-ceiling distance is charged",
  });
  if (!lowVoltageMode(mode) && conduitGarage(a) && walked && (a.garageRun || a.garageAttic === "yes" || a.openSpace === "garage")) inferred.push({
    label: "Across the garage",
    value: a.openSpace === "garage" ? `${walked} ft in metal conduit to a surface box`
      : a.garageAttic === "yes" ? `${SW_GARAGE_CONDUIT_RISE_FEET} ft of metal conduit up into the garage attic, then open from there`
        : `about ${Math.min(walked, SW_GARAGE_RUN_FEET[a.garageRun!])} ft in metal conduit${stairWalkPlane(a) === "attic" ? `, plus ${SW_GARAGE_CONDUIT_RISE_FEET} ft up to the ceiling` : ""}`,
    basis: a.garageStuds === "unsure" ? "You weren’t sure about the garage walls, so we priced conduit" : a.garageAttic === "yes" ? "Covered garage walls, but the garage attic gives an open path" : "Covered garage walls get wire in conduit on the wall surface",
  });
  if (a.distanceMethod === "steps" && walked) inferred.push({ label: "Your steps in feet", value: `${walked} ft`, basis: `${SW_FEET_PER_STEP} ft per step, rounded up` });
  if (a.directDistanceMethod === "steps" && routeFeet) inferred.push({ label: "Basement steps in feet", value: `${routeFeet} ft`, basis: `${SW_FEET_PER_STEP} ft per step, rounded up` });
  if (a.distanceMethod === "estimate" && a.distanceEstimate && a.distanceEstimate !== "far") inferred.push({ label: "Distance", value: a.distanceEstimate === "near" ? "Top of the short range" : "Top of the medium range", basis: "Priced from your estimate, which you approved" });
  if (a.wall === "unsure") inferred.push({ label: "Wall", value: "Ordinary drywall", basis: "You weren’t sure; any change is shown to you before work starts" });
  return inferred;
}

export function stairWalkToDedicatedAnswers(a: SwAnswers, mode: SwMode = {}): StairWalkResult {
  const facts = stairWalkFacts(a, mode);
  const inferred = stairWalkInferences(a, mode);
  const review = (code: string, reason: string): StairWalkResult => ({ kind: "REVIEW", code, reason, facts, inferred });
  const flags: string[] = [];

  const withEquipment = !mode.routeOnly;
  if (withEquipment && a.amperage === "240v") return review("NOT_THIS_SERVICE", "240-volt equipment is priced as a different service.");
  if (withEquipment && (a.amperage === "unsure" || a.fireplaceAmperage === "unsure")) return review("EQUIPMENT_UNKNOWN", "Send a photo of the equipment label and we’ll confirm the circuit size.");
  if (a.panelPlace === "outside") return review("PANEL_OUTSIDE", "Outdoor panels need a quick photo review before we can price the route.");
  if (a.panelPlace === "unsure") return review("PANEL_NOT_FOUND", "We’ll help you find the panel from a couple of photos.");
  if (conduitGarage(a) && a.distanceMethod === "estimate") return review("CONDUIT_NEEDS_MEASUREMENT", "A conduit run through the garage needs a measured distance. Count your steps or use a tape measure.");
  if (a.openSpace === "below" && a.belowCoverage === "partial" && a.distanceMethod === "estimate" && a.outletOverBasement !== "over") return review("PARTIAL_FOUNDATION_NEEDS_MEASUREMENT", "A partial basement or crawlspace route needs a measured distance. Count your steps or use a tape measure so we can separate the open and finished parts.");
  if (conduitGarage(a) && a.openSpace === "below" && a.belowCoverage === "partial") return review("CONDUIT_MIXED_FOUNDATION_REVIEW", "A route that combines garage conduit with a partial basement or crawlspace needs a quick photo review.");
  // Route-only: the package itself refuses conduit for these recipes later.
  if (withEquipment && conduitGarage(a) && (a.equipment === "sump_pump" || a.equipment === "electric_fireplace")) return review("CONDUIT_EQUIPMENT_REVIEW", "This equipment on a conduit run through the garage needs a quick review.");
  if (a.distanceEstimate === "far" && a.outletOverBasement !== "over") return review("ROUTE_TOO_LONG_TO_ESTIMATE", "For a long run we need a measurement or a photo walk-through.");
  if (flights(a) > 3) return review("TOO_MANY_FLOORS", "Routes through more than three floors need a quick review.");
  if (a.panelPlace === "garage" && (a.direction === "down" || a.direction === "basement")) return review("GARAGE_PANEL_TO_BASEMENT", "A circuit from the garage down to a lower level needs a quick photo review.");
  if (a.wall === "concrete") return review("SURFACE_MOUNT_PENDING_ENGINE", "Outlets on concrete or block get a box mounted on the wall surface. We’ll confirm that price from your answers.");
  if (a.wall === "masonry") return review("WALL_NOT_DRYWALL", "Brick, stone, tile and plaster walls need a different method; we’ll price it from a photo.");

  const screens = stairWalkScreens(a, mode);
  if (screens.some((screen) => !stairWalkScreenDone(screen, a))) return { kind: "INCOMPLETE", facts, inferred };
  const lv = levels(a)!;
  const plane = stairWalkPlane(a);
  const changes = stairWalkFloorChanges(a)!;
  const walked = stairWalkWalkedFeet(a);
  const routeFeet = stairWalkRouteFeet(a);
  const partialSections = routeFeet ? partialFoundationSections(a, routeFeet) : null;
  const garageSections = routeFeet && !partialSections ? openGarageSections(a, routeFeet) : null;

  const answers: Record<string, string> = {
    ...(withEquipment ? { dedicated_equipment: a.equipment! } : {}),
    dedicated_finish_ack: "accepted",
    [routeExteriorAnswerKey("dedicated_distance")]: a.exterior ?? "no",
    dedicated_distance: routeFeet !== null ? String(routeFeet) : a.distanceEstimate === "near" ? "under_25" : "25_to_50",
  };
  if (withEquipment && a.amperage) answers.dedicated_amperage = a.amperage;
  if (withEquipment && a.fireplaceAmperage) answers.dedicated_fireplace_amperage = a.fireplaceAmperage;
  if (a.outletOverBasement === "over" ? a.directDistanceMethod === "near" : walked === null) flags.push("DISTANCE_ESTIMATED");
  if (a.wall === "unsure") flags.push("WALL_TYPE_ASSUMED_DRYWALL");
  if (a.openSpace === "neither") flags.push("NO_OPEN_SPACE_PRICED_CONCEALED");
  if (partialSections) flags.push("PARTIAL_FOUNDATION_MIXED_ROUTE");
  if (garageSections) flags.push("OPEN_GARAGE_THEN_FINISHED");
  if (a.garageAttic === "unsure") flags.push("GARAGE_ATTIC_UNSURE_PRICED_WITHOUT");
  if (a.outletOverBasement === "unsure") flags.push("BASEMENT_OVERLAP_UNSURE_PRICED_BESIDE");
  if (a.panelPlace === "garage" && a.garageStuds === "unsure") flags.push("GARAGE_FINISH_UNSURE_PRICED_CONDUIT");

  // The panel end is open only where the customer told us so: a basement panel
  // with beams above it, open garage studs, or an inside panel on the same
  // level as the open space they picked.
  const panelAccess = a.panelPlace === "basement" ? (a.panelCeiling === "open" ? "open" : "finished")
    : a.panelPlace === "garage" ? "accessible"
      : changes === 0 && plane !== "walls" ? "accessible" : "finished";
  // Route access describes the horizontal run only; a closed panel end is
  // priced by the engine's vertical plan (extra fish and opening), not by
  // turning an open attic or basement run into a concealed one.
  // A finished house route that starts with an open garage stretch is mixed.
  const routeAccess = plane === "walls" && !garageSections ? "finished" : "accessible";
  answers.dedicated_route_access = routeAccess;
  const sections = partialSections ?? garageSections;
  if (sections) answers[routeSectionsAnswerKey("dedicated_distance")] = JSON.stringify(sections);
  else if (routeAccess === "finished" && n(a.doorways) > 0) answers.dedicated_distance_doorway = String(n(a.doorways));

  if (conduitGarage(a) && walked !== null) {
    // Finished garage: cable in surface EMT from the panel. When the outlet is
    // in the garage too, the whole walk is conduit; otherwise the conduit runs
    // across the garage (plus the rise to the ceiling for an attic route) and
    // normal cable continues from there.
    if (plane === "garage") {
      answers.dedicated_garage_emt_feet = String(walked);
      answers.dedicated_garage_emt_outlet = "yes";
    } else if (a.garageAttic === "yes") {
      // Straight up from the panel into the garage attic; the run continues
      // as open cable there. The rise is added to the walk and lives inside
      // the open garage stretch when the house part is finished.
      answers.dedicated_garage_emt_feet = String(SW_GARAGE_CONDUIT_RISE_FEET);
      answers.dedicated_distance = String(walked + SW_GARAGE_CONDUIT_RISE_FEET);
      if (garageSections) {
        garageSections[0] = { ...garageSections[0], feet: garageSections[0].feet + SW_GARAGE_CONDUIT_RISE_FEET };
        answers[routeSectionsAnswerKey("dedicated_distance")] = JSON.stringify(garageSections);
      }
    } else {
      const rise = plane === "attic" ? SW_GARAGE_CONDUIT_RISE_FEET : 0;
      const across = Math.min(walked, SW_GARAGE_RUN_FEET[a.garageRun!]);
      answers.dedicated_garage_emt_feet = String(across + rise);
      answers.dedicated_distance = String(walked + rise);
    }
    answers.dedicated_surface_conduit = "yes";
  }
  if (changes === 0) return { kind: "PRICE_INPUTS", answers, facts, inferred, flags };

  // Floors change: hand the engine the walked stair counts directly.
  const verticalCounts = stairWalkVerticalCounts(a);
  const stairAnswers: Record<string, string> = {
    [DEDICATED_STAIR_ROUTE_KEYS.fullFlights]: String(verticalCounts.fullFlights),
    [DEDICATED_STAIR_ROUTE_KEYS.halfFlights]: String(verticalCounts.halfFlights),
    [DEDICATED_STAIR_ROUTE_KEYS.attic]: plane === "attic" ? "yes" : "no",
    [DEDICATED_STAIR_ROUTE_KEYS.fromBasement]: a.panelPlace === "basement" ? "yes" : "no",
    ...(a.panelPlace === "basement" ? { [DEDICATED_STAIR_ROUTE_KEYS.panelEnd]: panelAccess === "open" ? "open" : "finished" } : {}),
  };
  const route = parseDedicatedStairRoute(stairAnswers);
  if (!route || route === "invalid" || dedicatedStairRoutePlan(route).floorTransitions !== changes) {
    return review("RISER_NOT_MODELLED", `This route changes floors ${changes} times, which instant pricing can’t include yet. We’ll confirm the price from your answers.`);
  }
  Object.assign(answers, stairAnswers);
  return { kind: "PRICE_INPUTS", answers, facts, inferred, flags };
}

/**
 * What the dedicated package will derive from the mapped answers, for display
 * only. scripts/verify-stair-walk-adapter.ts asserts it matches circuitPackageFor.
 */
export function stairWalkEnginePreview(answers: Record<string, string>) {
  const route = parseDedicatedStairRoute(answers);
  const vertical = route && route !== "invalid"
    ? dedicatedStairRoutePlan(route)
    : { cableFeet: 0, floorTransitions: 0, platePenetrations: 0, drywallAccessOpenings: 0, finishedWallFishFeet: 0 };
  const distance = answers.dedicated_distance;
  const measured = distance === "under_25" ? 25 : distance === "25_to_50" ? 50 : Number(distance);
  const sections = parseMixedRouteSections(answers[routeSectionsAnswerKey("dedicated_distance")]);
  const summary = sections ? summarizeMixedRouteSections(sections) : null;
  const doorwayFeet = (summary?.doorwayCount ?? (answers.dedicated_route_access === "finished" ? Number(answers.dedicated_distance_doorway ?? 0) : 0)) * 14;
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
