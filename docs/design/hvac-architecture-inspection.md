# HVAC — inspection report

*1 September 2026. The §26 first action: what already exists, what HVAC may reuse,
what is genuinely HVAC's, and what must be answered before a catalog is proposed.*

**Nothing here is an HVAC catalog and nothing here is production code.** HVAC is not
provisioned, not in the trade picker, and not referenced by any shared module. This
document exists so the catalog that follows is composed from primitives that already
hold rather than invented alongside them.

---

## Part 0 — What was read

| Layer | Files |
| --- | --- |
| Frozen Plumbing template | `lib/plumbing/{index,primitives,gates,families,metadata,appointments,roles,policies,catalog,composition,publish,mappings,visualAssist,scope,intents}.ts` |
| Its verifier | `scripts/verify-plumbing-template.ts` — `shape`, `composition`, `economics`, `failsClosed`, `publishPayload`, `noSelfDiagnosis`, `totality`, `boundary`, `intents` |
| Shared pricing/routing | `lib/{flow-types,routeResolver,pricing,policyBands,policyResolution,materialResolution,contractorComponents,permitPolicy,troubleshooting,serviceMatch}.ts` |
| Provisioning & readiness | `lib/{templateProvisioning,serviceActivation,onboardingReadiness,pricingReadiness}.ts` |
| Visual Assist boundary | `lib/visual-assist/{tasks,bindings,invariants,taxonomy}.ts` and `docs/design/plumbing-shared-integrations.md` |
| Schema | `prisma/schema.prisma` — `BookingType`, `AccessClassification`, `PhotoState`, `AppointmentKind`, `PreWorkScopeState`, `TemplatePolicyType`, `TemplatePolicyDefinition`, `ContractorPolicyValue`, `TemplateVersion`, `ContractorTrade` |
| Classification law | `docs/decisions/TEMPLATE-CLASSIFICATION-RULES.md` (explicitly written to be trade-agnostic and to serve plumbing *and HVAC*) |

Electrical was read as it actually exists — as `prisma/seed-*.ts` scripts plus
`prisma/template/electrical.{policies,wording}.json`, an **extracted** template — rather
than as a `lib/electrical` module, which does not exist. Plumbing is the only
**authored** template, and it is therefore the shape HVAC follows.

---

## Part 1 — Shared primitives HVAC can reuse

### 1.1 The seven trade primitives — all seven reusable, none needing new mechanism

`lib/plumbing/primitives.ts` declares seven, binds each to a real platform surface, and
says an eighth means the platform is missing something. HVAC needs no eighth.

| Primitive | Platform binding | What it becomes in HVAC | Verdict |
| --- | --- | --- | --- |
| `access_classification` | `AnswerOption.accessClassification` | Reaching the equipment: a basement furnace versus an attic air handler over a finished ceiling; a ground-level condenser versus a roof unit | **Reuse — but see G1.** The three-term vocabulary is right; the *number of slots* is not |
| `band_policy` | `TemplatePolicyDefinition:DISTANCE_BREAKPOINTS\|HEIGHT_BREAKPOINTS` | Line-set length, thermostat-wire run, condensate run, distance a replacement unit moves from where the old one stood | **Reuse unchanged.** HVAC has more band questions than plumbing, not different ones |
| `supply_arrangement` | `TemplatePolicyDefinition:SUPPLY_ARRANGEMENT` | Decisive more often than in either other trade — a homeowner-bought smart thermostat is the single commonest customer-supplied item in residential trades | **Reuse unchanged** |
| `component_increment` | `TemplateAnswerOptionComponent → ContractorComponent.approvedPriceCents` | A C-wire adapter, a second thermostat, an added condensate safety switch, an extra mini-split head | **Reuse unchanged** |
| `material_role` | `TemplateServiceMaterial → CanonicalMaterial` role cost | Named by role — "line-set", "condensate pump", "vent termination kit" — never by part number | **Reuse unchanged** |
| `photo_gate` | `TemplateAnswerOptionPhotoGroup` + `AnswerOption.photosBlockBooking` | HVAC leans on this hardest of the three: nameplate, vent arrangement, thermostat sub-base wiring, filter slot, line-set path are all *visible* | **Reuse unchanged** |
| `conditional_disclaimer` | `ConditionalDisclaimer` / `QuestionDisclaimer` | Sentences true only on a finished-ceiling or attic route | **Reuse unchanged** |

