# Plumbing ↔ Visual Assist — the integration contract

*31 August 2026. The agreed boundary between two workstreams built in parallel:
Visual Assist in `lib/visual-assist/**`, Plumbing Template V1 in `lib/plumbing/**`.*

This document is **architectural**. It states what each side owes the other and
what neither side may do. It deliberately does not describe how Visual Assist
works: its taxonomy, thresholds, prompt versions, dispositions and persistence are
its own, they will change, and a copy of them here would be a second source of
truth that goes stale silently. If you need to know how a photograph becomes an
observation, read `lib/visual-assist/**`. If you need to know what plumbing will
accept from it, this is the whole answer.

---

## Part 1 — The contract

### 1.1 The pipeline, and where the boundary sits

```
Visual Assist  ─┐
                ├─→  validated canonical Guided Pricing input  ─→  plumbing scope logic  ─→  Price2Book pricing engine
manual answer  ─┘         ^                                          lib/plumbing/scope.ts      lib/pricing.ts
                          |
                    THE BOUNDARY
              lib/plumbing/visualAssist.ts
```

Both inputs converge on **one canonical vocabulary** before plumbing sees either.
Downstream of the boundary nothing can tell a photograph's answer from a person's,
and nothing should be able to — that identity is what lets the pricing engine stay
unaware this feature exists.

### 1.2 Direction of dependency — one way, and it is not negotiable

**`lib/plumbing` imports nothing from `lib/visual-assist`.** Not a type, not a
constant, not an enum.

`lib/plumbing/visualAssist.ts` declares the shape plumbing *requires*, structurally,
and that is the entire coupling:

```ts
export type ValidatedVisualInput<T> = {
  value: T | null;
  accepted: boolean;
  confirmedByHuman: boolean;
};
```

**The adapter that produces this shape lives on the Visual Assist side.** Three
reasons, in order of how much they cost when ignored:

1. Visual Assist's internals are the volatile half. A dependency pointing into them
   would drag the plumbing template — a canonical artifact meant to outlive several
   provider generations — along with every threshold change.
2. Plumbing's vocabulary is deliberately coarser (§1.6). Coarsening belongs with
   whoever owns the finer vocabulary, because only they can tell when a new word is
   a new case rather than a new synonym.
3. The plumbing template is exercised by `scripts/verify-plumbing-template.ts` with
   **no provider, no database and no network**. That property is worth protecting on
   its own: it is what proves the template holds independently of anything that
   might be wrong with an inference layer.

### 1.3 The two-key requirement: accepted **and** human-confirmed

Plumbing accepts a value only when **both** are true. Not either.

| Key | Whose decision | What it asserts |
| --- | --- | --- |
| `accepted` | Visual Assist's confidence policy | The observation is coherent and well-evidenced |
| `confirmedByHuman` | The homeowner or the operator, in the flow | A person who owns the outcome looked at it and agreed |

They are not redundant. Acceptance says the model's output is *internally sound*;
confirmation says a *human asserted it*. A price is a promise, and a promise made on
an unconfirmed reading of a photograph is one nobody agreed to.

The adapter's obligation is therefore narrow: emit `accepted: true` only for the
disposition Visual Assist uses for "good enough to show and confirm", and
`confirmedByHuman: true` only after the person actually confirmed. Every other
disposition is `accepted: false`. Enumerating those dispositions here would be
copying their internals; the adapter knows them.

**There is deliberately no `confidence` field at this boundary.** A number here would
invite plumbing to apply its own threshold, and two components applying thresholds to
the same observation is two answers to "did we accept this" — with the expensive one
being whichever the pricing engine happened to read.

Enforced in `acceptVisualFact()`, which refuses in this order and records why:
not accepted → not confirmed → null value → missing flags. There is no path through
it that produces a fact from an input missing any of the three, and an object arriving
without the flags is refused rather than read optimistically.

### 1.4 The no-diagnosis boundary

**Visual Assist identifies visible configuration only.** It may not:

- select a repair, or say what work is needed;
- determine code compliance;
- move a price, directly or by side effect.

Plumbing enforces the third structurally rather than trusting it. `lib/plumbing/scope.ts`
holds no rate, no markup, no component price and no material cost, and returns
**canonical roles and component keys** for `lib/pricing.ts` to resolve against the
contractor's own economics. The verifier asserts the scope layer returns no price and
that no mapping carries a number.

The first two are Visual Assist's to hold, and plumbing's structure makes violating them
useless: there is no field on a `CanonicalFact` that could carry a repair recommendation,
and nothing downstream reads one.

**The strictest case is `existing_condition`**, the one family that can take a customer
out of the priceable catalog. Its contract is narrower than the rest of the template:

