# G1 — scoped access

> ## ACCEPTED — G1 is solved, 2 September 2026
>
> Implemented, proved and accepted by the platform owner. **G1 is closed as a
> platform blocker.**
>
> | | |
> | --- | --- |
> | ADR-021 | **2 passed, 0 failed** — 65 services, zero G1-caused price delta |
> | Existing Electrical | Preserved exactly; no tree rewritten; five previously-repriced routes hold their original `FINISHED` components |
> | Scoped coexistence | `INDOOR_EQUIPMENT = FINISHED` alongside `OUTDOOR_EQUIPMENT = ACCESSIBLE`, neither displacing the other |
> | `verify-access-slots.ts` | 67/67, no database |
> | Writer baseline | 8 reviewed pairs; tripwire proven to fail on a new pair **and** on a changed writer set |
> | Plumbing | Untouched |
>
> ### The permanent platform invariant
>
> **Rejected:** ~~one writer per slot~~.
>
> **Permanent — cross-slot isolation plus reviewed same-slot refinement:**
>
> > **Access facts are isolated by slot. Within one slot, ordered successive
> > writes are valid refinement and the last applicable writer wins.**
>
> Stated as the five things it guarantees:
>
> - refinement inside `INDOOR_EQUIPMENT` may change `INDOOR_EQUIPMENT`;
> - it can **never** modify `OUTDOOR_EQUIPMENT`;
> - it can **never** modify `PRIMARY`;
> - multiple writers within one slot are permitted **only** as deliberate ordered
>   refinement;
> - a new or changed multi-writer `(service, slot)` pair trips the baseline until
>   reviewed.
>
> `writeSlot()` applies this to **every** slot. `PRIMARY` is not grandfathered
> and holds no special rule, which is what stops the platform carrying two
> semantics.
>
> **Why the earlier rule was wrong.** It was an abstraction invented after the
> product, and the live Electrical catalog refused it: eight services legitimately
> refine one access fact as the customer supplies more specific information, and
> banning the second writer would have changed five existing routes. The corrected
> invariant describes what the product actually does. §6.1 is preserved below as
> the rejected premise rather than deleted, and §9's acceptance checks 2 and 3 are
> read against this rule.

**Origin: a shared-platform proposal, direction approved by product 2 September 2026
with the nine decisions in §2 attached.**

Raised by the HVAC workstream; **HVAC is not the owner of this change.** Sources:
`docs/design/hvac-v0-catalog-review.md` Part 6 (the audit that raised it) and
`docs/design/hvac-v0-architecture.md` §B.3 (how HVAC represents the gap meanwhile).

The conceptual case is settled. **The review that remains is whether an implementation
preserves Electrical and Plumbing behavior** — §7 is written to be checked against, and
§7.3 is the acceptance gate.

---

## 1. The case, led by the cross-trade evidence

### 1.1 Two independent trades hit the same ceiling

This is the argument to weigh first, because it is what separates a platform gap from a
trade's feature request.

**Plumbing hit it and documented it**, in `docs/design/plumbing-shared-integrations.md`
§1.7a:

> A service that genuinely needs both routes classified separately is asking for a platform
> change, not a second family.

Sixteen plumbing services composed both `fixture_access` and `drain_route`. Plumbing
resolved it by **narrowing** — deciding one route is *the* route per service. That was the
right call for plumbing and it was a workaround.

**HVAC hit it independently**, from honest tune-up and equipment scope, and cannot narrow:
an air conditioner tune-up that does not touch the indoor equipment is not a tune-up.

One trade working around a limitation is a trade problem. **Two independent trades
demonstrating the same underlying limitation means the platform abstraction is
incomplete** — which is the threshold this codebase sets for promoting something from
trade-local modeling into shared infrastructure, rather than a bar HVAC invented for its
own convenience.

### 1.2 What is being asked

Replace the single access classification on a job configuration with a **keyed set**:

