# HVAC Template — V0 architecture package

*1 September 2026. The §23 deliverable. Architecture and trade modeling only:
no HVAC is provisioned, no shared file is edited, nothing enters the Guided Setup
trade picker, and no canonical HVAC code exists yet.*

Follows `docs/design/hvac-architecture-inspection.md` (the §26 inspection) and the
three decisions locked on it.

---

## Decisions this package is built on

| | Decision | What it changes here |
| --- | --- | --- |
| **Q1** | Equipment replacement is modeled **canonically in full** and ships **`REMOTE_QUOTE`** in V1 | The replacement model carries matched identity, fuel, venting, capacity, line set and both equipment locations. Commercial outcome and canonical fidelity are decoupled — §J |
| **Q2** | **One** HVAC service-call shell | Every symptom converges on `hvac-service-call`. The reported symptom is preserved as structured intake context and selects nothing — §D, §G |
| **Q3** | Architect for a **multi-trade** contractor | G2 is a real blocker on the shared platform and is flagged for the Plumbing proof — §D.4. G1 constrains what V1 may fixed-price and is expressed as a refusal, never as a merge — §B.3 |

Two rules carried in from the inspection and treated as settled: **reuse the seven
primitives unchanged, invent no eighth**, and **re-author trade-owned structures under
`lib/hvac` rather than extracting prematurely**.

## Approved, 1 September 2026

The §23 architecture shape is approved. Six decisions carried forward, each recorded
where it binds:

| # | Decision | Where it lives |
| --- | --- | --- |
| 1 | **`maintenanceScope` approved** as metadata, **not** an eighth Guided Pricing primitive | §C.4 |
| 2 | ~~**Keep the G1 double refusal** — `REMOTE_QUOTE` plus independent `location_pair_gate`.~~ **SUPERSEDED 2 Sep 2026 by D13.** Sound when made: the platform held one scalar access state, and refusing twice was the honest way to avoid pricing against a location nobody had classified. Scoped access removed the limitation, so `locationScope: "BOTH"` is now descriptive and `location_pair_gate` is retired | §B.3 |
| 3 | **`intents_do_not_resolve_to_component_repairs` approved.** Manufacturer / model / serial / manufacture date stay evidence-only and prohibited from gate and mapping use. The `serviceMatch` residual is recorded as a **future invariant-expansion trigger** | §G.1, §G.4, §G.7 |
| 4 | **G2 remains a hard Plumbing-proof condition** | §D.4, §J.5 |
| 5 | **Q7 conservative line-set rule stands.** Reopenable only on actual HVAC contractor review | §E.4, §F.10 |
| 6 | **Do not overload `SUPPLY_ARRANGEMENT`.** NOT_OFFERED uses the existing eligibility mechanism where one exists; the missing part is flagged rather than absorbed | §C.5, and G9 |
| 7 | **Oil and hydronic stay deferred, and are not folded in as fuel branches.** A service whose canonical vocabulary cannot describe its own scope drivers collects an incomplete scope **even when its commercial outcome is `REMOTE_QUOTE`** | §J.3, and the catalog review |
| 8 | **The presence/absence merge rule**, approved as a general principle: where *"is there one there now?"* is already an observable configuration question, presence and absence are normally **branches of one physical service**, not separate canonical services | Catalog review, audit 6 |
| 9 | **G1 promoted to a pre-production blocker — SATISFIED / CLOSED 2 Sep 2026.** A valid blocker when raised: it stopped HVAC shipping three tune-ups on a scope declaration that was false. Closed by the scoped-access platform implementation and its acceptance proof, not withdrawn | Catalog review Part 6; `g1-scoped-access.md` |
| 10 | **`maintenanceScope` items carry `at: INDOOR / OUTDOOR`.** Decision 1's declaration becomes a structured list rather than prose, so `locationScope` can be checked against the work the service promises | Catalog review, §6.4 |
| 11 | **G1's direction is approved and escalated to the platform owner** as `docs/design/g1-scoped-access.md`, carrying nine decisions: shared slot vocabulary (`PRIMARY` / `INDOOR_EQUIPMENT` / `OUTDOOR_EQUIPMENT`), `AccessClassification` unchanged, validated strings rather than a DB enum, one module owning slot validation, services declaring the slots they reference, expand→parallel→switch→contract with an `accessClass === accessBySlot.PRIMARY` equivalence invariant, ADR-021 as the zero-delta acceptance gate, two separately named invariants, and cross-trade evidence leading | `docs/design/g1-scoped-access.md` |
| 13 | **G1 accepted as solved by the platform owner, 2 Sep 2026.** ADR-021 zero delta across 65 services, existing Electrical routes preserved, mismatched scoped coexistence proven, writer-baseline tripwire proven to fail on both a new pair and a changed writer set. `locationScope: "BOTH"` no longer refuses anything; a service that stays non-priceable needs an **independent, service-specific reason**. **HVAC is unparked with respect to G1** — which is not the same as production-ready; every other blocker still applies | §B.3, §J.5 |
| 12 | **Three things stay distinct**, and the catalog may not collapse them: `identity / evidence` ≠ `promised physical work` ≠ `access classification`. Evidence rides on the job sheet and prices nothing; promised work drives `locationScope`; access classification gates | §6.2 of the G1 proposal |

---

# A. Candidate service catalog

Fifty-five candidates. Not a shipping list — §J recommends which subset ships. The
column that matters is **suitability**, and it is assigned per service with a reason,
never inherited from a category.

**Suitability vocabulary** (§15): **EXACT** — deterministically priceable from
homeowner-observable inputs · **CONDITIONAL** — some resolved branches price, others
review · **APPOINTMENT** — Price2Book books the contractor rather than predicting scope ·
**SAFETY** — safety response precedes pricing.

Dimension names are formalized in §E. `[BOTH]` marks a service whose responsible scope
needs two independently-classified equipment locations — G1, and the reason it cannot
fixed-price in V1.

### Thermostats & Controls — `thermostats-controls`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `thermostat-replacement` | Replace Existing Thermostat | Known | **EXACT** | `control_present`, `conductor_count`, `common_wire`, `thermostat_count`, `supply_arrangement` | Priced |
| `smart-thermostat-installation` | Smart Thermostat Installation | Known | **CONDITIONAL** | + `system_type` | Priced with C-wire adapter component; `REMOTE_QUOTE` where new cable must be run |
| `thermostat-new-installation` | Thermostat Installation Where None Exists | Known | **CONDITIONAL** | + `indoor_location`, `run_band`, `finish_ack` | Mostly `REMOTE_QUOTE` — a new control run through finished construction |
| `additional-zone-thermostat-installation` | Add a Thermostat for Another Zone | Known | **APPOINTMENT** | `zone_count`, `system_type` | Review — adding a zone is a distribution change, not a control swap |
| `zoning-system-installation` | Zoning System Installation | Known | **APPOINTMENT** | `system_type`, `zone_count`, `indoor_location` | Review |
| `zone-damper-replacement` | Zone Damper Replacement | Known, component-named | **CONDITIONAL** | `zone_count`, `indoor_location` | **Defer** — §22 component service; safe only as an explicit customer selection |

### Heating Equipment — `heating-equipment`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `gas-furnace-replacement` | Gas Furnace Replacement | Known identity, unbounded scope | **CONDITIONAL → `REMOTE_QUOTE` in V1** | `system_type`, `fuel_type`, `venting_class`, `heating_input_btu`, `indoor_location`, `condensate_route`, `supply_arrangement` | Review with a fully resolved scope attached |
| `electric-furnace-replacement` | Electric Furnace Replacement | Same | **CONDITIONAL → `REMOTE_QUOTE`** | + `dedicated_circuit_present` prerequisite | Review |
| `oil-furnace-replacement` | Oil Furnace Replacement | Same | **APPOINTMENT** | + tank and oil-line facts outside V1 vocabulary | Review |
| `boiler-replacement` | Boiler Replacement | Same | **APPOINTMENT** | `system_type`, `fuel_type`, `venting_class`, `indoor_location` | Review — hydronic distribution is not modeled in V1 |
| `matched-system-replacement` | Complete System Replacement (Furnace and AC) | Known identity | **APPOINTMENT `[BOTH]`** | Every heating and cooling dimension, plus `lineset_status` | Review — G1 |

### Cooling Equipment — `cooling-equipment`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `ac-condenser-replacement` | Air Conditioner Replacement (Outdoor Unit) | Known identity | **CONDITIONAL → `REMOTE_QUOTE`** | `system_type`, `cooling_tons`, `outdoor_location`, `lineset_status`, `supply_arrangement` | Review |
| `ac-and-coil-replacement` | Air Conditioner and Indoor Coil Replacement | Known identity | **APPOINTMENT `[BOTH]`** | + `indoor_location`, `condensate_route` | Review — G1 |
| `evaporator-coil-replacement` | Indoor Coil Replacement | Known | **APPOINTMENT** | `system_type`, `cooling_tons`, `indoor_location`, `lineset_status` | Review |
| `condenser-relocation` | Move the Outdoor Unit | Known | **APPOINTMENT** | `outdoor_location`, `run_band`, `lineset_status` | Review |
| `condenser-pad-replacement` | Replace the Outdoor Unit Pad | Known | **EXACT** | `outdoor_location`, `equipment_condition` | Priced |
| `lineset-replacement` | Refrigerant Line Set Replacement | Known | **APPOINTMENT `[BOTH]`** | `lineset_status`, both locations, `run_band` | Review — G1 |

### Heat Pumps — `heat-pumps`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `heat-pump-replacement` | Heat Pump Replacement (Outdoor Unit) | Known identity | **CONDITIONAL → `REMOTE_QUOTE`** | `system_type`, `cooling_tons`, `outdoor_location`, `lineset_status`, `control_present` | Review |
| `heat-pump-system-replacement` | Heat Pump System Replacement | Known identity | **APPOINTMENT `[BOTH]`** | + `indoor_location`, `heating_input_btu` (backup heat), `condensate_route` | Review — G1 |
| `dual-fuel-system-replacement` | Dual-Fuel System Replacement | Known identity | **APPOINTMENT `[BOTH]`** | Every heating and cooling dimension | Review — G1 |

