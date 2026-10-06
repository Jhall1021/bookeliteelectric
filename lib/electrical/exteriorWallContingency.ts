export const EXTERIOR_WALL_DISCLAIMER_KEYS = {
  outlet: "EXTERIOR_WALL_CONTINGENCY_OUTLET",
  switch: "EXTERIOR_WALL_CONTINGENCY_SWITCHLEG",
  wallSconce: "EXTERIOR_WALL_CONTINGENCY_WALL_SCONCE",
  exteriorGfci: "EXTERIOR_WALL_CONTINGENCY_EXTERIOR_GFCI",
} as const;

export const EXTERIOR_WALL_QUESTION_HELP =
  "Exterior walls can require extra wire and small drywall openings.";

export const EXTERIOR_WALL_CONTINGENCY_TEXT =
  "If openings are needed, we'll show you the additional price before proceeding. " +
  "Drywall repair and painting are not included.";

export const EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT =
  "Even with attic, basement, or crawlspace access, we can't always snake wire up or down an exterior wall. " +
  "If we have to bring the wire to the nearest reachable interior wall and continue through finished drywall (sheetrock), " +
  "we'll resecure the removed pieces; patching and painting are not included.";

export const EXTERIOR_SWITCH_CONTINGENCY_TEXT = EXTERIOR_WALL_CONTINGENCY_TEXT;
