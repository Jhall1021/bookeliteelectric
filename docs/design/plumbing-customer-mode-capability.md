# Plumbing V1 — customer-mode capability report

*2 September 2026. Documentation only. Answers §4.6 of
[guided-estimates.md](guided-estimates.md) (`509eb0c`, D2) for the frozen
Plumbing catalog.*

**Nothing here is implemented.** No schema, no runtime field, no surface, no
contractor control. The Plumbing catalog and code are unchanged; this reads them.

---

## Counts

| Mode | Supported | Excluded |
| --- | --- | --- |
| `PRICE_ONLINE` | **49 / 63** | 14 |
| `GUIDED_ESTIMATE` | **56 / 63** | 7 |
| `ONSITE_VISIT` | **63 / 63** | 0 |

**45 services support all three.** No service supports zero, and no service
excludes `ONSITE_VISIT`. Every exclusion below names a capability fact, never an
outcome.

---

## Governing rule — `isPrimaryEligible` is structural, not economic

Settled 2 September 2026, in favor of the schema contract.

`ADD_ON_ONLY` may exclude `ONSITE_VISIT` **only when the service is inherently an
addition to another visit by scope or product definition** — work that would not
make sense on its own even if a plumber were already standing there for free.

Contractor minimums, travel economics, truck-roll cost, and whether a standalone
visit is profitable are **contractor-owned** and must never determine canonical
capability. The test:

> If travel and minimum-charge economics disappeared entirely, would this still
> inherently be an add-on rather than a valid standalone service?

## The exclusion vocabulary

Five reasons, drawn from the frozen rationale rather than invented. Each names
*the fact that cannot be established*, which is what D2 requires.

| Key | Means |
| --- | --- |
| `CONCEALED_SCOPE` | the deciding fact is behind a finished surface or inside an assembly, and appears only on disassembly |
| `ONSITE_LOCALIZATION` | the work cannot be described until its location is found on site |
| `SUBSURFACE_SCOPE` | the deciding fact is below grade and cannot be observed remotely |
| `UTILITY_COORDINATION` | delivery depends on a third party whose agreement cannot be confirmed remotely |
| `SITING_NOT_ESTABLISHED` | equipment does not exist yet, so its position, route and terminations are not facts about the building |
| `ADD_ON_ONLY` | the work is not sellable as the reason for a dedicated visit |

---

## `PRICE_ONLINE` — 14 exclusions

| Service | Reason | The fact |
| --- | --- | --- |
| `toilet-flange-repair` | `CONCEALED_SCOPE` | "anywhere between a repair ring and cutting into the floor, and which one it is cannot be known until the toilet is off" |
| `shower-valve-body-replacement` | `CONCEALED_SCOPE` | the valve body is behind the wall; its condition and the surrounding pipe are not visible until it is opened |
| `washing-machine-outlet-box-replacement` | `CONCEALED_SCOPE` | the valves and drain sit inside a recessed box in the wall cavity |
| `drain-line-repair-accessible` | `CONCEALED_SCOPE` | the extent of damage along the waste pipe is established by exposing it |
| `whole-home-repipe-assessment` | `CONCEALED_SCOPE` | the run of existing pipe through the structure is not knowable from outside it |
| `gas-leak-locate` | `ONSITE_LOCALIZATION` | "what the repair is cannot be known until the leak is found" |
| `sewer-line-replacement-assessment` | `SUBSURFACE_SCOPE` | "breaking ground is a utility locate, a permit, and a scope that is not knowable from a photograph" |
| `water-service-line-assessment` | `SUBSURFACE_SCOPE` | the supply line between street and building is buried |
| `main-water-shutoff-valve-replacement` | `UTILITY_COORDINATION` | "the street valve has to be closed by the utility, and whether that can be arranged is not something this form can answer" |
| `backflow-preventer-installation` | `UTILITY_COORDINATION` | the device is inspected and certified by an authority outside the booking |
| `tank-to-tankless-conversion` | `SITING_NOT_ESTABLISHED` | "a conversion changes the gas load, the vent path and often the water routing at once. There is no configuration of a web form that bounds that" |
| `heat-pump-water-heater-replacement` | `SITING_NOT_ESTABLISHED` | the unit's clearance and condensate route are not properties of the heater it replaces |
| `gas-line-extension-appliance` | `SITING_NOT_ESTABLISHED` | the pipe run is sized by length and load together, and neither exists until the appliance location is chosen |
| `sump-pump-new-installation` | `SITING_NOT_ESTABLISHED` | there is no pit; where it goes and where it discharges are decisions, not observations |
| `water-softener-new-installation` | `SITING_NOT_ESTABLISHED` | the loop, bypass and drain do not exist until someone decides where they run |

