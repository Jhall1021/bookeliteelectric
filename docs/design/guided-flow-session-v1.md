# GuidedFlowSession V1 — shared booking-flow persistence

**Status:** implemented and fully proven, live, on `feat/guided-flow-session`
(off `origin/main`). Not `feat/route-assist-v1`, not merged — stopping here
per instruction, before anything is merged. Route Assist and Device
Handoff's own branch stays as its accepted, independent checkpoint — see
`docs/design/device-handoff-v1.md`.

**What "fully proven, live" means, concretely (§9, §11):** every claim in
this document was checked against a real running dev server, a real
service in the catalog (`replace-standard-outlet`, `replace-gfci-outlet`),
and a real Postgres database (the dedicated rehearsal Neon branch, §8) —
not simulated, not mocked. That includes single-device reload/resume
through the browser, and the full cross-device handoff + optimistic-
concurrency scenario at the real HTTP layer, simulating two independent
devices with two independent cookie jars.

**Purpose, stated once so it doesn't drift while building:** establish
canonical server-side persistence and concurrency authority for an
in-progress homeowner Guided Pricing flow. Device Handoff becomes this
architecture's first major cross-device consumer, not its reason for
existing.

## 1. What already exists (re-inspected fresh for this branch)

### 1.1 The tree walk is, and stays, entirely client-side

`components/guided-flow/GuidedFlowEngine.tsx` fetches one `ServiceFlowDTO`
(`GET /api/services/[slug]`) — the **full tree**, every question and every
answer option, self-contained — once, on mount. From then on, `evaluate()`
and `advanceFrom()` walk it **purely in the browser**, against a local
`answers: Record<string,string>` map, using `lib/pricing.ts`'s
`applyBranch`/`customerPrice`. No per-question server round-trip exists
today.

### 1.2 The server never derives "what's next" — only "what does this total to"

`lib/routeResolver.ts`'s `resolveRoute(service, answers, isPrimary,
settings)` is explicitly documented **"STATELESS BY DESIGN... No
server-side flow state, no session-held partial route"**, and it requires
answers for *every* question along the resolved path — an incomplete
answer set returns `INVALID`, not "here's the next question." It is a
terminal-outcome resolver, called only at the two write boundaries
(`POST /api/visit`, `POST /api/quotes`) to independently re-derive the
price from what the client says the customer chose. It is not, and must not
become, a mid-flow "what question is next" engine.

**This is the load-bearing fact for the whole design.** There is no
existing server-side capability to compute "the next question" from a
partial answer set, and building one would be exactly the "second routing
engine" the brief prohibits. So resume cannot work by asking the server
"where was I" — it has to work by giving the **client** back the same
inputs it already knows how to walk.

### 1.3 The existing precedent for exactly this: `REROUTE_HANDOFF_KEY`

`components/guided-flow/RerouteNotice.tsx` already carries answers across a
navigation via `sessionStorage`, tagged with the target service id,
consumed once on mount, cleared immediately (`GuidedFlowEngine.tsx:132-160`).
GuidedFlowSession is the **same idea**, generalized: a server-held mirror
of `answers` (plus identity/lifecycle bookkeeping) instead of
`sessionStorage`, so it survives a reload and reaches a second device. The
consuming code path — restore `answers`, then call the *existing,
unmodified* `advanceFrom`/`evaluate` — is unchanged in kind, only in where
the answers came from.

### 1.4 Existing identity, tenancy and terminal-write precedent

- **Anonymous homeowner identity already exists and is not being
  reinvented.** `lib/session.ts`'s `elite_session_id` cookie (or
  `x-price2book-visit` header for embeds) is a 32-byte random, *unhashed*
  bearer token naming a homeowner across requests, scoped to a contractor
  only via the resolved site (ADR-011) — never a tenant claim on its own.
  `GuidedFlowSession` is keyed off this same token, not a new identity.
- **`Visit`** (`prisma/schema.prisma:2377-2401`) is the cart — lazily
  created only on first `POST /api/visit` (`findOrCreateOpenVisit`), status
  `OPEN | CHECKED_OUT | ABANDONED`, `sessionId String?` (nullable),
  `@@index([contractorId, sessionId, status])`, "at most one OPEN visit per
  contractor+session" enforced as a **contract-phase invariant, not a DB
  constraint** (documented as such — Prisma can't express a partial
  unique). `GuidedFlowSession` sits **above** `Visit`, not nested under it:
  a customer can be mid-flow on a service with no `Visit` row yet.
- **Terminal writes already replay, not trust.** `POST /api/visit` takes
  `{ serviceId, answersSnapshot }`, calls `resolveRoute` itself, and
  explicitly warns+ignores a client-sent price
  (`app/api/visit/route.ts:49-54`). This is the same discipline
  `GuidedFlowSession` extends earlier in the flow — it stores what the
  customer *said*, never what the client computed.
- **`LineItem.answersSnapshot` / `Quote.answersSnapshot`** are already
  `Record<string,string>` Json blobs with this exact shape.
  `GuidedFlowSession.consumedAnswers` is the same shape captured earlier,
  not a new vocabulary.
- **No optimistic-concurrency pattern exists anywhere in this schema yet**
  (checked: no `version Int` + conditional-update idiom in
  `prisma/schema.prisma`). §5 below introduces the standard Prisma
  idiom — new to this codebase, not a novel invention.
- **Tenancy:** `lib/tenantGuard.ts`'s `TENANT_SCOPED_MODELS` is a flat set
  of model names with a direct `contractorId` scalar, guard-enforced.
  `GuidedFlowSession`, `GuidedFlowVisualAssistTask` and `DeviceHandoff`
  belong there (see §4).

## 2. Reconciliation, reconfirmed for this branch

Per `docs/design/device-handoff-v1.md §5` (read-only pass, 10 Sep 2026): no
active branch introduces session/draft persistence; the two branches
touching this area
(`feat/g2-trade-scoped-troubleshooting-isolated`,
`feat/shared-typed-question-validation`) both make narrow, unrelated
changes (`Service.tradeKey` threading; a `QuestionValidationRule` enum).
Re-checked at the start of this branch — nothing changed. `origin/main` at
the base of this worktree already includes PR #44 (admin redesign); neither
of those two branches has merged, so this branch expects to rebase past
whichever lands first, same conclusion as before.

## 3. Design: keep the database a mirror, not a router

The single governing decision: **`GuidedFlowSession` stores only what the
customer told us — `consumedAnswers` — never a computed "current question"
or "next state."** "Where the flow is" is *always* re-derived by handing
`answers` back to the unmodified client walk against a freshly-fetched
`ServiceFlowDTO`. This is what makes the equivalence proof (§7) possible at
all, and what keeps `resolveRoute`, `evaluate`, `advanceFrom` and
`applyBranch` completely untouched by this branch.

```
Resume, on any device:
  1. GET /api/services/[slug]         (existing, unchanged — the tree)
  2. GET /api/guided-flow-sessions/active?serviceSlug=...  (new — the answers)
  3. GuidedFlowEngine seeds `answers` from (2) instead of `{}`,
     then calls the SAME advanceFrom() it already calls today.