Every one already fails closed as `REVIEW` or `BLOCK_PUBLICATION`. HVAC inherits that
without argument.

### 1.2 Platform machinery HVAC reuses without touching

- **`lib/templateProvisioning.ts` is already trade-neutral and says so.** It takes a
  `CanonicalCatalogSource`, never reads `TemplateService` rows directly, and installs the
  whole catalog in one transaction. Electrical reads template rows; Plumbing composes
  through `composeAll()`. HVAC is a third source of the same shape and needs **no change
  to the orchestrator**.
- **`ContractorTrade.tradeKey` is a `String`** validated against distinct published
  template trades. `"hvac"` becomes enrollable the moment an HVAC `TemplateVersion` is
  published — no schema change, and no change before then.
- **`lib/routeResolver.ts`** — stateless, fail-closed, server-only pricing. "Uncertain
  scope = review; known scope = the engine prices it" is the rule HVAC's whole
  non-diagnosis posture rests on, and it is already the platform's rule.
- **`lib/pricing.ts` / `JobConfiguration`** — HVAC contributes canonical roles and
  component keys and reads no number, exactly as `lib/plumbing/scope.ts` does.
- **`lib/serviceActivation.ts` + `lib/onboardingReadiness.ts`** — trade-neutral, derived
  never stored, one activation authority. A service that could quote a price with no
  approved price cannot go live. HVAC needs nothing here.
- **`lib/policyBands.ts`** — `{b1}` holes, whole-set validation, `UnresolvedPolicyError`
  rather than a rendered hole. Reused verbatim.
- **`AppointmentKind.PRE_WORK` / `PreWorkScopeState`** — the four-state model
  (`PENDING_VERIFICATION` → `STANDARD_SCOPE_VERIFIED` | `OUT_OF_SCOPE_REVIEW` →
  `EXCEPTION_RESOLVED`) is exactly what HVAC equipment replacement needs, and the rule
  that *the visit never changes the price* is already enforced.

### 1.3 The Visual Assist boundary — reused as a contract, not extended

`lib/plumbing/visualAssist.ts` is the pattern, and HVAC copies its **shape**:

- structural typing only — `lib/hvac` would import nothing from `lib/visual-assist`;
- the two-key rule (`accepted` **and** `confirmedByHuman`), no `confidence` field;
- **a customer answer always wins** over a confirmed observation;
- a source value that does not determine a *single* canonical value maps to `UNKNOWN`,
  never to the more common candidate;
- manufacturer/model carried as **evidence only**, never a gate input, never a lookup key.

`lib/visual-assist/invariants.ts` already refuses taxonomy members that are verdicts
(`improper`, `damaged`, `defective`, `needs_`, `upgrade`, `repair`, `replace`,
`recommend`, `violation`, `noncompliant`, `unsafe`, `hazard`) and fields naming forbidden
capabilities (`diagnos`, `fault`, `defect`, `repair`, `recommend`, `complian`). **Those
checks are trade-neutral and already cover the HVAC failure modes** — an
`IMPROPERLY_VENTED` or `NEEDS_REPLACEMENT` member cannot be registered today.

### 1.4 Plumbing's own architecture, reused as a shape rather than as code

Eight structures in `lib/plumbing` are trade-shaped, not trade-specific: gates returning
`{action, reason, factKey, observed}`; families as manifests; branded `ComposedService`
with `DUPLICATE_FACT_WRITER` / `GATE_WITHOUT_SOURCE` refusals; total mappings over closed
vocabularies; a pure publish payload; appointment shells that declare `platformKind: null`
rather than folding into the nearest enum; requirement kinds without contractor
satisfaction; a trade emergency screen plus intent phrases.

**HVAC should re-author these in `lib/hvac`, not extract them into a shared module yet.**
§6 is explicit, and it is right: extraction before the second real instance generalizes
from one example. After HVAC exists, *three* of those eight will be structurally identical
across two authored trades — **that** is when extraction becomes arguable, and it is a
platform decision with its own review, not something HVAC does on its way past.

---

## Part 2 — Genuine HVAC-specific needs

Each of these fails the "is this already a shared primitive?" test honestly — the
mechanism exists, the *fact* does not.

