import type { AccessBySlot } from "../accessSlots";

/**
 * One customer-facing scope promise for every electrical route that crosses
 * finished construction. Keep this independent of a particular service tree:
 * outlets, switches, lighting, fans, TV/low-voltage work, and future routes
 * all establish the same FINISHED access fact.
 */
export const FINISHED_WALL_METHOD_DISCLOSURE =
  "We'll choose the practical method for the conditions—either making small access openings in drywall or carefully removing reusable baseboard. " +
  "We'll put any removed drywall pieces or reusable baseboard back and secure them. " +
  "Caulking, spackling, sanding, texture matching, staining, priming, painting, and replacement materials are not included.";

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
