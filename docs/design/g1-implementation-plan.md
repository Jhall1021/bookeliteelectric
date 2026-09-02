# G1 — implementation plan

*2 September 2026. Written after platform-owner approval, **before any shared file is
modified.** Branch: `feat/g1-scoped-access`, cut from the review snapshot `cd31df8`
(1 commit ahead of `main` at `3fbd2d5`). The review branch ref does not move.*

Six semantic decisions surfaced that are **not** mechanical consequences of the approved
design. They are §1, and per the approval they come back before implementation.

---

## 0. Corrections carried in, and verified against the code

| # | Correction | Verified |
| --- | --- | --- |
| 1 | Slot belongs on **`CanonicalDisclaimer.accessSlot`**, not deprecated `ConditionalDisclaimer` | **Confirmed, and my proposal was wrong.** `ConditionalDisclaimer` is documented "DEPRECATED and now UNATTACHED". `app/api/services/[slug]/route.ts` resolves *both* `conditionalHelp` (:168–176) and `conditionalDisclaimers` (:217–224) through `contractorDisclaimer.canonicalDisclaimer` into `disclaimerAccessClass()`, which reads `CanonicalDisclaimer.accessClass`. One field serves both DTO paths |
| 2 | `accessBySlot` is a **partial** map; missing ≠ `UNKNOWN` | Adopted. See §2.3 |
| 3 | Derive `referencedAccessSlots` from the tree, not an authored list | Adopted, with a derivation rule that is itself a decision — **§1.3** |
| 4 | `accessFinishedDisclaimer` is `(PRIMARY, FINISHED)` compatibility only | **Confirmed.** `AnswerOption.accessFinishedDisclaimer` (schema:2052) is read only in `QuestionStep.tsx:157` gated on `accessClass === "FINISHED"` |
| 5 | ADR-021 is zero-delta, not "276 forever" | Adopted. Baseline captured from this branch's own pre-G1 state |
| 6 | Parallel rule: `accessClass === accessBySlot.PRIMARY`, fail loudly | Adopted. See §2.6 |
| 7 | Duplicate same-slot write fails closed; different slots coexist | Adopted — but *how* a pure function refuses is **§1.1** |
| 8 | `location_scope_matches_promised_work` independent of G1 | Adopted — but it has a sequencing problem, **§1.6** |
| 9 | Implement on a fresh branch, verify tree **and** commits before pushing | Done; branch created as above |

---

## 1. New semantic decisions — brought back before implementation

### 1.1 How a pure accumulator refuses a duplicate same-slot write

`applyBranch` is a pure function returning a `JobConfiguration`. It has **no refusal
channel**. Correction 7 requires a duplicate same-slot write to fail closed, so one must be
added.

**Recommendation — follow the pattern already in the config.** `JobConfiguration` already
carries exactly this shape twice: `awaitingComponentApproval` and
`awaitingComponentMaterialCost` are flags set during accumulation that force
`resolveRoute` to return `REVIEW`. Add a third:

```ts
/** A second answer tried to write a slot already written. Never resolved silently. */
accessSlotConflict: AccessSlot | null
```

`resolveRoute` reads it and returns `REVIEW` with an operator-facing reason. Throwing
instead would turn a data defect into a 500 rather than a review, and the codebase's stated
rule is that our own bugs are uncertain scope.

**What needs deciding:** the operator-facing reason string, and confirmation that a
conflict is a `REVIEW` rather than an `INVALID`. Recommendation: `REVIEW`, because
`INVALID` is reserved for routes that cannot be replayed at all.

### 1.2 Where the slot-writer rule lives

> **Outcome:** `one_access_writer_per_slot` was rejected on evidence — see
> `g1-scoped-access.md`. The rule that shipped is cross-slot isolation plus
> reviewed same-slot refinement, and the recommendation below held: nothing was
> extracted, `lib/plumbing` was not touched, and the verifier is the shared
> enforcement point.

There is **no shared composition module.** `composeService` lives in `lib/plumbing/composition.ts`
and is trade-local; HVAC would have its own. Implementing per-slot composition means either
two implementations of a platform invariant, or an extraction.

**Recommendation — do not extract now.** Plumbing is frozen and single-slot, so its existing
global rule is already correct for it and needs no change. HVAC implements per-slot in its
own composition, and the **verifier** (`one_access_writer_per_slot`) is the shared enforcement
point that both trades are checked by. Revisit extraction when a third trade arrives, per
the standing rule.

