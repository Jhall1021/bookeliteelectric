# Route Assist Scan Evidence V1

Status: implementation foundation for review

## Purpose

This layer gives a future calibrated room-scan / camera interpretation provider a safe, structured place to report physical route evidence without becoming a pricing engine or a second route model.

The governing architecture remains:

`camera / room scan -> observable physical facts -> canonical Routing V2 primitives and quantities -> MaterialTakeoff -> contractor economics -> approved customer price`

Scan Evidence V1 stops at **observable physical evidence**.

## Relationship to Ordered Geometry V1

Ordered Geometry V1 already established that Route Assist's existing `RoutePoint[]` + `RouteSegment[]` graph is the canonical physical route graph and that `orderRoute()` can deterministically reconstruct SOURCE -> DESTINATION order.

Scan Evidence V1 therefore references those existing point/segment IDs. It does not create another route graph.

It can preserve evidence for:

- measured per-segment route length;
- observed surface type;
- scan-local physical plane identity (for example wall-1 vs wall-2);
- world/gravity-frame segment orientation;
- physical flat/inside/outside turns when actual world/plane geometry establishes them;
- visible doorway/window/large-opening/fixed-obstruction context.

## Evidence bases

Two bases exist:

- `WORLD_GEOMETRY`: calibrated metric/plane geometry from world tracking / room scan;
- `VISIBLE_SCENE`: semantic recognition from the visible scene/mesh/photo.

A visible-scene observation is useful evidence, but it is **not metric authority**.

Accordingly:

- measured route footage requires `WORLD_GEOMETRY`;
- plane identity requires `WORLD_GEOMETRY`;
- physical segment orientation requires `WORLD_GEOMETRY`;
- physical raceway turn identity requires `WORLD_GEOMETRY`;
- obstacle context may come from `VISIBLE_SCENE` or `WORLD_GEOMETRY`.

This prevents a pixel-length estimate or a 2-D left/right bend from becoming a physical measurement/fitting.

## Confidence

Every scan observation carries provider/runtime confidence, visibility, and basis.

Provider confidence is **evidence, not authority**.

Scan Evidence V1 validates that confidence is finite and in 0..1, but it deliberately does not choose a confidence threshold for canonical binding. A later reviewed policy may combine:

- evidence basis;
- visibility;
- provider confidence;
- customer confirmation;
- task-specific tolerances.

`isClearWorldGeometryObservation()` therefore means only: non-null + CLEAR + WORLD_GEOMETRY. It is a necessary structural condition, not permission to price or bind.

## Plane identity

`surfacePlaneId` is an opaque scan-local identifier such as `wall-1`.

It is not a Routing V2 primitive, material code, catalog key, pricing key, or free-text field.

Its purpose is to preserve a physically useful distinction that ordinary image geometry loses:

- same surface class, same physical plane;
- same surface class, different physical plane.

That distinction can later support trustworthy flat/inside/outside geometry without using arbitrary image-space turn direction.

## Obstacle context

The scan-evidence vocabulary may describe:

- `DOORWAY`;
- `WINDOW`;
- `LARGE_OPENING`;
- `FIXED_OBSTRUCTION`.

These values explain why the physical path detours. They do not add a price, labor amount, material component, or Routing V2 quantity by themselves.

The ordered segment geometry remains the physical truth used downstream.

## Alignment

`alignRouteAssistScanEvidenceV1()` validates the evidence against the existing Route Assist graph and returns evidence rows in SOURCE -> DESTINATION order.

It never copies scan values into:

- `RouteSegment.estimatedLengthFt`;
- `RoutePoint.physicalTurn`;
- Routing V2 quantities;
- MaterialTakeoff;
- pricing.

That boundary is intentional while canonical-binding policy and homeowner decision-tree behavior are owned by other workstreams.

## Concealed routing

An ordinary room scan still cannot establish hidden concealed-route facts such as:

- framing behind drywall;
- studs, joists, headers, blocking or insulation;
- hidden plumbing, ducts or existing wiring;
- whether a cavity is fishable;
- exact hidden cable path;
- accessible attic/basement/crawlspace route footage that was not itself scanned/measured;
- code compliance;
- circuit suitability;
- exact wall-opening count unless the openings are actually observed.

No Scan Evidence V1 field may be used to infer those facts.

## Non-goals

Scan Evidence V1 does not:

- choose a route for the homeowner;
- alter homeowner questions or question order;
- alter onboarding;
- bind canonical Routing V2 quantities;
- alter MaterialTakeoff;
- choose products or packages;
- calculate stock usage or offcut reuse;
- calculate labor;
- calculate or recommend price;
- diagnose electrical conditions;
- determine feasibility or code compliance;
- create a second route taxonomy.
