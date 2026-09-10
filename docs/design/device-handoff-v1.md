# Device Handoff V1 — architecture

**Status:** domain/security layer implemented and verified (token entropy,
constant-time verification, expiry/revocation, safe re-scan of a completed
handoff, non-disclosing failures — `scripts/verify-device-handoff-domain.ts`,
all passing). **Cross-device quote resume is not end-to-end complete** — it
is blocked on canonical server-side `GuidedFlow` session persistence, which
does not exist anywhere in this codebase yet (§1.2) and is being held for a
separate, coordinated decision rather than built here (§3, §5). Do not
represent QR continuation as shippable until that lands. Route Assist's
mobile-only/manual capture does not depend on this and is independently
usable today.

## 1. What was asked, and what was found

The brief asks for a QR code that lets a desktop customer "pick up their
existing Price2Book quote on their phone for a camera step." The
implementation-order section of the brief asked for exactly this
inspection before building: identify how anonymous homeowner state is
persisted, identify existing token primitives, and don't redesign
unrelated session architecture without a genuine blocker. Here's what
inspecting the actual codebase found.

### 1.1 Token pattern to reuse — exists, and it's good

`ContractorInvitation` (`prisma/schema.prisma`) already establishes the
right shape: a SHA-256 hash of a 32-byte random token stored (never the raw
token), an `expiresAt`, and spent/revoked markers. `lib/device-handoff/`
copies this pattern exactly rather than inventing a second one —
`token.ts`'s `generateHandoffToken`/`hashHandoffToken`/`tokenMatchesHash`
are the same primitives, and `lib/session.ts`'s anonymous visit-cookie
token (`randomBytes(32).toString("base64url")`) confirms this is the
codebase's established convention for an opaque, capability-bearing token.

### 1.2 The genuine blocker: no mid-flow session exists to hand a QR code to

This is the finding that matters. `GuidedFlowEngine.tsx` — the component
that walks a customer through a service's questions — holds all of its
state (`answers`, `config`, tree position, back-stack) in plain React
`useState`. **Nothing is written to the server as the customer answers
questions.** The only things that get a server-side row are terminal
actions: adding a priced outcome to the cart (`Visit`/`LineItem` via
`POST /api/visit`) or submitting a blocking-review quote (`Quote` via
`POST /api/quotes`) — both at the *end* of a service's tree, not partway
through.

So "resume the exact same in-progress quote on another device" is not a
QR-code problem sitting on top of an existing mechanism. It requires new
mid-flow session persistence for `GuidedFlowEngine` itself — a model that
snapshots which service, which answers so far, and where in the tree the
customer is — before there is anything for a Device Handoff token to point
at. That's not scoped to Route Assist or even to Visual Assist; it's a
change to the shared engine every trade's booking flow runs through.

**This is exactly the "genuine blocker" the brief's own instructions asked
to be flagged rather than built around unilaterally** — both because of its
size (new Prisma model, new concurrency semantics, touches every service)
and because of *when*: another workstream is active on this exact engine
right now (`feat/g2-trade-scoped-troubleshooting-isolated`, the branch this
work forked from, is mid-flight trade-scoped troubleshooting-reroute work
inside the same guided-flow area). Adding session-versioning semantics to
`GuidedFlowEngine` without coordinating with that work is the kind of
shared-infrastructure change this repo's own practice treats carefully —
see `docs/design/pricesight-v1.md`'s posture on not touching booking/
tenancy/checkout, and this repo's established convention of one worktree
per active workstream specifically to avoid this kind of collision.

### 1.3 No realtime/polling precedent exists

Confirmed no `setInterval`/`useSWR`/SSE/WebSocket pattern anywhere in the
app. The brief explicitly says polling is fine and not to introduce
WebSockets — that's the right call given there's nothing to build on top
of either way. §4 below designs the polling contract; it isn't built yet
because it has nothing to poll (§1.2).

### 1.4 Homeowner "sessions" are deliberately not auth

Contractor/staff login (Better Auth, magic-link, `User`/`Session` tables)
is a different, deliberately separate system from homeowner booking, which
is anonymous — a cart-identity cookie (`lib/session.ts`) scoped to a
contractor via the storefront, never a `User` row. Device Handoff follows
the anonymous-cookie model, not Better Auth — a homeowner scanning a QR
code to continue *their own unauthenticated cart* should not suddenly
acquire a login.

