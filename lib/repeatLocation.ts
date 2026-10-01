/**
 * Same-room continuation for services whose next location can be measured
 * from the location the customer just added.
 *
 * This module is intentionally pure. The API first proves that the parent
 * line belongs to this browser's open visit, then calls this transformer.
 * The browser never sends an answer snapshot or a price for a continuation.
 */

export const REPEAT_LOCATION_SERVICE_SLUGS = [
  "new-120v-outlet",
  "surface-mounted-outlet",
  "surface-mounted-fixture-box",
  "new-wall-sconce",
  "new-ceiling-fan",
] as const;

export type RepeatLocationServiceSlug = (typeof REPEAT_LOCATION_SERVICE_SLUGS)[number];

export type RepeatLocationInput = {
  parentLineItemId: string;
  distanceFeet: number;
  doorway?: boolean;
  turnsOntoAnotherWall?: boolean;
  sameControl?: boolean;
};

export type RepeatLocationUI = {
  itemLabel: string;
  prompt: string;
  helpText: string;
  askDoorway: boolean;
  askWallTurn: boolean;
  requireSameControl: boolean;
  maxFeet: number;
  measurementQuestionKey: string;
  measurementPrompt: string;
};

type Result =
  | { ok: true; answers: Record<string, string>; ui: RepeatLocationUI }
  | { ok: false; error: string };

const SURFACE_FEET = "surface_route_feet";
const SURFACE_SAME_WALL = "surface_route_same_wall";
const SURFACE_DOOR = "surface_route_door_between";
const ACCESSIBLE_FEET = "accessible_route_feet";
const CONCEALED_FEET = "concealed_route_feet";
const FAN_FINISHED_FEET = "fan_finished_route_feet";

function serviceLabel(slug: RepeatLocationServiceSlug): string {
  if (slug === "new-wall-sconce") return "wall sconce";
  if (slug === "surface-mounted-fixture-box") return "surface-mounted light";
  if (slug === "new-ceiling-fan") return "ceiling fan";
  return "outlet";
}

export function isRepeatLocationService(slug: string): slug is RepeatLocationServiceSlug {
  return (REPEAT_LOCATION_SERVICE_SLUGS as readonly string[]).includes(slug);
}

/** Returns the safe shortcut offered after the first item is in the cart. */
export function repeatLocationUI(
  serviceSlug: string,
  parentAnswers: Record<string, string>,
): RepeatLocationUI | null {
  if (!isRepeatLocationService(serviceSlug)) return null;

  const itemLabel = serviceLabel(serviceSlug);
  const surface = parentAnswers[SURFACE_FEET] !== undefined;
  const accessible = parentAnswers[ACCESSIBLE_FEET] !== undefined
    || parentAnswers.extension_route_access === "accessible";
  const finished = parentAnswers[CONCEALED_FEET] !== undefined
    || parentAnswers[FAN_FINISHED_FEET] !== undefined
    || parentAnswers.extension_route_access === "finished";

  // These routes cannot be described by one additional segment. Examples:
  // back-to-back work has no measured path, and a reviewed route may have no
  // ordinary access class to inherit. The customer can still start a fresh
  // item through the full flow.
  if (!surface && !accessible && !finished) return null;

  return {
    itemLabel,
    prompt: `How far is the next ${itemLabel} from this new ${itemLabel}?`,
    helpText: `Measure from the ${itemLabel} you just added to the next location. We’ll price only this additional segment at the reduced While We’re There rate.`,
    askDoorway: !accessible,
    askWallTurn: surface,
    requireSameControl: serviceSlug === "new-ceiling-fan",
    maxFeet: surface ? 200 : 300,
    measurementQuestionKey: serviceSlug.includes("outlet")
      ? "concealed_route_feet"
      : "extension_existing_fixture_feet",
    measurementPrompt: serviceSlug === "new-wall-sconce"
      ? "How far is it from the new wall sconce to the next wall sconce?"
      : serviceSlug === "new-ceiling-fan"
        ? "How far is it from the new ceiling fan to the next ceiling fan?"
        : serviceSlug === "surface-mounted-fixture-box"
          ? "How far is it from the new surface-mounted light to the next light?"
          : `How far is it from the new ${itemLabel} to the next ${itemLabel}?`,
  };
}

