export type ReviewedLandscapeLightingPackage = {
  fixtureCount: 4 | 6 | 8;
  cableRole: "LANDSCAPE_CABLE_12_2";
  connectorRole: "LANDSCAPE_WATERPROOF_CONNECTOR_PAIR";
};

const FIXTURE_COUNTS = new Map([
  ["four", 4],
  ["six", 6],
  ["eight", 8],
] as const);

/** Homeowner answers identify a candidate layout only. The contractor still
 * confirms the equipment, existing source, softscape route and actual cable
 * footage before the package can produce an editable suggestion. */
export function reviewedLandscapeLightingPackage(
  serviceSlug: string,
  answers: Record<string, string | undefined>,
): ReviewedLandscapeLightingPackage | null {
  if (serviceSlug !== "outdoor-landscape-lighting") return null;
  if (answers.landscape_equipment !== "customer_supplied_complete") return null;
  if (answers.landscape_source !== "existing_outdoor_gfci") return null;
  if (answers.landscape_route !== "ordinary_softscape") return null;
  if (!["under_50", "50_to_100"].includes(answers.landscape_distance ?? "")) return null;
  const fixtureCount = FIXTURE_COUNTS.get(answers.landscape_fixture_count as "four" | "six" | "eight");
  if (!fixtureCount) return null;
  return {
    fixtureCount,
    cableRole: "LANDSCAPE_CABLE_12_2",
    connectorRole: "LANDSCAPE_WATERPROOF_CONNECTOR_PAIR",
  };
}
