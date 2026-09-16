import type { RouteAssistDestinationType } from "./taxonomy";

/**
 * The atomic Route Assist fact model.
 *
 * Every observable fact Route Assist can establish -- an anchor, a doorway
 * casing, a corner, a wall-plane continuity -- is one row here, independently
 * OPEN or LOCKED. This exists to make a specific class of bug structurally
 * impossible rather than merely detected: the legacy sweep tier's doorway-
 * topology-drift guard (visibleTrimRouteProposal.ts) computes a NEW whole-
 * scene conclusion and then compares it against the last accepted one --
 * which works, but only because someone remembered to call it. A LOCKED fact
 * here is unwritable at the point of write itself: writeRouteAssistFactV1
 * refuses before it ever looks at the incoming value, so there is no
 * "compare and reject" step to accidentally skip.
 *
 * `SOURCE_ANCHOR`/`DESTINATION_ANCHOR` are the sharpest case of that rule.
 * The homeowner's tap is authoritative the instant it's placed -- see
 * HOMEOWNER_ONLY_FACT_TYPES below, which makes it a schema-level fact that no
 * vision-provider call can ever carry the provenance required to write one.
 * A provider's belief about what it sees at that point is a SEPARATE fact,
 * `ANCHOR_OBJECT_MATCH` -- evidence about the homeowner's point, never a
 * competing claim about where that point is.
 *
 * This module intentionally knows nothing about photos vs. sweeps, Gemini vs.
 * any other provider, or Routing V2. It is the shared ledger a photo-first
 * capture, a targeted-photo resolution, and (eventually) the sweep tier can
 * all write into through the same one refusal rule.
 */

export const ROUTE_ASSIST_FACT_TYPES_V1 = [
  "SOURCE_ANCHOR",
  "DESTINATION_ANCHOR",
  "WALL_PLANE",
  "BASEBOARD_CONTINUITY",
  "DOORWAY_PRESENCE",
  "DOORWAY_LEFT_CASING",
  "DOORWAY_TOP_CASING",
  "DOORWAY_RIGHT_CASING",
  "DOORWAY_ENTRY_SIDE",
  "CORNER_PRESENCE",
  "CORNER_KIND",
  "WINDOW",
  "VISIBLE_OBSTACLE",
  "ANCHOR_OBJECT_MATCH",
] as const;
export type RouteAssistFactTypeV1 = (typeof ROUTE_ASSIST_FACT_TYPES_V1)[number];

export type RouteAssistFactStateV1 = "OPEN" | "LOCKED";

/**
 * Who wrote this fact and when. Not a free-text log -- the `source`
 * discriminant is what HOMEOWNER_ONLY_FACT_TYPES checks against, so this is
 * load-bearing, not decorative provenance.
 */
export type RouteAssistFactProvenanceV1 =
  | { source: "HOMEOWNER_PLACEMENT"; at: string }
  | { source: "VISION_PROVIDER"; providerKey: string; at: string }
  | { source: "DETERMINISTIC_RULE"; rule: string; at: string };

/**
 * SOURCE_ANCHOR/DESTINATION_ANCHOR may only ever be written with
 * HOMEOWNER_PLACEMENT provenance -- structurally, not by convention. A vision
 * provider has no field anywhere in this module it could populate to claim
 * one of these two types; writeRouteAssistFactV1 checks the type against
 * this set before it looks at anything else about the call.
 */
const HOMEOWNER_ONLY_FACT_TYPES: ReadonlySet<RouteAssistFactTypeV1> = new Set(["SOURCE_ANCHOR", "DESTINATION_ANCHOR"]);

export type RouteAssistAnchorPointV1 = { x: number; y: number; imageId: string };

/** Reuses the existing destination-type taxonomy for a marker's typed icon (outlet/switch/light/fixture/...) rather than inventing a parallel vocabulary. */
export type RouteAssistFactValueV1 =
  | { kind: "ANCHOR"; point: RouteAssistAnchorPointV1; markerType: RouteAssistDestinationType }
  | { kind: "BOOLEAN"; value: boolean }
  | { kind: "OBJECT_REF"; objectId: string; imageId: string }
  | { kind: "ENUM"; value: string };

export type RouteAssistFactV1 = {
  version: 1;
  /** Stable identity: `${type}:${scopeId}`. See routeAssistFactIdV1. */
  factId: string;
  type: RouteAssistFactTypeV1;
  /** What this fact is about -- an anchor label ("A", "B"), a leg id, a doorway/corner instance id. Caller-defined, opaque to this module. */
  scopeId: string;
  value: RouteAssistFactValueV1;
  evidenceImageIds: string[];
  provenance: RouteAssistFactProvenanceV1;
  state: RouteAssistFactStateV1;
  /** Other factIds this fact's conclusion depends on (e.g. DOORWAY_ENTRY_SIDE depends on both casings). Informational -- not itself enforced by this module. */
  dependsOnFactIds: string[];
};

