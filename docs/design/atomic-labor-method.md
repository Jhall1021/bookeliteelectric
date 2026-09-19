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

## Catalog-wide queue

`lib/electrical/laborCoverageFamilies.ts` assigns all 82 catalog services,
including inactive variants and internal fixtures, to exactly one labor family.
`scripts/generate-electrical-labor-family-queue.ts` joins that registry to the
route ledger and produces the readable queue in
`docs/audits/electrical-labor-family-queue.md`. Verification fails if either
side gains or loses a service, preventing whichever example is currently being
discussed from narrowing the catalog audit.

Surface raceway is the second modeled family. Its recipe separates route
setup, base-and-cover footage, conductor-feet, straight joints, internal wire
clips, wall supports, inside/outside/flat corners, blank ends, transitions and
device boxes. Evidence remains scoped to the actual selected family: Wiremold
2900 base and cover is 0.060 manhours/ft while 400 and 800 are 0.070 and 0.075;
none becomes a universal surface-raceway constant.

Device replacement and controls are the third modeled family. Straightforward
replacements remain atomic-enough whole operations because the published
observations measure the complete replacement and do not isolate removal,
make-up and testing reliably. Smart-device hardware, app commissioning,
thermostat power remediation, occupancy configuration and timer programming
are separate operations. That prevents one answer about replacing an outlet
from silently pricing Wi-Fi setup or an astronomical timer.