```
  accessClass:  AccessClassification | null     →     accessBySlot:  { AccessSlot → AccessClassification }
```

### 1.3 Why it is urgent now

G1 was previously understood as constraining equipment *installation*, where `REMOTE_QUOTE`
is an acceptable outcome anyway. The catalog review found it also blocks **three routine,
known-scope, fixed-price maintenance services** — Air Conditioner, Heat Pump and Mini-Split
Tune-Up — each promising work at both indoor and outdoor equipment. The alternatives are
turning routine maintenance into a review, or narrowing a tune-up until it is not one.

### 1.4 The migration story is unusually good

**Every authored access row in the codebase is effectively `PRIMARY` today.** Scoped access
therefore arrives as an *additive representation change with no intended pricing behavior
change* — and ADR-021 gives a far stronger proof than unit tests, because it exercises the
real pricing engine over the existing active catalog. See §7.3.

---

## 2. Decisions carried into this proposal

Nine, resolved by product on 2 September 2026.

| # | Decision |
| --- | --- |
| **1** | **Shared slot vocabulary, not per-trade namespaces.** V1 slots are `PRIMARY`, `INDOOR_EQUIPMENT`, `OUTDOOR_EQUIPMENT`. Slots describe **where access applies, not which trade is asking** — if Plumbing later needs `INDOOR_EQUIPMENT` it must mean what HVAC means. Trade-owned namespaces would recreate the abstraction problem this change exists to remove |
| **2** | **`AccessClassification` is unchanged.** G1 changes **cardinality and scope, not the access taxonomy.** `ACCESSIBLE` / `FINISHED` / `UNKNOWN` keep their meanings. Containment is a virtue of this proposal, not an omission from it |
| **3** | **Persist slot keys as validated strings, not a database enum.** V1 validation accepts only the three bare keys. **Ordinal keys are not supported and must be rejected.** See §4.5 for what is deliberately *not* decided |
| **4** | **One platform owner for slot validation.** A single shared module defines the type, the parser and the validator; schema, provisioning, composition, API, verifiers, HVAC and clients all reuse it |
| **5** | **Services and clients operate only on referenced slots.** The runtime may hold a full map; published flow data declares which slots that service references |
| **6** | **Migration shape: expand → parallel → switch → contract**, with the parallel-stage equivalence invariant in §7.2 |
| **7** | **ADR-021 is the behavioral acceptance gate.** Expected price delta is **zero** |
| **8** | **Two separately named invariants.** The first was `one_access_writer_per_slot`; it was **rejected on evidence** and replaced by cross-slot isolation plus reviewed same-slot refinement, enforced by `writeSlot()` and `scripts/verify-access-writers.ts`. The second, `location_scope_matches_promised_work`, stands unchanged. See §6 |
| **9** | **Lead the platform rationale with the cross-trade evidence** — §1.1 |

---

## 3. What the current representation is

### 3.1 Three persisted fields, one runtime accumulator

| Surface | Field | Type |
| --- | --- | --- |
| `prisma/schema.prisma` | `AnswerOption.accessClassification` | `AccessClassification?` — the answer *declares* what it means |
| `prisma/schema.prisma` | `AnswerOptionComponent.conditionAccessClass` | `AccessClassification?` — a component variant applies only under this class |
| `prisma/schema.prisma` | `ConditionalDisclaimer.accessClass` | `AccessClassification?` — text rendered only under this class |
| `lib/pricing.ts` | `JobConfiguration.accessClass` | `AccessClassification \| null` — accumulated along the route |

`AccessClassification` is a Postgres enum with exactly three members: **`ACCESSIBLE`,
`FINISHED`, `UNKNOWN`.** Unchanged by decision 2.

### 3.2 Where it is read

