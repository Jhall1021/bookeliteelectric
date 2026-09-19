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

The appliance family is also modeled. Dishwasher and disposal remain narrowly
electrical-only operations; whole-appliance published durations are not used as
substitutes. Clean OTR microwave and range-hood swaps are distinct from new
mounting, hood removal and converting a hood feed to a boxed receptacle.
Cabinet, duct, backsplash and new-circuit work remain excluded or review-led.

TV, data, doorbell and camera work is the next modeled family. TV/soundbar
mounting stays separate from new power and concealment. Ethernet and coax keep
different per-foot operations, two explicit terminations and a completed-run
test. Doorbell/camera hardware, new route work, transformer work and app/network
commissioning are independent operations; a physical installation time never
silently includes or excludes commissioning.

Panels and protection are now modeled as well. Breaker replacement and whole-
house surge protection have bounded operations that exclude diagnosis and
repair of the fault that caused a trip. Panel replacements and 200-amp service
upgrades are decomposed into setup, removal, enclosure mounting, actual single-
 and double-pole branch counts, main-feeder termination, grounding/bonding,
labeling/testing, meter work, measured service-entrance conductor footage and
grounding-electrode count. Permit and utility coordination are deliberately
outside these field-labor operations. The model therefore refuses to produce a
panel duration when the job's circuit or service quantities are unknown.

Outdoor, backup-power, pool and spa work now has atomic recipes. The bounded
generator-inlet and hot-tub packages
retain their real physical pieces; their old whole-service hours are not used
as atomic evidence. Broad inactive services also receive operation recipes so
their missing scope is explicit: transfer-switch circuit count, pool equipment
and bonding counts, landscape cable and fixture counts, and exterior-light
route and location counts. They remain review-led until those quantities and
contractor labor units exist. Raceway-feet and conductor-feet are deliberately
separate because a multi-conductor circuit does not contain one conductor-foot
per foot of raceway.

Every branch-routing service now points to a complete service-level recipe as
well as the shared route components. New and dedicated 120V receptacles, four
240V receptacle configurations, EVSE work, exterior GFCI work and the three
surface-raceway endpoints retain different breaker, cable and termination
operations. Larger 240V cable is not calibrated from ordinary 14/2 cable.
Routes require their measured footage and framing geometry; surface work
requires its physical fitting counts. The four entry aliases reuse the same
dedicated-circuit recipe rather than manufacturing separate labor standards.

Lighting and fan services now have complete service-level recipes. Existing-
box fixture and fan replacements remain distinct from new-location cable and
support work. New ceiling work uses the same measured framing geometry as
other concealed routes, including one finished-surface opening per crossing.
A light-to-fan conversion cannot assume the old box is fan-rated. Bathroom-fan
work cannot assume the housing or duct connection fits. Under-cabinet lighting
scales independently by installed channel/tape feet, continuous-run count and
driver count; the provisional four-hour package is retained only as context,
not converted into an atomic labor unit.

## Eight-question first pass

`lib/electrical/laborCalibrationWizard.ts` reduces the calibration intake to
eight fixed-scope, familiar scenarios. They deliberately include both an open-
access and a finished-wall outlet, so the contractor's difference measures
routing difficulty rather than conflating it with device installation. The
other anchors cover recessed lighting, fixture and fan replacement, appliance
electrical work and a quantity-defined panel replacement.

Eight answers cannot directly prove 116 unlike operations. They establish
direct evidence for their contained operations and a contractor speed signal.
Book relationships may then create same-family proposals; unrelated families
receive only low-confidence proposals. Every inferred value requires explicit
contractor approval. Six targeted questions exist for surface raceway, data,
TV mounting, connected controls, generator work and bathroom fans, but appear
only when that family is enabled or its proposal needs confirmation.