**2.1 Equipment identity is a pair, not a scalar.** Every fact in `PlumbingFacts` is
single-valued per job because a water heater is one object. A split system is two objects
that must match — an indoor furnace or air handler and an outdoor condenser or heat pump —
and a great many HVAC scopes turn on the *relationship* between them, not on either alone.
This is the largest genuinely new modeling requirement, and it is what drives G1 below.

**2.2 Fuel source and combustion arrangement are two facts, not one.** Plumbing's
`CombustionClass` fuses them (`GAS_ATMOSPHERIC`, `GAS_POWER_VENT`, `GAS_DIRECT_VENT`,
`ELECTRIC`) and that is correct for a water heater. It is wrong for HVAC: a heat pump has
no combustion at all yet is not "electric" in the way an electric furnace is, and a
dual-fuel system is both. HVAC needs `fuel_source` and `venting_arrangement` as separate
closed vocabularies, each with its own `UNKNOWN`.

**2.3 Two capacity axes that are not interchangeable.** Cooling capacity (tons) and
heating input (BTU/h) are separate ratings on separate equipment. §17 is right that
capacity is identity rather than quantity — and, by the continuum test, standard
manufactured ratings are **canonical labels** exactly as `TANK_GALLONS` is. Nobody chose
1.5 / 2 / 2.5 / 3 tons; manufacturers did.

**2.4 Control wiring conductor count.** The highest-volume HVAC service (thermostat
replacement) turns on one observable: how many wires land on the existing sub-base, and
whether one of them is a common. It is countable by a homeowner from a photograph, it is
the difference between a 20-minute swap and running new cable through a finished wall, and
it is the fact most likely to be *guessed* if no gate exists for it. It has no plumbing
analogue and needs its own family and its own gate.

**2.5 Head count and zone count.** Quantities with real scope consequences. Distinct from
capacity (2.3) and from each other.

**2.6 Line-set presence, size and reuse.** A replacement that reuses an existing line set
and one that runs a new one are different jobs. This is genuinely HVAC's, and it is also
the fact a homeowner is *least* able to observe reliably — flagged as a product question
(Q7) rather than assumed into the model.

**2.7 Accessory presence.** "Is there already a humidifier / media cabinet / UV lamp
here?" is the replacement-versus-new-installation distinction for a whole service family,
and it is observable. Plumbing has no equivalent because a faucet's predecessor is always
present.

**2.8 A maintenance visit's included scope.** §21 requires that what a tune-up *includes*
be separable from what may be *discovered*. No current metadata field expresses this — see
G8.

---

## Part 3 — Diagnostic-risk areas, ranked by how likely they are to happen

**R1 — A symptom search phrase routing to a component replacement. The single largest
risk, and it already has a precedent in the codebase.**

`lib/plumbing/intents.ts` maps symptoms onto specific component-replacement services:
`"water heater not heating"` → `water-heater-element-thermostat-replacement`;
`"pilot wont stay lit"` → `water-heater-gas-control-valve-replacement`;
`"toilet keeps running"` → `toilet-internals-repair`; `"disposal humming"` →
`garbage-disposal-replacement`.

In plumbing this is defensible: a `SERVICE_SUGGESTION` is confirmed by the customer and
never navigates on its own (`docs/design/plumbing-shared-integrations.md` §1.7), and the
inference range is narrow. **In HVAC it is not defensible**, because the equivalent
mapping is `"AC not cooling"` → `capacitor replacement`, which §2 of the HVAC brief names
as the exact forbidden move. The gap is one of degree that becomes one of kind.

- *Reported, not fixed.* The plumbing intents are the plumbing workstream's to judge, and
  editing them from here would break the parallel-session rule.
- *HVAC's own rule:* a symptom phrase may route only to a service family or an appointment
  shell, never to a service whose subject is a named component — and that must be a
  **verifier invariant**, not a convention. Plumbing has no such check today; HVAC needs
  one and it is new.

**R2 — An observed condition selecting work.** Plumbing already solved this and the
solution is copyable wholesale: `CONDITION_SCOPE` is *effect-free* for every member, the
verifier asserts empty roles/components/prerequisites, and the earlier version that
attached a repair coupling to `DEGRADED` is documented as the boundary being crossed. HVAC
reuses the pattern verbatim.

**R3 — Equipment age becoming a replacement recommendation.** HVAC-specific and new.
Nameplates carry a manufacture date, Visual Assist can read it, and "your system is 18
years old" → "replace it" is diagnosis by arithmetic. **Defense:** a date is *evidence*
in the same class as `manufacturer` and `model` — carried to the job sheet, readable by
no gate, and mapped by nothing.