| File | Reads it for |
| --- | --- |
| `lib/pricing.ts` | Accumulating the route, and selecting component variants (`sel.conditionAccessClass !== accessClass`) |
| `lib/categories.ts` | `disclaimerAccessClass()` — whether a conditional disclaimer renders |
| `lib/routeResolver.ts` | Carrying it through resolution |
| `lib/flow-types.ts` | The client DTO — `accessClassification`, `conditionAccessClass`, `conditionalDisclaimers[].accessClass` |
| `components/guided-flow/QuestionStep.tsx` | Conditional help text, conditional disclaimers, and the displayed price delta |
| `components/guided-flow/GuidedFlowEngine.tsx` | Passing the accumulated class down |

### 3.3 Authored data that would need a slot

Counted in the repo, not in production:

| | Count | Where |
| --- | --- | --- |
| Answer options declaring an access classification | ~30 | `prisma/seed-*.ts`, all electrical |
| Components conditioned on access | ~14 | `prisma/seed-*.ts`, all electrical |
| Conditional disclaimers keyed to access | 6 | `prisma/seed-conditional-disclaimers.ts` |
| Plumbing families writing access | 2 | `fixture_access`, `drain_route` — composition permits only one per service |

**No row anywhere wants a slot other than `PRIMARY` today.** That is what makes the change
inert on arrival rather than a migration with a behavior question attached.

---

## 4. The design

### 4.1 Keyed access, plural name

`accessBySlot`, replacing the scalar. The plural name is part of the proposal: retaining
`accessClass` for a map would leave every reader looking correct and meaning something else.

### 4.2 Access writers target a slot

`AnswerOption.accessSlot`, defaulting to `PRIMARY`. This follows the codebase's existing
rule that **the answer declares what it means** rather than the engine inferring from
wording — the rule written after six electrical access questions in three vocabularies
produced a component condition that matched none of them.

### 4.3 Components and disclaimers condition on `(slot, class)`

`AnswerOptionComponent.conditionAccessSlot` and `ConditionalDisclaimer.accessSlot`, both
defaulting to `PRIMARY`. A component conditioned on `(OUTDOOR_EQUIPMENT, FINISHED)` is a
sentence the current schema cannot say.

### 4.4 No later-answer overwrite

Writing a slot that is already written is a **refusal**, not a replacement. Composition
should make it unreachable (§6.1); the runtime check is the belt-and-braces that fails
closed rather than picking a winner. This removes the behavior in §5.1 rather than
relocating it.

### 4.5 Validated strings — and what is deliberately left undecided

Decision 3. The slot column is a **validated string**, and V1's validator accepts exactly
`PRIMARY`, `INDOOR_EQUIPMENT`, `OUTDOOR_EQUIPMENT` — nothing else.

**The reason is narrow and should stay narrow.** A database enum is the one representation
that would need a schema migration merely to admit a finer slot key later. A validated
string means a future refinement is *a deliberate validator and semantics change*, not a
migration undertaken to make the change discussable.

> **What is NOT decided here:** how multiple indoor equipment instances — several
> mini-split heads with genuinely different access conditions — will eventually be
> represented. Ordinal keys are one candidate. Access belonging to equipment or component
> *instances* rather than to slot strings is another, and may be better.
>
> **No ordinal grammar is specified, supported, or promised.** Documenting one now would
> turn an implementation detail into an accidental API promise, and would pre-commit a
> decision that should wait for a third concrete need.

Precedent worth following: `TemplateVersion.trade` is a `String` rather than a foreign key,
with the recorded reasoning that if a `CanonicalTrade` entity ever arrives it becomes a key
and nothing already written is undone. Same shape of decision, same benefit.

### 4.6 Services declare the slots they reference

Decision 5. The runtime and canonical object may hold
`accessBySlot: Record<AccessSlot, AccessClassification>`. The **published flow and service
payload declares which slots that service actually references** — `PRIMARY` for essentially
every existing Electrical and Plumbing service; `INDOOR_EQUIPMENT` and `OUTDOOR_EQUIPMENT`
for an HVAC dual-location tune-up.

Five consequences, each of which is the point rather than a side effect:

