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
import { routeExteriorAnswerKey } from "./mixedRouteSections";

export type SwYesNoUnsure = "yes" | "no" | "unsure";
export type SwAnswers = Partial<{
  equipment: "fridge_freezer" | "sump_pump" | "microwave" | "electric_fireplace" | "knows_size";
  amperage: "15a_120v" | "20a_120v" | "240v" | "unsure";
  fireplaceAmperage: "15a" | "20a" | "unsure";
  panelPlace: "basement" | "garage" | "inside" | "outside" | "unsure";
  garageStuds: "open" | "drywall" | "unsure";
  panelCeiling: "open" | "finished" | "unsure";
  garageRun: "near" | "one" | "two" | "three";
  distanceMethod: "feet" | "steps" | "estimate";
  distanceFeet: string;
  distanceSteps: string;
  distanceEstimate: "near" | "across" | "far";
  estimateAck: "accepted";
  fullFlights: string;
  halfFlights: string;
  direction: "up" | "down" | "basement";
  doorways: string;
  openSpace: "below" | "attic" | "garage" | "neither";
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

// ---------------------------------------------------------------------------
// Screens. Each screen can hold more than one small question.
// ---------------------------------------------------------------------------

export type SwOption = { value: string; label: string; detail?: string };
export type SwField =
  | { key: SwKey; kind: "choice"; label?: string; options: SwOption[] }
  | { key: SwKey; kind: "stepper"; label: string; detail?: string; max: number }
  | { key: "distanceMethod"; kind: "distance" };
export type SwScreen = {
  id: "project" | "panel" | "walk" | "stairs" | "space" | "wall" | "confirm";
  title: string;
  help?: string;
  fields: SwField[];
};

const n = (value: string | undefined) => Number(value ?? 0) || 0;
const flights = (a: SwAnswers) => n(a.fullFlights) + n(a.halfFlights);
const needsDirection = (a: SwAnswers) => a.panelPlace !== "basement" && flights(a) > 0;

/** Levels counted from the lowest living level (1); the basement is 0. */
function levels(a: SwAnswers): { panel: number; outlet: number } | null {
  if (!a.panelPlace || a.panelPlace === "outside" || a.panelPlace === "unsure") return null;
  const total = flights(a);
  if (a.panelPlace === "basement") return { panel: 0, outlet: total };
  if (total === 0) return { panel: 1, outlet: 1 };
  if (!a.direction) return null;
  if (a.direction === "basement") return { panel: total, outlet: 0 };
  return a.direction === "up" ? { panel: 1, outlet: 1 + total } : { panel: 1 + total, outlet: 1 };
}

export function stairWalkSpaceOptions(a: SwAnswers): SwOption[] {
  const lv = levels(a);
  if (!lv) return [];
  const total = flights(a);
  const options: SwOption[] = [];
  if (a.panelPlace === "garage" && a.garageStuds && total === 0) {
    options.push({ value: "garage", label: "The outlet is in the garage too", detail: a.garageStuds === "open" ? "Along the open garage studs" : "In metal conduit on the garage wall" });
  }
  const outletCouldBeLowest = a.panelPlace === "basement" ? total <= 1 && a.panelCeiling === "open" : total === 0 || a.direction === "down" || a.direction === "basement";
  const outletCouldBeTop = a.panelPlace === "basement" ? total >= 1 : total === 0 || a.direction === "up";
  if (outletCouldBeLowest) {
    options.push(a.panelPlace === "basement" && total === 0
      ? { value: "below", label: "Open basement ceiling between the panel and the outlet", detail: "You can see wooden beams or lift-out ceiling tiles" }
      : a.direction === "basement"
        ? { value: "below", label: "Open basement ceiling near the outlet", detail: "You can see wooden beams or lift-out ceiling tiles" }
        : { value: "below", label: "Basement or crawl space right under the outlet", detail: "With wooden beams or lift-out tiles you can see from below" });
  }
  if (outletCouldBeTop) options.push({ value: "attic", label: "Attic right above the outlet", detail: "With a hatch or pull-down stairs you can get through" });
  if (options.length) options.push({ value: "neither", label: "Neither, or I’m not sure" });
  return options;
}

const distanceDone = (a: SwAnswers) =>
  a.distanceMethod === "feet" ? n(a.distanceFeet) > 0
    : a.distanceMethod === "steps" ? Number.isInteger(n(a.distanceSteps)) && n(a.distanceSteps) > 0
      : a.distanceMethod === "estimate" ? a.distanceEstimate === "far" || (Boolean(a.distanceEstimate) && a.estimateAck === "accepted")
        : false;

/**
 * In the storefront the dedicated-circuit tree asks "What will this power?"
 * itself, after the route question, so the live component runs route-only:
 * no equipment screen, and route answers that price once equipment arrives.
 */
export type SwMode = { routeOnly?: boolean };

/** Every answer key the route-only component hands the flow engine. */
export const STAIR_WALK_ROUTE_ANSWER_KEYS = [
  "dedicated_stair_walk",
  "dedicated_distance",
  "dedicated_distance_doorway",
  "dedicated_finish_ack",
  routeExteriorAnswerKey("dedicated_distance"),
  "dedicated_surface_conduit",
  "dedicated_garage_emt_feet",
  "dedicated_garage_emt_outlet",
  ...Object.values(DEDICATED_STAIR_ROUTE_KEYS),
] as const;

export function stairWalkScreens(a: SwAnswers, mode: SwMode = {}): SwScreen[] {
  const screens: SwScreen[] = [];
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
    title: "Where is your electrical panel?",
    help: "It’s a gray metal door about the size of a medicine cabinet, with switches inside.",
    fields: [
      { key: "panelPlace", kind: "choice", options: [
        { value: "basement", label: "Basement" },
        { value: "garage", label: "Garage" },
        { value: "inside", label: "Somewhere else inside", detail: "Laundry, hallway, closet…" },
        { value: "outside", label: "Outside the house" },
        { value: "unsure", label: "I can’t find it" },
      ] },
      ...(a.panelPlace === "basement" ? [{ key: "panelCeiling" as const, kind: "choice" as const, label: "Look up above the panel. What’s there?", options: [
        { value: "open", label: "Wooden beams or lift-out tiles" }, { value: "finished", label: "A smooth painted ceiling" }, { value: "unsure", label: "I’m not sure" },
      ] }] : []),
      ...(a.panelPlace === "garage" ? [{ key: "garageStuds" as const, kind: "choice" as const, label: "Can you see wooden studs on the garage walls?", options: [
        { value: "open", label: "Yes, the studs show" }, { value: "drywall", label: "No, the walls are covered" }, { value: "unsure", label: "I’m not sure" },
      ] }] : []),
      ...(conduitGarage(a) ? [{ key: "garageRun" as const, kind: "choice" as const, label: "How far is the panel from the door into the house?", options: [
        { value: "near", label: "A few feet", detail: "Same wall as the door" },
        { value: "one", label: "Across a one-car garage" },
        { value: "two", label: "Across a two-car garage" },
        { value: "three", label: "Across a three-car garage" },
      ] }] : []),
    ],
  });
  screens.push({
    id: "walk",
    title: "Walk from the panel to where the outlet will go",
    help: "Go the way you’d normally walk, through hallways and doorways. Close is fine.",
    fields: [
      { key: "distanceMethod", kind: "distance" },
      { key: "doorways", kind: "stepper", label: "Doorways you walked through", detail: "Count open archways too", max: 3 },
    ],
  });
  screens.push({
    id: "stairs",
    title: "Did that walk take you up or down any stairs?",
    help: "Count each staircase once. If there were none, just continue.",
    fields: [
      { key: "fullFlights", kind: "stepper", label: "Full staircases", detail: "About 12 or more steps", max: 3 },
      { key: "halfFlights", kind: "stepper", label: "Short half-flights", detail: "About 5 to 8 steps, like in a split-level", max: 3 },
      ...(needsDirection(a) ? [{ key: "direction" as const, kind: "choice" as const, label: "Where did the stairs take you?", options: [
        { value: "up", label: "Up" }, { value: "down", label: "Down to another floor" }, { value: "basement", label: "Down to the basement" },
      ] }] : []),
    ],
  });
  const spaceOptions = stairWalkSpaceOptions(a);
  if (spaceOptions.length) {
    screens.push({
      id: "space",
      title: "Can the wire travel through an open space?",
      help: "Pick one only if it’s right above or below the new outlet. If you’re not sure, choose the last option and we’ll price the harder path.",
      fields: [{ key: "openSpace", kind: "choice", options: spaceOptions }],
    });
  }
  screens.push({
    id: "wall",
    title: "About the wall where the outlet goes",
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
        : a[field.key] !== undefined);
}

