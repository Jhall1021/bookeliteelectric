# G2 — trade-scoped troubleshooting

> ## IMPLEMENTED — pending G1 integration, 2 September 2026
>
> Architecture, runtime implementation and the database application are
> **approved and accepted**. Merge is **held** until G1 lands, because both
> change `prisma/schema.prisma`, `lib/routeResolver.ts` and `GuidedFlowEngine.tsx`.
>
> | | |
> | --- | --- |
> | Acceptance | **28/28** — all eight cases, against a multi-trade contractor the verifier builds and removes |
> | `Service.tradeKey` | Applied to `price2book-production`: `text`, nullable, **no default** |
> | Backfill | 154 stamped `electrical`; 0 unclassified, 0 classified as anything else |
> | Regressions | `tsc` clean · troubleshooting route contract passes · ADR-021 **2 passed, 0 failed** |
>
> **Locked decisions — D1–D4.**
>
> **D1 — Provenance-less services get an explicit dated backfill, never a
> default.** `Service.tradeKey` is nullable with no schema default. Null means
> *trade not established* and fails closed; it does not mean electrical.
>
> **D2 — `/api/troubleshooting` takes the originating service, not a trade.**
> The browser sends `serviceId`; the server resolves it in-tenant and reads the
> durable trade. A client-supplied `tradeKey` is never accepted. One trade, one
> answer — no per-trade list.
>
> **D3 — G2 does not depend on `ContractorTrade`.** That table answers which
> trades a *contractor* sells; routing depends on which trade a *service*
> belongs to. Elite's missing enrolment rows are a separate concern with a
> separate owner, and are untouched.
>
> **D4 — One runtime routing authority; planning surfaces may query separately.**
> See §4.1.
>
> **Custom-service authoring is trade-scoped.** `/dashboard/services/new` shows
> a required Trade choice from the server-authoritative published set, the API
> validates it and stamps `tradeKey`. Never inferred — including from "only one
> trade exists today". A single option is preselected but still stored as a
> choice.
>
> **The invariant is `active_service_has_trade`**, broader than the original
> route-reachable rule: every active service must have a trade, so a new
> null-trade service cannot exist even before anything routes through it.

*Audit and proposal below, written before implementation. Branch
`feat/g2-trade-scoped-troubleshooting`, cut from `main` at `3fbd2d5`. The active
Plumbing rehearsal branch is not touched.*

**Ownership.** The platform/HVAC architecture workstream owns the audit and the
shared design. The Plumbing rehearsal owns the integration proof **after** the
design is locked — §6. That separation is the point: a rehearsal-specific
workaround could prove Plumbing green and leave the same defect waiting for HVAC.

---

## 1. The invariant

> **A troubleshooting reroute resolves within the originating service's trade
> and contractor. Another trade's diagnostic service is INVISIBLE to that
> lookup — not counted as ambiguity.**

The second half matters as much as the first. Today a second trade's diagnostic
makes the lookup *ambiguous*, which is a refusal. Under the invariant it is not a
candidate at all, so it cannot make anything ambiguous.

---

## 2. What the audit found

### 2.1 The reported defect is real, and it is one of four

`lib/troubleshooting.ts` searches `contractorId + TROUBLESHOOT_ONLY + active`
with **no trade dimension**, and refuses when it finds more than one. That is the
known defect. The audit found **three more lookups answering the same question**,
none of which goes through the shared module:

| Where | How it asks | What it does with two |
| --- | --- | --- |
| `lib/troubleshooting.ts:65` `findTroubleshootingService` | `findMany`, ordered | **Refuses** — "not decidable". Loud, and the only honest one |
| `lib/onboardingReadiness.ts:279` | `findFirst`, **no `orderBy`** | **Silently picks one.** Readiness then reports on another trade's diagnostic |
| `lib/serviceActivation.ts:215` | `findFirst`, **no `orderBy`** | **Silently picks one.** Tells the contractor to launch the wrong service first |
| `app/dashboard/setup/page.tsx:136` | `.find()` over offered rows | **Silently picks one.** Orders the wrong prerequisite in Review & Launch |

Three of the four fail **silently**, and `findFirst` without `orderBy` is not
even deterministic in Postgres — the same contractor can get different answers on
consecutive requests.

**Consequence for the design:** adding a trade parameter to
`findTroubleshootingService` alone would fix the loud failure and leave three
quiet ones. Whatever G2 does must make the other three consume the same
authority, or delete their local queries.