**R4 — Model-number lookup becoming pricing authority.** §12. Plumbing's rule is already
written: a model number is a string read off a photograph, and treating it as a lookup key
opens the injection surface `lib/visual-assist/observation.ts` warns about. Derived
equipment metadata, if it ever exists, is a third category and must not silently become
canonical scope.

**R5 — Visual Assist verdict members.** Largely pre-defended: `invariants.ts` would
already refuse `IMPROPERLY_VENTED`, `NEEDS_REPLACEMENT`, `UNDERSIZED_SYSTEM`,
`REFRIGERANT_LEAK`. Two HVAC candidates deserve a second look when the taxonomy is
written, because they read as observations and function as verdicts: anything naming
*frost*, *ice* or *rust* on a coil, and anything naming a *reading* (pressure, temperature
split) rather than an appearance.

**R6 — The priceable service standing next to the appointment shell.** A no-cool customer
being offered "AC Tune-Up" because it is the nearest thing with a price is the commercial
pressure this architecture exists to resist. §25 says it plainly. **Defense:** an
appointment shell's route may not offer a priced alternative in the same step, and a
tune-up must never be reachable *from* a symptom intent.

**R7 — Contractor-language questions.** §8. "Is access normal", "is this a standard
install", "is the unit easy to service". Every one is a contractor's judgment wearing a
homeowner question's clothes. **Defense:** the existing `noSelfDiagnosis()` verifier
pattern — scan customer-facing strings for a forbidden vocabulary — extended with these.

**R8 — Maintenance discovering repairs.** The visit legitimately finds things. The booking
must promise only the defined scope, and the finding must open a conversation rather than
auto-price a repair. Structurally this is `PreWorkScopeState.OUT_OF_SCOPE_REVIEW` applied
to a different appointment kind — the mechanism exists.

**R9 — Two emergency screens on one storefront.** A contractor doing plumbing and HVAC has
two gas-smell pattern sets. Plumbing already recommended the union rather than a per-trade
switch; HVAC's carbon-monoxide and combustion patterns make that recommendation stronger,
not weaker.

---

## Part 4 — Proposed V0 structure

**A naming clarification the brief's §11 and §23B collapse together, and which matters:**
plumbing has **eleven categories** (presentation, contractor-renameable) and **nine question
families** (reusable manifests of observable questions). §11's "service families" are
categories; §23B's "family architecture" is question families. HVAC needs both and they
are not the same list.

### 4.1 Question families — hypothesis, ~11

| Family | Establishes | Gate |
| --- | --- | --- |
| `system_identity` | `system_type` — furnace+AC, heat pump, boiler, mini-split, package unit | `identity_gate` |
| `fuel_source` | `fuel_type` — natural gas, propane, oil, electric, dual-fuel | `fuel_gate` |
| `venting_arrangement` | `venting_class` — atmospheric, induced/power, direct/sealed, none | `venting_gate` |
| `equipment_capacity` | `cooling_tons`, `heating_btu` — nameplate ratings | `capacity_gate` |
| `indoor_equipment_location` | `access_class` (indoor) | `access_gate` |
| `outdoor_equipment_location` | `access_class` (outdoor) — **blocked by G1** | `access_gate` |
| `existing_control` | `control_present`, `conductor_count`, `common_wire_present` | `control_gate` |
| `supply_arrangement` | `supply_arrangement` | — |
| `run_distance` | `run_band` — line set, control wire, condensate | — (band policy) |
| `accessory_presence` | `accessory_present`, `replacement_vs_new` | — |
| `existing_condition` | `equipment_condition` — **observation only, effect-free** | `condition_gate` |
| `unit_count` | `head_count`, `zone_count` | — |

Gates: `identity_gate`, `fuel_gate`, `venting_gate`, `capacity_gate`, `access_gate`,
`control_gate`, `condition_gate`. Seven, each fail-closed on `UNKNOWN`, each carrying the
fact key and the observation onto its refusal.

Outcome vocabulary: **the same four plumbing uses** — `CONTINUE`, `PHOTO_REVIEW`,
`REMOTE_QUOTE`, `ON_SITE_SERVICE` — translating to the unchanged platform `RouteAction`
enum in one total function. **No fifth "safety" outcome.** §10 says not to build an
emergency-diagnosis system, and plumbing's answer is right: safety screening runs *before*
the flow, at the search/intent layer, and its outcome is "call us", not a route.

