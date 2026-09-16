import type { RouteAssistDestinationType } from "./taxonomy";
import { type RouteAssistFactWriteInputV1 } from "./factModel";

/**
 * Pure, DOM-free marker state for the photo-first capture UI.
 *
 * Deliberately separate from the React component: reposition/remove/type-
 * change are ordinary local UI edits, not fact-store writes -- the homeowner
 * owns this state completely until they confirm it. `routeAssistPhotoMarkers
 * ToFactWritesV1` is the one bridge from "what the homeowner placed" to "what
 * gets written into the locked fact store," and it only ever runs once, on
 * confirm. This split is what makes "reposition it" and "SOURCE_ANCHOR locks
 * on placement" both true without contradiction: the lock happens at
 * confirm-time, not at tap-time.
 */
export type RouteAssistPhotoMarkerRoleV1 = "SOURCE" | "DESTINATION";

export type RouteAssistPhotoMarkerV1 = {
  id: string;
  role: RouteAssistPhotoMarkerRoleV1;
  /** "A" for the source; "B", "C", "D", ... for destinations in placement order. */
  label: string;
  x: number;
  y: number;
  imageId: string;
  markerType: RouteAssistDestinationType;
};

/** A-then-B-then-C..., in placement order. Exactly one SOURCE; any number of DESTINATIONs. */
export function nextRouteAssistPhotoMarkerLabelV1(
  existing: readonly RouteAssistPhotoMarkerV1[],
): { role: RouteAssistPhotoMarkerRoleV1; label: string } {
  if (!existing.some((marker) => marker.role === "SOURCE")) return { role: "SOURCE", label: "A" };
  const destinationCount = existing.filter((marker) => marker.role === "DESTINATION").length;
  return { role: "DESTINATION", label: String.fromCharCode("B".charCodeAt(0) + destinationCount) };
}

function markerIdFor(role: RouteAssistPhotoMarkerRoleV1, label: string): string {
  return `marker-${role.toLowerCase()}-${label}`;
}

export function placeRouteAssistPhotoMarkerV1(
  existing: readonly RouteAssistPhotoMarkerV1[],
  point: { x: number; y: number; imageId: string },
  markerType: RouteAssistDestinationType,
): RouteAssistPhotoMarkerV1[] {
  const { role, label } = nextRouteAssistPhotoMarkerLabelV1(existing);
  const marker: RouteAssistPhotoMarkerV1 = { id: markerIdFor(role, label), role, label, x: point.x, y: point.y, imageId: point.imageId, markerType };
  return [...existing, marker];
}

/** Immediate, in-place reposition -- no lock, no provider round trip. */
export function repositionRouteAssistPhotoMarkerV1(
  existing: readonly RouteAssistPhotoMarkerV1[],
  markerId: string,
  point: { x: number; y: number },
): RouteAssistPhotoMarkerV1[] {
  return existing.map((marker) => (marker.id === markerId ? { ...marker, x: point.x, y: point.y } : marker));
}

export function setRouteAssistPhotoMarkerTypeV1(
  existing: readonly RouteAssistPhotoMarkerV1[],
  markerId: string,
  markerType: RouteAssistDestinationType,
): RouteAssistPhotoMarkerV1[] {
  return existing.map((marker) => (marker.id === markerId ? { ...marker, markerType } : marker));
}

/**
 * Remove a marker. Removing a destination re-letters the remaining
 * destinations to stay contiguous (B, C, D with C removed becomes B, C, not
 * B, D) -- labels are placement-order positions, not permanent identities,
 * until confirm writes them into the fact store.
 */
export function removeRouteAssistPhotoMarkerV1(
  existing: readonly RouteAssistPhotoMarkerV1[],
  markerId: string,
): RouteAssistPhotoMarkerV1[] {
  const remaining = existing.filter((marker) => marker.id !== markerId);
  const source = remaining.filter((marker) => marker.role === "SOURCE");
  const destinations = remaining.filter((marker) => marker.role === "DESTINATION");
  const relabeledDestinations = destinations.map((marker, index) => {
    const label = String.fromCharCode("B".charCodeAt(0) + index);
    return { ...marker, label, id: markerIdFor("DESTINATION", label) };
  });
  return [...source, ...relabeledDestinations];
}

/**
 * The one bridge from homeowner-owned marker state to fact-store writes.
 * Every returned write carries HOMEOWNER_PLACEMENT provenance -- the only
 * provenance factModel.ts's homeowner-only fact types will ever accept -- so
 * this function cannot produce a write factModel would refuse.
 */
export function routeAssistPhotoMarkersToFactWritesV1(
  markers: readonly RouteAssistPhotoMarkerV1[],
  at: string = new Date().toISOString(),
): RouteAssistFactWriteInputV1[] {
  return markers.map((marker) => ({
    type: marker.role === "SOURCE" ? "SOURCE_ANCHOR" : "DESTINATION_ANCHOR",
    scopeId: marker.label,
    value: { kind: "ANCHOR" as const, point: { x: marker.x, y: marker.y, imageId: marker.imageId }, markerType: marker.markerType },
    evidenceImageIds: [marker.imageId],
    provenance: { source: "HOMEOWNER_PLACEMENT" as const, at },
  }));
}