### 2.2 The real finding — a live `Service` has no durable trade identity

This is the platform-model change underneath G2, and every candidate source
fails:

| Candidate | Why it cannot answer "what trade is this service?" |
| --- | --- |
| `Service.templateVersionId → TemplateVersion.trade` | **75 of 154 live services have it. 79 do not.** Elite's entire catalog is null, including its diagnostic. The schema is also explicit that it is *"a RECORD, not a link: nothing reads through it at request time, and a contractor-authored row leaves both null"* |
| `ContractorTrade.tradeKey` | Says which trades a **contractor** is enrolled in, not which trade a **service** belongs to. **One row exists in the entire database**; Elite is enrolled in nothing |
| `CanonicalCategory` | Has **no trade field** — `id`, `slug`, `name`, `defaultIcon`, `active`, and nothing else |
| Category slug | See 2.3. Structurally unsound, and unsound *exactly* where G2 needs it |
| Service name or slug | Ruled out. Elite's diagnostic is `electrical-troubleshooting`, which is a name, not an identity — and `lib/troubleshooting.ts` was written specifically to stop identifying it that way |

**So there is nothing to filter on.** G2 cannot be implemented as a query change,
because the column the query would filter by does not exist.

### 2.3 Why category cannot stand in — the collision is on the diagnostic itself

`CanonicalCategory.slug` is **globally unique**; 13 rows exist, all Electrical.

Plumbing's frozen catalog declares a category `service-calls`. HVAC's proposed
catalog declares a category `service-calls`. Both hold that trade's service call.

So either the two trades **share one canonical category row** — in which case
category cannot identify trade, and specifically cannot for the diagnostic
service, which is the only service G2 is about — or one trade renames a category
to work around a lookup, which is a naming decision driven by a query.

The one category where trade identity matters most is the one two trades already
want to share. Category is not a fallback; it is the clearest proof that the
identity is missing.

### 2.4 The proof harness is not accidentally covering this

Both rehearsal contractors are enrolled in `plumbing` only. Live enrollment is
`brightpath-electric: electrical`, `elite-electric: (none)`. The multi-trade case
is genuinely unexercised.

---

## 3. The model change — `Service.tradeKey`

**Proposed:** a durable trade identity on the live service.

```prisma
/// Which trade's catalog this service belongs to.
tradeKey String?
```

Why on `Service` rather than derived:

- **It survives contractor authoring.** A contractor-authored service has no
  template provenance and never will; it still belongs to a trade.
- **It is what the routing question actually asks.** "Which of my diagnostics
  belongs to the trade this customer is booking in" is a property of the service.
- **It does not read through provenance.** `templateVersionId` stays what the
  schema says it is — a record, not a link.
- **Same shape as `TemplateVersion.trade` and `ContractorTrade.tradeKey`**: a
  validated `String`, not a foreign key, because trade is not an entity in this
  schema. If a `CanonicalTrade` ever arrives it becomes a key and nothing already
  written is undone.

**Nullable, deliberately.** `null` means *trade not established* and must be
distinguished from any trade — the same missing-is-not-a-value discipline G1
applied to access slots. A null-trade service is not "electrical by default".

### 3.1 Where the value comes from

| Source | For |
| --- | --- |
| Provisioning | Template-installed services — the trade of the `TemplateVersion` being installed, stamped at write time. Covers all 75 that have provenance and everything installed hereafter |
| Backfill | The 79 without provenance. **This is a decision, not a mechanical migration** — see the open question in §7 |
| Contractor authoring | Whatever trade the contractor is creating within |

---

## 4.1 One RUNTIME authority — and two legitimate planning queries

*Corrected after implementation. "All four now call
`findTroubleshootingService`" would be false, and the difference matters.*

> **One runtime routing authority. Planning surfaces may use separate
> availability queries, but must preserve the same trade identity and ambiguity
> semantics.**

| Surface | Asks | Uses |
| --- | --- | --- |
| `routeResolver`, `/api/troubleshooting` | *What ACTIVE diagnostic can this customer be routed to in this trade?* | `findTroubleshootingService` — the one runtime authority |
| `serviceActivation` | The same question, about the same destination | `findTroubleshootingService` |
| `onboardingReadiness` | *Is there a prerequisite in this trade, and what STATE is it in?* — needs the row **when it is not yet active** | Own scoped query |
| `dashboard/setup` launch ordering | *Which offered-but-not-live service must launch first?* | Own trade-indexed map |