```

Nothing about step 3 is new code in `evaluate`/`advanceFrom` — it's a new
*source* for the initial `answers` value, exactly parallel to how the
reroute handoff already seeds it from `sessionStorage` today
(`GuidedFlowEngine.tsx:138-160`).

## 4. Schema

All additive. No existing model's columns change. New file:
`prisma/schema.prisma` additions (exact DDL reviewed before `db push`, §8).

```prisma
enum GuidedFlowSessionStatus {
  ACTIVE
  COMPLETED
  ABANDONED
}

/// Canonical server-side mirror of an in-progress homeowner Guided Pricing
/// flow. Owns none of: route resolution, pricing, Route Assist semantics,
/// or Device Handoff semantics — see docs/design/guided-flow-session-v1.md
/// §3. It stores what the customer told us and nothing this system computed
/// from it, on purpose: resolveRoute stays the only price authority, and
/// GuidedFlowEngine's client walk stays the only "what's next" authority.
model GuidedFlowSession {
  id           String @id @default(cuid())
  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id], onDelete: Cascade)

  /// The SAME anonymous token lib/session.ts already issues for the cart —
  /// not a new homeowner identity. Unhashed, matching Visit.sessionId's own
  /// precedent; this is a bearer capability already scoped by contractor
  /// resolution (ADR-011), same as every other read/write keyed on it.
  sessionId String

  serviceId   String
  service     Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  /// Denormalized — survives a rename; same precedent as PriceSightAnalysis's
  /// serviceSlug/serviceName snapshot fields.
  serviceSlug String

  /// Same shape as LineItem.answersSnapshot / Quote.answersSnapshot. This is
  /// not a new vocabulary — it's the existing one, captured earlier.
  consumedAnswers Json    @default("{}")
  customerNote    String?

  status GuidedFlowSessionStatus @default(ACTIVE)
  /// Optimistic concurrency — §5. Every write supplies the version it read;
  /// a stale write is rejected, never silently overwritten.
  version Int @default(0)

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  lastActivityAt DateTime  @default(now())
  completedAt    DateTime?

  /// What this session became, once it becomes something. Deliberately a
  /// bare id, not a Prisma relation — LineItem/Quote are not touched by this
  /// migration; see §8's migration-safety note on why.
  lineItemId String?
  quoteId    String?

  visualAssistTasks GuidedFlowVisualAssistTask[]
  deviceHandoffs    DeviceHandoff[]

  /// The lookup every "find or create the active session for this
  /// browser+service" call uses. NOT unique, same reasoning as Visit's own
  /// index comment: "at most one ACTIVE session per contractor+session+
  /// service" is a contract-phase invariant, not a DB constraint Prisma can
  /// express as a partial unique.
  @@index([contractorId, sessionId, serviceId, status])
  @@map("guided_flow_sessions")
}