/** Drops answers that no longer apply after an earlier answer changes. */
export function pruneStairWalkAnswers(a: SwAnswers): SwAnswers {
  const next = { ...a };
  if (next.equipment !== "electric_fireplace") delete next.fireplaceAmperage;
  if (next.equipment !== "knows_size") delete next.amperage;
  if (next.panelPlace !== "garage") delete next.garageStuds;
  if (!conduitGarage(next)) delete next.garageRun;
  if (next.panelPlace !== "basement") delete next.panelCeiling;
  if (!needsDirection(next)) delete next.direction;
  if (next.distanceMethod !== "estimate") { delete next.distanceEstimate; delete next.estimateAck; }
  if (next.openSpace && !stairWalkSpaceOptions(next).some((option) => option.value === next.openSpace)) delete next.openSpace;
  return next;
}

// ---------------------------------------------------------------------------
// Inference and the engine adapter
// ---------------------------------------------------------------------------

export type SwPlane = "below" | "attic" | "garage" | "walls";
export const stairWalkPlane = (a: SwAnswers): SwPlane =>
  a.openSpace === "below" || a.openSpace === "attic" || a.openSpace === "garage" ? a.openSpace : "walls";

export function stairWalkFloorChanges(a: SwAnswers): number | null {
  const lv = levels(a);
  if (!lv) return null;
  const plane = stairWalkPlane(a);
  if (plane !== "attic" && lv.panel <= 1 && lv.outlet <= 1) return 0;
  return Math.abs(lv.outlet - lv.panel);
}