> **observable condition → continue, or leave automated pricing.**

It consumes only what a person can see, or an approved observable Visual Assist fact:
visibly broken, visibly corroded, visibly leaking, visibly damaged, inaccessible or
concealed, cannot determine. The "nothing wrong" answer is phrased as an observation too
— *"No visible leaking, corrosion, or damage"*, not *"it looks fine"*, which asks the
customer for a verdict on the installation rather than for what they can see. It may **not** consume or express an inferred cause —
"failed cartridge", "bad PRV", "damaged flange", "failed expansion tank", "defective
valve", "collapsed sewer", "undersized piping", "code violation". Those are conclusions
about *why*, and a booking flow that reached one would be diagnosing from a web form and
then quoting the repair it picked.

Its effect is equally narrow. It may not choose a repair, recommend a replacement, attach
a component-specific fix, or diagnose. `CONDITION_SCOPE` is therefore **effect-free** —
every entry has empty roles, components and prerequisites, and the verifier asserts it.
An earlier version attached a repair coupling and a rework component to `DEGRADED`; that
was the boundary being crossed, and removing it is what makes "an observation cannot
select work" a property of the data rather than a rule in a comment.

When an observed condition takes the customer out of the catalog, the route leaves
automated pricing and **carries the observation with it** (`GateOutcome.observed`), so
review does not start by asking the customer what they already answered.

### 1.4a The destination is neutral too — `ON_SITE_SERVICE`, never "diagnostic"

The no-self-diagnosis rule governs the **route**, not only the answer. An observed active
failure earns a *visit*; it does not earn a diagnosis, and naming the outcome after one
smuggles the conclusion back in through the label — "diagnostic" asserts we already know
the problem is a fault to be found, which is exactly what nobody has established.

Plumbing's outcome vocabulary is therefore its own:

| Plumbing outcome | Platform `RouteAction` |
| --- | --- |
| `CONTINUE` | `CONTINUE` |
| `PHOTO_REVIEW` | `PHOTO_REVIEW` |
| `REMOTE_QUOTE` | `REMOTE_QUOTE` |
| `ON_SITE_SERVICE` | `REROUTE_TROUBLESHOOTING` |

**The platform enum is unchanged.** `RouteAction.REROUTE_TROUBLESHOOTING` and
`BookingType.TROUBLESHOOT_ONLY` are shared and stay exactly as they are; `toRouteAction()`
is the single translation, total over the union. This is a vocabulary boundary, not a
schema change.

Renamed with it, before publication: the destination service is `plumbing-service-call`
("Plumbing Service Call"), its category is `service-calls`, and the appointment shell is
`on_site_service`. A `key` is the identity that survives across template versions and
must never move once a version has been seeded — Plumbing V1 has never been written to a
database, so this rename was free today and would not have been tomorrow.

The verifier scans **customer-facing strings and keys**, not source: the platform enum
legitimately contains the word, so a source-wide ban would be unsatisfiable. What must
never carry it is anything a person reads.

### 1.5 A customer answer always wins

Where a person answered the question *and* a confirmed observation exists, the
**person's answer is used** and the provenance records it.

Not because it is more likely right — it frequently is not — but because it is the
assertion the price is a promise against. Silently overriding a stated answer with a
photograph's reading produces a quote for a job the customer never described, and they
find out on the day. `intakeFacts()` implements this; the verifier asserts it.

### 1.6 When the source vocabulary is finer than plumbing's — fail to manual

Visual Assist distinguishes things plumbing does not need (tank from tankless, standard
from hybrid). `CombustionClass` asks only **how the appliance burns**. That coarseness is
the design: it stops every new taxonomy word from becoming a new gate.

**The rule for the residue:** a source value that does not determine a *single*
`CombustionClass` maps to `UNKNOWN`. Never to the more common of the candidates, never
to a preference.

The live case is **`GAS_TANKLESS`, which stays unmapped** — a gas tankless may be
power-vented or sealed, and choosing one would invent the exact fact `combustionGate`
exists to establish. `UNKNOWN` then routes to manual selection or review, which is what
the flow would have done with no photograph at all.

This is not an adapter failure. It is the adapter declining to answer a question the
photograph did not answer.

### 1.7 Binding kinds — two, and they stay two

| Kind | What it does |
| --- | --- |
| `ANSWER_OPTION` | Selects an existing `AnswerOption` on a question in the service's own tree |
| `SERVICE_SUGGESTION` | Suggests which canonical service this is |