### Ductless & Mini-Split — `ductless-mini-split`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `mini-split-single-head-installation` | Mini-Split Installation (One Indoor Unit) | Known | **APPOINTMENT `[BOTH]`** | `head_count`, `indoor_location`, `outdoor_location`, `run_band`, `condensate_route` | Review — G1, and this is where G1 costs the most |
| `mini-split-multi-head-installation` | Mini-Split Installation (Multiple Indoor Units) | Known | **APPOINTMENT `[BOTH]`** | + `head_count` | Review — G1 |
| `mini-split-replacement-existing-lineset` | Mini-Split Replacement | Known | **APPOINTMENT `[BOTH]`** | + `lineset_status` | Review — G1 |
| `mini-split-head-cleaning` | Mini-Split Indoor Unit Deep Cleaning | Known | **EXACT** | `head_count`, `indoor_location` | Priced |
| `mini-split-condensate-pump-installation` | Mini-Split Condensate Pump Installation | Known | **CONDITIONAL** | `head_count`, `indoor_location`, `condensate_route` | Priced or review |

### Indoor Air Quality — `indoor-air-quality`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `uv-lamp-installation` | UV Air Treatment Installation | Known | **CONDITIONAL** | `system_type`, `indoor_location`, `accessory_present`, `dedicated_circuit_present` | Priced or review |
| `uv-lamp-bulb-replacement` | UV Lamp Bulb Replacement | Known | **EXACT** | `accessory_present`, `indoor_location`, `supply_arrangement` | Priced |
| `electronic-air-cleaner-installation` | Electronic Air Cleaner Installation | Known | **CONDITIONAL** | + `filter_slot_size` | Priced or review |
| `media-cabinet-installation` | Media Air Cleaner Cabinet Installation | Known | **CONDITIONAL** | `indoor_location`, `filter_slot_size`, `accessory_present` | Priced or review |
| `air-cleaner-media-replacement` | Air Cleaner Media Replacement | Known | **EXACT** | `accessory_present`, `filter_slot_size` | Priced |
| `duct-mounted-air-purifier-installation` | Duct-Mounted Air Purifier Installation | Known | **CONDITIONAL** | `system_type`, `indoor_location`, `dedicated_circuit_present` | Priced or review |
| `energy-recovery-ventilator-installation` | Fresh-Air Ventilator Installation (HRV/ERV) | Known | **APPOINTMENT** | `system_type`, `indoor_location`, distribution facts outside V1 | Review |

### Humidification — `humidification`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `whole-house-humidifier-replacement` | Whole-House Humidifier Replacement | Known | **EXACT** | `accessory_present`, `replacement_vs_new`, `indoor_location`, `supply_arrangement` | Priced |
| `whole-house-humidifier-installation` | Whole-House Humidifier Installation | Known | **CONDITIONAL** | + water supply, `condensate_route`, `dedicated_circuit_present`, `run_band` | Priced on a resolved branch; review otherwise |
| `humidifier-pad-replacement` | Humidifier Pad Replacement | Known | **EXACT** | `accessory_present`, `filter_slot_size` | Priced |
| `whole-house-dehumidifier-installation` | Whole-House Dehumidifier Installation | Known | **APPOINTMENT** | `indoor_location`, `condensate_route`, distribution facts | Review |

### Filtration — `filtration`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `filter-replacement` | Air Filter Replacement | Known | **EXACT** | `filter_slot_size`, `accessory_present` | Priced — **While We're There only** |
| `filter-cabinet-installation` | Filter Cabinet Installation | Known | **CONDITIONAL** | `indoor_location`, `filter_slot_size`, `system_type` | Priced or review |
| `filter-rack-conversion` | Convert to a Larger Filter Rack | Known | **APPOINTMENT** | `indoor_location`, distribution facts | Review |

### Condensate & Drainage — `condensate-drainage`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `condensate-pump-replacement` | Condensate Pump Replacement | Known | **EXACT** | `condensate_route`, `indoor_location`, `supply_arrangement`, `equipment_condition` | Priced |
| `condensate-pump-installation` | Condensate Pump Installation | Known | **CONDITIONAL** | + `dedicated_circuit_present`, `run_band` | Priced or review |
| `condensate-drain-clearing` | Condensate Drain Line Clearing | Known **when explicitly selected** | **EXACT** | `condensate_route`, `indoor_location` | Priced — but see §G.1: *"my AC is leaking water"* must never reach this |
| `condensate-safety-switch-installation` | Condensate Safety Switch Installation | Known | **EXACT** | `condensate_route`, `indoor_location` | Priced |
| `secondary-drain-pan-installation` | Secondary Drain Pan Installation | Known | **CONDITIONAL** | `indoor_location`, `condensate_route` | Priced or review |

### Air Distribution — `air-distribution`

Q6: ductwork is out of V1 canonical pricing scope. Represented so the concept exists,
priced only where the work is genuinely bounded.

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `supply-register-replacement` | Replace Supply Registers or Return Grilles | Known | **EXACT** | register count, `indoor_location` | Priced |
| `duct-modification-assessment` | Duct Modification Assessment | Unknown | **APPOINTMENT** | `system_type`, `indoor_location` | On-site assessment |
| `return-air-addition-assessment` | Adding a Return Air Path — Assessment | Unknown | **APPOINTMENT** | `system_type`, `indoor_location` | On-site assessment |
| `duct-sealing-assessment` | Duct Sealing Assessment | Unknown | **APPOINTMENT** | `system_type`, `indoor_location` | On-site assessment |

### Maintenance — `maintenance`

Priceable, and §21's separation is structural rather than a sentence: what the visit
**includes** is the service's canonical scope; what may be **discovered** is not part of
it and cannot be auto-priced.

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `ac-tune-up` | Air Conditioner Tune-Up | Known | **EXACT** | `system_type`, `outdoor_location`, system count | Priced |
| `furnace-tune-up` | Furnace Tune-Up | Known | **EXACT** | `system_type`, `fuel_type`, `indoor_location`, system count | Priced |
| `heat-pump-tune-up` | Heat Pump Tune-Up | Known | **EXACT** | `system_type`, `outdoor_location`, system count | Priced |
| `boiler-tune-up` | Boiler Tune-Up | Known | **CONDITIONAL** | `system_type`, `fuel_type`, `indoor_location` | Priced or review |
| `mini-split-tune-up` | Mini-Split Tune-Up | Known | **EXACT** | `head_count`, `indoor_location` | Priced |
| `multi-system-seasonal-maintenance` | Seasonal Maintenance — Multiple Systems | Known | **CONDITIONAL** | system count, `system_type` per system | Priced or review |

### Service Calls — `service-calls`

| Key | Homeowner-facing name | Known? | Suitability | Observable dimensions | Terminal outcome |
| --- | --- | --- | --- | --- | --- |
| `hvac-service-call` | HVAC Service Call | Unknown by definition | **APPOINTMENT** | `system_type` (best-effort), `indoor_location` **or** `outdoor_location`, `reported_symptom` | On-site service call |

**One shell. Q2.** Every symptom in §4C — no cooling, no heat, won't start, weak airflow,
leaking water, strange noise, short cycling, thermostat not controlling, frozen coil,
odor, high humidity, poor comfort, intermittent — converges here.

### Deliberately absent, with reasons

| Not in the catalog | Why |
| --- | --- |
| Capacitor, contactor, blower motor, inducer, igniter, pressure switch, control board replacement | §22. Each is a repair a technician selects after attending. Modeling them now creates the target a symptom would eventually resolve to |
| Anything refrigerant-charge related — leak search, recharge, top-up | The homeowner cannot observe charge, and every route to it runs through a diagnosis |
| Heat exchanger inspection / replacement | The determination is the work. Not a bookable online scope |
| Load calculation / system sizing | A contractor determination (§2), and the input to a replacement quote rather than a service |
| Maintenance agreements and plans | A recurring commercial product, not a service with a scope — Q4 |

---

# B. Family architecture

**Fourteen question families.** Plumbing needs nine for sixty-three services; HVAC needs
five more, and every one of them is an **identity** dimension plumbing has no analogue for
— system type, fuel, venting, cooling capacity, control wiring, refrigerant line set. That
is the honest reason, and it is worth stating because "more families" is otherwise
indistinguishable from drift.

A family is a **manifest**, exactly as in plumbing: the questions, the answer vocabulary,
the canonical fact each answer establishes, and the gate that consumes it. Not a tree.

| Family | Establishes | Gate | Notes |
| --- | --- | --- | --- |
| `system_identity` | `system_type` | `identity_gate` | Asked first on nearly every service. The root fact |
| `heating_equipment` | `fuel_type`, `venting_class`, `heating_input_btu` | `fuel_gate`, `venting_gate`, `capacity_gate` | Three questions, one family — all three are read off the same appliance in the same photograph, the reasoning plumbing used to pair venting with capacity |
| `cooling_equipment` | `cooling_tons`, outdoor unit presence | `capacity_gate` | The outdoor half of the pair |
| `indoor_equipment_access` | `access_class` (indoor) | `access_gate` | **Mutually exclusive with `outdoor_equipment_access`** |
| `outdoor_equipment_access` | `access_class` (outdoor) | `access_gate` | **Mutually exclusive with `indoor_equipment_access`** |
| `existing_control` | `control_present`, `conductor_count`, `common_wire`, `thermostat_count` | `control_gate` | The highest-volume family in the catalog |
| `supply_arrangement` | `supply_arrangement` | — | Policy-keyed. Decisive more often than in plumbing |
| `accessory_and_media` | `accessory_present`, `replacement_vs_new`, `filter_slot_size` | — | One family because they are read off the same cabinet in the same look |
| `distribution_and_zoning` | `zone_count`, `head_count` | — | Quantities, not capacity — §17 |
| `condensate_route` | `condensate_route` | — | Cross-cutting: condensing furnaces, cooling coils and mini-splits all produce water |
| `refrigerant_lineset` | `lineset_status` | — | **Presence and path only.** Size and condition are contractor determinations — Q7 |
| `run_distance` | `run_band` | — | Policy-keyed. Line set, control wire, condensate |
| `existing_condition` | `equipment_condition` | `condition_gate` | **Effect-free**, copied wholesale from plumbing |
| `finish_disruption_ack` | `finish_ack` | — | Conditional disclaimer, copied shape |