> `REMOTE_QUOTE` and "no priced terminal" are **outcomes** of these facts and are
> not used as reasons anywhere in this table.

## `GUIDED_ESTIMATE` — 5 exclusions

| Service | Reason | The fact |
| --- | --- | --- |
| `sewer-line-replacement-assessment` | `SUBSURFACE_SCOPE` | photographs do not reach below grade |
| `water-service-line-assessment` | `SUBSURFACE_SCOPE` | as above |
| `sump-pump-new-installation` | `SUBSURFACE_SCOPE` | the pit does not exist; the ground it goes into cannot be assessed from images |
| `gas-leak-locate` | `ONSITE_LOCALIZATION` | the deciding fact is the leak's position, found by instrument |
| `plumbing-service-call` | *the visit is the product* | PL-SVC-001 exists to establish a scope nobody has yet; estimating it would presuppose the answer |
| `toilet-flange-repair` | `CONCEALED_SCOPE` | the deciding fact is under the toilet. Photographs of the base, the rocking and the floor give context but do not distinguish a repair ring from a broken flange, damaged piping or subfloor involvement |
| `whole-home-repipe-assessment` | *the visit is the product* | the assessment IS someone attending to establish scope; estimating the assessment would presuppose its result |

**`excavation` is not itself the reason.** It is a work characteristic. Three of
these carry `requires: ["excavation"]` and the reason recorded is
`SUBSURFACE_SCOPE` — the underlying limitation. **No universal rule is asserted**
that excavation implies exclusion; a service that broke ground where the scope
*was* remotely establishable would be judged on its own facts.

## `ONSITE_VISIT` — no exclusions

**Corrected 2 September 2026** under the reopening condition *"a service's actual
trade semantics are proven wrong"*.

Six services were `WHILE_WE_ARE_THERE_ONLY`. None survived the governing rule:
each is a distinct complaint a homeowner would call about on its own — an
inspection flagging a missing expansion tank, a discharging T&P valve, a weeping
supply line, a leaking basket strainer, the classic leak under the sink, banging
pipes. None is work that only makes sense while somebody is already there, which
is the shape an inherent add-on actually takes.

The justification recorded in `metadata.ts` named the service-call minimum —
economics, in a canonical field. All six are now `PRIMARY_ELIGIBLE`, and the
`VisitPosture` documentation carries the structural test instead so the same
confusion cannot be re-introduced by argument.

**Primary-capable is not add-on-incapable.** The flag gates only whether the
minimum applies when a service originates a visit; the While We're There path
reads `whileWeThereBasePrice` regardless. All six keep their add-on behavior.

`WHILE_WE_ARE_THERE_ONLY` remains a valid posture and is currently unused. A
genuine add-on — hauling away an old unit, adding a shutoff while the wall is
open — would still belong to it.

## Fact classification — §5

**Every fact in `lib/plumbing/gates.ts` is a decision fact.** Each is read by a
gate that deterministically changes scope, routing or refusal:

| Fact | Gate |
| --- | --- |
| `access_class` | `access_gate` |
| `shutoff_condition` | `shutoff_gate` |
| `combustion_class` | `combustion_gate` |
| `capacity` | `capacity_gate` |
| `fixture_condition` | `condition_gate` |

