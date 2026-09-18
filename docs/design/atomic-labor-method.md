# Atomic labor method

Electrical is the proving trade. Plumbing and HVAC should use the same model
after the electrical operation library and calibration flow are proven.

## Contract

Every offered terminal route must resolve to:

```text
setup operations + Σ(physical quantity × contractor labor per unit)
```

The recipe describes physical work. Published references supply evidence and
relationships. The contractor supplies or approves their own labor per unit.
Price2Book must not average conflicting sources, infer a missing operation as
zero, or turn a whole-job observation into an atomic unit.

The current `CanonicalComponent` table cannot safely be used for this first
decomposition: it is already a live pricing input. Attaching an uncalibrated
atomic component would change a published route to review. The operation and
recipe types therefore begin as a parallel, executable contract in
`lib/laborOperations.ts`. No storefront price changes until coverage and
calibration are complete.

## Geometry, not distance bands

Distance is a quantity source, not a kind of work. For finished wiring, the
route must distinguish:

- cable feet parallel to a framing bay (fish cable; no framing drill),
- feet perpendicular to framing,
- framing spacing (normally 16 inches, but an input rather than a constant),
- one framing drill per crossing,
- one access opening per concealed crossing,
- endpoint/top-plate openings that exist regardless of route length.

For example, ten perpendicular feet across 16-inch framing resolves to eight
crossings. A finished switch leg then carries eight framing drills and ten
access openings: eight at the crossings plus the two baseline openings needed
to reach both sides of the top plate. Restoration remains a separate scope.

## Evidence rules

- `VERIFIED`: one product- and scope-compatible numeric unit is supported.
- `PARTIAL`: useful numeric evidence exists, but only for a sub-scope or one
  system. It may seed a contractor question; it is not silently adopted.
- `DISPUTED`: credible sources disagree. Preserve every observation and ask.
- `NONE`: the operation has been identified but no usable number exists yet.

The first family deliberately leaves most values null. Current evidence gives
different NM-cable units (including 0.030 and 0.006 manhours/ft), broader
whole-fixture recessed-light units, and a 0.25-hour old-work-box subcomponent.
Those facts are retained without pretending they establish an entire switch
leg or recessed-light route.

## Calibration

The wizard should choose anchor questions by labor family, not walk services:

1. ask the contractor for a familiar complete example;
2. subtract already-established operation quantities;
3. propose labor for the unresolved family;
4. compare several answers against book relationships;
5. propose, never auto-approve, related operation units;
6. show every affected service and permit individual overrides.

A contractor who is consistently faster than a book can produce a
family-specific calibration factor. That factor is supporting evidence, not a
global rule and not permission to overwrite unrelated labor families.

## First implemented family

`lib/electrical/atomicLabor.ts` defines the initial branch-wiring and recessed-
lighting vocabulary and recipes. It covers accessible and finished switch
legs, switch-power runs, and recessed-light groups, including quantity-driven
stud/joist crossings and access openings. `scripts/verify-electrical-atomic-
labor.ts` proves the geometry and fail-closed behavior. It does not yet modify
the database or any published price.

Next: map Route Assist facts into these quantity inputs, expand the operation
library across the remaining electrical service families, then build the
anchor-question calibration UI from the resulting unresolved operations.