- the homeowner flow stays deterministic;
- clients cannot invent or submit irrelevant access state;
- a **missing required slot answer becomes detectable** rather than silently absent;
- the published tree is self-describing;
- `accessBySlot` does not become a generic bag of client-supplied values.

The full map is a server and runtime representation. It is **not** automatically the public
contract for every service.

### 4.7 One module owns the grammar

Decision 4. A single shared platform module defines the concept — an `AccessSlot` type, a
`parseAccessSlot()`, an `assertValidAccessSlot()` — and one V1 policy for accepted keys.
Schema validation, provisioning, composition, API parsing, the template verifiers, HVAC and
the frontend types all consume it. **The grammar in §4.5 only helps if exactly one place
owns it**; duplicated across six surfaces, the one that goes stale is the one that matters.

---

## 5. The three defects the current representation causes

**5.1 A later access answer silently overwrites an earlier one.** `lib/pricing.ts:507`:

```ts
const accessClass = branch.accessClassification ?? config.accessClass;
```

The comment above it says the classification "isn't overwritten by a later non-access
answer", which is true and is not the risk. A later **access** answer replaces it, with no
record that a different answer was given first.

**5.2 Composition refuses two writers unconditionally, because no merge rule exists.**
`composeService` rejects `DUPLICATE_FACT_WRITER` outright, and correctly: the platform has
one slot and nowhere to express how two answers combine. That refusal is what keeps 5.1
unreachable through a composed tree. **The refusal is not the problem; the single slot is.**

**5.3 A service can under-declare its location scope, and nothing objects.** Three HVAC
tune-ups were declared single-location while promising work at two, and shipped as `FIXED`.
Closed by the second invariant in §6.2 — **which is needed whether or not this proposal
ships.**

---

## 6. Two invariants, deliberately separate

They solve different failures and must not be collapsed into one.

### 6.1 Slot isolation and reviewed refinement — platform, structural

**The invariant in force.** Access facts are isolated by slot; within one slot,
ordered successive writes are valid refinement and the last applicable writer
wins. Enforced in two places that cannot disagree, because one is the mechanism
and the other is the review:

| Enforced by | What it guarantees |
| --- | --- |
| `writeSlot()` in `lib/accessSlots.ts` | A write reaches exactly one slot. No refinement in one slot can alter another — cross-slot isolation is structural, not checked |
| `scripts/verify-access-writers.ts` | Same-slot refinement is *reviewed*. Eight baseline `(service, slot)` pairs today; a new or changed one fails until somebody looks |

**Prevents runtime ambiguity** — the cross-location collision — while leaving the
deliberate narrowing the product depends on.

---

#### ~~`one_access_writer_per_slot`~~ — the rejected premise

*Preserved rather than deleted. It was tested against the live catalog and
failed: eight active Electrical services write one slot more than once,
deliberately, each question narrowing the last. This rule would have refused all
eight and repriced five routes. It was an abstraction invented after the product
rather than a description of it.*

The rejected rule read:

Replaces today's global one-access-writer constraint. A service may have one writer for
`INDOOR_EQUIPMENT` and one for `OUTDOOR_EQUIPMENT`; it may **never** have two competing
writers for the same slot. `DUPLICATE_FACT_WRITER` becomes per-`(fact, slot)`.

**Prevents runtime ambiguity.** It is what keeps composition deterministic.

### 6.2 `location_scope_matches_promised_work` — canonical, trade-model

Every physical location at which a service promises work must be represented in its declared
work/location scope. A narrower declaration fails verification.

**Prevents the catalog author from lying about which locations the service touches.** This
is the defect that produced three fixed-price tune-ups promising work nobody had classified
access for.

**It must exist even if scoped access is rejected outright.** Declaring where you promise
work is independent of whether the platform can yet classify access at each location.

Two supporting requirements:

- **`maintenanceScope` carries structured location metadata** — each promised item declares
  `INDOOR` or `OUTDOOR` — rather than relying on prose. The invariant is not checkable
  otherwise.