`SERVICE_SUGGESTION` is the correct abstraction for this data model, not a workaround:
answers are per-tree `AnswerOption.value` strings hanging off a Question off a Service
off a Contractor, so there is no platform-wide answer namespace to bind to. Several
distinctions that look like answers — standard fixture versus chandelier, and the
plumbing analogue of tank versus tankless — are **separate services**, not options.

That makes Visual Assist the image sibling of `lib/serviceMatch.ts`, and it inherits
serviceMatch's hardest-won rule: **a suggestion is confirmed by the customer and never
navigates on its own.** It may not silently select, navigate, or mutate the booking
service. "Describe a chandelier, get sent to Standard Light Fixture" is how that service
lost its money.

Do not generalize a third binding kind without a real use case in hand. Targets that
cannot yet resolve to a real `(questionKey, valueMap)` against a provisioned contractor
tree stay `UNBOUND` — an explicit, reviewable state. **Do not invent database question
keys** to give a binding somewhere to point.

### 1.7a One authoritative producer per single-valued fact

A composed service must have **exactly one** question that can write any given
single-valued fact. `fixture_access` and `drain_route` both answer into the platform's
single access slot; sixteen services composed both, so the customer was asked twice and
whichever answer arrived second won.

The split is by what the job **is**, not what it touches:

- work **on** the drain line (clearing, jetting, camera, drain repair) uses the
  drain/cleanout access question;
- fixtures and equipment that merely **connect** to a drain use their normal
  fixture/equipment access question.

`composeService` rejects any service where two families can write the same fact
(`DUPLICATE_FACT_WRITER`). It rejects unconditionally, because **no merge rule exists**:
the platform has one access slot and nowhere to express how two answers would combine.
Introducing a merge rule is a deliberate schema change, not something a template author
works around.

### 1.7b Every gate input must be reachable from the workflow

A gate whose fact no question in the composed workflow can establish refuses forever —
and it refuses as `NEEDS_REVIEW`, which nobody investigates. Thirty-five services were in
that state before the composition audit.

> **Every gate input must be reachable from at least one actual question, or an approved
> external fact source, in the composed workflow.**

A test that manufactures the required fact directly is not proof of reachability. The
verifier answers each service **only through its own composed questions**; a fact the tree
cannot establish comes back nullish and the service fails to scope.

Two corollaries, both applied:

- `capacity` belongs with the appliance/equipment family, because it comes from the same
  equipment identity, label and photo flow as the vent type.
- A gate with no legitimate producer is **dropped**, not left in place. A permanently
  unsatisfiable gate masquerading as `NEEDS_REVIEW` is worse than omitting the gate.

### 1.7c Composition is authoritative

**All provisioning and seed generation consume `composeService()` / `composeAll()` output.
No downstream code independently walks `service.families` and reconstructs ordering or
composition.**

Both composition defects were visible only in the assembled tree, so a second assembler is
a second place for them to hide. Enforced three ways:

1. `ComposedService` is **branded** with a module-private symbol, so it cannot be
   hand-rolled — the ordinary way to obtain one is to call `composeService`.
2. `composeAll()` is the seed path's entry point and **refuses as a whole**. A catalog
   where one service cannot compose is not a catalog to provision 62 from and skip the 63rd.
3. A verifier tripwire fails the build if anything outside `lib/plumbing` reaches into
   `.families`. It passes trivially today because no seed exists; it is there to fail on
   the day one is written the other way. (Proven by construction: a probe file that walked
   `service.families` failed the gate, and removing it restored it.)

The verifier itself is allow-listed — asserting an invariant about families requires
looking at them, the same exception `verify-us-spelling.ts` makes for the file that lists
the forbidden words.

### 1.8 What each side owns

| | Visual Assist | Plumbing |
| --- | --- | --- |
| Provider, prompt, schema, image handling | ✅ | ✗ |
| Confidence policy, thresholds, dispositions | ✅ | ✗ |
| Taxonomy and bindings | ✅ | ✗ |
| The plumbing adapter | ✅ | ✗ |
| Analysis persistence and audit rows | ✅ | ✗ |
| Canonical fact vocabulary (`CombustionClass` etc.) | ✗ | ✅ |
| Gates, families, scope logic | ✗ | ✅ |
| The 63 canonical services | ✗ | ✅ |

Neither side edits the other's files. Neither side edits a shared file to make the
other's verifier green.

---

## Part 2 — What plumbing still needs from shared files

Deferred, not forgotten. Each is a change something already written depends on.
Sequenced after the parallel workstreams stabilize.

### 2.1 `AppointmentKind.SERVICE_CALL` — `prisma/schema.prisma`

Additive enum value; the existing `@@index([bookingId, kind])` covers it.

