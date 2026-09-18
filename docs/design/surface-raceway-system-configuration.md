# Surface Raceway System Configuration V1

## The ownership question

Every unresolved requirement in the surface-outlet takeoff belongs to exactly one
authority. The failure this phase closes is not that facts were missing — it is
that missing facts had no owner, so any layer could have invented them.

```
Routing V2 tells us the job geometry.
The selected material system tells us product-specific physical facts.
The contractor tells us business and work-practice choices.
No layer invents another layer's facts.
```

## Ownership matrix

| Requirement | Authority | Owner in the schema | State after this phase |
|---|---|---|---|
| Conductor specification (gauge) | `CONTRACTOR_POLICY` | `ContractorPolicyValue.choice` @ `surface_outlet.branch_conductor_spec` | Declared by rehearsal contractor; unresolved for everyone else |
| Conductor function | `CANONICAL_PHYSICAL` | `CanonicalMaterial.key` — 9 function-aware roles | Resolved platform-wide |
| Grounding strategy | `PRODUCT_DERIVED` | `ContractorMaterialSystem.groundingStrategy` | Declared per contractor; null until |
| Termination slack | `CONTRACTOR_POLICY` | `ContractorPolicyValue.measurement` @ `surface_raceway.conductor_slack_per_termination` | Declared; null ≠ 0 |
| Support / clip spacing | `PRODUCT_DERIVED` | `ContractorMaterialSystem.supportSpacingFt` + `supportAtEachTerminus` | Declared per contractor |
| Source transition fitting | `PRODUCT_DERIVED` | `ContractorMaterialSystem.sourceTermination` + material FK | Declared |
| Destination / end fitting | `PRODUCT_DERIVED` | `ContractorMaterialSystem.destinationTermination` + material FK | Declared as `DIRECT_ENTRY` |
| Package stock length | `PRODUCT_DERIVED` | `ContractorMaterial.packageQuantity` — **already existed** | Declared |
| Offcut reuse | `CONTRACTOR_POLICY` | `ContractorPolicyValue` @ `surface_raceway.offcut_reuse` | **Deliberately unresolved** |
| Segment geometry | `ROUTE_GEOMETRY` | Routing V2 — turn counts only, never leg lengths | **Unresolvable by design** |

No requirement ended in `UNRESOLVED_AUTHORITY`.

## What already existed, and was used rather than duplicated

Three of the ten needed **no new schema**:

- **Package geometry** already lived on `ContractorMaterial.packageQuantity` /
  `packageUnit` / `packagePriceCents`.
- **Conductor function** was solved in the previous phase by putting the
  function in the canonical role key.
- **Conductor specification, slack and offcut policy** fit
  `TemplatePolicyDefinition` + `ContractorPolicyValue` exactly. That model is
  already documented as *"A decision the template knows must be made, and
  refuses to make"*, and `TemplateServicePolicy` as *"A policy a service needs
  that no question introduces"* — which is precisely the conductor
  specification. Its `ContractorPolicyValue` comment already said *"Unresolved
  is the honest starting state and is NOT zero."*

  Extending it cost two enum values (`MEASUREMENT`, `MATERIAL_SPECIFICATION`),
  one nullable `measurement Float?`, and a `choices String[]` on the definition.
  Provisioning needed **no change at all**: `installCatalog` already creates
  every policy value unresolved, so a contractor provisioned today receives all
  three questions and none of the answers.

## Why one new object was necessary

`ContractorMaterialSystem` carries the four `PRODUCT_DERIVED` facts. It was not
avoidable by extending `ContractorMaterial`, because:

- `ContractorMaterial` is one row **per role**. Whether the assembly establishes
  an equipment grounding path is not a property of the channel, or the elbow, or
  the box — it is a property of the three together. A `providesGroundPath`
  column on the channel row would let a contractor state that the channel
  grounds while the fitting does not, which is not a sentence about anything.
- The four facts **move together**. A contractor switching raceway family
  changes grounding, support interval and both terminations at once. One
  lifecycle, one owner.
- `MaterialSupplierLink` is supplier catalogue data — product id, brand,
  breadcrumb, package price. It carries no physical system properties and should
  not start to; a supplier feed is not where "how often is this strapped" comes
  from.

And it is deliberately **not** a `ContractorPolicyValue`, because those are the
contractor's *opinions* — how much slack they cut, how far a job may run before
it costs more. These are physical properties of a product family the contractor
**reports**. Both are contractor-supplied; only one of them is their choice.

## Why support count is not `ceil(feet / spacing)`

For 31 ft at a declared 5 ft interval:

```
blind rounding        ceil(31 / 5)                    = 7
the declared rule     floor(31 / 5) + 2 termini       = 8
```

The two disagree, and the difference is the terminus question — which the blind
form answers silently and wrongly. `supportAtEachTerminus` is a separate
nullable declaration for exactly that reason. `Math.ceil(feet …)` appears nowhere
in the derivation, and a verifier asserts its absence.

## Why ampacity is not a homeowner question

The service's own routing settles it. `outlet_load_type` continues only for
`everyday` — motor, heating, shop-equipment and EV loads all reroute to other
services — and `outlet_power_source` continues only for `tap_existing`, with a
dedicated circuit rerouting too. Every job that can reach this takeoff is one
everyday load tapped off an existing general-purpose branch circuit.

One conductor specification can therefore be valid across the entire envelope,
which makes the missing fact **contractor configuration**, not a breaker the
homeowner is asked to read. Adding the question would add a wrong-answer failure
mode and still land on the specification the contractor would have chosen.

Price2Book does not assert that the contractor's chosen specification is
code-suitable for every circuit they might encounter. It records that this is the
material basis they accept every job in this fixed-price service on. If a
contractor cannot make one declaration covering the whole envelope, the
product-model consequence is that the service later needs an additional
observable routing fact or a split outcome. **That split is not built here.**

## PricingSettings — analysis only, not implemented

The earlier recommendation was: make `PricingSettings` fields nullable, `null` =
undecided, `0` = deliberate zero.

**It still appears to be the smallest coherent representation**, and this phase
strengthened the case rather than weakening it. All four fields
(`crewHourRateCents`, `primaryMinimumCents`, `roundingIncrementCents`,
`defaultPermitAdminCents`) are non-null `Int` with no default, so a row cannot
exist in a partially-decided state — which forces provisioning to invent four
numbers at once or create no row at all. It currently creates no row, and
`loadPricingSettings` throws `No pricing settings for contractor …`.

That throw is honest but coarse: it cannot distinguish *"this contractor has
decided nothing"* from *"this contractor has set a crew rate but not a
minimum"*. The `ContractorPolicyValue.measurement` field added this phase is the
same problem solved correctly one layer down, and the two should agree.

**When it first becomes necessary:** not for material completeness — proven
here, since the straight pilot reaches `purchaseComplete` with obviously
synthetic settings and the route still resolves to `REVIEW`. It becomes
load-bearing at the **first step of component economics**, where
`labor hours × crewHourRateCents` produces a proposed component cost. Until then
`PricingSettings` is consumed only by the legacy per-route path. Concretely:

```
component labor hours (contractor)  ─┐
                                     ├─► proposed component labor cost ─┐
crewHourRateCents (PricingSettings) ─┘                                  │
                                                                         ├─► component economics
material takeoff (this phase)       ────► proposed component material ──┘
```

`crewHourRateCents` is needed at the left-hand join. `primaryMinimumCents` and
`roundingIncrementCents` are **not** — they apply to a whole customer-facing
price, not to a component's cost, and pulling them in earlier would apply a job
minimum to a single component.