export function stairWalkWalkedFeet(a: SwAnswers): number | null {
  if (a.distanceMethod === "feet" && n(a.distanceFeet) > 0) return Math.ceil(n(a.distanceFeet));
  if (a.distanceMethod === "steps" && n(a.distanceSteps) > 0) return Math.ceil(n(a.distanceSteps) * SW_FEET_PER_STEP);
  return null;
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
      } else if (field.kind === "stepper") {
        if (distanceDone(a)) facts.push({ screen: screen.id, label: field.label, value: String(n(a[field.key] as string)) });
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

export function stairWalkInferences(a: SwAnswers): SwInference[] {
  const inferred: SwInference[] = [];
  if (a.equipment) {
    const amps = a.equipment === "fridge_freezer" ? 15
      : a.equipment === "electric_fireplace" ? (a.fireplaceAmperage === "20a" ? 20 : a.fireplaceAmperage === "15a" ? 15 : null)
        : a.equipment === "knows_size" ? (a.amperage === "20a_120v" ? 20 : a.amperage === "15a_120v" ? 15 : null)
          : 20;
    if (amps) inferred.push({ label: "Circuit", value: `${amps} amp, 120 volt${a.equipment === "sump_pump" ? " with GFCI protection" : ""}`, basis: "From the equipment you chose" });
  }
  const changes = distanceDone(a) ? stairWalkFloorChanges(a) : null;
  if (changes !== null) {
    inferred.push({
      label: "Floor changes",
      value: changes === 0 ? "None" : String(changes),
      basis: changes === 0
        ? (flights(a) > 0 ? "Wire runs through the basement ceiling, so the stairs don’t add a riser" : "Panel and outlet are on the same level")
        : "One per staircase you counted; vertical wire, drilling and wall openings are added for you",
    });
  }
  if (a.openSpace || (distanceDone(a) && stairWalkSpaceOptions(a).length === 0)) {
    const plane = stairWalkPlane(a);
    inferred.push({
      label: "Wire path",
      value: plane === "below" ? "Through the open space below" : plane === "attic" ? "Through the attic, then down to the outlet" : plane === "garage" ? (conduitGarage(a) ? "In metal conduit along the garage wall" : "Along the open garage studs") : "Inside finished walls and ceilings",
      basis: plane === "walls" ? "No open space you were sure of, so we priced the harder path" : "From the open space you picked",
    });
  }
  const walked = stairWalkWalkedFeet(a);
  if (conduitGarage(a) && a.garageRun && walked) inferred.push({
    label: "Across the garage",
    value: a.openSpace === "garage" ? `${walked} ft in metal conduit to a surface box` : `about ${Math.min(walked, SW_GARAGE_RUN_FEET[a.garageRun])} ft in metal conduit${stairWalkPlane(a) === "attic" ? `, plus ${SW_GARAGE_CONDUIT_RISE_FEET} ft up to the ceiling` : ""}`,
    basis: a.garageStuds === "unsure" ? "You weren’t sure about the garage walls, so we priced conduit" : "Covered garage walls get wire in conduit on the wall surface",
  });
  if (a.distanceMethod === "steps" && walked) inferred.push({ label: "Your steps in feet", value: `${walked} ft`, basis: `${SW_FEET_PER_STEP} ft per step, rounded up` });
  if (a.distanceMethod === "estimate" && a.distanceEstimate && a.distanceEstimate !== "far") inferred.push({ label: "Distance", value: a.distanceEstimate === "near" ? "Top of the short range" : "Top of the medium range", basis: "Priced from your estimate, which you approved" });
  if (a.wall === "unsure") inferred.push({ label: "Wall", value: "Ordinary drywall", basis: "You weren’t sure; any change is shown to you before work starts" });
  return inferred;
}

export function stairWalkToDedicatedAnswers(a: SwAnswers, mode: SwMode = {}): StairWalkResult {
  const facts = stairWalkFacts(a, mode);
  const inferred = stairWalkInferences(a);
  const review = (code: string, reason: string): StairWalkResult => ({ kind: "REVIEW", code, reason, facts, inferred });
  const flags: string[] = [];

  const withEquipment = !mode.routeOnly;
  if (withEquipment && a.amperage === "240v") return review("NOT_THIS_SERVICE", "240-volt equipment is priced as a different service.");
  if (withEquipment && (a.amperage === "unsure" || a.fireplaceAmperage === "unsure")) return review("EQUIPMENT_UNKNOWN", "Send a photo of the equipment label and we’ll confirm the circuit size.");
  if (a.panelPlace === "outside") return review("PANEL_OUTSIDE", "Outdoor panels need a quick photo review before we can price the route.");
  if (a.panelPlace === "unsure") return review("PANEL_NOT_FOUND", "We’ll help you find the panel from a couple of photos.");
  if (conduitGarage(a) && a.distanceMethod === "estimate") return review("CONDUIT_NEEDS_MEASUREMENT", "A conduit run through the garage needs a measured distance. Count your steps or use a tape measure.");
  // Route-only: the package itself refuses conduit for these recipes later.
  if (withEquipment && conduitGarage(a) && (a.equipment === "sump_pump" || a.equipment === "electric_fireplace")) return review("CONDUIT_EQUIPMENT_REVIEW", "This equipment on a conduit run through the garage needs a quick review.");
  if (a.distanceEstimate === "far") return review("ROUTE_TOO_LONG_TO_ESTIMATE", "For a long run we need a measurement or a photo walk-through.");
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

  const answers: Record<string, string> = {
    ...(withEquipment ? { dedicated_equipment: a.equipment! } : {}),
    dedicated_finish_ack: "accepted",
    [routeExteriorAnswerKey("dedicated_distance")]: a.exterior!,
    dedicated_distance: walked !== null ? String(walked) : a.distanceEstimate === "near" ? "under_25" : "25_to_50",
  };
  if (withEquipment && a.amperage) answers.dedicated_amperage = a.amperage;
  if (withEquipment && a.fireplaceAmperage) answers.dedicated_fireplace_amperage = a.fireplaceAmperage;
  if (walked === null) flags.push("DISTANCE_ESTIMATED");
  if (a.wall === "unsure") flags.push("WALL_TYPE_ASSUMED_DRYWALL");
  if (a.openSpace === "neither") flags.push("NO_OPEN_SPACE_PRICED_CONCEALED");
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
  const routeAccess = plane === "walls" ? "finished" : "accessible";
  answers.dedicated_route_access = routeAccess;
  if (routeAccess === "finished" && n(a.doorways) > 0) answers.dedicated_distance_doorway = String(n(a.doorways));

  if (conduitGarage(a) && walked !== null) {
    // Finished garage: cable in surface EMT from the panel. When the outlet is
    // in the garage too, the whole walk is conduit; otherwise the conduit runs
    // across the garage (plus the rise to the ceiling for an attic route) and
    // normal cable continues from there.
    if (plane === "garage") {
      answers.dedicated_garage_emt_feet = String(walked);
      answers.dedicated_garage_emt_outlet = "yes";
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
  const stairAnswers: Record<string, string> = {
    [DEDICATED_STAIR_ROUTE_KEYS.fullFlights]: String(n(a.fullFlights)),
    [DEDICATED_STAIR_ROUTE_KEYS.halfFlights]: String(n(a.halfFlights)),
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
  const doorwayFeet = answers.dedicated_route_access === "finished" ? Number(answers.dedicated_distance_doorway ?? 0) * 14 : 0;
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