## B.1 Gates — seven

| Gate | Reads | `UNKNOWN` | Out-of-coverage |
| --- | --- | --- | --- |
| `identity_gate` | `system_type` | `PHOTO_REVIEW` | `REMOTE_QUOTE` — *"this service covers X; the equipment observed is Y"*. A different job, not an unusual version of this one |
| `fuel_gate` | `fuel_type` | `PHOTO_REVIEW` | `REMOTE_QUOTE` |
| `venting_gate` | `venting_class` | `PHOTO_REVIEW` | `REMOTE_QUOTE` |
| `capacity_gate` | `cooling_tons` **or** `heating_input_btu` | `PHOTO_REVIEW` | `REMOTE_QUOTE` |
| `access_gate` | `access_class` | `PHOTO_REVIEW` | — |
| `control_gate` | `control_present`, `conductor_count` | `PHOTO_REVIEW` | `REMOTE_QUOTE` where the conductors present cannot carry the selected control |
| `condition_gate` | `equipment_condition` | `PHOTO_REVIEW` | `ON_SITE_SERVICE` on active failure. **Effect-free** |

Outcome vocabulary is **plumbing's four, unchanged**: `CONTINUE`, `PHOTO_REVIEW`,
`REMOTE_QUOTE`, `ON_SITE_SERVICE`, translating to the untouched platform `RouteAction`
enum through one total function. **No fifth safety outcome** — §10, and §D.3.

## B.2 `capacity_gate` reads two axes, and they are not interchangeable

Cooling capacity (tons) and heating input (BTU/h) are separate ratings on separate
equipment. A service declares `capacity: { axis: "COOLING" | "HEATING", unit, covers }`,
and a service covering both declares two.

The `covers` values are **standard manufactured ratings** — 1.5 / 2 / 2.5 / 3 / 3.5 / 4 /
5 tons; 40k / 60k / 80k / 100k / 120k BTU. By the continuum test nobody chose these,
manufacturers did, so they are canonical labels exactly as plumbing's `TANK_GALLONS` are —
**not** a policy with `{b1}` holes.

## B.3 `locationScope` — what a service promises, verified

*Superseded 2 September 2026. This section previously described `BOTH` as a
double refusal, which was correct while the platform held one scalar access
state. G1 removed that limitation; the refusal is retired rather than kept as
redundant defense, because a gate whose only meaning is "the platform cannot
represent both facts" would encode a limitation that no longer exists.*

**`locationScope: "BOTH"` means exactly one thing:**

> The service promises physical work at **both** the indoor and the outdoor
> equipment location.

It is a description of the work, verified against the promise. It is **not** a
commercial disposition, and by itself it forces nothing — not `REMOTE_QUOTE`,
not review, not appointment-only.

1. **Both dimensions are in the canonical vocabulary.** `indoor_location` and
   `outdoor_location` are separate facts with separate vocabularies.
2. **Every service declares `locationScope: "INDOOR" | "OUTDOOR" | "BOTH"`**, and
   `location_scope_matches_promised_work` verifies that the declaration covers
   every location where the service promises work. A narrower declaration fails
   the build.
3. **Scoped access represents the two independently.** A `BOTH` service composes
   both access families; `INDOOR_EQUIPMENT` and `OUTDOOR_EQUIPMENT` are
   established separately and neither can overwrite the other.
4. **Each access-dependent reader consumes its explicit slot.** A component or
   disclaimer conditioned on the outdoor route reads `OUTDOOR_EQUIPMENT` and is
   unaffected by anything the indoor route established.
5. **Commercial disposition is a separate question**, decided by the service's
   own observable and unobservable scope drivers — never by location cardinality.
   A service may not remain review-only merely because it declares `BOTH`.

### The permanent worked example — capability, not refusal

**AC Tune-Up.** `locationScope: "BOTH"`, with indoor and outdoor
`maintenanceScope` items — it cleans the condenser coil outside and clears the
condensate drain inside.

```
  Q  Where is the indoor equipment?   →  INDOOR_EQUIPMENT   = ACCESSIBLE
  Q  Where does the outdoor unit sit? →  OUTDOOR_EQUIPMENT  = ACCESSIBLE

  →  both routes established independently, neither displacing the other
  →  both satisfy the service's bounded conditions
  →  FIXED
```

Two locations, one visit, one fixed price, and a declaration that is checkably
true. That is the outcome G1 was raised to make possible.

The service that *cannot* be fixed-priced — Mini-Split Installation — is no
longer an example of this section at all. Its reason is
`lineset_suitability_is_trade_judgment`: whether an existing refrigerant line
set may be reused is a technician's determination, and it would exclude online
pricing on a single-location job just as firmly. See §F.8.

## B.4 The composition rules HVAC inherits

Unchanged from plumbing, because both were found the expensive way there:

- **One authoritative producer per single-valued fact.** `DUPLICATE_FACT_WRITER` —
  which is what makes indoor/outdoor mutual exclusion structural rather than a convention.
- **Every gate input reachable from an actual composed question.** `GATE_WITHOUT_SOURCE` —
  a gate with nothing to read refuses forever, as a review nobody investigates.
- **Composition is authoritative.** A branded `ComposedService`, `composeAll()` refusing as
  a whole, and a tripwire on anything outside `lib/hvac` reaching into `.families`.

---

# C. Shared primitives, and what is genuinely missing

## C.1 Reused unchanged — the seven, and no eighth

| Primitive | HVAC meaning |
| --- | --- |
| `access_classification` | Reaching the equipment. Basement furnace versus attic air handler over a finished ceiling; ground-level condenser versus roof unit |
| `band_policy` | Line-set length, control-wire run, condensate run, how far a replacement may move from where the old unit stood |
| `supply_arrangement` | A homeowner-bought smart thermostat is the commonest customer-supplied item in any residential trade |
| `component_increment` | C-wire adapter, second thermostat, added condensate safety switch, additional mini-split head, secondary drain pan |
| `material_role` | `line_set`, `condensate_pump`, `vent_termination_kit`, `pvc_vent_pipe`, `flue_connector`, `humidifier_pad`, `filter_media`, `thermostat_wire`, `refrigerant_line_insulation` — roles, never part numbers |
| `photo_gate` | HVAC leans hardest of the three trades: nameplate, vent arrangement, thermostat sub-base wiring, filter slot, line-set path are all visible |
| `conditional_disclaimer` | Sentences true only on an attic or finished-ceiling route |

## C.2 Platform machinery reused with no change

`templateProvisioning` (already trade-neutral by construction — takes a
`CanonicalCatalogSource`, installs atomically) · `ContractorTrade.tradeKey` as a validated
`String` · `routeResolver`'s stateless fail-closed resolution · `JobConfiguration` ·
`serviceActivation` and `onboardingReadiness` · `policyBands` with its `{b1}` holes and
`UnresolvedPolicyError` · `AppointmentKind.PRE_WORK` with `PreWorkScopeState`'s four
states · the `TemplatePolicyDefinition` / `ContractorPolicyValue` pair.

## C.3 Genuinely missing — named, **not created**

| Gap | What it is | Status |
| --- | --- | --- |
| ~~**G1**~~ | One access slot; HVAC jobs have two locations | **CLOSED 2 Sep 2026.** Solved by scoped access — `accessBySlot` over `PRIMARY` / `INDOOR_EQUIPMENT` / `OUTDOOR_EQUIPMENT`, accepted on a zero-delta ADR-021 proof |
| **G2** | `findTroubleshootingService` is contractor-scoped, not trade-scoped | **Blocker under Q3.** §D.4 |
| **G3** | `AppointmentKind.SERVICE_CALL` | Plumbing's §2.1. HVAC inherits it and adds nothing |
| **G4** | `ContractorCredential` | Plumbing's §2.2. HVAC adds EPA 608, which is *federal*, not jurisdictional |
| **G5** | Trade-aware emergency screening | Plumbing's §2.3. HVAC's gas and CO patterns **overlap** plumbing's — direct evidence for the union approach plumbing already recommended |
| **G6** | Trade-aware "permit included" sentence | Plumbing's §2.5. **HVAC binds it sooner** — equipment replacement is permitted work and "permit included" is a real posture on it |
| **G7** | A count-shaped `TemplatePolicyType` | New. "How many heads/zones/systems included as standard" has no honest home; `DISTANCE_BREAKPOINTS` with `unit: "heads"` would be a lie in the type |
| **G8** | Nowhere to record a maintenance visit's included scope | New. §21's separation currently has to live in prose. See C.4 |
| **G9** | No branch-level availability; a resolved `SUPPLY_ARRANGEMENT` choice prunes nothing | New, and **live for plumbing today**. See C.5 |
| **G10** | No general "request a quote" escape path in service matching | New. See C.6 |

## C.4 The one metadata addition HVAC proposes — `maintenanceScope`

Not a primitive and not a mechanism: a fifth **declaration** alongside plumbing's four
(`permit`, `photo`, `preWork`, `visit`), carrying the canonical list of what a maintenance
visit includes.

It exists so §21's separation is a property of the data. Without it, "what the tune-up
covers" lives in `shortDescription`, which is customer copy nobody verifies, and "what may
be discovered" has no expression at all — which is precisely the seam a discovered repair
would slip through into an auto-priced line item.

Its complement already exists: a discovery is `PreWorkScopeState.OUT_OF_SCOPE_REVIEW`
applied to a service visit — a conversation, never a reprice.