`conditionGate` routes an observed `ACTIVE_FAILURE` to an on-site service call, which is
a paid visit that *produces* a scope rather than verifying one that exists. Electrical
models this as a `TroubleshootingSession` with no `Appointment` row, so this is new
behavior, not a rename.

Named `SERVICE_CALL`, not `DIAGNOSTIC` — see §1.4a. An enum value outlives every
rewording above it, and the platform should not learn plumbing's forbidden conclusion as
a schema constant.

Meanwhile: `lib/plumbing/appointments.ts` declares the shell with `platformKind: null`,
`shellIsSchedulable()` returns false, and the verifier asserts both. Nothing can schedule
it by accident and nothing has folded it into `PRE_WORK` — which would silently corrupt
every "was the scope verified" query.

### 2.2 Contractor credential records — the largest gap

The template names requirement *kinds* (`lib/plumbing/roles.ts`); whether a contractor
satisfies one is contractor configuration and has nowhere to live.

```prisma
model ContractorCredential {
  contractorId String
  key          String    // matches PlumbingRequirementKey
  heldAt       DateTime?
  @@unique([contractorId, key])
}
```

Every gas service declares `unsatisfied: "BLOCK_PUBLICATION"`, and there is currently
nothing for the publication guard to read — so that requirement is **declarative only**
today.

*Note for whoever writes it:* no license numbers or expiry dates in V1. They are
regulated personal data with a retention question attached, and nothing in the
publication path needs more than "has this contractor recorded that they hold this".

### 2.3 Trade-aware emergency screening — `lib/serviceMatch.ts`

`EMERGENCY_PATTERNS` is electrical: burning, sparking, shock, a hot outlet. None fire on
*"sewage backing up into my bathtub"* or *"I smell gas"*.

`lib/plumbing/intents.ts` holds the plumbing patterns, message and screen, all verified,
wired to nothing. `screenForEmergency()` needs to take the trade — or run the union,
which is the safer default for a contractor offering both.

A plumbing storefront today would accept an online booking, three days out, for a gas leak.

**Do not** solve this by copying the matcher into `lib/plumbing`. Two emergency screens is
two things to keep in step, and the one that goes stale is the one that matters.

### 2.4 Intent phrases in the keyword fallback — `lib/serviceMatch.ts`

`keywordFallback()` scores against service **names**, so "sillcock", "closet flange" and
"spigot" find nothing. Lower priority than 2.3 — this degrades matching, it does not
accept a dangerous booking.

### 2.5 A trade-aware "permit included" sentence — `lib/permitPolicy.ts`

`PERMIT_INCLUDED_DISCLAIMER` reads *"The electrical permit for this work…"*. Every
plumbing service currently declares `permit: "EXCLUDED"`, so the sentence in use is
already trade-neutral. The moment one declares `INCLUDED`, that module needs a plumbing
sentence — **not** a plumbing-local copy. It is deliberately the only copy, and
`verify-permit-policy.ts` exists to stop a seventh variant appearing.

### 2.6 Template seeding and canonical rows

The plumbing template is authored in TypeScript, so a seed step must write
`TemplateVersion` / `TemplateService` / `TemplateQuestion` / `TemplateAnswerOption` /
`TemplatePolicyDefinition` rows before `provision-from-template.ts` can reach it.

**The seed step must take `composeAll()` output from `lib/plumbing/composition.ts`.**
See §1.7c — it is the single ordering rule, it refuses as a whole, and its result type is
branded so the raw service-family list is structurally inconvenient to substitute.

`provision-from-template.ts` itself needs no change — it already takes `--trade`, resolves
canonical categories, and refuses to write economics. `TemplateVersion.trade` is a
`String`, so `"plumbing"` is writable today.

Also required: `CanonicalCategory` rows for the eleven plumbing categories, and
`CanonicalMaterial` / `CanonicalComponent` rows for the roles and component keys in
`lib/plumbing/mappings.ts`. None exist.

### 2.7 `package.json` — one final shared edit, once

```
&& tsx scripts/verify-plumbing-template.ts
```

**Not added, by policy.** `package.json` is treated as a single final shared-file edit:
every verifier is appended to the `verify` chain in one pass after the parallel
workstreams stabilize, rather than several sessions rewriting the same string. Runs
standalone meanwhile:

```bash
npx tsx scripts/verify-plumbing-template.ts
```

---

## Working rules for parallel sessions

- Stage **explicit files only**. No `git add -A`, no `git add .`, no broad commits.
- Do not edit another workstream's files to make a shared verifier green. Report the
  finding and let the owner fix it.
- Shared collision surfaces during this phase: `prisma/schema.prisma`,
  `lib/tenantGuard.ts`, `package.json`.
