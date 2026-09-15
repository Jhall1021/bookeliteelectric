"use client";

import {
  projectOrderedRouteToViewportV1,
  projectionPointsFromRouteGraphV1,
  type RouteAssistProjectionPointV1,
} from "@/lib/visual-assist/route-assist/routeProjection";
import type { RoutePoint, RouteSegment } from "@/lib/visual-assist/route-assist/types";

type Props = {
  destinationKind: "OUTLET" | "SWITCH" | "LIGHT_FIXTURE";
  /** Preferred input: the canonical persisted Route Assist graph. */
  routeGraph?: { points: RoutePoint[]; segments: RouteSegment[] };
  /** Fixture/adapter input only when a caller already owns reviewed ordered coordinates. */
  orderedRoutePoints?: RouteAssistProjectionPointV1[];
};

const DEMO_ROUTE: RouteAssistProjectionPointV1[] = [
  { id: "source", x: 0, y: 4 }, { id: "baseboard-left", x: 0, y: 5 },
  { id: "door-left-bottom", x: 4, y: 5 }, { id: "door-left-top", x: 4, y: 0 },
  { id: "door-right-top", x: 8, y: 0 }, { id: "door-right-bottom", x: 8, y: 5 },
  { id: "destination-baseboard", x: 11, y: 5 }, { id: "destination", x: 11, y: 3 },
];

export default function RouteAssistSurfaceRacewayPreview({ destinationKind, routeGraph, orderedRoutePoints }: Props) {
  const hasLight = destinationKind === "LIGHT_FIXTURE";
  const destinationLabel = destinationKind === "OUTLET" ? "New outlet" : "New switch";
  const graphPoints = routeGraph ? projectionPointsFromRouteGraphV1(routeGraph.points, routeGraph.segments) : null;
  const reviewedPoints = graphPoints ?? orderedRoutePoints ?? null;
  const usingReviewedGeometry = Boolean(reviewedPoints?.length);
  const projection = projectOrderedRouteToViewportV1({ points: reviewedPoints ?? DEMO_ROUTE, viewportWidth: 400, viewportHeight: 300, padding: 38 });

  return (
    <div className="overflow-hidden rounded-xl border border-cardline bg-slate-50" data-testid="route-assist-wiremold-route-preview">
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" role="img" aria-label="Proposed surface raceway route">
          <rect x="0" y="0" width="400" height="300" fill="#f5f1e9" />
          {!usingReviewedGeometry && <><line x1="0" y1="244" x2="400" y2="244" stroke="#c8bba9" strokeWidth="12" /><rect x="168" y="92" width="104" height="152" fill="#e7ded1" stroke="#b6a58f" strokeWidth="4" /></>}
          {projection && <><polyline points={projection.polylinePoints} fill="none" stroke="#2452D9" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />{projection.points.map((point, index) => <circle key={point.id} cx={point.x} cy={point.y} r={index === 0 || index === projection.points.length - 1 ? 7 : 4} fill={index === 0 ? "#0F1E3C" : "#2452D9"} />)}</>}
          {hasLight && !usingReviewedGeometry && <circle cx="220" cy="42" r="15" fill="white" stroke="#2452D9" strokeWidth="3" />}
        </svg>
        <div className="absolute left-3 top-3 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-navy shadow-sm">Existing outlet to starter box</div>
        <div className="absolute bottom-3 right-3 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-electric shadow-sm">{destinationLabel}{hasLight ? " to light" : ""}</div>
        <div className="absolute right-3 top-3 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate shadow-sm">{graphPoints ? "Canonical route" : usingReviewedGeometry ? "Reviewed geometry" : "Demo geometry"}</div>
      </div>
      <div className="border-t border-cardline bg-white px-3 py-2 text-xs leading-5 text-slate">{graphPoints ? "Rendered from the canonical persisted Route Assist graph in deterministic A-to-B order. Rendering creates no measurements or physical facts." : usingReviewedGeometry ? "This line preserves the reviewed ordered route shape. Rendering does not create measurements or physical facts." : "Demo path follows the baseboard and door casing. Actual geometry and distance must come from reviewed scan evidence."}</div>
    </div>
  );
}