## C.5 NOT_OFFERED — what exists, and the one piece that does not

Decision 6: *"customer supplies the equipment"* and *"this contractor does not offer this
configuration"* are semantically different, and `SUPPLY_ARRANGEMENT` must not be made to
mean both. Checked against the schema and the resolution path.

**Service-level NOT_OFFERED already exists, and is the right mechanism.**
`Service.offered` is a deliberate four-state model, written because conflating any two of
them has already caused a bug here:

```
provisioned  the row exists — the template installed it
offered      the contractor decided they sell this      ← this field
ready        derived: priced, costed, schedulable, payable
active       publicly live on the storefront
```

A contractor who will not replace furnaces at all leaves `gas-furnace-replacement`
un-offered. **HVAC uses this unchanged and proposes nothing.**

**Branch-level NOT_OFFERED does not exist — G9.** Two findings, the second larger than
the first:

1. `AnswerOption` carries no availability field. There is no way to express *"this
   service is offered, but only in one supply arrangement."*
2. **A resolved `SUPPLY_ARRANGEMENT` choice prunes nothing.** `resolvePolicy` writes the
   contractor's answer to `ContractorPolicyValue.choice` as **free text**, returns
   `optionsRelabeled: 0`, and clears the key from `unresolvedPolicyKeys` so the service
   can publish. Band policies get every dependent label rewritten; choice policies get no
   effect on the tree at all. A contractor who answers *"we supply the equipment"* still
   ships *"I already have it"* to homeowners.

**G9, stated:** *the platform can express whether a service is offered, and cannot express
whether a branch within it is. A `SUPPLY_ARRANGEMENT` answer currently gates publication
and changes nothing a homeowner sees.*

Two notes on scope. This is **not HVAC-specific and not HVAC's to fix** — plumbing has
three `SUPPLY_ARRANGEMENT` policies today and its family manifest is written assuming the
policy prunes the arrangements a contractor does not offer. It is reported to that
workstream, and it is the kind of thing the two-contractor proof is well placed to surface,
since it only becomes visible when a contractor answers the question one way and sees the
other option on their own storefront.

And HVAC does not work around it. `equipment.supply_arrangement` keeps its single honest
meaning — **who brings the equipment** — and the fourth answer some contractors want
(*"we do not fit customer-supplied equipment"*) waits for G9 rather than being smuggled in
as a policy choice string that only prose explains.

## C.6 No quote-request escape path — G10

Checked while deciding whether deferred services could keep their search aliases.
`lib/serviceMatch.ts` has two no-match outcomes and neither is a quote request:

| Outcome | What the homeowner gets |
| --- | --- |
| `unsure` | The service list, to browse |
| `out_of_scope` | *"That's not something we handle through the website. Give us a call and we'll let you know if we can help."* |

**Neither captures a lead**, and for a deferred-but-real service the second is wrong in the
misleading direction: it asserts the contractor does not do the work. Plenty of HVAC
contractors replace boilers and oil furnaces; a storefront saying otherwise turns away a
real customer on Price2Book's word rather than the contractor's.

**Consequence for decision 7.** `oil-furnace-replacement` and `boiler-replacement` ship
**no aliases in V1**. Those searches fall through to `unsure` and the service list — a dead
end, but an honest one, and the contractor's phone number is on the page either way.

**G10, stated:** *there is no outcome meaning "we may well do this, tell us about it" — the
matcher can suggest, clarify, refuse, or give up, and a trade with legitimately deferred
services needs the fifth.* Not HVAC's to build, and not a gate: it degrades a search
result, it does not let anything be booked that should not be.

---

# D. Appointment and safety architecture

## D.1 Three shells — two exist, one is plumbing's outstanding request

| Shell | Purpose | Platform kind | Blocks |
| --- | --- | --- | --- |
| `verification` | Confirms the house matches the bounded scope that was sold. **Never changes the price**; reaching `OUT_OF_SCOPE_REVIEW` opens a change-approval conversation | `PRE_WORK` | Installation |
| `installation` | The work itself. Price2Book does not own second-stage scheduling in V1 | `INSTALLATION` | Nothing |
| `on_site_service` | Where an observed active failure and every reported symptom go. A paid visit that **produces** a scope | **`null`** — needs `AppointmentKind.SERVICE_CALL` (G3) | Pricing |

`platformKind: null` is a deliberate refusal, not an omission: nothing may schedule a
shell the platform cannot carry, and folding it into `PRE_WORK` would silently corrupt
every "was the scope verified" query.

## D.2 One shell, and the symptom rides along — Q2

`hvac-service-call` is the single destination. Thirteen distinct homeowner intents
converge on it, and the distinction that matters is preserved without being acted on:

```
reported symptom  →  hvac-service-call  →  symptom carried as structured intake context
                                        →  selects nothing, prices nothing, implies no component
```

`reported_symptom` is a **closed canonical vocabulary** — `NO_COOLING`, `NO_HEAT`,
`WILL_NOT_START`, `WEAK_AIRFLOW`, `WATER_OBSERVED`, `UNUSUAL_NOISE`, `CYCLING_FREQUENTLY`,
`CONTROL_NOT_RESPONDING`, `ICE_OBSERVED`, `ODOR_OBSERVED`, `HUMIDITY_COMPLAINT`,
`COMFORT_COMPLAINT`, `INTERMITTENT` — and it obeys three rules:

1. **It maps to nothing.** No `SYMPTOM_SCOPE` table exists. There is no structure a repair
   could arrive through, which is why this is architecture rather than discipline.
2. **It is context on the booking**, in the same class as `GateOutcome.observed`: it exists
   so a dispatcher does not start by asking what the homeowner already said.
3. **Its members are appearances, not causes.** `ICE_OBSERVED`, not `FROZEN_COIL`.
   `WATER_OBSERVED`, not `CONDENSATE_BLOCKAGE`. `CONTROL_NOT_RESPONDING`, not
   `THERMOSTAT_FAILED`. The same test `existing_condition` answers pass.

Two shells for No Heat and No Cooling would be more useful to a dispatcher, would change
no booking behavior, and would collide head-on with G2. One shell.

## D.3 Safety — screened before the flow, never as a gate outcome

§10 says not to build an emergency-diagnosis system, and plumbing's answer is the right
one: safety screening runs **before** the flow at the search/intent layer, and its outcome
is *"call us"*, not a route.

HVAC's patterns, deliberately over-inclusive on the same reasoning — a false positive costs
one phone call that might have been a booking; a false negative is somebody scheduling next
Tuesday for a carbon-monoxide alarm:

| Category | Examples of what people type |
| --- | --- |
| Fuel gas | *smell gas*, *smell of propane*, *rotten egg smell*, *gas leak*, *hissing at the furnace* |
| Carbon monoxide | *CO alarm*, *carbon monoxide detector going off*, *headaches and dizziness when the heat runs* |
| Combustion and fire | *smoke from the vents*, *burning smell from the furnace*, *flames outside the burner*, *soot* |
| Electrical | *burning smell*, *sparking at the unit*, *breaker keeps tripping and the wire is hot* |
| Severe combustion damage | *rust and holes in the furnace*, *water in the burner compartment* |

**Two things this must not do.** It must not become a triage tree — one screen, one
message, a phone call. And it must not become a second copy of plumbing's gas patterns:
G5, and the overlap is the argument for the union `serviceMatch` already needs.

## D.4 G2 — flagged for the Plumbing two-contractor proof

**This is a shared-platform blocker under Q3, and it is live today.**

`lib/troubleshooting.ts` resolves the diagnostic destination by role —
`bookingType: TROUBLESHOOT_ONLY, active: true`, scoped to `contractorId` and **not to
trade** — and refuses when it finds more than one:

> `${found.length} active TROUBLESHOOT_ONLY services (...) — which one is the diagnostic
> visit is not decidable`

Electrical's diagnostic and `plumbing-service-call` are both `TROUBLESHOOT_ONLY`. A
contractor enrolled in both trades therefore has two, `loadServiceForResolution` sets
`troubleshootingProblem`, and **every `REROUTE_TROUBLESHOOTING` route resolves to review**.
It fails as a review rather than an error — the category §1.7b already identifies as the
kind nobody investigates.

HVAC adds a third. Under Q3 a contractor in Electrical + Plumbing + HVAC is a valid
platform state, so this must be resolved before HVAC production enrollment — and it is
**not HVAC's to change**.

**What the Plumbing two-contractor proof needs, stated as a gate condition:**

> At least one proof contractor must be enrolled in **more than one trade**, and a
> `REROUTE_TROUBLESHOOTING` route on that contractor must resolve to **that trade's own**
> service call. Two plumbing-only contractors cannot exercise this and would pass the gate
> with the assumption untested.

Treated here as part of the gate before HVAC production enrollment, exactly as instructed.
No shared implementation is changed from this workstream.

---

# E. Decision-tree dimensions — the canonical observable vocabulary

Every dimension passes §8's test: **would a reasonable homeowner know or observe this
without diagnosing the system?** Every closed vocabulary has an `UNKNOWN` member, and
`UNKNOWN` stops rather than defaulting to the common case.

## E.1 Identity

| Fact | Vocabulary | How a homeowner knows |
| --- | --- | --- |
| `system_type` | `FURNACE_AND_AC` · `HEAT_PUMP_SPLIT` · `DUAL_FUEL` · `BOILER_HYDRONIC` · `MINI_SPLIT_DUCTLESS` · `PACKAGE_UNIT` · `AIR_HANDLER_ONLY` · `UNKNOWN` | Described by what is in the house: a furnace in the basement and a box outside; radiators; wall-mounted indoor units; one cabinet outside doing both |
| `fuel_type` | `NATURAL_GAS` · `PROPANE` · `OIL` · `ELECTRIC` · `DUAL_FUEL` · `UNKNOWN` | The utility bill, a propane tank in the yard, an oil tank, or no fuel line at all |
| `venting_class` | `ATMOSPHERIC` · `INDUCED_DRAFT` · `DIRECT_VENT_SEALED` · `NON_COMBUSTION` · `UNKNOWN` | **Vent material and count**: a metal pipe into a chimney; a metal pipe with a fan behind it; one or two white plastic pipes through a side wall; nothing at all |
| `cooling_tons` | 1.5 · 2 · 2.5 · 3 · 3.5 · 4 · 5 · `UNKNOWN` | The outdoor unit's nameplate |
| `heating_input_btu` | 40k · 60k · 80k · 100k · 120k · `UNKNOWN` | The furnace's rating plate |

