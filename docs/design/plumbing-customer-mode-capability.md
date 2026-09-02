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
| `GUIDED_ESTIMATE` | **58 / 63** | 5 |
| `ONSITE_VISIT` | **57 / 63** | 6 |

**41 services support all three.** No service supports zero. Every exclusion
below names a capability fact, never an outcome.

---

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

**`excavation` is not itself the reason.** It is a work characteristic. Three of
these carry `requires: ["excavation"]` and the reason recorded is
`SUBSURFACE_SCOPE` — the underlying limitation. **No universal rule is asserted**
that excavation implies exclusion; a service that broke ground where the scope
*was* remotely establishable would be judged on its own facts.

## `ONSITE_VISIT` — 6 exclusions

Corrected from an earlier draft that recorded 63/63. Physical possibility is not
capability: these six are canonically `WHILE_WE_ARE_THERE_ONLY`
(`isPrimaryEligible = false`), meaning **the work is not sellable as the reason
for a dedicated visit**.

| Service | Reason |
| --- | --- |
| `water-heater-expansion-tank` | `ADD_ON_ONLY` |
| `water-heater-tpr-valve-replacement` | `ADD_ON_ONLY` |
| `toilet-supply-line-replacement` | `ADD_ON_ONLY` |
| `sink-drain-assembly-replacement` | `ADD_ON_ONLY` |
| `p-trap-replacement` | `ADD_ON_ONLY` |
| `water-hammer-arrestor-installation` | `ADD_ON_ONLY` |

All six retain `PRICE_ONLINE`: they price perfectly well **as additions to a
visit being made for something else**.

**A tension worth naming.** `TemplateService.isPrimaryEligible` is described in
the schema as "structural, not economic", but Plumbing's own comment justifies
it partly by the service-call minimum — which *is* economics. The canonical
reading is the structural one: the work is an add-on to another visit. If the
platform later decides `isPrimaryEligible` is economic after all, these six move
back to supporting `ONSITE_VISIT` and this table changes.

---

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

## Ambiguous ownership

Two services where the mode set is a product judgment this report does not
settle:

1. **`toilet-flange-repair`.** `PRICE_ONLINE` is clearly out — `CONCEALED_SCOPE`.
   Whether `GUIDED_ESTIMATE` is genuinely useful is unresolved: photographs of
   the base, the rocking and the floor may support a range, or the decisive fact
   may appear only once the toilet is lifted. Recorded as supported; flagged as
   the judgment to make deliberately.
2. **`whole-home-repipe-assessment`.** Modeled as an assessment — the assessment
   is what is sold. Whether that makes it a `GUIDED_ESTIMATE` of the repipe or an
   `ONSITE_VISIT` product in its own right depends on what Guided Estimates
   decides an "assessment" is.

`gas-leak-locate` is **not** ambiguous and is the clearest case in the catalog:
the repair scope does not exist until the leak is located, so both
`PRICE_ONLINE` and `GUIDED_ESTIMATE` are excluded and `ONSITE_VISIT` is the
product.