**What needs deciding:** whether the platform owner wants the composition rule extracted to
a shared module now instead. It is a bigger change and touches a frozen template.

### 1.3 The derivation rule for `referencedAccessSlots`

Correction 3 says derive from the tree. The derivation itself is a decision, because there
are two candidate sources:

- **writers** — slots written by an `AnswerOption` whose `accessClassification` is non-null;
- **readers** — slots referenced by a component condition or a disclaimer condition.

**Recommendation: `referencedAccessSlots` = writers.** A reader referencing a slot no
question writes is a defect, not a slot the client should be told to expect — it is the
slot-analogue of `GATE_WITHOUT_SOURCE`, which already exists as a composition refusal.

That implies a **new composition/verifier check**: every slot read by a condition must be
in the writer set. Without it, a component conditioned on an unwritten slot silently never
matches — the electrical synonym bug in slot form.

**What needs deciding:** whether to add that reader-subset-of-writers check now. It is not
in the approved ten-check gate, and it closes a failure the approved design otherwise
permits.

### 1.4 Whether `conditionAccessSlot` is read when `conditionAccessClass` is null

`AnswerOptionComponent.conditionAccessClass` is nullable — null means "no access condition,
always applies". `CanonicalDisclaimer.accessClass` is likewise nullable.

**Recommendation:** the slot is read **only** when the class is non-null. A row with a null
class and a non-default slot is meaningless, and the verifier should reject it rather than
leave a value that reads as meaningful and is not.

### 1.5 What the client receives, and what it may send back

Correction 3 gives the flow `referencedAccessSlots`. The client accumulates access as the
homeowner answers.

**Recommendation:** the client renders from its own accumulated map but **never submits
it**. `resolveRoute` is stateless and re-derives access from the answer snapshot on the
server, which is the property that makes a quote reconstructible. Sending a client-built
`accessBySlot` would make the browser an authority on access — the exact class of defect
that moved pricing server-side in the first place.

**What needs deciding:** confirmation that `referencedAccessSlots` is display/validation
metadata only, and that no API accepts an access map from the browser.

### 1.6 Sequencing: `location_scope_matches_promised_work` needs HVAC to exist

Approved independently of G1, and it should be — but it cannot run yet. **There is no
`lib/hvac`.** The verifier checks `locationScope` against `maintenanceScope`, and neither
field exists in code; both are approved-but-unbuilt HVAC metadata (decisions 1, 2, 10).

The required AC Tune-Up fixture is likewise HVAC-shaped: it needs a real `ac-tune-up` entry
with a structured `maintenanceScope`.

**Two options:**

| | Approach | Cost |
| --- | --- | --- |
| **A** | Write the verifier against **standalone fixtures** — hand-built service objects, not the real catalog — landing with G1 | Proves the rule fires; does not prove the real catalog satisfies it |
| **B** | Land minimal `lib/hvac` canonical metadata first (`locationScope`, structured `maintenanceScope`, the tune-up entries), then the verifier against the real catalog | Larger, and it starts HVAC implementation, which is currently parked |

**Recommendation: A now, B when HVAC unparks.** The platform owner's acceptance list says
"the misdeclared AC Tune-Up fixture fails" — a standalone fixture satisfies that literally
and proves the guard is real. Making it a *catalog* regression guard is HVAC's work and
belongs with HVAC's implementation.

**What needs deciding:** whether A satisfies the acceptance gate, or whether G1 acceptance
should wait on HVAC's canonical metadata.

---

## 2. File-by-file plan

Phases follow the approved expand → parallel → switch → contract. Each phase is a commit;
ADR-021 runs at the marked points.

### 2.1 New — the shared slot module

**`lib/accessSlots.ts`** *(new file, no conflict surface)*

```ts
export type AccessSlot = "PRIMARY" | "INDOOR_EQUIPMENT" | "OUTDOOR_EQUIPMENT";
export const ACCESS_SLOTS: readonly AccessSlot[];
export const PRIMARY: AccessSlot;
export function parseAccessSlot(raw: string): AccessSlot | null;   // null, never a guess
export function assertValidAccessSlot(raw: string): AccessSlot;    // throws with the raw value
```

Correction 4's single owner. **V1 rejects everything but the three bare keys** — no ordinal
grammar is implemented, documented or accepted. Every other surface imports from here.

### 2.2 Expand — `prisma/schema.prisma`

Three additive columns, all `String @default("PRIMARY")`:

