import type { AccessClass } from "@/lib/accessSlots";

/**
 * A typical 36-inch doorway replaces a direct three-foot wall run with two
 * roughly 80-inch rises plus the same three-foot crossing. The extra path is
 * 160 inches, rounded conservatively to fourteen feet for customer pricing.
 */
export const DOORWAY_DETOUR_FEET = 14;

const DIRECT_DOORWAY_KEYS = new Set([
  "tv_outlet_run_distance",
  "ext_gfci_distance",
  "concealed_route_feet",
  "surface_route_feet",
  "doorbell_route_feet",
  "new-ethernet-line_distance",
  "new-coax-line_distance",
  "dedicated_distance",
]);

export function doorwayAnswerKey(questionKey: string): string {
  return questionKey === "surface_route_feet"
    ? "surface_route_door_between"
    : `${questionKey}_doorway`;
}

export function measurementCanCrossDoorway(args: {
  questionKey: string;
  prompt: string;
  serviceSlug?: string;
  accessClass?: AccessClass;
}): boolean {
  const { questionKey, prompt, serviceSlug, accessClass } = args;
  // An open attic, basement, or crawl-space route bypasses obstacles in the
  // finished wall. Showing a doorway here would imply extra wire and wall
  // openings that this route does not need.
  if (accessClass === "ACCESSIBLE") return false;
  if (DIRECT_DOORWAY_KEYS.has(questionKey)) return true;
  if (questionKey === "extension_power_to_switch_feet" || questionKey === "extension_switch_to_fixture_feet") return true;
  if (questionKey === "extension_existing_switch_feet") return true;
  if (questionKey === "extension_existing_fixture_feet") {
    return /wall sconce|exterior light/i.test(prompt) || serviceSlug === "new-wall-sconce" || serviceSlug === "new-exterior-lighting-locations";
  }
  return false;
}

export function measuredLegHasDoorway(
  answers: Record<string, string | undefined>,
  questionKey: string,
): boolean {
  if (answers[doorwayAnswerKey(questionKey)] === "yes") return true;
  return questionKey === "concealed_route_feet" && answers.concealed_route_obstacles === "doorway";
}
