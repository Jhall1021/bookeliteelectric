export type RouteAccess = "accessible" | "finished";

export type MixedRouteSection = {
  id: number;
  feet: number;
  access: RouteAccess;
  doorways: number;
};

export const ROUTE_SECTIONS_SUFFIX = "_route_sections";
export const ROUTE_START_EXTERIOR_SUFFIX = "_start_exterior";
export const ROUTE_END_EXTERIOR_SUFFIX = "_end_exterior";
export const ROUTE_EXTERIOR_SUFFIX = "_exterior";

export function routeSectionsAnswerKey(questionKey: string): string {
  return `${questionKey}${ROUTE_SECTIONS_SUFFIX}`;
}

export function routeStartExteriorAnswerKey(questionKey: string): string {
  return `${questionKey}${ROUTE_START_EXTERIOR_SUFFIX}`;
}

export function routeEndExteriorAnswerKey(questionKey: string): string {
  return `${questionKey}${ROUTE_END_EXTERIOR_SUFFIX}`;
}

export function routeExteriorAnswerKey(questionKey: string): string {
  return `${questionKey}${ROUTE_EXTERIOR_SUFFIX}`;
}

export function parseMixedRouteSections(value: string | undefined): MixedRouteSection[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 6) return null;
    const sections = parsed.map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") return null;
      const row = candidate as Record<string, unknown>;
      const feet = Number(row.feet);
      const access = row.access;
      const rawDoorways = Number(row.doorways ?? 0);
      if (!Number.isFinite(feet) || feet <= 0 || feet > 200) return null;
      if (access !== "accessible" && access !== "finished") return null;
      if (!Number.isInteger(rawDoorways) || rawDoorways < 0 || rawDoorways > 4) return null;
      return {
        id: Number.isInteger(Number(row.id)) ? Number(row.id) : index + 1,
        feet,
        access,
        // Open routes bypass finished-wall doorway obstacles.
        doorways: access === "finished" ? rawDoorways : 0,
      } satisfies MixedRouteSection;
    });
    return sections.every(Boolean) ? sections as MixedRouteSection[] : null;
  } catch {
    return null;
  }
}

export function summarizeMixedRouteSections(sections: MixedRouteSection[]) {
  const accessibleFeet = sections.reduce((sum, section) => sum + (section.access === "accessible" ? section.feet : 0), 0);
  const finishedMeasuredFeet = sections.reduce((sum, section) => sum + (section.access === "finished" ? section.feet : 0), 0);
  const doorwayCount = sections.reduce((sum, section) => sum + (section.access === "finished" ? section.doorways : 0), 0);
  return { accessibleFeet, finishedMeasuredFeet, doorwayCount };
}

export function mixedRouteTouchesExteriorWall(answers: Record<string, string | undefined>): boolean {
  return Object.entries(answers).some(([key, value]) =>
    ((value === "yes" || value === "unsure") && key.endsWith(ROUTE_EXTERIOR_SUFFIX))
    || (value === "yes" && (key.endsWith(ROUTE_START_EXTERIOR_SUFFIX) || key.endsWith(ROUTE_END_EXTERIOR_SUFFIX)))
  );
}

export function mixedRouteHasFinishedSection(answers: Record<string, string | undefined>): boolean {
  return Object.entries(answers).some(([key, value]) =>
    key.endsWith(ROUTE_SECTIONS_SUFFIX) && parseMixedRouteSections(value)?.some((section) => section.access === "finished")
  );
}