| Model | Column | Read when |
| --- | --- | --- |
| `AnswerOption` | `accessSlot` | `accessClassification` is non-null |
| `AnswerOptionComponent` | `conditionAccessSlot` | `conditionAccessClass` is non-null |
| `CanonicalDisclaimer` | `accessSlot` | `accessClass` is non-null |

`ConditionalDisclaimer` is **not** touched — correction 1. No backfill script: the column
default supplies `PRIMARY` for every existing row, which is the correct meaning.

### 2.3 Parallel — `lib/pricing.ts`

```ts
accessClass:  AccessClassification | null                          // retained this phase
accessBySlot: Partial<Record<AccessSlot, AccessClassification>>    // added
accessSlotConflict: AccessSlot | null                              // added — §1.1
```

**Partial, per correction 2.** A slot absent from the map means *the flow has not
established it*; `UNKNOWN` means *the homeowner answered and the classification is
explicitly unknown*. The two are never collapsed, and no code may treat absent as `UNKNOWN`
or vice versa.

`startConfiguration` / `startDisplayConfiguration`: `accessBySlot: {}`, `accessSlotConflict: null`.

`applyBranch` — the write site, replacing `branch.accessClassification ?? config.accessClass`:

- branch declares no classification → carry the map forward unchanged;
- slot unwritten → write it;
- **slot already written → set `accessSlotConflict`, change nothing else.** No merge, no
  precedence, no last-answer-wins.

Dual-write this phase: a `PRIMARY` write also sets the legacy scalar. Non-`PRIMARY` slots
never touch it — correction 6.

Component selection becomes `sel.conditionAccessClass !== accessBySlot[sel.conditionAccessSlot]`.
**Behavior is preserved for a missing slot**: today `FINISHED !== null` excludes the
component; under slots `FINISHED !== undefined` excludes it identically.

### 2.4 Parallel — the equivalence invariant

Correction 6, enforced wherever both representations exist:

```
assert(config.accessClass === (config.accessBySlot.PRIMARY ?? null))
```

**Fails loudly. No precedence rule.** Runs in `applyBranch`'s return path and in
`resolveRoute` before pricing.

### 2.5 Switch — readers

| File | Change |
| --- | --- |
| `lib/routeResolver.ts` | Read `accessSlotConflict` → `REVIEW`. Carry `accessBySlot` on `PRICED`/`REVIEW` |
| `lib/categories.ts` | Add `disclaimerAccessSlot()` beside `disclaimerAccessClass()` |
| `lib/flow-types.ts` | `AnswerOptionDTO.accessSlot`; `components[].conditionAccessSlot`; `conditionalDisclaimers[].accessSlot`; `QuestionDTO.conditionalHelp[].accessSlot`; `ServiceFlowDTO.referencedAccessSlots` |
| `app/api/services/[slug]/route.ts` | Select the three new columns; emit `referencedAccessSlots` derived per §1.3 |
| `components/guided-flow/GuidedFlowEngine.tsx` | Pass `accessBySlot` instead of the scalar |
| `components/guided-flow/QuestionStep.tsx` | Conditional help and disclaimers filter on `(slot, class)`; **`accessFinishedDisclaimer` reads `accessBySlot.PRIMARY === "FINISHED"` explicitly** — correction 4 |
| `app/api/visit/route.ts` | Config shape only |
| `components/marketing/*` | Follows the DTO; display only |

### 2.6 Not touched

`lib/plumbing/**` — **frozen and unmodified.** Its `FamilyOption` carries no slot, so
provisioning writes the column default `PRIMARY`, which is its correct meaning. Its
`composeService` global single-writer rule stays correct for a single-slot trade.

`prisma/seed-*.ts` — ~50 authored rows, untouched; defaults cover them.

`docs/hvac-g1-review` — immutable review snapshot; this branch was cut from it and its ref
does not move.

### 2.7 Contract

Drop `JobConfiguration.accessClass`, the dual-write, and the equivalence assertion — only
after no reader remains. Legacy `accessFinishedDisclaimer` **stays**, reading
`accessBySlot.PRIMARY`; its retirement is separate cleanup with its own proof.

---

## 3. Acceptance

ADR-021 baseline captured from **this branch's own pre-G1 state** (correction 5), re-run
after §2.5. **Expected delta caused by G1: zero.** A failing baseline is investigated, never
regenerated.

The ten-check §9 gate and the two §9.1 fixtures are unchanged, subject to §1.6's sequencing
question about which form the AC Tune-Up fixture takes.