- **Do not infer promised work location from the questions asked.** A service may
  legitimately ask an equipment-identity question about equipment that is not a location of
  promised physical work. Preserve three distinct things:

> `identity / evidence` ≠ `promised physical work` ≠ `access classification`
>
> Evidence rides on the job sheet and prices nothing. Promised work drives `locationScope`.
> Access classification is a scope fact that gates. Central AC Replacement and Heat Pump
> Replacement are corrected to truthful `BOTH` **for their indoor work**, not for capturing
> indoor coil identity.

---

## 7. Blast radius, migration, and the acceptance gate

### 7.1 Surfaces

| Surface | Scale | Nature |
| --- | --- | --- |
| `prisma/schema.prisma` | 3 new columns, all defaulted | Additive |
| `lib/pricing.ts` | The accumulator, the write site, the component filter | The real change |
| `lib/categories.ts` | One disclaimer predicate | Mechanical |
| `lib/routeResolver.ts`, `lib/flow-types.ts` | Pass-through and DTO shape | Mechanical |
| `components/guided-flow/*` | Two components reading the accumulated class | Mechanical |
| `prisma/seed-*.ts` | ~50 authored rows | Untouched — column defaults cover them |
| `lib/plumbing/**` | None | **Frozen and unmodified.** Both access families write `PRIMARY`; composition still refuses both on one service |
| `components/marketing/*` | Display only | Follows the DTO |

**Everything that exists today writes and reads `PRIMARY`, so no current tree changes
meaning.** Additive in the same way `AppointmentKind.SERVICE_CALL` is additive.

### 7.2 Sequence — expand → parallel → switch → contract

1. **Add slot-aware fields and writes.** Three columns, `PRIMARY` defaults. Nothing reads
   them.
2. **Populate existing authored rows with `PRIMARY`**, preserving current meaning exactly.
3. **Derive and check scalar equivalence.** `accessBySlot` runs alongside `accessClass`.

   > **Parallel-stage invariant:** wherever both representations exist,
   > **`accessClass === accessBySlot.PRIMARY`**. A disagreement is an **invariant failure
   > that fails loudly** — never a precedence decision, and never resolved by preferring
   > one representation.

4. **Switch composition, pricing and readers to `accessBySlot`** — only after parallel
   verification is green.
5. **Run the ADR-021 baseline.** See §7.3.
6. **Contract.** Drop the scalar only after no reader remains.

### 7.3 ADR-021 is the acceptance gate

Decision 7. `scripts/verify-flat-rate-unchanged.ts` is permanent, replays every active
service's flat-rate route **through the real engine**, and compares
**276 distinct price points across 65 active services** against a recorded baseline. It
already exercises `accessClassification` and `conditionAccessClass`.

> **Expected price delta for this migration is zero.** Run the baseline before and after
> the reader switch. **Any changed price is an implementation defect to investigate — not
> a baseline to regenerate.**

That is ADR-021's own standing rule: *a failing snapshot is never authority to update
itself.* It makes "did this preserve Electrical and Plumbing behavior" a question with a
mechanical answer rather than a judgment.

---

## 8. What HVAC does either way

**HVAC changes no shared file for this**, and its own side is unaffected by the outcome:

- `locationScope` stays a per-service declaration with its double refusal.
- `location_pair_gate` stays, and stays correct — with slots it simply stops firing for
  services that can now be represented.
- `maintenanceScope` becomes structured with `at: INDOOR | OUTDOOR` per item, and
  `location_scope_matches_promised_work` closes §5.3 **independently of this proposal**.

**If this slips**, the three tune-ups ship `CONDITIONAL_FIXED` as a holding position: the
promised scope is unchanged, one location writes access, and the second is screened by
**concrete homeowner-observable refusal facts** — *where is the indoor equipment?* answered
as attic or crawl space — never by a judgment question such as *"is access standard?"*.
A temporary position, not a destination.

**The HVAC catalog remains unfrozen and unpublished until G1 has an accepted production
path.**