enum VisualAssistTaskType {
  ROUTE_ASSIST
  PHOTO_CAPTURE
}

enum VisualAssistTaskStatus {
  PENDING
  COMPLETED
}

/// A lightweight, generic pointer: "this flow asked for a camera-based
/// task, here's whether it's done." Deliberately NOT a Route Assist model —
/// Route Assist owns its own result shape and, eventually, its own
/// persisted table (docs/design/route-assist-v1.md §6); this row is shared
/// guided-flow infrastructure that any Visual Assist task type can register
/// against. `result` is a generic JSON payload for now, since neither
/// Visual Assist nor Route Assist has its own persisted result table yet —
/// documented as a transitional home, not a permanent one.
model GuidedFlowVisualAssistTask {
  id                  String @id @default(cuid())
  guidedFlowSessionId String
  guidedFlowSession   GuidedFlowSession @relation(fields: [guidedFlowSessionId], references: [id], onDelete: Cascade)

  taskType VisualAssistTaskType
  /// Caller-assigned, opaque to this model — e.g. which question/step in the
  /// tree asked for this task, for display only.
  taskKey String?

  status VisualAssistTaskStatus @default(PENDING)
  /// The canonical result once COMPLETED — e.g. a RouteAssistResult JSON.
  /// One task, one result, visible to every client reading this session —
  /// never a per-device copy.
  result Json?

  createdAt   DateTime  @default(now())
  completedAt DateTime?

  @@index([guidedFlowSessionId, taskType])
  @@map("guided_flow_visual_assist_tasks")
}

enum DeviceHandoffTaskType {
  ROUTE_ASSIST
  PHOTO_CAPTURE
  VISUAL_ASSIST
}

enum DeviceHandoffStatus {
  AVAILABLE
  CONNECTED
  COMPLETED
  EXPIRED
  REVOKED
}

