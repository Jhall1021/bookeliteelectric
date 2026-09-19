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

Eight answers cannot directly prove 117 unlike operations. They establish
direct evidence for their contained operations and a contractor speed signal.
Book relationships may then create same-family proposals; unrelated families
receive only low-confidence proposals. Every inferred value requires explicit
contractor approval. Six targeted questions exist for surface raceway, data,
TV mounting, connected controls, generator work and bathroom fans. The setup
page now derives these from the contractor's active offered-service slugs: an
outlet-only contractor sees none of them, while a contractor offering Ethernet
or generator work sees only the applicable checks after the eight shared
anchors. A targeted check is also suppressed once every atomic operation it
can inform already has a contractor decision. Explicit service-family triggers
prevent a shared breaker or cable operation from selecting an unrelated
specialty question.

Published comparisons are stored as ranges with their observation IDs and
scope cautions, never collapsed silently into approved labor. At least four
compatible answers are required before an overall speed pattern is reported;
the median factor is called consistent only when at least 75% of the comparable
answers fall within 25% of it. Even then it is supporting evidence and has no
write or approval authority. Relationship proposals can also preserve the
book's incremental difference: if the book records 20 minutes for a switch and
25 for a wire fish, a contractor's 15-minute switch answer proposes 20 minutes
for the fish. The proposal remains visibly derived and requires approval.

For the contractor-facing starting point, the wizard displays the midpoint of
the retained published range and labels that calculation explicitly. The full
range and its evidence caution remain visible. The suggestion is never
prefilled as the contractor's answer: the screen explains that actual in-field
time may differ with crew, tools, methods and job conditions, then asks for the
time typical for that contractor.

## Service review projection

`lib/electrical/laborReviewProjection.ts` projects approved atomic units through
a service recipe without writing to the database. It distinguishes missing
physical quantities, missing labor, invalid route conditions and labor that
exists only as an unapproved proposal. A complete projection produces an
itemized suggested duration with direct-versus-approved-proposal provenance.
It is still only `READY_FOR_SERVICE_REVIEW`: every result requires explicit
service-level approval and carries `canPublish: false`. This prevents approving
one operation or a family relationship from silently publishing dozens of
service prices.

## Standard service scenarios

`lib/electrical/standardLaborScenarios.ts` separates services with an honest,
bounded standard scope from services whose physical quantities vary by the
job. Fixed replacements classify automatically from their constant recipe
lines. A small explicit map supplies only quantities already fixed by a
checked-in package: the panel circuit mix, 200-amp service quantities, the
generator package's 10-foot feeder and the 12-foot under-cabinet package.

Everything else fails closed with the exact missing facts. A new outlet needs
route type, footage and framing geometry; surface raceway needs its footage,
conductors and fitting counts; a transfer switch needs circuit and raceway
quantities. The hot-tub recipe deliberately has no standard yet because its
package does not establish the number of equipotential-bond connections. No
zero, average or favorable route is inserted merely to make a suggestion.

A standard scenario is only a physical quantity set. It does not approve any
atomic labor unit, service duration or price, and every classification carries
`canPublish: false`. Once the contractor approves the required atomic units,
the existing review projection can turn a complete standard into an itemized
suggestion that still requires separate service-level approval.

## Contractor-owned calibration persistence

Scenario evidence and approved atomic labor are stored separately. A
`ContractorLaborScenarioAnswer` preserves exactly what the contractor said
about one bounded scenario; it never decomposes a multi-operation total into
invented units. A `ContractorLaborOperationDecision` exists only after an
explicit direct entry or explicit approval of a relationship proposal. Its
provenance cites the scenario evidence used.

The shared persistence vocabulary is trade-neutral (`trade`, `scenarioKey`,
`operationKey`), while each trade supplies its own server-side registry. An
Electrical request cannot invent an operation key, cite an unanswered
scenario, or silently borrow Electrical assumptions for a future Plumbing or
HVAC workflow. Batch writes are transactional. This boundary has no Service
write capability and therefore cannot alter `fieldLaborHours`, publish a
service duration, or move a customer price.

## Operation proposal boundary

The answers do not get divided mechanically. A core or selected specialty
scenario containing one operation can create a direct review row for that
operation. The four core
multi-operation scenarios—including finished routing and panel replacement—
remain intact as scenario evidence until a defensible decomposition exists.
This prevents a total panel duration from silently becoming an invented
loadcenter, breaker, or testing unit.

The same rule applies to specialty checks: a prepared TV mount or clean bath-
fan swap can support its one named operation directly, while a ten-foot
surface-raceway total remains whole and cannot be divided among setup,
raceway, conductors, box and device by arithmetic.