**Plumbing has zero estimate-intake facts today**, and that is the clean state
§5 wants preserved. It is true *by construction*: `composeService` refuses a
service whose gate has no question feeding it (`GATE_WITHOUT_SOURCE`), and the
offline gate asserts no question exists that no gate reads. A routing-neutral
`CONTINUE` question collected only for a human to read could not be added today
without failing that check — which is the failure §5 describes, already fenced.

When Guided Estimates lands, intake facts must be carried **separately**. Adding
them to the gate vocabulary would put questions that price nothing into the
pricing engine.

---

## Derivable vs recoverable-only-from-prose

This is the part that decays.

**Mechanically derivable from frozen fields — safe indefinitely:**

- `ONSITE_VISIT` exclusions — `metadata.visit === "WHILE_WE_ARE_THERE_ONLY"`
- `plumbing-service-call`'s `GUIDED_ESTIMATE` exclusion — `bookingType === "TROUBLESHOOT_ONLY"`
- *that* a service excludes `PRICE_ONLINE` — no `RESOLVE_*` terminal in the composed tree
- the decision-fact list — `GATE_FACT` in `lib/plumbing/composition.ts`

**Recoverable only from authored comments — at risk:**

- **all 14 `PRICE_ONLINE` reasons.** Which of the five vocabulary keys applies is
  nowhere in the data. A refactor that tidied `catalog.ts` comments would erase
  it, and §4.6's warning would come true: reconstructing later gives "because it
  wasn't ready", which is exactly what D1 forbids.
- the `SUBSURFACE_SCOPE` distinction. `requires: ["excavation"]` is present, but
  the *reason* — that the deciding fact is below grade — is not, and per the
  refinement above it must not be inferred from `excavation` alone.

**This report is now that record.** Until the reasons become data, it is the
authority, and `catalog.ts` comments are its source.

---

## Resolved — the two former ambiguities

Both settled 2 September 2026, conservatively.

### `toilet-flange-repair` — `GUIDED_ESTIMATE` excluded

`PRICE_ONLINE` ❌ `CONCEALED_SCOPE` · `GUIDED_ESTIMATE` ❌ `CONCEALED_SCOPE` ·
`ONSITE_VISIT` ✅

The decisive condition is literally concealed beneath the toilet. Context photos
do not reveal whether the job is a repair ring, a broken flange, damaged piping
or subfloor involvement — so a contractor still lacks the fact they need to price
it remotely.

> **The discipline this sets.** Collecting useful information is not enough. The
> collected information must be *sufficient for a contractor to make a meaningful
> remote pricing judgment*. Otherwise Guided Estimates degrades into a fancy lead
> form.

A future branch — *"is the toilet already removed and the flange exposed?"* —
could legitimately change this, because it would change the fact available. That
is a canonical refinement to make deliberately, not a reason to overstate the
current generic service.

### `whole-home-repipe-assessment` — `GUIDED_ESTIMATE` excluded

`PRICE_ONLINE` ❌ · `GUIDED_ESTIMATE` ❌ · `ONSITE_VISIT` ✅

The assessment **is** the onsite product: someone attends to establish a scope.

**Do not infer that a repipe PROJECT could not support `GUIDED_ESTIMATE`.** That
is a different canonical service and a different capability question. A
hypothetical `whole-home-repipe` might well support it — house size, floors,
fixture counts, accessible basement or crawl space, existing pipe material,
utility-room context and photographs could plausibly be sufficient. The two must
not be conflated.

This distinction will likely recur: *Equipment Replacement* may support
`GUIDED_ESTIMATE` while *Equipment Replacement Assessment* is inherently onsite.

## Unresolved ownership

None. Both former ambiguities are settled above.

`gas-leak-locate` remains the clearest case in the catalog: the repair scope does
not exist until the leak is located, so both remote modes are excluded and
`ONSITE_VISIT` is the product.
