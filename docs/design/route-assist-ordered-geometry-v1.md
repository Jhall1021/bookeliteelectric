# Route Assist Ordered Geometry V1

Status: implementation foundation for review

## Boundary

Ordered Geometry V1 is a Route Assist physical-evidence layer.

It does not own pricing, contractor economics, material catalogs, labor, package selection, stock length, offcut policy, onboarding, or decision-tree semantics.

The governing flow remains:

`camera / room scan -> observable physical facts -> canonical Routing V2 primitives and quantities -> MaterialTakeoff -> contractor economics -> approved customer price`

Route Assist supplies observable physical facts only.

## Existing graph retained

Route Assist already persists `RoutePoint[]` and `RouteSegment[]`, and `orderRoute()` deterministically reconstructs a single SOURCE-to-DESTINATION walk. V1 therefore does not duplicate a second persisted ordered-route blob.

The missing durable fact was the physical kind of a turn. `RoutePoint.physicalTurn` may now preserve an explicitly observed `FLAT`, `INSIDE`, or `OUTSIDE` turn on a waypoint.

Absence means unknown/not established.

A 2-D left/right screen-space bend is not sufficient evidence for a physical raceway fitting.

## Derived ordered view

`buildOrderedRouteGeometryV1(points, segments)` returns:

- source and destination point IDs;
- point IDs in travel order;
- segments in travel order;
- per-segment estimated length and tagged surface;
- transitions in travel order;
- explicitly observed physical turn at each transition, when known;
- doorway/window obstacle context independently of the turn;
- known surface changes independently of the turn.

Invalid or ambiguous route graphs return `null`; no branch is guessed.

## Examples

### Straight route

`SOURCE -> 11.6 ft WALL -> DESTINATION`

Ordered output contains one 11.6 ft segment and no interior transitions.

### Doorway detour

A confirmed surface route may preserve:

`1.7 ft -> FLAT -> 6.8 ft -> FLAT + DOORWAY -> 3.4 ft -> FLAT + DOORWAY -> 6.8 ft -> FLAT -> 2.1 ft`

The doorway is context for why the path detours. It does not add cost and does not suppress the physical turns.

### Multiple turns

When the scan genuinely establishes them, the route may preserve:

`4.0 ft -> INSIDE -> 8.5 ft -> OUTSIDE -> 5.2 ft -> FLAT -> 3.1 ft`

If the capture can see only a 2-D bend and cannot establish the physical fitting relationship, the transition remains physically unknown.

## Routing V2 mapping

Existing safe mapping remains:

- confirmed measured surface route length -> `SURFACE_ROUTE_FT`;
- confirmed measured concealed route length -> `CONCEALED_ROUTE_FT` only when that concealed path itself was actually observed/measured;
- `sameWall` never means `back_to_back`.

Ordered physical turn evidence is designed to support:

- `SURFACE_ROUTE_FLAT_CORNER`;
- `SURFACE_ROUTE_INSIDE_CORNER`;
- `SURFACE_ROUTE_OUTSIDE_CORNER`.

However, Ordered Geometry V1 does not bind new homeowner questions or change the current Routing V2 decision tree. A future integration may consume the explicit physical-turn evidence only when observation completeness is sufficient to claim an exact canonical quantity.

Doorway/window context and surface changes remain structured Route Assist evidence unless/until Routing V2 has a genuine downstream need for a canonical primitive. They must not become cost adders merely because the scan recognized them.

## Legacy corner counts

Route Assist V1 contains `insideCornersCount` and `outsideCornersCount` derived from a 2-D image-space cross-product convention. Those fields remain for compatibility in this isolated phase, but they are not the semantic basis of Ordered Geometry V1.

New ordered geometry uses only `RoutePoint.physicalTurn` for physical fitting identity. No new code may infer `physicalTurn` from the legacy cross-product labels.

Changing existing Guided Flow auto-answer bindings is intentionally outside this parallel workstream because the Decision Tree Audit owns homeowner-question behavior.

## Concealed-route evidence

Ordered Geometry V1 does not infer:

- framing behind drywall;
- hidden studs, joists, headers, blocking, insulation, plumbing, ducts, or wiring;
- whether a concealed path is fishable or code compliant;
- accessible attic/basement/crawlspace footage from an ordinary room scan;
- exact wall-opening locations or counts unless they are actually observed.

Access-opening ranges remain evidence, not exact quantities.

## What MaterialTakeoff may consume later

A later MaterialTakeoff integration may consume ordered Route Assist segments such as:

`[4.2, 7.8, 9.1, 6.4]`

along with confirmed ordered physical turns.

MaterialTakeoff/contractor policy remains responsible for combining that geometry with:

- selected raceway/product system;
- stock/package length;
- contractor offcut-reuse policy;
- package purchasing rules.

Route Assist must never output `buy N sticks`, select a SKU, assume offcut reuse, calculate labor, or calculate a customer price.

## Non-goals

Ordered Geometry V1 does not:

- modify pricing architecture;
- modify MaterialTakeoff policy;
- create a material catalog;
- create a labor model;
- create a pricing formula;
- alter onboarding;
- alter homeowner question wording/order;
- alter decision-tree semantics;
- diagnose electrical conditions;
- decide circuit suitability or code compliance;
- infer hidden construction;
- create a second route taxonomy.