/// Shared cross-device continuation infrastructure — deliberately outside
/// Visual Assist and not owned by GuidedFlowSession either. Matches
/// lib/device-handoff/'s already-proven pure domain (token.ts, lifecycle.ts)
/// exactly; this is that domain's first real persistence, not a redesign of
/// it. tokenHash only, never the raw token — same rationale as
/// ContractorInvitation.
model DeviceHandoff {
  id                  String @id @default(cuid())
  guidedFlowSessionId String
  guidedFlowSession   GuidedFlowSession @relation(fields: [guidedFlowSessionId], references: [id], onDelete: Cascade)

  taskType DeviceHandoffTaskType
  taskId   String?

  tokenHash String              @unique
  status    DeviceHandoffStatus @default(AVAILABLE)

  expiresAt   DateTime
  connectedAt DateTime?
  completedAt DateTime?

  createdAt DateTime @default(now())

  @@index([guidedFlowSessionId, status])
  @@map("device_handoffs")
}
```

**Deliberately NOT touching `LineItem`/`Quote`** to add a back-reference —
`GuidedFlowSession.lineItemId`/`quoteId` are bare, unenforced ids (same
precedent as `PriceSightAnalysis`'s `serviceId String // the live row, for
navigation only`). Smaller migration surface, zero risk to two of the
most heavily-used models in the schema, and the bookkeeping need (`what did
this become`) doesn't require a DB-level FK to be satisfied.

## 5. Concurrency

Standard Prisma optimistic-concurrency idiom — new to this codebase (none
existed to copy), but not a novel invention:

```ts
const result = await db.guidedFlowSession.updateMany({
  where: { id, version: expectedVersion, status: "ACTIVE" },
  data: { consumedAnswers, customerNote, version: { increment: 1 }, lastActivityAt: new Date() },
});
if (result.count === 0) {
  // Either the version moved (a newer write already landed) or the session
  // is no longer ACTIVE. Caller re-fetches current state; never retried
  // blindly with the same stale payload.
  return 409;
}
```

**Proof required by the brief (§8 of the Device Handoff follow-on brief):**
desktop holds version N; phone advances to N+1 (completes Route Assist);
desktop attempts a write still asserting N → rejected (`count === 0`);
desktop re-fetches, sees the phone's N+1 state, including the Route Assist
result; nothing is lost. Proven live in §11.2.

## 6. Compatibility during an active session

**Correction made during implementation:** the design originally proposed a
`serviceUpdatedAtSnapshot DateTime` field, compared against
`Service.updatedAt` on resume, purely as an early-detection convenience.
Building it turned up a fact §1 missed on first read: **`Service` has no
`updatedAt` (or `createdAt`) column at all** — confirmed by Prisma's own
validation error listing every available field on the model. Adding one
would mean touching a model this design otherwise goes out of its way not
to touch (§4's `LineItem`/`Quote` reasoning applies identically here), for
a field that was already documented as a nice-to-have, not load-bearing.
**Cut, not worked around.**

What actually protects a customer when a contractor edits the tree
mid-session needs no new field at all, because it was never the snapshot's
job — it's `resolveRoute`'s existing, unconditional behavior. Per the
brief's "reuse existing booking freeze/version semantics" instruction: this
is the existing case, not a new one. `resolveRoute`'s `INVALID` path
already covers "the answer doesn't map to anything on this question...
usually means the tree changed under a customer mid-flow"
(`lib/routeResolver.ts:373-379`) and "no answer for" (a question the stored
answers don't cover, e.g. because the tree grew a new required question).
GuidedFlowSession adds no tree-change handling of its own — it hands the
client back to the exact same fetch-tree-and-walk path a fresh visitor
takes, and if the tree changed underneath, the client's own existing walk
surfaces exactly the same review/error outcome it already would for
anyone, at the exact same terminal-write boundary (`/api/visit`,
`/api/quotes`) that already guards every booking today. Nothing about this
is new exposure; a resumed session is no more (and no less) protected than
a browser tab that's simply been left open on a question for a while,
which is already possible today and already handled.

## 6.1 Access control — how a second device becomes authorized, precisely

Every `GuidedFlowSession`/`GuidedFlowVisualAssistTask` route checks the
caller's own anonymous session token (`lib/session.ts`'s existing
`elite_session_id`) against the row's stored `sessionId`, and 404s on a
mismatch — never 403, so a guessed id can't confirm a session exists
(same shape `DELETE /api/visit` already uses).

That check alone would make a second device unable to reach a session it
didn't create — which is the whole point of Device Handoff. The join
happens in exactly one place: `GET /api/device-handoffs/resolve`. On a
valid, unexpired, unrevoked token, it sets the resolving browser's
`elite_session_id` cookie to the **same value** already stored on the
target `GuidedFlowSession` — the phone becomes a second genuine holder of
the same anonymous bearer identity, the same way two tabs in one browser
already implicitly are. From that moment, every other route's ownership
check passes for the phone with no special case, because there genuinely
is no difference between "two tabs" and "two devices" once the token is
shared. This is deliberate: a resumed session is authorized to do exactly
what the anonymous token it received already permits — narrow the visit to
one contractor's cart (ADR-011) — and nothing more. It is never given, and
has no path to, contractor/admin/platform access; it never touches
`ContractorMembership`, Better Auth, or any authenticated identity at all.
Proven live in §11.2.

## 7. Equivalence proof — plan, then what actually happened

The claim: **resuming a session and answering fresh produce identical
`GuidedFlowEngine` state for the same answers.** Proved by construction,
not by parallel implementation — there is only one walk (§3), unmodified.

The plan here originally proposed a synthetic, no-browser, no-DB script:
seed a `ServiceFlowDTO` fixture, walk it twice with the same answers from
two different sources, diff the result. **Not built, superseded by
something strictly stronger.** Extracting `advanceFrom`/`evaluate` out of
`GuidedFlowEngine.tsx` into a standalone testable function — the only way
to drive them from a plain script — would itself be exactly the kind of
change to the existing walk this whole design goes out of its way to
avoid (§3, §6). Since the real component was going to be wired up for the
browser proof anyway (§11.1), that proof **is** the equivalence proof, and
a more honest one: it exercises the actual `GuidedFlowEngine.tsx` code
path a real customer runs, not a hand-extracted stand-in for it. See §11.1
for the result — reload after answering, resume lands on the byte-identical
resolved price, with zero lines of `evaluate`/`advanceFrom` changed to make
that true.

## 8. Migration safety — rehearsed and proven, 10 Sep 2026

### 8.0 Scope, reconciled — exactly what this feature adds

**Three models, five enums, confirmed by re-reading the actual schema, not
by recount from memory** (an earlier informal summary in this session said
four enums — that was a miscount made before the schema was final, not a
later design change; the fifth was always there once
`GuidedFlowVisualAssistTask` got its own model):

| Enum | Values | Why it's separate from the others |
|---|---|---|
| `GuidedFlowSessionStatus` | `ACTIVE`, `COMPLETED`, `ABANDONED` | The flow's own lifecycle (§9 of the brief's vocabulary) |
| `VisualAssistTaskType` | `ROUTE_ASSIST`, `PHOTO_CAPTURE` | What kind of camera task was requested on a session |
| `VisualAssistTaskStatus` | `PENDING`, `COMPLETED` | A task's own two-state lifecycle — **not** the same vocabulary as the session's three-state one, even though both models can be "COMPLETED" at the same moment for different reasons |
| `DeviceHandoffTaskType` | `ROUTE_ASSIST`, `PHOTO_CAPTURE`, `VISUAL_ASSIST` | What a handoff token is *for* — copied from Route Assist's own pure domain (`lib/device-handoff/types.ts`), unchanged |
| `DeviceHandoffStatus` | `AVAILABLE`, `CONNECTED`, `COMPLETED`, `EXPIRED`, `REVOKED` | A handoff token's own five-state lifecycle, also copied unchanged from Route Assist's pure domain |

`VisualAssistTaskStatus` is the one worth naming explicitly: it would have
been tempting to reuse `GuidedFlowSessionStatus` or invent a shared
"done/not done" enum across all three models, but a task, a session, and a
handoff are three genuinely different things that all happen to use the
word "COMPLETED" — collapsing them into one enum would make a future
schema change to one silently able to affect the other two. Kept separate
on purpose, not by oversight.

**Confirmed additive, re-verified directly against the diff, not asserted:**
`git diff 2c4d821 origin/feat/guided-flow-session -- prisma/schema.prisma`
contains **zero removal lines** — not one existing enum member, column,
index, or type was touched. Every line in that file's diff is a pure
addition.

### 8.0.1 Two separate things, kept separate in this document on purpose

**This feature's own schema change** (§4 above) — 3 models, 5 enums, 0
existing-column changes, described in full above.

**Pre-existing schema drift already committed on `origin/main`** (§8.1
below) — unrelated destructive changes (an enum-value removal, two column
drops with real data, three new constraints) that some *other*,
already-merged work introduced to `schema.prisma` before this branch
existed, and that the live database simply hasn't caught up to yet. This
branch didn't create that drift and doesn't resolve it — `db push` just
can't apply *anything* to the rehearsal clone, including this feature's
own additive change, without also being told to accept it. **Nothing
about accepting it on a disposable rehearsal clone authorizes running the
same command, or any command, against production. That drift's actual
resolution is a separate, later release/migration decision for whoever
owns it — not scoped, not started, not implied by anything in this
document.**

- Purely additive: **three new models, five new enums** — see §8.0 for the
  exact names and the reasoning, and zero changes
  to any existing model's columns, indexes, or types.
- Rehearsed on a dedicated Neon branch created off the actual production
  lineage for this work alone — `br-sparkling-band-axoiwyf5`
  (endpoint `ep-red-shadow-axi5fqgd`), parented on `br-delicate-shape-axk2kvxa`
  = production (endpoint `ep-icy-hill-axkgrsjb`) — **not** the shared
  `pass-three-contract-rehearsal` branch (`br-noisy-surf-axvy9c0s`, endpoint
  `ep-summer-hall-axkpjhec`) other sessions may be using concurrently
  (memory: shared-rehearsal-db-races). Branch identity re-confirmed against
  Neon's own API (`primary`/`default` flags, and the branch→endpoint
  mapping) immediately before every command that wrote to it.
- No `prisma/migrations` history exists in this repo — confirmed before
  choosing a tool. This project uses `prisma db push` exclusively (the same
  mechanism `scripts/contract-branch-rehearsal.sh` uses for its own,
  unrelated "contract" pipeline). Followed that convention rather than
  introducing a migration-file workflow this repo doesn't otherwise use.
- **A real design defect was found and fixed by the rehearsal, not by
  review:** the original schema proposed `serviceUpdatedAtSnapshot
  DateTime`, compared against `Service.updatedAt`. `Service` has no
  `updatedAt` (or `createdAt`) column — Prisma's own validation error
  caught it. Cut rather than worked around; see §6 for why nothing is lost
  by cutting it.
- **Unrelated pre-existing drift, found and explicitly separated from this
  migration's own result:** production's live schema is significantly
  behind what's already committed on `origin/main` — `db push` required
  `--accept-data-loss` for a `BookingStatus.CANCELED` enum-value removal,
  two column drops with real data (`answer_option_disclaimers.disclaimerId`,
  `pricing_settings.targetRateCents`), and three new unique constraints,
  plus 24 other already-committed tables that don't exist on the live
  database yet (template versioning, appointments, payment events, and
  more — none of it related to this branch). **None of this schema.prisma
  content was authored by this branch; it predates it.** Applied only to
  the disposable rehearsal clone, with explicit approval scoped to that
  clone, specifically not as authorization to run the same command against
  production — that needs its own separately reviewed migration/deployment
  strategy.
- **Evidence.** Before: 51 tables, 18 enums. After: 78 tables, 34 enums —
  the delta includes this branch's 3 tables/5 enums plus the 24
  already-committed-but-undeployed tables above. Zero tables were removed.
  Column-level structure of all three new tables (every column, every
  foreign key, every index) read back from `information_schema` and
  confirmed to match the schema file exactly.
  `scripts/verify-guided-flow-session-persistence.ts` — create, read back,
  optimistic-concurrency accept, optimistic-concurrency reject-and-preserve,
  cascade delete, pre-existing contractor/service/visit/line-item data
  (1 contractor, 75 services, 33 visits, 39 line items, 150 questions)
  confirmed untouched — 13/13 checks pass against the rehearsal branch.
- Existing flows are unaffected by construction: nothing reads or writes
  these new tables unless `GuidedFlowEngine.tsx` is explicitly wired to
  (§10), and that wiring is additive (new code paths triggered by presence
  of a resumed session), not a replacement of the existing
  fetch-and-walk-from-empty path.

## 9. Work plan (all done)

1. ~~Push `feat/route-assist-v1`~~ — done.
2. ~~Separate branch, fresh inspection~~ — done (§1–§2).
3. ~~Finalize schema + invariants~~ — done (§4–§6).
4. ~~Implement persistence foundation~~ — done: Prisma models rehearsed and
   proven on an isolated Neon branch (§8), `lib/tenantGuard.ts` registration
   done and independently confirmed by `audit-unguarded-tenant-access.ts`
   and `verify-tenant-indexes.ts` (§11).
5. ~~Application-code persistence library + API routes~~ — done:
   `lib/guidedFlowSession.ts`, `lib/deviceHandoffStore.ts`,
   `app/api/guided-flow-sessions/*`, `app/api/device-handoffs/*`.
6. ~~Prove single-device reload/resume~~ — done, in a real browser against a
   real live service (§11.1) — a stronger proof than the pure-function
   equivalence test §7 originally proposed; see §7's note on why.
7. ~~Concurrency proof~~ — done twice: once directly against Prisma (§8),
   once at the real HTTP API layer simulating two independent devices
   (§11.2) — the exact scenario the brief asked for.
8. ~~Wire Device Handoff to the shared session~~ — done: real Prisma-backed
   (`DeviceHandoff` model, §4). `lib/device-handoff/` (token generation,
   the lifecycle state machine, invariants) copied verbatim from
   `feat/route-assist-v1`, unchanged except renaming
   `quoteSessionId` → `guidedFlowSessionId` throughout to match the real
   FK — see that directory's own updated header comment for the full note.
   `lib/deviceHandoffStore.ts` is the new persistence adapter on top of it.
9. ~~Wire Route Assist cross-device continuation~~ — done, generically, via
   `GuidedFlowVisualAssistTask` — proven against a **real** live service
   (`replace-gfci-outlet`), not a fixture harness; see §10's correction.
10. ~~Full browser/HTTP end-to-end proof~~ — done (§11).
11. Report findings before merge — this document plus the chat report; no
    auto-merge, as instructed.

## 10. Scope boundary: no catalog/tree hook invented — and a correction

Route Assist has no integration point in the live electrical tree yet —
deciding which `Question`/`AnswerOption` opens it was already flagged as
deliberately out of scope for Route Assist's own slice
(`docs/design/route-assist-v1.md §1.4`). This branch does not invent one
either — doing so would be exactly the "new trade-specific behavior" the
brief prohibits.

**Correction from the original plan:** this section originally said the
end-to-end proof would run against a synthetic fixture harness, the way
Route Assist's own `app/dev-fixtures/route-assist` does, because building
real tree integration was out of scope. That undersold what was actually
possible. `GuidedFlowVisualAssistTask` doesn't need a tree hook to be
proven — it's a generic API surface any caller can register a task
against, tree-integration or not. So §11's proof creates and completes a
`ROUTE_ASSIST` task directly against a **real, live** service
(`replace-gfci-outlet`) via the API, with no synthetic fixture at all. What
remains genuinely out of scope, unchanged from the original plan, is
*deciding which question in the tree opens Route Assist automatically* —
that's still a catalog/product decision nobody has made, and nothing here
makes it.

## 11. Full proof — evidence

### 11.1 Single-device reload/resume — real browser, real service

Against `elite-electric` / `replace-standard-outlet` (a live A1 service,
per `pricesight-v1.md`'s own catalog analysis), on the rehearsal Neon
branch:

1. Opened the real storefront page, clicked through the intro, answered
   both questions (`device_replacement_reason`, `outlet_condition`),
   reached the real resolved price ($260 — matching the service's actual
   published `basePrice`).
2. Read the `GuidedFlowSession` row directly from the database:
   `consumedAnswers` held exactly the two answers given, `version: 2`.
3. **Reloaded the page** — a fresh component mount, a fresh
   `POST /api/guided-flow-sessions` call.
4. Clicked "Check My Price" again. The existing, **completely unmodified**
   `advanceFrom`/`evaluate` auto-skip logic (`GuidedFlowEngine.tsx:363-426`,
   §1.3) walked straight past both already-answered questions using the
   *restored* answers and landed on the identical "Here's Your Price! $260"
   screen — with zero new code in the walk itself, exactly as §3 predicted.
5. Clicked "Add to My Visit." The real `POST /api/visit` created a real
   `LineItem` (`computedPriceCents: 26000`, matching `answersSnapshot`
   exactly). `GuidedFlowSession` was marked `COMPLETED`,
   `lineItemId` pointing at that exact row.

### 11.2 Cross-device Device Handoff + concurrency — real HTTP, two devices

`scripts/verify-guided-flow-cross-device.ts`, run against the rehearsal
branch with two independent cookie jars simulating desktop and phone,
against `elite-electric` / `replace-gfci-outlet` — 18/18 checks pass:

- Desktop creates a session, answers a question, it persists.
- Desktop creates a `ROUTE_ASSIST` Device Handoff; the returned QR URL
  contains only the opaque token — asserted by regex that it names neither
  session id, task id, nor `guidedFlowSessionId`.
- Phone (starting with **no** cookie at all) resolves the token. Its
  `elite_session_id` cookie afterward is **byte-identical** to desktop's —
  the join described in §6.1 actually happens.
- **The brief's exact concurrency scenario:** phone (now joined) advances
  the session to version 2. Desktop, still holding version 1, attempts a
  write — **rejected with HTTP 409**, response body hands back the phone's
  newer `consumedAnswers` for reconciliation. A follow-up `GET` from
  desktop confirms the phone's state survived untouched.
- Phone creates and completes a `ROUTE_ASSIST` `GuidedFlowVisualAssistTask`
  with a result; desktop reads the **same row** back — one canonical
  result, not two.
- Phone completes the handoff; desktop's poll immediately reflects
  `TASK_COMPLETED`.
- The same (now-completed) token, scanned again by a third, unrelated
  client, still resolves with `200` — never re-creates the task, never
  errors, per the brief's "scans an already-completed handoff" requirement.
- An invalid token: `404`, and the response body contains no mention of
  "session" or "contractor" — verified by regex, not just eyeballed.

### 11.3 A real defect found and fixed by this proof

Building the create routes and testing them live (not just type-checking)
surfaced a genuine bug the same way Route Assist's own browser pass did:
`prisma.deviceHandoff.create` and `prisma.guidedFlowVisualAssistTask.create`
both **derive** their tenant ownership through `GuidedFlowSession` (no
direct `contractorId` column — by design, §4). `lib/tenantGuard.ts`'s
extension correctly refused both creates on the *guarded* client with a
`DerivedCreateError`, exactly as it's designed to for every other derived
model in this schema (`Question`, `LineItem`, `Photo`, ...). Fixed by
following the exact precedent `POST /api/visit` already sets for `Photo`:
validate ownership first via a **guarded** read (`loadSession`, checked
against `site.contractorId`), then perform the create on the **unguarded**
`prisma` singleton, with a comment explaining why at both call sites.
`scripts/audit-unguarded-tenant-access.ts` — the audit built specifically
to catch an unexplained instance of exactly this pattern — was run
afterward and found **zero unexplained unguarded accesses**; the one it
flagged before the fix (`GuidedFlowVisualAssistTask.create`) is now a
classified, justified entry in that script's own registry, matching the
`Photo`/`templateProvisioning.ts` precedents already there.

### 11.4 Regression — existing data and tenant isolation

- `verify-tenant-indexes.ts`: both new derived models
  (`DeviceHandoff`, `GuidedFlowVisualAssistTask`) confirmed indexed on
  their owner path — pass.
- `verify-cross-tenant-resource-access.ts`: unaffected by this branch,
  confirmed still passing (a real id from another contractor opens
  nothing) — pass.
- Pre-existing data on the rehearsal branch (1 contractor, 75 services, 33
  visits, 39 line items, 150 questions) confirmed present and unmodified
  both before this branch's schema push (§8) and after the full live proof
  above added its own new rows alongside them.
- `npm run verify`'s full DB-fixture-writing chain was deliberately **not**
  run against the rehearsal branch — most of those scripts assume specific
  fixture state and this repo's own memory of prior incidents
  (shared-rehearsal-db-races) warns that running them outside their
  intended sequence can collide. The targeted, relevant subset above was
  run instead, and the live proof in §11.1–§11.2 already exercises the
  real booking write path (`POST /api/visit`) end-to-end.

## 12. Branch reconciliation — `lib/device-handoff/` overlap, and the merge plan

Both `feat/route-assist-v1` (HEAD `f8f501a`) and `feat/guided-flow-session`
(HEAD `6cbdad9`) forked from the same commit, `2c4d821`. Diffed against
that actual fork point (not against `origin/main`, which has since moved
forward past both — PR #41 merged after this work began, touching four
files neither branch actually changed; a naive diff against current
`origin/main` would misreport those as "overlap" when they're not).

### 12.1 The real overlap — exactly five files, minimal divergence

Only `lib/device-handoff/{index,invariants,lifecycle,token,types}.ts`
exist on both branches. `index.ts` is **byte-identical**. The other four
differ by exactly one thing: `feat/guided-flow-session` renamed
`quoteSessionId` → `guidedFlowSessionId` throughout (plus updated header
comments explaining the rename and the real Prisma FK it now matches) —
2–20 changed lines per file, zero logic changes. No other file path is
touched by both branches.

### 12.2 Which branch is more complete, and the recommended canonical owner

`feat/route-assist-v1` has the pure domain only — no Prisma model, no
persistence, no API routes; its own design doc (`device-handoff-v1.md`)
states outright that cross-device resume was blocked there. `feat/
guided-flow-session` has the same domain (correctly renamed) **plus** the
real `DeviceHandoff` Prisma model, `lib/deviceHandoffStore.ts`, the full
`app/api/device-handoffs/*` surface, and a live, end-to-end proof (§11.2)
that it actually works across two devices.

**Recommended canonical owner: `feat/guided-flow-session`'s version.**
Not because it happened to build persistence — because the field name it
uses (`guidedFlowSessionId`) is the semantically correct one now that
`GuidedFlowSession` is the canonical term; Route Assist's `quoteSessionId`
was a placeholder name coined before `GuidedFlowSession` existed. Device
Handoff should end up owned by neither Route Assist nor GuidedFlowSession
architecturally (§6 of the brief: shared cross-device infrastructure,
consumed by both) — but as a practical matter of *which git history it
lives in*, the more complete, correctly-named, already-proven copy is the
one to keep.

### 12.3 What to remove/rebase — recommendation, not executed here

**Not performed in this session** — `feat/route-assist-v1` was already
reported as an accepted, pushed checkpoint, and rewriting its content
without a fresh go-ahead would cross into "rewriting working code" the
brief asked not to do unnecessarily. Recommendation for whoever sequences
the actual merge:

1. Delete `feat/route-assist-v1`'s own copy of the five
   `lib/device-handoff/` files (superseded by the canonical one below).
2. Update its `docs/design/device-handoff-v1.md`, which currently states
   Device Handoff is blocked/undesigned for persistence — that's no longer
   true once `feat/guided-flow-session` is in the base it rebases onto.
3. `scripts/verify-device-handoff-domain.ts` (Route Assist's own pure,
   no-DB proof of the same domain) can stay — it still proves something
   real about the domain layer and costs nothing to keep, now importing
   from the canonical (renamed) module instead of its own copy.

Nothing else on either branch references `lib/device-handoff/` internals
directly (confirmed: `RouteAssistCapture.tsx` and the Route Assist domain
module never import from it — Device Handoff and Route Assist are wired
together only at the level of "both exist," not through direct imports),
so this cleanup is mechanical, not a redesign.

### 12.4 Recommended merge sequence

1. **Merge `feat/guided-flow-session` first.** It doesn't depend on Route
   Assist at all (confirmed: nothing in it imports `lib/visual-assist/
   route-assist/` or `RouteAssistCapture.tsx`) and carries the canonical
   `lib/device-handoff/`, the real `DeviceHandoff`/`GuidedFlowSession`
   models, and the full API surface. This becomes the new base.
2. **Rebase `feat/route-assist-v1` onto the post-merge `main`**, applying
   §12.3's cleanup as part of that rebase (delete the duplicate domain
   copy, update its design doc). This is the only branch with expected
   conflicts, and only in the five overlapping files plus the one doc.
3. **New integration slice — not yet built on either branch:** wire
   `RouteAssistCapture.tsx` to actually call the real
   `/api/guided-flow-sessions/*` and `/api/device-handoffs/*` endpoints for
   cross-device continuation. §11.2's proof exercises the mechanism
   generically over HTTP; nothing today makes the Route Assist *component*
   itself create a session, request a handoff, or read back a
   `GuidedFlowVisualAssistTask` result. This is real, scoped, straightforward
   work — the API it would call is already proven — but it hasn't happened
   yet and shouldn't be assumed done.
4. **Service-tree invocation points** — deliberately not started, per
   explicit instruction (§10).
5. **Full homeowner end-to-end proof** — once 3 and 4 exist, a real
   desktop→QR→phone→Route Assist→booking pass, the way §11.1/§11.2 proved
   the underlying pieces separately.

### 12.5 Expected conflicts and cleanup, summarized

| Branch | Needs a cleanup commit before PR? | What |
|---|---|---|
| `feat/guided-flow-session` | No | Self-contained; merges cleanly against current `main` today |
| `feat/route-assist-v1` | Yes, if sequenced after guided-flow-session | Delete duplicate `lib/device-handoff/`, update `device-handoff-v1.md`'s now-stale "blocked" framing |

No conflicts expected outside `lib/device-handoff/*` and
`docs/design/device-handoff-v1.md` — every other file either branch
touches is disjoint, confirmed by diffing both against their actual fork
point.