## 2. What's implemented now — reusable, storage-agnostic

`lib/device-handoff/` — no Prisma model, no API route yet, proven with
`scripts/verify-device-handoff-domain.ts` (no DB, no network):

```
lib/device-handoff/
  types.ts       DeviceHandoffTaskType (ROUTE_ASSIST | PHOTO_CAPTURE |
                 VISUAL_ASSIST — reusable from day one, not Route-Assist-
                 only), DeviceHandoffStatus, the DeviceHandoff shape
  token.ts        generate / hash / constant-time verify, the QR URL builder
                 (its signature structurally prevents passing a session or
                 task id into the URL — there's no parameter for one)
  lifecycle.ts    createHandoff / resolveHandoff / connectHandoff /
                 completeHandoff / revokeHandoff, all pure functions over a
                 DeviceHandoff record; desktopPresentationState derives the
                 WAITING_FOR_PHONE / PHONE_CONNECTED / TASK_COMPLETED /
                 HANDOFF_EXPIRED / HANDOFF_REVOKED labels from status alone,
                 never a separately-stored field that could drift
  invariants.ts   TTL-within-policy, token entropy, URL-leaks-nothing, and a
                 field-registry walk (no field may look like it carries a
                 photo, a name, an answer, or a price — a handoff is a
                 capability pointer, never a payload)
scripts/verify-device-handoff-domain.ts
```

This is genuinely reusable today by anything that wants "hand this task to
another device" — Route Assist, an equipment photo task, a future capture
flow — none of it is Route-Assist-specific.

## 3. The decision this doc is asking for

Wiring this to the brief's actual acceptance proof (QR → phone resumes the
exact tree position → completes Route Assist → desktop sees it, no
duplicate quote) needs, as a prerequisite:

1. A new Prisma model — call it `GuidedFlowSession` — that
   `GuidedFlowEngine` writes to as the customer answers questions (not just
   at the terminal action), keyed by the existing anonymous visit
   identity from `lib/session.ts` so it doesn't invent a second homeowner
   identity concept.