export type RouteAssistFactStoreV1 = { version: 1; facts: Readonly<Record<string, RouteAssistFactV1>> };

export function emptyRouteAssistFactStoreV1(): RouteAssistFactStoreV1 {
  return { version: 1, facts: {} };
}

export function routeAssistFactIdV1(type: RouteAssistFactTypeV1, scopeId: string): string {
  return `${type}:${scopeId}`;
}

export function getRouteAssistFactV1(store: RouteAssistFactStoreV1, type: RouteAssistFactTypeV1, scopeId: string): RouteAssistFactV1 | null {
  return store.facts[routeAssistFactIdV1(type, scopeId)] ?? null;
}

export function listRouteAssistFactsV1(store: RouteAssistFactStoreV1): RouteAssistFactV1[] {
  return Object.values(store.facts);
}

export type RouteAssistFactWriteInputV1 = {
  type: RouteAssistFactTypeV1;
  scopeId: string;
  value: RouteAssistFactValueV1;
  evidenceImageIds: readonly string[];
  provenance: RouteAssistFactProvenanceV1;
  dependsOnFactIds?: readonly string[];
  /** Provider/rule-sourced facts default to OPEN; pass true to lock immediately (e.g. a single-shot targeted resolution that needs no further confirmation round). Ignored for homeowner-only types, which always lock on write regardless. */
  lockOnWrite?: boolean;
};

export type RouteAssistFactWriteResultV1 =
  | { outcome: "WRITTEN"; store: RouteAssistFactStoreV1; factId: string }
  | { outcome: "REFUSED_LOCKED"; store: RouteAssistFactStoreV1; factId: string; problem: string }
  | { outcome: "REFUSED_PROVENANCE"; store: RouteAssistFactStoreV1; problem: string };

/**
 * The one write path into the fact store. Two refusals, both structural:
 *
 * 1. PROVENANCE: a homeowner-only fact type with non-homeowner provenance is
 *    refused before anything else is inspected -- there is no value this
 *    call could carry that would make it acceptable.
 * 2. LOCKED: an existing LOCKED fact at this factId is refused before the
 *    incoming value is even compared against it. This is deliberately not a
 *    "does the new value match the old one, and if not reject" check -- that
 *    shape is a drift DETECTOR, and the whole point of this function is that
 *    a locked fact never reaches a comparison at all.
 */
export function writeRouteAssistFactV1(store: RouteAssistFactStoreV1, input: RouteAssistFactWriteInputV1): RouteAssistFactWriteResultV1 {
  if (HOMEOWNER_ONLY_FACT_TYPES.has(input.type) && input.provenance.source !== "HOMEOWNER_PLACEMENT") {
    return { outcome: "REFUSED_PROVENANCE", store, problem: `${input.type} may only be written by homeowner placement, not ${input.provenance.source}` };
  }

  const factId = routeAssistFactIdV1(input.type, input.scopeId);
  const existing = store.facts[factId];
  if (existing && existing.state === "LOCKED") {
    return { outcome: "REFUSED_LOCKED", store, factId, problem: `${factId} is locked and cannot be rewritten` };
  }

  const locksImmediately = HOMEOWNER_ONLY_FACT_TYPES.has(input.type) || input.lockOnWrite === true;
  const fact: RouteAssistFactV1 = {
    version: 1,
    factId,
    type: input.type,
    scopeId: input.scopeId,
    value: input.value,
    evidenceImageIds: [...input.evidenceImageIds],
    provenance: input.provenance,
    state: locksImmediately ? "LOCKED" : "OPEN",
    dependsOnFactIds: [...(input.dependsOnFactIds ?? [])],
  };
  return { outcome: "WRITTEN", store: { version: 1, facts: { ...store.facts, [factId]: fact } }, factId };
}

/** Explicitly lock an OPEN fact (e.g. once a provider-sourced conclusion is accepted). No-op-as-null on an already-locked or nonexistent fact -- never "succeeds" at locking something that isn't there. */
export function lockRouteAssistFactV1(store: RouteAssistFactStoreV1, type: RouteAssistFactTypeV1, scopeId: string): RouteAssistFactStoreV1 | null {
  const factId = routeAssistFactIdV1(type, scopeId);
  const existing = store.facts[factId];
  if (!existing || existing.state === "LOCKED") return null;
  return { version: 1, facts: { ...store.facts, [factId]: { ...existing, state: "LOCKED" } } };
}