`venting_class` is worth dwelling on: it is directly observable from *pipe material*, and it
is one of the largest scope drivers in the trade — a sealed-combustion unit needs PVC
venting and condensate disposal that an atmospheric one never had. Asking what the pipe
looks like is an observation; asking whether the system is "high efficiency" is asking the
homeowner to classify their equipment.

## E.2 Location and access

| Fact | Vocabulary | Maps to |
| --- | --- | --- |
| `indoor_location` | `BASEMENT` · `UTILITY_CLOSET` · `GARAGE` · `ATTIC` · `CRAWL_SPACE` · `MECHANICAL_ROOM` · `UNKNOWN` | `AccessClass` |
| `outdoor_location` | `GROUND_LEVEL_ADJACENT` · `GROUND_LEVEL_REMOTE` · `ROOF` · `WALL_OR_BALCONY_MOUNT` · `NONE` · `UNKNOWN` | `AccessClass` |

Exactly one may be composed per service (B.3).

## E.3 Controls

| Fact | Vocabulary |
| --- | --- |
| `control_present` | `PRESENT_WORKING` · `PRESENT_NOT_RESPONDING` · `ABSENT` · `UNKNOWN` |
| `conductor_count` | `2` · `3` · `4` · `5` · `6` · `7` · `8_OR_MORE` · `UNKNOWN` |
| `common_wire` | `PRESENT` · `ABSENT` · `UNKNOWN` |
| `thermostat_count` | integer |

`PRESENT_NOT_RESPONDING` is a **symptom**, and the family routes it to `ON_SITE_SERVICE`
rather than continuing. That the homeowner can select it and still be routed correctly is
the point: the flow accepts what they observed without concluding anything from it.

Counting wires and looking for a blue or C-marked one are observations a homeowner makes
reliably from one photograph. *Whether the thermostat has enough power* is a conclusion,
and no question asks it.

## E.4 Quantity, distribution, condensate, line set

| Fact | Vocabulary |
| --- | --- |
| `zone_count` / `head_count` / `system_count` | integer |
| `condensate_route` | `GRAVITY_DRAIN_PRESENT` · `PUMP_PRESENT` · `NONE_VISIBLE` · `UNKNOWN` |
| `lineset_status` | `PRESENT_VISIBLE` · `PRESENT_CONCEALED` · `NONE` · `UNKNOWN` |
| `filter_slot_size` | printed dimensions, read off the filter |
| `run_band` | `STANDARD` · `EXTENDED` · `OVER_BAND` — policy-keyed |

`lineset_status` is deliberately about **presence and path**, never size, age or
reusability (Q7). A homeowner can see whether an insulated pair of copper lines exists and
roughly where it runs. Whether it may be reused is a contractor determination, and any
replacement on an existing line set therefore leaves automated pricing regardless of the
answer.

## E.5 Arrangement and condition

| Fact | Vocabulary |
| --- | --- |
| `supply_arrangement` | `CUSTOMER_SUPPLIED` · `CONTRACTOR_SUPPLIED` — policy-keyed |
| `replacement_vs_new` | `REPLACEMENT` · `NEW_INSTALLATION` · `UNKNOWN` |
| `accessory_present` | `PRESENT` · `ABSENT` · `UNKNOWN` |
| `equipment_condition` | `SERVICEABLE` · `DEGRADED` · `ACTIVE_FAILURE` · `UNKNOWN` — **effect-free** |

## E.6 Evidence-only facts — read by nothing

| Fact | Why it is here | Why nothing reads it |
| --- | --- | --- |
| `manufacturer` | On the job sheet | A string off a photograph is not a lookup key — §12 |
| `model` | On the job sheet | Same |
| `serial` | On the job sheet | Same |
| **`manufacture_date`** | On the job sheet | **Locked by Q3's instruction.** Age must never itself trigger or recommend replacement — §G.4 |

These sit in the facts record with no gate, no mapping and no consumer. That is what makes
"evidence only" a property of the code rather than a rule in a comment.

## E.7 Policies — the decisions HVAC refuses to make

No defaults. Not a suggested value, not a commented-out one.

| Key | Type | Boundaries | What the contractor is asked |
| --- | --- | --- | --- |
| `lineset_run.breakpoints` | `DISTANCE_BREAKPOINTS` | 2 | What line-set length is included as standard, and above what length it becomes an extended run |
| `control_wire_run.breakpoints` | `DISTANCE_BREAKPOINTS` | 2 | Same, for a new thermostat cable run |
| `condensate_run.breakpoints` | `DISTANCE_BREAKPOINTS` | 1 | How far a condensate line is carried before it stops being standard |
| `equipment_relocation.breakpoints` | `DISTANCE_BREAKPOINTS` | 1 | How far a replacement may move from where the old unit stood and still count as like-for-like |
| `equipment_height.breakpoints` | `HEIGHT_BREAKPOINTS` | 1 | Above what working height an attic or elevated install stops being standard |
| `thermostat.supply_arrangement` | `SUPPLY_ARRANGEMENT` | 0 | Do you supply thermostats, does the customer, or both? |
| `accessory.supply_arrangement` | `SUPPLY_ARRANGEMENT` | 0 | Humidifiers, air cleaners, UV lamps, media |
| `equipment.supply_arrangement` | `SUPPLY_ARRANGEMENT` | 0 | Major equipment — furnaces, condensers, heat pumps. Asked separately, because plenty of contractors will fit a customer's thermostat and will not fit a customer's condenser (Q5) |
| `included_head_count` | **needs G7** | 1 | How many mini-split heads or zones are included as standard |

---

# F. Worked examples

Ten storyboards. Each shows the homeowner's request, the observable questions, the
resolved scope or appointment outcome, and why Price2Book may or may not fixed-price it.
No economics appear; where a placeholder would be needed, none is used.

## F.1 Replace Existing Thermostat — **EXACT**

> *"I want to replace my thermostat."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | Is there a thermostat on the wall now, and does it control the system? | `control_present` |
| 2 | Do you already have the new thermostat, or should one be supplied? | `supply_arrangement` |
| 3 | Take the cover off and count the wires landing on the back plate. How many? | `conductor_count` |
| 4 | Is one of them blue, or marked C? | `common_wire` |
| 5 | How many thermostats are being replaced? | `thermostat_count` |

**Resolution.** `control_present = PRESENT_WORKING`, `conductor_count ≥ 4`, supply
arrangement resolved → priced. `control_present = ABSENT` → this is
`thermostat-new-installation`, a different service. `PRESENT_NOT_RESPONDING` →
`ON_SITE_SERVICE`, because the homeowner has reported a symptom and nobody has established
what it means. Any `UNKNOWN` → `PHOTO_REVIEW` with a sub-base photo requested.

**Why it prices.** Every deciding fact is countable by a person standing in front of the
device, `locationScope: "INDOOR"`, and the work does not vary with anything unobserved.
This is the best-bounded service in the HVAC catalog.

## F.2 Install Smart Thermostat — **CONDITIONAL**

> *"I bought a Nest, can you install it?"*

Same five questions, plus `system_type` — because a smart thermostat on a heat pump needs a
reversing-valve conductor a furnace-and-AC system does not.

**Resolution.**

- `common_wire = PRESENT` and `conductor_count` sufficient for `system_type` → **priced**,
  `supply_arrangement = CUSTOMER_SUPPLIED`.
- `common_wire = ABSENT`, `conductor_count` has a spare → **priced** with the
  `c_wire_adapter` component attached. The component's approved price is the contractor's;
  the identity is canonical.
- `common_wire = ABSENT`, no spare conductor → **`REMOTE_QUOTE`**. New cable through
  finished construction is a run whose length and route nobody has established.
- `UNKNOWN` on either → `PHOTO_REVIEW`.

**Why the branch matters.** This is the whole architecture in one service: the same
homeowner request resolves to a fixed price, a fixed price plus a named increment, or a
review, decided entirely by facts the homeowner counted. Nothing infers *why* a wire is
missing.

## F.3 Replace Condensate Pump — **EXACT**

> *"My condensate pump needs replacing."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | Where is the indoor equipment? | `indoor_location` → `access_class` |
| 2 | Is there a small pump with a plastic reservoir beside or under the equipment? | `condensate_route` |
| 3 | Do you already have the replacement pump? | `supply_arrangement` |
| 4 | Looking at the existing installation, which of these describes it? | `equipment_condition` |

**Resolution.** `PUMP_PRESENT` + resolved access + `SERVICEABLE` → priced.
`NONE_VISIBLE` → this is `condensate-pump-installation`, a different service.
`ACTIVE_FAILURE` → `ON_SITE_SERVICE`, carrying the observation.

**The §22 boundary, in the open.** *"Replace my condensate pump"* is a customer selecting
known work and it prices. ***"My AC is leaking water"* is a symptom, routes to
`hvac-service-call` as `WATER_OBSERVED`, and must never reach this service** — even though
a blocked condensate line is a common cause. That inference is the technician's.

## F.4 AC Tune-Up — **EXACT**

> *"I'd like an AC tune-up before summer."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | What kind of system do you have? | `system_type` |
| 2 | Where is the outdoor unit? | `outdoor_location` → `access_class` |
| 3 | How many cooling systems are being serviced? | `system_count` |

**Resolution.** Priced on all resolved branches. `ROOF` may leave automated pricing
depending on the contractor's height policy.

