import type { AccessBySlot } from "../accessSlots";

/**
 * One customer-facing scope promise for every electrical route that crosses
 * finished construction. Keep this independent of a particular service tree:
 * outlets, switches, lighting, fans, TV/low-voltage work, and future routes
 * all establish the same FINISHED access fact.
 */
export const FINISHED_WALL_METHOD_DISCLOSURE =
  "We may need small drywall openings or to temporarily remove reusable baseboard. " +
  "We'll reinstall removed pieces, but patching, caulking, and painting are not included.";

export function hasFinishedAccess(accessBySlot: AccessBySlot): boolean {
  return Object.values(accessBySlot).some((accessClass) => accessClass === "FINISHED");
}

export function isFinishedWallDisclosureQuestion(questionKey: string): boolean {
  return questionKey === "concealed_access_method" ||
    questionKey.endsWith("_finish_ack") ||
    questionKey.endsWith("_finished_route_confirm");
}

export function appendFinishedWallDisclosure(
  statements: readonly (string | null | undefined)[],
  applies: boolean,
): string | null {
  const unique = statements.filter((statement): statement is string => !!statement?.trim());
  if (applies && !unique.includes(FINISHED_WALL_METHOD_DISCLOSURE)) {
    unique.push(FINISHED_WALL_METHOD_DISCLOSURE);
  }
  return unique.length > 0 ? [...new Set(unique)].join(" ") : null;
}