function validDistance(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= max;
}

function clearDistanceKeys(answers: Record<string, string>) {
  for (const key of [
    ACCESSIBLE_FEET,
    CONCEALED_FEET,
    FAN_FINISHED_FEET,
    SURFACE_FEET,
    "extension_existing_switch_feet",
    "extension_existing_fixture_feet",
    "extension_power_to_switch_feet",
    "extension_switch_to_fixture_feet",
  ]) delete answers[key];
}

export function buildRepeatLocationAnswers(args: {
  serviceSlug: string;
  parentAnswers: Record<string, string>;
  input: RepeatLocationInput;
}): Result {
  const { serviceSlug, parentAnswers, input } = args;
  const ui = repeatLocationUI(serviceSlug, parentAnswers);
  if (!ui) return { ok: false, error: "This item needs the full setup for another location." };
  if (!validDistance(input.distanceFeet, ui.maxFeet)) {
    return { ok: false, error: `Enter a distance from 1 to ${ui.maxFeet} feet.` };
  }
  if (ui.requireSameControl && input.sameControl !== true) {
    return { ok: false, error: "A fan with a different control needs the full setup." };
  }

  const answers = { ...parentAnswers };
  clearDistanceKeys(answers);
  const distance = String(input.distanceFeet);

  if (serviceSlug === "new-wall-sconce") {
    // A chained sconce is fed from the previously-added switched fixture, so
    // it shares that fixture's control and does not buy another switch leg.
    answers.extension_existing_location = "no";
    answers.extension_control = "existing_fixture";
    answers.extension_existing_fixture_feet = distance;
    answers.extension_existing_fixture_feet_doorway = input.doorway ? "yes" : "no";
  } else if (parentAnswers[SURFACE_FEET] !== undefined) {
    answers[SURFACE_FEET] = distance;
    answers[SURFACE_SAME_WALL] = input.turnsOntoAnotherWall ? "no" : "yes";
    answers[SURFACE_DOOR] = input.doorway ? "yes" : "no";
    answers.surface_route_obstacles = "clear";
  } else if (parentAnswers[ACCESSIBLE_FEET] !== undefined) {
    answers[ACCESSIBLE_FEET] = distance;
  } else if (parentAnswers[FAN_FINISHED_FEET] !== undefined) {
    answers[FAN_FINISHED_FEET] = distance;
    answers.fan_finished_route_obstacles = "clear";
    answers.fan_finished_route_confirm = "accept";
  } else if (parentAnswers[CONCEALED_FEET] !== undefined) {
    answers[CONCEALED_FEET] = distance;
    answers.concealed_back_to_back = "no";
    answers.concealed_route_obstacles = input.doorway ? "doorway" : "clear";
    answers.concealed_route_feet_doorway = input.doorway ? "yes" : "no";
  } else if (parentAnswers.extension_route_access === "accessible") {
    // Lighting extensions use their own measured keys rather than the shared
    // outlet route key. A chained wall sconce is handled above.
    answers.extension_existing_fixture_feet = distance;
  } else {
    answers.extension_existing_fixture_feet = distance;
    answers.extension_existing_fixture_feet_doorway = input.doorway ? "yes" : "no";
  }

  if (serviceSlug === "new-ceiling-fan") {
    // The repeat UI explicitly confirms the new fan shares the previous fan's
    // control. `pull_chains` is the existing no-new-switch-work branch in the
    // pricing tree; the audit field records the actual reason it was used.
    answers.lighting_control = "pull_chains";
    answers._repeat_shared_control = "yes";
  }

  answers._repeat_same_room = "yes";
  answers._repeat_parent_line_item_id = input.parentLineItemId;
  answers._repeat_segment_feet = distance;
  return { ok: true, answers, ui };
}
