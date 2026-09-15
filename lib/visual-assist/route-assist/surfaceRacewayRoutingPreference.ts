export type RouteAssistTrimBoundaryV1 =
  | "BASEBOARD"
  | "DOOR_CASING_LEFT"
  | "DOOR_CASING_TOP"
  | "DOOR_CASING_RIGHT"
  | "WINDOW_CASING"
  | "CEILING_LINE"
  | "OTHER_TRIM";

export type RouteAssistSurfaceRacewayPathCandidateV1 = {
  id: string;
  totalLengthFt: number;
  /** Visible raceway footage that is not immediately adjacent to observed trim/boundary. */
  openWallLengthFt: number;
  /** Ordered observed trim boundaries followed by the proposed route. */
  trimBoundaries: RouteAssistTrimBoundaryV1[];
  /** False when the provider cannot establish a continuous practical surface path. */
  physicallyViable: boolean;
};

export type RouteAssistSurfaceRacewayPreferenceV1 = {
  version: 1;
  strategy: "HUG_OBSERVED_TRIM";
  selectedCandidateId: string | null;
  requiresHomeownerReview: boolean;
};

/**
 * Choose a Wiremold/surface-raceway path by minimizing exposed open-wall run
 * before minimizing total footage. This intentionally prefers a slightly longer
 * baseboard/casing route over a shorter visually intrusive shortcut.
 *
 * This is route geometry only: no fitting SKU, material package, labor or price.
 */
export function chooseTrimHuggingSurfaceRacewayPathV1(
  candidates: RouteAssistSurfaceRacewayPathCandidateV1[],
): RouteAssistSurfaceRacewayPreferenceV1 {
  const viable = candidates
    .filter(
      (candidate) =>
        candidate.physicallyViable &&
        Number.isFinite(candidate.totalLengthFt) &&
        candidate.totalLengthFt >= 0 &&
        Number.isFinite(candidate.openWallLengthFt) &&
        candidate.openWallLengthFt >= 0 &&
        candidate.openWallLengthFt <= candidate.totalLengthFt,
    )
    .sort(
      (a, b) =>
        a.openWallLengthFt - b.openWallLengthFt ||
        a.totalLengthFt - b.totalLengthFt ||
        a.id.localeCompare(b.id),
    );

  return {
    version: 1,
    strategy: "HUG_OBSERVED_TRIM",
    selectedCandidateId: viable[0]?.id ?? null,
    // Route Assist proposes; homeowner still reviews the actual rendered path.
    requiresHomeownerReview: true,
  };
}

/**
 * Validate the preferred doorway bypass shape when Route Assist proposes going
 * up and over a door. The route should stay adjacent to casing rather than draw
 * a loose rectangle away from the trim.
 */
export function isTrimHuggingDoorwayBypassV1(
  boundaries: RouteAssistTrimBoundaryV1[],
): boolean {
  for (let index = 0; index <= boundaries.length - 3; index++) {
    const sequence = boundaries.slice(index, index + 3);
    const leftToRight =
      sequence[0] === "DOOR_CASING_LEFT" &&
      sequence[1] === "DOOR_CASING_TOP" &&
      sequence[2] === "DOOR_CASING_RIGHT";
    const rightToLeft =
      sequence[0] === "DOOR_CASING_RIGHT" &&
      sequence[1] === "DOOR_CASING_TOP" &&
      sequence[2] === "DOOR_CASING_LEFT";
    if (leftToRight || rightToLeft) return true;
  }
  return false;
}