2. Concurrency semantics on that model — the brief explicitly asks for
   this (session versioning / current-step authority / task completion
   markers so a stale desktop tab can't overwrite completed mobile work).
3. A real `DeviceHandoff` Prisma model (the shape in §2 is ready to become
   one) plus `app/api/device-handoff/*` routes: create, `/handoff/[token]`
   resolve, connect, complete, and a status-polling endpoint.
4. The polling loop on the desktop side and the "continue on this phone /
   return to my computer" UI on mobile.

**I did not start on (1)–(2).** They're a real, non-trivial expansion of
booking-session architecture that every service in the catalog runs
through, with schema and concurrency implications, in an area another
workstream is actively touching. That combination — shared infrastructure,
hard to reverse once other code depends on it, live parallel work in the
same file — is squarely the kind of thing worth a deliberate go-ahead
rather than a judgment call made silently inside an unrelated feature
branch.

**What I'd suggest, if useful:** (1)-(2) as their own coordinated slice —
sized modestly (it only needs to snapshot `serviceId` + `answers` + tree
position, not become a general event-sourced session), reviewed against
whatever `feat/g2-trade-scoped-troubleshooting-isolated` and any other
active guided-flow work are doing first. Everything in §2 is ready to sit
on top of it as soon as it lands, and nothing in §2 needs to change to
support it.

## 4. Designed, not yet built — for review once §3 is resolved

**Polling contract.** `GET /api/device-handoff/[id]/status` → `{ status:
DesktopPresentationState }`, polled every 3–5s from the desktop tab while
`WAITING_FOR_PHONE`/`PHONE_CONNECTED`, stopped once `TASK_COMPLETED` /
`HANDOFF_EXPIRED` / `HANDOFF_REVOKED`. No new infrastructure — matches the
brief's explicit "polling is acceptable" guidance.

**Resolve flow.** `GET /handoff/[token]` → look up by trying
`tokenMatchesHash` against candidate rows (or, more practically, index by a
non-secret lookup prefix of the hash the way rate-limited invitation flows
usually do) → `resolveHandoff` → on success, load the `GuidedFlowSession`
(§3) named by `handoff.quoteSessionId` and hand the phone straight into
`GuidedFlowEngine` at its recorded tree position with `taskType`/`taskId`
telling it to open Route Assist immediately rather than the question tree.
On failure, a neutral "this link isn't valid" screen — never a reason that
distinguishes "expired" from "wrong token" from "revoked" in a way that
leaks whether *some* handoff exists (the lifecycle functions already
return a specific reason for logging; the UI should collapse all of them
to the same neutral copy, per the brief's "do not expose quote details").

**Concurrency.** Once §3 lands, "stale desktop can't overwrite completed
mobile work" is a version check on `GuidedFlowSession` (a monotonic
`stepVersion`, bumped on every write, compared-and-rejected on write if the
writer's known version is behind) — the same shape as any other
optimistic-concurrency write in this codebase, not a new pattern.

**Failure states** — all designed against the lifecycle functions already
proven in §2: `EXPIRED` → "Generate a new QR code" on desktop;
`REVOKED`/invalid token → neutral message, no quote details, per
`resolveHandoff`'s reason never leaking beyond a generic mismatch to the
UI layer; desktop closed → phone continues normally, since the phone only
ever needed the `GuidedFlowSession`, not the desktop tab, to keep working
(true once §3 exists); phone closes accidentally → desktop's existing
handoff is still `CONNECTED` or `AVAILABLE` and can be reused or
regenerated.

## 5. Reconciliation pass — read-only, no code changed

Before any `GuidedFlowSession` work is authorized, here is what a read-only
pass across every active local branch/worktree found (git log/diff only —
no merge, rebase, migration, or file edit performed as part of this).

**No branch is building this, and none overlaps or conflicts with it.**
Every local branch's `prisma/schema.prisma` was checked for anything named
like a session/draft/handoff model
(`grep -inE 'model .*Session|model .*Draft|InProgress|GuidedFlow'`); every
branch, including `origin/main`, has exactly the same two pre-existing,
unrelated hits — Better Auth's `Session` (user login) and
`TroubleshootingSession` (post-booking in-home diagnostic time tracking).
Nothing named `GuidedFlowSession`, `BookingSession`, `QuoteSession` or
`Draft*` exists anywhere in this repo's git history on any branch. Commit
messages across all branches were also searched for `handoff`, `resume`,
`route assist`, `qr code`, `mid-flow`, `booking draft` — no hits describing
this work.

**The one branch actively touching the same three files a
`GuidedFlowSession` change would touch** —
`feat/g2-trade-scoped-troubleshooting-isolated` (the branch this Route
Assist worktree was forked from context-wise, though its own HEAD is
identical to `origin/main` — no code has landed on it) — changes exactly
one thing in this area: it adds `Service.tradeKey String?` to
`prisma/schema.prisma` and threads it through
`lib/routeResolver.ts`'s troubleshooting-reroute branch so a reroute
resolves against the *asking service's own trade* instead of a
contractor-wide lookup. `GuidedFlowEngine.tsx` gets one line changed (a
`?serviceId=` query param on the troubleshooting fetch). None of this adds,
reads, or writes any persisted session state — it's entirely about *which
trade's catalog* a lookup resolves against, not about resuming a booking
mid-flow. A second branch, `feat/shared-typed-question-validation`, adds a
`QuestionValidationRule` enum and touches `lib/routeResolver.ts` similarly
narrowly (validation rules on answers), also with no session-persistence
concern.

**Conclusion: a `GuidedFlowSession` model has no existing work to reconcile
against today.** The only real coordination cost is ordinary — a future PR
adding it should expect to rebase past whichever of those two branches
merges first, since both touch `GuidedFlowEngine.tsx` and
`lib/routeResolver.ts`.

**Recommended ownership boundary, informational only:** `GuidedFlowEngine.tsx`
is a pure client-state tree-walker today; `lib/routeResolver.ts` is a
stateless, request-scoped pure function with no concept of a persisted
session. Mid-flow persistence is a different concern from either and needs
its own write path (create/update-by-token, optimistic-concurrency
versioning, expiry) neither file has a hook for today. A new
`lib/guidedFlowSession.ts` (paired with the `GuidedFlowSession` Prisma
model), called by `GuidedFlowEngine.tsx` at defined checkpoints, with
`routeResolver.ts` remaining agnostic to it, looks like the clean seam —
but the concurrency/versioning design touches the one file every trade's
booking flow runs through, which is enough surface that it reads as its own
initiative rather than a rider on any branch currently active. This is a
recommendation for whoever makes the go/no-go call, not a decision made
here.