### 4.2 Service categories — hypothesis, ~10

Thermostats & Controls · Heating Equipment · Cooling Equipment · Heat Pumps ·
Ductless & Mini-Split · Indoor Air Quality · Humidification · Filtration ·
Condensate & Drainage · Maintenance · Service Calls

Ductwork is deliberately absent pending Q6. "Equipment Replacement" is deliberately absent
as a category — replacement belongs inside Heating/Cooling/Heat Pumps, because filing it
separately invites a category of services whose common property is *being expensive and
under-specified*.

### 4.3 Appointment shells — hypothesis, 2 + 1

`verification` (`PRE_WORK`, exists), `installation` (`INSTALLATION`, exists), and one
`on_site_service` shell requiring the same `AppointmentKind.SERVICE_CALL` plumbing already
asked for. **One service-call shell, not two** — see Q2, and see G2 for why two would be
actively harmful today.

---

## Part 5 — Shared-platform gaps

Reported, not worked around. Three are new; four are plumbing's, already filed, that HVAC
inherits and in two cases makes more urgent.

**G1 — One access slot per job, and HVAC jobs have two locations. NEW, and the largest.**

`JobConfiguration.accessClass` is a single `AccessClass | null` that "once set, persists".
`composeService` refuses any service where two families write the same fact
(`DUPLICATE_FACT_WRITER`) — **unconditionally, because no merge rule exists**. Plumbing hit
this with sixteen services composing both `fixture_access` and `drain_route`, resolved it
by deciding one route is *the* route per service, and wrote down that a service genuinely
needing two classified routes "is asking for a platform change, not a second family."

**A split-system HVAC job is that service, structurally.** An attic air handler over a
finished ceiling with a ground-level condenser is `FINISHED` and `ACCESSIBLE`
simultaneously, and neither answer is the job's access. HVAC cannot resolve this the way
plumbing did, because the two locations are not alternatives — both are worked on, in the
same visit, at the same price.

*Not solvable HVAC-locally.* Options are a platform change (a keyed access map, or a
second slot), or an HVAC catalog restricted in V1 to single-location work. That is a
product and platform decision, and it is the largest single input to V1 scope.

**G2 — `findTroubleshootingService` refuses for any multi-trade contractor. NEW, and it is
live today, before HVAC exists.**

`lib/troubleshooting.ts` finds the contractor's diagnostic visit by role —
`bookingType: TROUBLESHOOT_ONLY, active: true`, scoped to `contractorId` and **not to
trade** — and refuses when it finds more than one:

> `${found.length} active TROUBLESHOOT_ONLY services (...) — which one is the diagnostic
> visit is not decidable`

Electrical's diagnostic and Plumbing's `plumbing-service-call` are both
`TROUBLESHOOT_ONLY`. **A contractor enrolled in both trades therefore has two, and every
`REROUTE_TROUBLESHOOTING` route resolves to review** — `loadServiceForResolution` sets
`troubleshootingProblem` and the resolver refuses. The failure is a review rather than an
error, which is the category `docs/design/plumbing-shared-integrations.md` §1.7b already
identifies as the kind nobody investigates.

This is not an HVAC problem; **HVAC is the third instance of it**, and the Plumbing
two-contractor proof is the correct place for it to surface. Flagging it here because that
proof is the stated gate before HVAC moves, and it will only catch this if at least one
proof contractor is enrolled in electrical *and* plumbing. If both proof contractors are
plumbing-only, the gap passes the gate untested.

**G3 — `AppointmentKind.SERVICE_CALL`.** Plumbing's §2.1, unchanged. HVAC inherits the
identical need and adds nothing to the argument. Not re-filed.

**G4 — `ContractorCredential`.** Plumbing's §2.2. HVAC strengthens it materially: EPA
Section 608 certification for refrigerant handling is *federally* required in the US, not
jurisdictional, which makes it the least ambiguous member the model will ever hold and the
best argument that "declarative only" is not a durable resting state.

**G5 — Trade-aware emergency screening.** Plumbing's §2.3. HVAC's carbon-monoxide, gas-odor
and combustion patterns **overlap plumbing's**, which is direct evidence for the union
approach plumbing already recommended over a per-trade switch. Two trades authoring
near-identical gas patterns is the drift `serviceMatch` exists to prevent.

