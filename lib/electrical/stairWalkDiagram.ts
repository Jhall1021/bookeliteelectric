import {
  stairWalkFloorChanges,
  stairWalkPlane,
  stairWalkRouteCopy,
  stairWalkRouteFeet,
  stairWalkVerticalCounts,
  type SwAnswers,
  type SwMode,
  type SwPlane,
} from "./stairWalk";

const count = (value: string | undefined) => Number(value ?? 0) || 0;

export type StairWalkDiagramModel = {
  panelLevel: number;
  outletLevel: number;
  highestLevel: number;
  basementLevelZero: boolean;
  splitFoyerBetween: boolean;
  floorChanges: number;
  plane: SwPlane;
  panelLabel: string;
  outletLabel: string;
  measurementLabel: string;
  routeLabel: string;
  partialOpen: { position: "panel" | "middle" | "outlet"; ratio: number } | null;
  description: string;
};

/**
 * Presentation-only geometry for the confirmation drawing. It mirrors the
 * Stair Walk topology without inventing a floor plan or changing pricing.
 */
export function stairWalkDiagramModel(answers: SwAnswers, mode: SwMode = {}): StairWalkDiagramModel {
  const copy = stairWalkRouteCopy(mode);
  const lowVoltage = mode.routeKind === "ethernet" || mode.routeKind === "coax";
  const vertical = stairWalkVerticalCounts(answers);
  const flights = vertical.fullFlights + vertical.halfFlights;
  const splitFoyerBetween = answers.panelPlace === "basement" && count(answers.fullFlights) === 0 && count(answers.halfFlights) === 2 && answers.outletOverBasement === "over";
  const basementLevelZero = answers.panelPlace === "basement" || answers.direction === "basement";
  const panelLevel = answers.panelPlace === "basement"
    ? 0
    : answers.direction === "down" || answers.direction === "basement"
      ? flights
      : 0;
  const outletLevel = answers.panelPlace === "basement"
    ? answers.outletOverBasement === "over" ? Math.max(1, flights) : flights
    : answers.direction === "up"
      ? flights
      : 0;
  const floorChanges = stairWalkFloorChanges(answers) ?? 0;
  const plane = stairWalkPlane(answers);
  const routeFeet = stairWalkRouteFeet(answers);
  const directProjection = answers.outletOverBasement === "over" && Boolean(answers.directDistanceMethod);
  const measurementLabel = routeFeet
    ? directProjection
      ? `${routeFeet} ft direct ${lowVoltage ? "cable" : "wire"} distance`
      : `${routeFeet} ft ${answers.distanceMethod === "steps" ? "from your steps" : "measured"}`
    : answers.distanceEstimate === "near"
      ? "Short-range estimate"
      : answers.distanceEstimate === "across"
        ? "Across-home estimate"
        : "Route distance";
  const panelLabel = answers.panelPlace === "basement"
    ? mode.routeKind ? `Basement ${copy.sourceShort.toLowerCase()}` : "Basement panel"
    : answers.panelPlace === "garage"
      ? `Garage ${copy.sourceShort.toLowerCase()}`
      : answers.panelPlace === "outside"
        ? `Outside ${copy.sourceShort.toLowerCase()}`
        : copy.sourceShort;
  const outletLabel = answers.exterior === "yes" ? `New ${copy.target} · outside wall` : `New ${copy.target}`;
  const routeLabel = plane === "attic"
    ? "Through the attic, then down"
    : plane === "below"
      ? answers.panelPlace === "basement" ? "Along the open basement ceiling" : "Through open space below"
      : plane === "garage"
      ? answers.garageStuds === "open" ? "Along open garage studs" : "In conduit on the garage wall"
      : plane === "surface"
        ? "Visible along the baseboard"
        : "Inside finished walls and ceilings";
  const totalFeet = routeFeet ?? 0;
  const openFeet = count(answers.belowFeet);
  const partialOpen = plane === "below" && answers.belowCoverage === "partial" && answers.belowPosition && totalFeet > 0 && openFeet > 0
    ? { position: answers.belowPosition, ratio: Math.max(0.12, Math.min(0.88, openFeet / totalFeet)) }
    : null;
  const transition = floorChanges === 0 ? "no priced floor changes" : `${floorChanges} priced floor change${floorChanges === 1 ? "" : "s"}`;
  const description = `${panelLabel} to ${outletLabel.toLowerCase()}: ${measurementLabel}, ${routeLabel.toLowerCase()}, with ${transition}.`;

  return {
    panelLevel,
    outletLevel,
    highestLevel: Math.max(panelLevel, outletLevel, basementLevelZero ? 1 : 0),
    basementLevelZero,
    splitFoyerBetween,
    floorChanges,
    plane,
    panelLabel,
    outletLabel,
    measurementLabel,
    routeLabel,
    partialOpen,
    description,
  };
}
