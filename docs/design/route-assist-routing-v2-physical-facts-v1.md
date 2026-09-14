# Route Assist -> Routing V2 Physical Facts V1

Status: implementation foundation for review

## Purpose

This layer converts a complete, confirmed Route Assist **surface-route scan** into physical fact candidates that correspond to Routing V2's existing surface quantities.

It does not auto-answer a homeowner question and does not write a component quantity, MaterialTakeoff row, labor value, or price.

The governing flow remains:

`camera / room scan -> observable physical facts -> canonical Routing V2 primitives and quantities -> MaterialTakeoff -> contractor economics -> approved customer price`

This layer sits at the boundary between the first and second terms. It says what physical facts the evidence establishes; it does not grant those facts authority over today's decision tree.

## Canonical mapping

The projection has exactly four physical facts:

| Projection fact | Existing Routing V2 physical quantity |
| --- | --- |
| `surfaceRouteFt` | `SURFACE_ROUTE_FT` |
| `insideCornerCount` | `SURFACE_ROUTE_INSIDE_CORNER` |
| `outsideCornerCount` | `SURFACE_ROUTE_OUTSIDE_CORNER` |
| `flatCornerCount` | `SURFACE_ROUTE_FLAT_CORNER` |

No doorway, window, large-opening, cabinet/obstruction, orientation, plane ID, or other scan evidence is promoted into a new Routing V2 quantity.

Those observations remain evidence around the ordered physical route.

## Completeness

The projection returns either:

- `COMPLETE` with the four physical facts and ordered segment lengths; or
- `INCOMPLETE` with no canonical fact object and explicit blockers.

A complete projection requires:

1. Route Assist mode is `SURFACE`;
2. the homeowner confirmed the route;
3. Route Assist is not already requesting contractor review;
4. scan evidence validates against the same Route Assist graph;
5. every route segment has a `CLEAR` `WORLD_GEOMETRY` length measurement;
6. every interior transition has a `CLEAR` `WORLD_GEOMETRY` physical-turn observation.

Missing or partial evidence does not become a zero, estimate, inferred fitting, or rounded answer.

## Ordered segment geometry

The projection retains ordered per-segment lengths separately from the total.

Example:

`[1.7, 6.8, 3.4, 6.8, 2.1]`

may project:

- `surfaceRouteFt = 20.8`;
- `flatCornerCount = 4`.

The ordered list is preserved for future MaterialTakeoff stock/package logic.

Route Assist does not calculate how many sticks to buy and does not assume offcut reuse.

## No whole-foot rounding

Physical scan geometry remains physical geometry.

`20.8 ft` stays `20.8 ft`.

The current Routing V2 homeowner NUMBER path has historically treated camera-fed footage as whole feet. This projection does not silently round a measured route to satisfy that UI contract; the Decision Tree Audit / later binding policy must decide how measured decimal footage should interact with the homeowner flow.

## Plane coherence

`surfacePlaneId` is supporting evidence.

When both adjacent segments have clear world-geometry plane IDs:

- a `FLAT` turn must remain on the same plane;
- an `INSIDE` or `OUTSIDE` turn must transition between different planes.

A contradiction makes the projection `INCOMPLETE` rather than trusting the turn label or plane label selectively.

Plane IDs are not required when the calibrated scan can establish physical turn topology by another world-geometry method.

## Confidence

The lowest confidence among observations used by the projection is carried as `evidenceConfidenceFloor`.

No confidence threshold is chosen here.

A low-confidence but structurally coherent scan can therefore be represented as complete physical evidence while still having:

`automaticBindingAuthorized = false`

That is deliberate. Provider confidence is evidence, not authority. A separate reviewed policy must decide how confidence, confirmation, tolerances, and task type govern automatic binding.

## Legacy Route Assist corner counts

This projection does **not** read:

- `insideCornersCount`;
- `outsideCornersCount`;
- the legacy 2-D image-space turn direction.

Corner facts come only from Scan Evidence V1 physical-turn observations backed by `WORLD_GEOMETRY`.

This allows the old fields to remain temporarily for compatibility without treating their image-space convention as physical fitting truth.

## Obstacles

Doorways, windows, large openings and fixed obstructions can explain why the route detours.

They do not add a canonical quantity here.

Their physical effect is represented by the ordered segment geometry and turns. Any later decision about material packages, labor, review, or price belongs downstream.

## Concealed routing

This V1 projection is surface-only.

It intentionally refuses `CONCEALED` and `UNSURE` Route Assist modes. An ordinary room scan cannot establish hidden accessible/fished route footage, hidden framing, exact wall openings, feasibility, or code compliance.

A future concealed projection requires its own observable evidence contract rather than reusing the surface rules.

## Automatic binding

`automaticBindingAuthorized` is hard-coded to `false` in this V1 projection.

That is not a temporary flag to flip casually. It records the current workstream boundary:

- Route Assist may establish stable physical facts;
- the Decision Tree Audit decides whether a homeowner question should be asked, skipped, inferred, or used as fallback;
- a later explicit binding policy decides whether a complete fact may auto-answer that audited flow.

## Non-goals

This layer does not:

- alter homeowner decision-tree wording/order/semantics;
- alter onboarding;
- modify the current Route Assist invocation registry;
- write answer values;
- bind component quantities;
- modify MaterialTakeoff;
- select a material system or SKU;
- choose stock/package length;
- decide offcut reuse;
- calculate labor;
- calculate or recommend price;
- infer hidden construction;
- diagnose, decide circuit suitability, feasibility, or code compliance.