**G6 — A trade-aware "permit included" sentence.** Plumbing's §2.5. Plumbing declares
`EXCLUDED` on every service so the sentence never binds. **HVAC will bind it sooner**:
equipment replacement is permitted work in most jurisdictions and "the permit is included"
is a real posture contractors take on it. `PERMIT_INCLUDED_DISCLAIMER` currently reads
*"The electrical permit for this work…"*.

**G7 — A count-shaped policy type. NEW, candidate.** `TemplatePolicyType` has three
members and none expresses "how many are included as standard" — how many mini-split heads,
zones or thermostats before the price steps. Reusing `DISTANCE_BREAKPOINTS` with
`unit: "heads"` would be a lie in the type. Flagged as *likely* rather than certain; it
resolves during catalog design once the actual band questions are written.

**G8 — Nowhere to record what a maintenance visit includes. NEW.** §21 requires the
included scope and the may-be-discovered scope to be separable, and no current metadata
field carries either. `PreWorkScopeState` is the right *shape* for the discovery half;
the included half has no home. Small, and worth naming before a tune-up service is written
with the answer buried in `shortDescription`.

---

## Part 6 — Product questions that block catalog design

Ordered by how much of the catalog each one moves.

**Q1 — Does HVAC V1 attempt equipment replacement at all?**
§5 says be conservative; §23J asks for a recommendation. *My recommendation:* replacement
is modeled canonically in V0 and ships as `REMOTE_QUOTE` in V1 — the scope is real and
nameable, and pretending otherwise loses the model, but no configuration of a web form
bounds it. Blocks: roughly a third of the candidate catalog and most of the capacity work.

**Q2 — One service-call shell or two (No Heat / No Cooling)?**
§20 prefers neutral reusable outcomes. *My recommendation:* one, named for what happens
rather than for the season. Two would be more useful to a dispatcher and would collide
head-on with G2. Blocks: the appointment architecture and the intent routing table.

**Q3 — Is the HVAC target a specialist HVAC contractor or a multi-trade shop?**
This decides whether G2 is a V1 blocker or a later one, and whether G1's single-location
restriction is survivable. Blocks: V1 scope sizing.

**Q4 — Does Price2Book sell maintenance *agreements*, or only single maintenance visits?**
A plan is a recurring commercial product, not a service with a scope, and modeling one as
a service would put a subscription inside a price book. *My assumption absent an answer:*
single visits only; agreements are out of scope for the trade model entirely.

**Q5 — Is customer-supplied *major equipment* an allowed arrangement?**
The `SUPPLY_ARRANGEMENT` policy already lets a contractor answer per category, and
plumbing already split fixtures from water heaters for exactly this reason. HVAC's version
carries a liability question plumbing's does not — many contractors will not warrant a
homeowner's own condenser. *My assumption:* the policy exists per category and the answer
is the contractor's; the template asks and never assumes.

**Q6 — Is ductwork in canonical V1 scope at all?**
Duct modification is where HVAC scope becomes genuinely unbounded. *My recommendation:*
out of V1 canonical scope; it routes to assessment. Blocks: whether a Ductwork category
exists.

**Q7 — Is line-set reuse a canonical fact, given a homeowner usually cannot observe it?**
It changes replacement scope enormously and fails the §8 test ("would a reasonable
homeowner know this without diagnosing?"). *My inclination:* it is a photo-gated fact at
best and a review trigger at worst — but this is a real trade judgment and I should not
make it alone.

**Q8 — What happens when a homeowner describes a symptom and a maintenance service exists
for the same equipment?**
The R6 pressure, stated as a policy question. *My recommendation:* the symptom wins, the
shell is offered, and the tune-up is never surfaced as the cheaper alternative in that
route.

---

## What happens next

On answers to Q1–Q3 (the three that move scope), the §23 architecture package follows:
candidate catalog with pricing-suitability classification, family architecture, the ten
worked examples, the diagnostic-risk audit, Visual Assist binding opportunities, and the
V1 recommendation. Nothing is provisioned, nothing enters the trade picker, and no shared
file is edited, until the Plumbing two-contractor proof has confirmed the multi-trade
provisioning architecture — and G2 says that proof has one more thing to confirm than it
may currently be set up to.