The two exceptions are availability differences, not identity differences.
Teaching the runtime authority to optionally return inactive rows would blur a
safety boundary that is currently useful: it exists to answer what a homeowner
can actually reach.

**Both preserve identity semantics exactly** — contractor plus exact `tradeKey`,
other trades invisible, zero same-trade candidates a distinct deliberate
outcome, and multiple same-trade candidates refusing rather than choosing a
winner. That last property is what the pre-G2 `findFirst` violated.

## 4.2 The API, as locked

The likely shape is `findTroubleshootingService(db, contractorId, tradeKey)`.
**This proposal does not lock that signature**, because the audit's answer to
"where does `tradeKey` legitimately come from" has a consequence the caller
inherits:

- `lib/routeResolver.ts:240` has the originating service in hand, so it reads
  that service's own `tradeKey`. Clean.
- `app/api/troubleshooting/route.ts:32` has a **site and a contractor**, not a
  service. It has no trade to pass, and inventing one at the call site is exactly
  the inference this proposal forbids.

That second caller is the design question, not a detail. Settling it is what
locks the signature — §7.

---

## 5. Acceptance cases

| # | Case | Required outcome |
| --- | --- | --- |
| 1 | Electrical + Plumbing contractor, one diagnostic per trade — Electrical reroute | Resolves the **Electrical** diagnostic |
| 2 | Same contractor — Plumbing reroute | Resolves the **Plumbing** service call |
| 3 | HVAC added later to the same contractor | Cases 1 and 2 **unchanged** |
| 4 | Zero active diagnostics **within that trade** | **Fails closed** — refuses, names the trade |
| 5 | Two active diagnostics **within one trade** | **Fails closed** — ambiguous, as today |
| 6 | A diagnostic in **another** trade | **Never causes ambiguity.** Invisible, not counted |
| 7 | Single-trade contractor | **Behaves exactly as before** — no new refusal, no changed destination |
| 8 | Tenant isolation | **Unchanged.** Still a tenant-rooted top-level query scoped to `contractorId` |

Case 7 is the regression gate. Case 6 is the one that distinguishes this design
from "add a filter and hope" — a second trade's diagnostic must stop being a
candidate, not become a tie-breaker.

---

## 6. What the Plumbing rehearsal is asked for — after the design locks

Small, explicit, and **theirs to write**:

> Make at least one proof contractor genuinely multi-trade — enrolled in more
> than one trade with a diagnostic in each — and exercise a Plumbing
> `REROUTE_TROUBLESHOOTING` path against the **shipped shared lookup**,
> asserting it resolves the Plumbing service call and not another trade's.

They own the rehearsal edit. G2 owns the shared behavior. The rehearsal validates
the solution; it does not design it, and it must not carry a local workaround
that makes Plumbing green while the defect waits for HVAC.

---

## 7. Open questions — these block the signature, not the model

1. **What trade do the 79 provenance-less services get?** Every one is
   Electrical today, so `'electrical'` is factually right and trivially
   verifiable. But writing it as a default rather than a one-time stamped
   migration would make "electrical" the meaning of null, which is the failure
   the nullable column exists to prevent. Recommend: an explicit dated backfill
   over the known set, never a column default.

2. **What does `/api/troubleshooting` pass?** It has a site, not a service —
   §4. Options: take a trade parameter from the caller; take the originating
   service and read its trade; or return per-trade results. This is the one
   genuine design decision left.

3. **Does Elite need `ContractorTrade` rows?** It has none, and enrollment is
   validated against published template trades. If service-level `tradeKey`
   answers the routing question, enrollment may not need to change for G2 at all
   — worth confirming rather than assuming, since it is a different table with a
   different owner.

4. **Do the other three lookups adopt the shared function, or keep local
   queries with a trade filter?** Recommend adopting: four implementations of one
   question is how they drifted, and three of them already fail silently.

---

## 8. What this does not propose

No change to `BookingType`, to `TROUBLESHOOT_ONLY` as the role marker, to the
tenancy model, or to `lib/plumbing/**`. No rehearsal edit. No new trade entity.
The identity-by-role decision in `docs/audits/troubleshooting-route-contract.md`
stands — G2 adds the missing second dimension to it, and changes nothing else.