---

## 9. Acceptance review

*Set by product, 2 September 2026. When the platform owner responds, the review is
**mechanical against this list** — not a re-argument of whether scoped access is desirable.
That question is closed.*

| # | Check | Passes when |
| --- | --- | --- |
| 1 | **Schema and data compatibility** | Every existing access declaration, component condition and disclaimer becomes `PRIMARY` **without changing meaning** |
| 2 | **Composition** | The global single-writer rule becomes single-writer-**per-slot**, and two writers to the *same* slot still fail |
| 3 | **Pricing** | Readers consume the intended slot **explicitly**. No "last answer wins" path remains anywhere |
| 4 | **Conditions and disclaimers** | `conditionAccessClass` and disclaimer access conditions are **slot-aware** rather than implicitly global |
| 5 | **Published/client contract** | A flow exposes **only the access slots it actually requires** |
| 6 | **Parallel invariant** | While both representations exist, `accessClass === accessBySlot.PRIMARY` holds **everywhere** |
| 7 | **Existing trades** | Electrical and Plumbing are **behaviorally identical** and continue to use `PRIMARY` |
| 8 | **HVAC coexistence proof** | An attic air handler and a ground-level condenser independently produce **two access classifications in one job**, with no conflict and no overwrite |
| 9 | **ADR-021** | Every existing baseline price point unchanged. **Expected delta: zero** |
| 10 | **Misdeclaration protection** | `location_scope_matches_promised_work` fails a deliberately incorrect declaration **even where the pricing engine would otherwise accept it** |

### 9.1 The required test fixture — recreate the bug on purpose

Check 10 gets its own fixture, and it must **reproduce the defect this whole proposal came
from** rather than assert the invariant abstractly.

**Case A — the misdeclaration must fail.**

```
  ac-tune-up
    maintenanceScope:  [ … { at: OUTDOOR, … }, { at: INDOOR, … } ]   ← promises both
    locationScope:     OUTDOOR                                        ← declares one

  →  location_scope_matches_promised_work  MUST FAIL
```

This is the exact shape that shipped: an AC Tune-Up promising a condensate drain flush at
the indoor equipment while declaring outdoor-only scope, which the pricing engine accepted
without complaint because nothing cross-checked the declaration against the promise. **A
verifier that passes this fixture has not closed the defect.**

**Case B — the honest declaration must work end to end.**

```
  ac-tune-up
    maintenanceScope:  [ { at: OUTDOOR, … }, { at: INDOOR, … } ]
    locationScope:     BOTH

  →  location_scope_matches_promised_work  passes
  →  two scoped access answers coexist:
        INDOOR_EQUIPMENT   ← "where is the indoor equipment?"
        OUTDOOR_EQUIPMENT  ← "where does the outdoor unit sit?"
     neither overwrites the other, and both survive to pricing
  →  the fixed-price route resolves when both conditions permit it
```

Check 8's coexistence case is deliberately the *harder* pair — attic air handler
(`INDOOR_EQUIPMENT` = `FINISHED`) with a ground-level condenser
(`OUTDOOR_EQUIPMENT` = `ACCESSIBLE`) — proving two **different** classifications are held
simultaneously rather than two matching ones that could hide an overwrite. Case B's pricing
assertion uses a pair where both permit the fixed-price route.

### 9.2 The bar: solved, not merely implemented

> **Both fixture cases passing, plus a green ADR-021 baseline, is what makes G1 *solved*
> rather than *implemented*.**

The distinction is the point. An implementation that represents two slots correctly but
still lets an author under-declare has moved the defect rather than closed it — and the
defect was never that the engine could not hold two classifications. It was that nothing
noticed when a service promised work at a location it had not declared.

### 9.3 What happens after

On acceptance, HVAC restores the three tune-ups to their intended `FIXED` disposition,
locks the 21-service default catalog, and publishes the companion catalog review page.
Until then the catalog stays unfrozen.