**The §21 separation, structurally.** The service's `maintenanceScope` declaration is the
canonical list of what the visit includes. **Anything discovered during it is outside that
scope by definition** and reaches `OUT_OF_SCOPE_REVIEW` — a conversation with the
homeowner, never an auto-priced repair. The booking promises the inspection, not its
findings.

**What makes this safe to price.** The scope is defined by the *procedure*, not by the
system's condition. A tune-up on a struggling unit and a tune-up on a healthy one are the
same work; the difference is what the technician then reports.

## F.5 No Cooling — **APPOINTMENT**

> *"My AC isn't cooling."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | *(emergency screen, before any question)* | — |
| 2 | What are you seeing? | `reported_symptom = NO_COOLING` |
| 3 | What kind of system do you have? | `system_type` |
| 4 | Where is the outdoor unit? | `outdoor_location` |

**Resolution.** `hvac-service-call`. A visit is booked, the symptom rides along as intake
context, and the technician establishes the work.

**Why this is a success and not a failure** (§9). Price2Book made a promise it can keep:
somebody competent will attend, at a known time, for a known visit price. The alternative —
resolving `NO_COOLING` to capacitor replacement because that is the common cause — is a
quote for work nobody has seen, and the homeowner finds out on the day.

**What the architecture forbids here.** No question asks whether refrigerant is low,
whether the capacitor is weak, whether the compressor is running or whether the system is
undersized. No answer maps to a component. There is no `SYMPTOM_SCOPE` table for one to
map into.

## F.6 No Heat — **APPOINTMENT**

> *"The furnace isn't heating."*

Identical shape to F.5 with `reported_symptom = NO_HEAT` and `indoor_location`, and the
**same destination** — Q2's single shell. The two differ in exactly one field, and that
field selects nothing.

**The one place this differs meaningfully.** The emergency screen fires harder: *"no heat
and I smell gas"*, *"the CO alarm went off"* and *"there's a burning smell"* all take the
phone-call path before the flow starts. That is a screen, not a triage tree — one message,
one call.

## F.7 Whole-House Humidifier — **CONDITIONAL**

> *"I want a whole-house humidifier."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | Is there a humidifier on the ductwork now? | `accessory_present`, `replacement_vs_new` |
| 2 | What kind of system do you have? | `system_type` |
| 3 | Where is the indoor equipment? | `indoor_location` → `access_class` |
| 4 | Is there a water supply line within reach? | water supply prerequisite |
| 5 | Is there a floor drain or condensate pump nearby? | `condensate_route` |
| 6 | Do you already have the humidifier? | `supply_arrangement` |

**Resolution.**

- `accessory_present = PRESENT` + `REPLACEMENT` → this is
  `whole-house-humidifier-replacement`, and it **prices**: the water, drain, duct opening
  and power already exist and were proven by the unit standing there.
- `NEW_INSTALLATION` with water and drain both present → prices on a resolved branch.
- `NEW_INSTALLATION` with either absent → **`REMOTE_QUOTE`**. A water line and a drain that
  do not exist are runs of unknown length, and `run_band` alone does not bound plumbing
  work in another trade's scope.

**Why replacement and new installation are separate services.** They share a name in
marketing and share almost nothing physically — §11's warning about forcing different
physical scopes into one family because of shared language.

## F.8 Mini-Split Installation — **APPOINTMENT (G1)**

> *"I want a mini-split in my sunroom."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | How many indoor units? | `head_count` |
| 2 | Which wall or ceiling would each go on? | `indoor_location` |
| 3 | Where would the outdoor unit sit? | `outdoor_location` |
| 4 | Roughly how far from the indoor unit to the outdoor one? | `run_band` |
| 5 | Is there an existing line set? | `lineset_status` |
| 6 | Where would the condensate go? | `condensate_route` |

**Resolution. `REMOTE_QUOTE` — on `lineset_suitability_is_trade_judgment`.**

*Revised 2 September 2026. This example previously read "G1 is the only reason",
and that reason is gone: the service declares `locationScope: "BOTH"`, the two
locations are now classified independently, and `BOTH` refuses nothing. What
remains is a genuine scope driver — whether an existing refrigerant line set may
be reused is a technician's determination, and it would exclude online pricing on
a single-location job just as firmly.*

**This is the case that makes G1 concrete.** Every question above is answerable by a
homeowner, every fact is observable, and the scope is genuinely bounded — a single-head
mini-split on a known wall with a known run is one of the better-bounded jobs in the trade.
It cannot be fixed-priced today because the platform holds one access classification and
this job has two that are both worked. **All six answers travel to review**, so the person
pricing it starts from a complete picture rather than from scratch.

If a future platform review scopes access per location, this service is the first to
become fixed-price eligible, with no change to its questions.

## F.9 Furnace Replacement — **CONDITIONAL, `REMOTE_QUOTE` in V1**

> *"I need a new furnace."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | What kind of system do you have? | `system_type` |
| 2 | What fuel does it burn? | `fuel_type` |
| 3 | What leaves the top of the furnace — a metal pipe, or one or two white plastic pipes? | `venting_class` |
| 4 | What input is on the rating plate? | `heating_input_btu` |
| 5 | Where is it? | `indoor_location` → `access_class` |
| 6 | Is there a drain or pump nearby for condensate? | `condensate_route` |
| 7 | Do you already have the furnace? | `supply_arrangement` |
| 8 | Looking at it, which of these describes it? | `equipment_condition` |

**Resolution. `REMOTE_QUOTE` in V1 — Q1.** Every gate runs, every fact resolves, the full
canonical scope is assembled with its material roles, prerequisites and notes, and **the
whole resolved scope travels to review** rather than to a price.

**Why the canonical model is complete anyway.** The dimensions above are what a replacement
genuinely turns on, and modeling them now is what lets a later decision to fixed-price a
bounded branch — say, like-for-like induced-draft in a basement at a standard input, no
relocation, contractor-supplied — be a *policy* change rather than a redesign. The scope
was never the reason for the review; **the commercial promise was**.

**Why V1 does not promise a price.** §5's list is real: efficiency, venting, combustion
air, electrical, condensate disposal, duct sizing, clearances, permits and code-required
changes at replacement. Some resolve from the eight answers; several do not, and the ones
that do not move the number a great deal.

## F.10 Heat Pump Replacement — **CONDITIONAL, `REMOTE_QUOTE` in V1**

> *"I need to replace my heat pump."*

| # | Question | Establishes |
| --- | --- | --- |
| 1 | What kind of system do you have? | `system_type` |
| 2 | What size is the outdoor unit on its nameplate? | `cooling_tons` |
| 3 | Where does the outdoor unit sit? | `outdoor_location` → `access_class` |
| 4 | Is there an existing line set, and can you see where it runs? | `lineset_status` |
| 5 | Is the thermostat being kept? | `control_present` |
| 6 | Do you already have the equipment? | `supply_arrangement` |
| 7 | Looking at it, which of these describes it? | `equipment_condition` |

**Resolution. `REMOTE_QUOTE`.** `locationScope: "OUTDOOR"` — the outdoor-only replacement
avoids G1 and is refused for the Q1 reason instead.

**Why the heat-pump case is not the furnace case.** Two dimensions dominate and neither is
homeowner-observable: whether the indoor coil matches the new outdoor unit, and whether the
existing line set is reusable. `system_type = HEAT_PUMP_SPLIT` with
`lineset_status = PRESENT_CONCEALED` is the commonest real answer and is exactly the state
in which nobody can responsibly quote.

**`heat-pump-system-replacement`, where both units are replaced, is `[BOTH]`** and refuses
for G1 as well as Q1 — two independent reasons, which is the correct number when two
independent things are true.

---

# G. Diagnostic-risk audit

Every place the model could infer a repair, and the structure that prevents it. §7 of the
brief lists the five vectors: symptom, condition, image, equipment age, homeowner guess.

## G.1 Symptom → repair — the largest risk, and the new invariant

**How it would happen.** Not through a decision tree — through the **intent table**.
`lib/serviceMatch.ts` scores a homeowner's sentence against services, and an intent entry
mapping *"AC not cooling"* to `capacitor-replacement` would be one line of data that
converts a symptom into a repair selection with no code change anywhere.

**This is not hypothetical.** `lib/plumbing/intents.ts` contains the pattern today:
`"pilot wont stay lit"` → `water-heater-gas-control-valve-replacement`;
`"disposal humming"` → `garbage-disposal-replacement`; `"toilet keeps running"` →
`toilet-internals-repair`. In plumbing this is defensible — a `SERVICE_SUGGESTION` is
confirmed by the homeowner and never navigates on its own, and the inference range is
narrow. **In HVAC the same pattern is the forbidden move**, because the inference range is
wide and the wrong guess is expensive. *Reported to the plumbing workstream, not changed
from here.*

**Three structural preventions:**

1. **No component-repair services exist to route to.** The catalog contains no capacitor,
   contactor, blower motor, inducer, igniter, pressure switch or control board service.
   §22's "a known selected repair may be modeled later" is a *later* decision, and V1
   declines it precisely so this risk has no target.
2. **Symptom phrases route only to `hvac-service-call` or a service family.** Never to a
   service whose subject is a named component.
3. **A verifier invariant** — new, and HVAC's own:

   > **`intents_do_not_resolve_to_component_repairs`.** For every intent whose phrases
   > match a symptom pattern, the target service key must be `hvac-service-call`, a family
   > landing service, or a service whose subject is an **assembly** rather than a
   > component. A symptom phrase resolving to a component-named service **fails the
   > build**.
   >
   > Implemented as two lists the verifier owns: `SYMPTOM_PATTERNS` (no cooling, no heat,
   > won't start, not working, weak airflow, leaking, noise, cycling, frozen, smells,
   > humid, uncomfortable, intermittent) and `COMPONENT_NOUNS` (capacitor, contactor,
   > compressor, blower, motor, inducer, igniter, thermocouple, pressure switch, control
   > board, relay, transformer, coil, valve, damper, pump). The intersection must be
   > empty. Both lists are the verifier's, so adding a component service later cannot
   > silently widen what a symptom may reach.

   This is stronger than plumbing's `noSelfDiagnosis()`, which checks *copy* and *keys*.
   This checks the **routing table**, which is where the failure actually lives.