When at least four comparable answers show the consistent pattern defined by
the calibration contract, published atomic references may be scaled into
relationship proposals. Mixed answers suppress that inference. Every such row
shows its reference and scenario basis, requires explicit approval, and carries
`canPublish: false`. Existing contractor-approved operation decisions are
never replaced by newly generated proposals.

After proposal review, setup builds a direct-entry completion queue from only
the contractor's offered services. It removes already-established and already-
proposed operations, ranks the remainder by the number of offered services
each unit can help unlock, and shows at most twelve at a time. Each row keeps
its atomic unit (`each` or `ft`), inclusion and exclusion boundaries, affected-
service count, and a published starting point only when the operation carries
a non-disputed numeric reference. A direct entry is stored as `DIRECT_ENTRY`
with no invented scenario citation. Saving a partial batch publishes neither a
service duration nor a customer price. The client adds the returned decision
keys to its established set, clears the saved controls and immediately renders
the next highest-impact batch. On a later visit, complete scenario evidence
resumes directly at operation review instead of forcing a redundant re-save;
the contractor can still deliberately reopen and edit those answers. Progress
reports distinct required units and operation-complete offered services, while
stating that route measurements and service approval remain separate gates.
After a successful operation batch, the client refreshes the server component
tree so newly complete bounded-service projections appear in the separate
service-review panel immediately; the refresh itself performs no approval.

## Service-level labor approval

Approved operation units still do not alter a service. A separate projection
recomputes one bounded service from the current operation decisions and its
standard physical quantities. Route-dependent work remains `NO_STANDARD_SCOPE`
even if every atomic unit is known; its actual route facts must come from the
guided flow or Route Assist.

The approval endpoint locks the tenant-owned service, recomputes inside the
same serializable transaction, and compares the result with the exact duration
the contractor reviewed. A changed operation decision produces a stale-review
refusal rather than approving a different number. The only write is
`Service.fieldLaborHours` through the existing shared pricing-input authority.
It returns `published: false`; customer-price approval remains a later,
separate action.

The contractor-facing panel treats a persisted `fieldLaborHours` as current
only when it still equals the freshly recomputed projection. A changed atomic
unit therefore reopens the service for review instead of trusting an old local
success flag. Successful service-labor approval refreshes the server component
tree so derived pricing can update immediately, but the endpoint and UI retain
the separate customer-price approval boundary.

## Customer-price review handoff

Once the pricing foundation can calculate a fixed-price suggestion, each
unapproved row links directly to that tenant-owned service's Pricing & labor
workspace rather than sending the contractor back to the general services
list. The service page accepts only its four known tab keys; a missing or
unknown query value falls back to Overview.

A service with no calculable suggestion does not show a dash beside a
premature approval link. It is labeled as needing labor setup and links to the
calibration/review area on the same page. Summary counts distinguish approved
prices, calculable prices ready for review, and services still waiting for
labor. This makes the remaining gate explicit without treating missing labor
as a zero-dollar price.

The setup page follows that dependency order visually as well: rate and
minimum, material decisions, atomic labor calibration, service-duration
review, then customer-price review. Contractors no longer encounter a wall of
unavailable prices before reaching the work that makes those prices possible.

The preceding service-selection step is deliberately prospective. An
unselected fixed-price service says its price comes after selection; a chosen
one says pricing setup is next; a completed one says its price is approved.
It no longer labels the entire catalog “Needs a price” before setup has had a
chance to do its job. Quote-only services remain explicitly price-free.

This is navigation, not a new approval mechanism. Guided setup still has no
price-write capability. The contractor sees the itemized suggestion in the
existing service pricing panel and must explicitly publish it there. Atomic
operation decisions, service-duration approval and customer-price publication
therefore remain three separate decisions even though the handoff between
them is now direct.

Route-priced services follow their existing, separate pricing contract. They
do not have one service-wide duration or published base price: the completed
route supplies physical quantities, approved atomic component labor supplies
time, and the derived-pricing approval covers that economic basis. Onboarding
therefore must not send such a service through the legacy base-price check.
It reports a missing derived-basis approval and links to the supported route-
pricing review instead. Legacy fixed-price services retain their explicit
published-price approval requirement unchanged.

The service-duration panel treats this as a distinct complete shape, not a
setup deficiency. It tells the contractor that route-priced services receive
their quantities from each homeowner's route and combine those facts with the
approved per-item and per-foot labor units. It never asks the contractor to
invent one average whole-service duration for variable work.