## G.2 Condition → repair

**How it would happen.** A `CONDITION_SCOPE` entry attaching a material role or component
to `DEGRADED` — plumbing shipped exactly that once and removed it.

**Prevention.** `CONDITION_SCOPE` is **effect-free** for all four members: empty
`materialRoles`, empty `components`, empty `prerequisites`. The verifier asserts it. The
`existing_condition` family declares no `component_increment` primitive, so there is no
mechanism by which an observation could attach one. Every answer is an appearance —
*"there is visible rust or corrosion"*, not *"the heat exchanger is cracked"* — and the
`DIAGNOSTIC` word list is extended with HVAC's causes: *cracked heat exchanger, low
refrigerant, weak capacitor, failed compressor, bad board, undersized, oversized,
improperly vented, out of code*.

## G.3 Image → repair

**How it would happen.** A Visual Assist taxonomy member that is a verdict, or a field
naming a capability Visual Assist must not have.

**Prevention, mostly already built.** `lib/visual-assist/invariants.ts` refuses fields
containing `diagnos`, `fault`, `defect`, `repair`, `recommend`, `complian`, `hazard`,
`unsafe`, and taxonomy members containing `improper`, `damaged`, `defective`, `needs_`,
`upgrade`, `repair`, `replace`, `recommend`, `violation`, `noncompliant`. Those checks are
trade-neutral and already cover HVAC's obvious failures.

**Two HVAC-specific members to watch when the taxonomy is written**, because they read as
observations and function as verdicts:

- anything naming **frost, ice or rust on a coil** — a real appearance, but one whose only
  use is inferring a cause. Permitted as `ICE_OBSERVED` on the *symptom* vocabulary, which
  maps to nothing; forbidden as an equipment classification, which maps to scope.
- anything naming a **reading** — pressure, temperature split, amperage. A measurement is
  not an appearance, and a photograph of a gauge is a technician's instrument, not a
  homeowner's observation.

## G.4 Equipment age → replacement recommendation

**How it would happen.** Nameplates carry a manufacture date. Visual Assist can read it.
*"Your system is 18 years old"* → *"you should replace it"* is diagnosis by arithmetic, and
it is the most commercially tempting inference in the entire trade.

**Prevention — locked by decision.** `manufacture_date` sits in the facts record alongside
`manufacturer`, `model` and `serial` as **evidence only**: no gate reads it, no mapping
consumes it, no service declares it as a dimension, and nothing derives an age from it.
It reaches the job sheet and stops.

**A verifier assertion to write with it:** no gate's `factKey` and no mapping key may be
any evidence-only fact. That makes "evidence only" a property of the module rather than a
convention, in the same way `CONDITION_SCOPE`'s empty arrays are.

## G.5 Homeowner guess → scope

**How it would happen.** A question that invites a homeowner to classify rather than
observe. §8's bad examples, plus HVAC's own: *"is your system high efficiency?"*, *"is your
system properly sized?"*, *"is the ductwork adequate?"*, and §8's ambiguous
contractor-language: *"is access normal?"*, *"is this a standard installation?"*.

**Prevention.** Every question in §E is phrased as *what do you see* or *what can you
count*. `venting_class` asks what the pipe is made of, not whether the unit is
high-efficiency. `conductor_count` asks how many wires, not whether there is enough power.
`lineset_status` asks whether lines exist and where they run, not whether they can be
reused. And the `noSelfDiagnosis()` scan is extended with the contractor-language phrases —
*normal access*, *standard installation*, *easy to service*, *properly*, *adequate*,
*sufficient* — so a reworded question fails the build rather than a review.

## G.6 Commercial pressure → the priced service next to the shell

**How it would happen.** A no-cool homeowner being offered "AC Tune-Up" because it is the
nearest thing with a price. Nobody has to intend this for it to happen; it is what a
matcher optimizing for a bookable outcome does on its own.

**Prevention.** An appointment shell's route may not offer a priced alternative in the same
step, and no symptom intent phrase may point at a maintenance service. The G.1 invariant
covers the second; the first is a routing rule for whoever wires the shell.

## G.7 Residual risk, and the trigger that reopens it

The G.1 invariant checks the **intent table**, not the model behind `serviceMatch`. A model
scoring a symptom sentence highly against a component service would bypass a table-based
check entirely. What holds today is `serviceMatch`'s own hardest-won rule — a suggestion is
confirmed by the homeowner and never navigates on its own — together with the fact that
V1's catalog contains **no component-repair service to score against**.

> **Recorded trigger (approved, decision 3).** If component-repair services are ever
> introduced — §22's "a known selected repair may be modeled later" — the diagnostic
> protection **must be re-audited at the scoring and matching layer**. It may not be
> assumed to remain sufficient merely because the routing-table invariant still passes.
> The invariant's continued green is evidence about the table, not about the matcher, and
> introducing the target is exactly the change that separates the two.

---

# H. Visual Assist opportunities

Read-only, documented, **not implemented**. HVAC does not modify the Visual Assist
workstream, and HVAC must function with no photograph at all: every canonical question in
§E is answerable manually, which is the property that keeps this an assist rather than a
dependency.

The intended flow, unchanged from plumbing:

```
photo → Visual Assist observable identity → homeowner confirmation → existing HVAC canonical input
```

Never `photo → AI diagnosis → repair selection`.

## H.1 Candidate tasks

| Proposed task | Fields it would return | Binding kind | Value |
| --- | --- | --- | --- |
| `hvac.thermostat.identify.v1` | `control_present`, `conductor_count`, `common_wire` | `GUIDED_ANSWER` on `existing_control` | **Highest.** Counting wires off a sub-base photograph is exactly what a classifier is good at and what a homeowner finds fiddly |
| `hvac.indoor_equipment.identify.v1` | `system_type`, `venting_class`, `fuel_type` | `GUIDED_ANSWER` | High. Vent material and pipe count are visually unambiguous |
| `hvac.outdoor_unit.identify.v1` | `system_type` (heat pump vs straight cool), `cooling_tons` | `GUIDED_ANSWER` + `SERVICE_SUGGESTION` | High. The heat-pump/AC distinction is a *service* distinction, not an answer — the chandelier lesson |
| `hvac.nameplate.read.v1` | `manufacturer`, `model`, `serial`, `manufacture_date`, `heating_input_btu`, `cooling_tons` | `GUIDED_ANSWER` for the two ratings; **evidence only** for the rest | Moderate. Rating plates in dark closets are the hard case |
| `hvac.filter_label.read.v1` | `filter_slot_size` | `GUIDED_ANSWER` on `accessory_and_media` | Moderate, and easy — printed dimensions on a filter edge |
| `hvac.accessory_presence.identify.v1` | `accessory_present` for humidifier / media cabinet / UV | `GUIDED_ANSWER` | Moderate. Decides replacement versus new installation |

## H.2 What every HVAC task must refuse to return

Beyond the invariants already enforced: system condition or serviceability · whether
venting is correct · whether equipment is correctly sized · refrigerant state ·
any age *derived* from a manufacture date · any recommendation, in any field, under any
name.

## H.3 The boundary HVAC would implement on its own side

Identical in shape to `lib/plumbing/visualAssist.ts`, and identical in the rules that
matter: `lib/hvac` imports nothing from `lib/visual-assist`; the adapter lives on the
Visual Assist side; **accepted AND confirmed by a human**, never either alone; no
`confidence` field at the boundary; a source value that does not determine a single
canonical value maps to `UNKNOWN`, never to the more likely candidate; and **a homeowner's
answer always wins** over a confirmed observation, because the price is a promise against
what they asserted.

`manufacture_date` is the one addition to plumbing's shape, and it enters as
evidence-only — the strictest class in the record.

---

# I. Plumbing / Electrical comparison

## I.1 Reused unchanged

The seven primitives · the four-outcome vocabulary and its single total translation to the
platform `RouteAction` enum · the fail-closed gate contract `{action, reason, factKey,
observed}` · families-as-manifests · branded composition with `DUPLICATE_FACT_WRITER` and
`GATE_WITHOUT_SOURCE` · total mappings over closed vocabularies · the pure publish payload ·
appointment shells declaring `platformKind: null` rather than folding into the nearest enum ·
requirement kinds without contractor satisfaction · the four metadata declarations ·
`CONDITION_SCOPE`'s effect-free contract · the pre-work model and its four states ·
policy definitions with `{b1}` holes and no defaults · trade intents plus a pre-flow
emergency screen.

## I.2 Legitimately HVAC-specific

| | Why no analogue exists |
| --- | --- |
| **Matched-pair equipment identity** | Every plumbing fact is single-valued because a water heater is one object |
| **Fuel and venting as separate facts** | Plumbing's `CombustionClass` correctly fuses them for a water heater; a heat pump has no combustion and a dual-fuel system has two answers |
| **Two capacity axes** | Plumbing has gallons. HVAC has tons *and* BTU, on different equipment |
| **`control_gate` and conductor counting** | Nothing in plumbing turns on a low-voltage conductor count |
| **`lineset_status`** | No plumbing analogue, and a large replacement-scope driver |
| **`reported_symptom` as inert context** | Plumbing's service call carries no structured symptom |
| **`maintenanceScope`** | §21 has no plumbing equivalent; plumbing's flush services are single-procedure |
| **Eight gates and fourteen families** | Five of the extra families are identity dimensions; that is the whole difference |

## I.3 Candidates for future shared extraction — **not now**

After HVAC there will be a genuine second instance of several structures that are already
trade-shaped rather than trade-specific:

| Structure | Confidence it generalizes |
| --- | --- |
| Composition — branding, ordering, `DUPLICATE_FACT_WRITER`, `GATE_WITHOUT_SOURCE` | **High.** Neither rule mentions a trade |
| The gate contract and `firstRefusal` | **High.** Pure shape |
| Appointment-shell declaration with `platformKind: null` | **High.** The mechanism *is* the gap-reporting protocol |
| The publish payload builder | **Medium.** Plumbing's is already generic; the trade-specific part is which mapping tables to walk |
| Requirement kinds | **Medium.** Identical shape, disjoint vocabularies |
| The trade emergency screen | **Medium**, and entangled with G5 — the union question has to be settled first |
| Families and primitives themselves | **Low.** The *shape* recurs; the content shares nothing |

**This is not a proposal to extract.** §6 is right that generalizing from one example is
how the wrong abstraction gets frozen, and generalizing from two on the day the second
arrives is barely better. The list exists so the decision is informed when someone makes it,
and it is a platform decision with its own review — not something HVAC does on its way past.

## I.4 What HVAC learned from electrical, which it never touches

Electrical is **extracted** rather than authored, and it contributes lessons rather than
code: the access-synonym bug (six questions, three vocabularies, a component that matched
none of them) is why `UNKNOWN` stops instead of taking the cheaper branch; the chandelier
defect is why a suggestion is confirmed and never navigates; the troubleshooting route
contract is why identity is by **role**, not by slug — and why G2 matters.

---

# J. Recommended V1 scope

Optimized for **trustworthy scope**, not service count (§25). Twenty-three services ship
priceable, twenty-one ship as review or appointment outcomes, eleven defer — 55, the whole
candidate list dispositioned with none left implicit.

## J.1 Ship, fixed-price eligible — 23

*Controls* — `thermostat-replacement`, `smart-thermostat-installation`

*Condensate* — `condensate-pump-replacement`, `condensate-pump-installation`,
`condensate-drain-clearing`, `condensate-safety-switch-installation`

*Maintenance* — `ac-tune-up`, `furnace-tune-up`, `heat-pump-tune-up`, `mini-split-tune-up`,
`multi-system-seasonal-maintenance`

*Humidification* — `whole-house-humidifier-replacement`, `humidifier-pad-replacement`,
`whole-house-humidifier-installation`

*Air quality and filtration* — `uv-lamp-installation`, `uv-lamp-bulb-replacement`,
`air-cleaner-media-replacement`, `media-cabinet-installation`, `filter-cabinet-installation`,
`filter-replacement` *(While We're There only)*

*Cooling and ductless* — `condenser-pad-replacement`, `mini-split-head-cleaning`

*Distribution* — `supply-register-replacement`

**What these have in common** — and it is the test, not the category: a single equipment
location, a scope defined by procedure or by an identity the homeowner can read, and no
branch whose price turns on something nobody has seen.

**One item for the catalog review.** `filter-cabinet-installation` and
`media-cabinet-installation` may be the same physical work under two marketing names —
§11's warning about shared language, pointed at this package's own catalog. Both are
carried here rather than silently merged, because deciding they are one service is a trade
judgment and the catalog review is where it belongs.

## J.2 Ship, routing to review or appointment — 21

**Equipment replacement, canonically complete, `REMOTE_QUOTE`** — `gas-furnace-replacement`,
`electric-furnace-replacement`, `ac-condenser-replacement`, `heat-pump-replacement`
(Q1: full canonical model, no fixed-price promise).

**Blocked by G1 `[BOTH]`** — `matched-system-replacement`, `ac-and-coil-replacement`,
`heat-pump-system-replacement`, `dual-fuel-system-replacement`, `lineset-replacement`,
`mini-split-single-head-installation`, `mini-split-multi-head-installation`,
`mini-split-replacement-existing-lineset`.

**Genuinely unbounded** — `oil-furnace-replacement`, `boiler-replacement`,
`evaporator-coil-replacement`, `condenser-relocation`, `zoning-system-installation`,
`duct-modification-assessment`, `return-air-addition-assessment`, `duct-sealing-assessment`.

**The appointment shell** — `hvac-service-call`, carrying all thirteen symptoms.

## J.3 Defer past V1 — 11

`thermostat-new-installation` and `additional-zone-thermostat-installation` (control runs
through finished construction need `control_wire_run` policy data nobody has yet) ·
`zone-damper-replacement` (§22 component service) · `electronic-air-cleaner-installation`,
`duct-mounted-air-purifier-installation`, `energy-recovery-ventilator-installation`,
`whole-house-dehumidifier-installation`, `filter-rack-conversion`,
`mini-split-condensate-pump-installation`, `secondary-drain-pan-installation`,
`boiler-tune-up`.

`multi-system-seasonal-maintenance` ships (J.1) but **bounded**: priced for two systems,
review above that. The boundary is a contractor allowance and belongs in a policy, not in
this list — see G7, which is the same missing count-shaped policy type.

## J.4 Never, on current architecture

Every component-level repair (§22) · anything refrigerant-charge related · heat-exchanger
work · load calculation and sizing · maintenance agreements (Q4).

## J.5 What must be true before HVAC provisions to anyone

0. ~~**Access can be represented per location**~~ — **G1, SATISFIED 2 Sep 2026.**
   Scoped access shipped and was accepted: two equipment locations are classified
   independently, the three tune-ups' `FIXED` disposition is unblocked, and
   `docs/design/g1-scoped-access.md` carries the proof. No longer a gate.
1. **The Plumbing two-contractor proof passes with at least one multi-trade contractor**,
   and `REROUTE_TROUBLESHOOTING` resolves to that trade's own service call — **G2**,
   §D.4.
2. **`AppointmentKind.SERVICE_CALL` exists** (G3) — HVAC's shell is
   `platformKind: null` until it does, and `hvac-service-call` is where a large share of
   traffic lands.
3. **Emergency screening is trade-aware or unioned** (G5) — an HVAC storefront on the
   electrical screen would take an online booking, three days out, for a carbon-monoxide
   alarm.
4. **`ContractorCredential` exists** (G4) or every gas and refrigerant service is
   knowingly declarative-only. EPA 608 is federal.

Items 2–4 are plumbing's outstanding requests. HVAC adds urgency to all three and new work
to none.

**G9 is not on this list.** A contractor who does not offer a configuration can decline the
whole service via `Service.offered` today; the missing branch-level expression degrades
what a storefront shows, and does not let anything be booked that should not be. Reported
(§C.5), not gating.

---

# Remaining product questions

Q1–Q3 were locked before this package. **Q5 and Q7 are now resolved** by decisions 6 and
5 and are recorded above as settled. Q4, Q6 and Q8 stand on the recommendations below.

**Q4 — Maintenance agreements.** *Assumed: out of scope entirely.* A plan is a recurring
commercial product, not a service with a scope, and modeling one as a service would put a
subscription inside a price book. Single visits only. If agreements are wanted, they are a
**platform** feature (recurring billing, entitlement, scheduling) and not a trade template
one — the canonical model above needs no change either way, which is why this does not
block.

**Q5 — Customer-supplied major equipment. Resolved — decision 6, and §C.5.**
`equipment.supply_arrangement` is a separate policy from thermostats and accessories
because the answers genuinely differ: many contractors will fit a homeowner's thermostat
and will not fit a homeowner's condenser. It keeps its single meaning — **who brings the
equipment** — and is not overloaded.

Whole-service NOT_OFFERED uses `Service.offered`, which already exists and is exactly this
mechanism. **Branch-level NOT_OFFERED has no home, and that is G9** — reported as a small
shared-platform modeling gap rather than absorbed into the policy type. HVAC ships the
question with no default and waits.

**Q6 — Ductwork.** *Assumed and recommended: out of V1 canonical pricing scope.* Represented
as four assessment services so the concept exists in the model and nothing is priced.
Register and grille replacement is the one bounded exception and prices. Duct **sizing** and
**adequacy** stay out entirely — they are contractor determinations, and a question about
them would fail §8.

**Q7 — Line-set reuse. Resolved and locked — decision 5.** `lineset_status` captures
**observable presence and path only**. For V1, replacement work involving an existing line
set stays outside automated fixed pricing **regardless of what the homeowner answers**.
Reusability and suitability are trade judgments and are not inferred.

A bounded branch may be reopened later **only on actual HVAC contractor review** — not on
a modeling argument, and not because the branch would be commercially convenient.

**Q8 — Symptom versus maintenance.** *Recommended and built in:* the symptom wins, the
service call is offered, and the tune-up is never surfaced as a cheaper alternative in that
route. Enforced by the G.1 invariant (no symptom phrase may reach a maintenance service) and
by the routing rule in §G.6.

---

# Completion against §27

| Criterion | State |
| --- | --- |
| Coherent candidate catalog | §A — 55 candidates, 12 categories, exclusions with reasons |
| Known vs unknown classification | §A — per service, with a reason, never inherited from a category |
| Reusable family architecture | §B — 14 families, 8 gates, composition rules inherited |
| Homeowner-observable decision dimensions | §E — every fact passes §8's test; four evidence-only facts read by nothing |
| Non-diagnostic appointment routing | §D.2 — one shell, 13 symptoms, `reported_symptom` maps to nothing |
| Safety-routing boundary | §D.3 — pre-flow screen, one message, no triage tree |
| Worked examples | §F — all ten |
| Initial V1 recommendation | §J — 22 priceable, 21 routed, 12 deferred, 4 gate conditions |
| Shared vs HVAC-specific primitive analysis | §C, §I — seven reused, no eighth, one metadata addition, eight gaps named |
| Visual Assist integration opportunities | §H — six candidate tasks, documented only |
| No unresolved architectural contradiction | See below |

**On the last one, precisely.** There is no contradiction *inside* the model. There are
three **acknowledged external constraints**, each expressed as a refusal rather than
absorbed as a compromise: G1 costs eight services their fixed-price eligibility (§B.3), G2
blocks production enrollment until the Plumbing proof exercises a multi-trade contractor
(§D.4), and G3 leaves the service-call shell unschedulable (`platformKind: null`) until the
enum lands. Each is visible, each fails closed, and none is worked around locally.
