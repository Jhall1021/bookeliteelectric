# Route Assist V1 — architecture

**Status:** Phase 1 (manual capture, no CV) implemented as a domain library +
capture component, verified at both the domain level and the interactive
browser level (§8.1) — including a real drag-interaction defect found and
fixed by the browser pass, not by domain tests alone. Not wired into any
live booking tree yet — that is the next slice, and it is deliberately not
done here (§5). Route Assist's mobile-only/manual capture is independently
usable now; cross-device continuation is a separate, currently-blocked
capability (`docs/design/device-handoff-v1.md`).

## 1. Architecture read

### 1.1 What "Visual Assist" currently is

`lib/visual-assist/*` exists in this working tree but is **not committed to
`origin/main`** except two files (`taxonomy.ts`, `observation.ts`). The rest
(`schema.ts`, `tasks.ts`, `confidence.ts`, `confirmation.ts`, `invariants.ts`,
`provider.ts`, `providers/anthropic.ts`, `storage.ts`, `image.ts`,
`analysis.ts`) are uncommitted work from a separate, parallel workstream
sitting in this shared working tree. It has no caller anywhere in `app/` —
proven correct only by `scripts/verify-visual-assist-domain.ts`, with no
Prisma model, no API route, no UI.

What it's built for: **single-photo equipment classification.** A task
(`VisualAssistTaskDefinition` in `tasks.ts`) describes one photo, a closed
set of scalar fields (`FieldSpec`: `ENUM | ENUM_ARRAY | STRING | NUMBER |
BOOLEAN`), and per-field confidence policy. Every field is independently
scored and the best outcome is `SUGGEST_AND_CONFIRM` — there is no
auto-accept path anywhere in the design. All six shipped tasks (panel,
receptacle, EV charger, switch plate, lighting fixture, water heater) are
"what piece of equipment is this and what does its nameplate say" — not
spatial reasoning about a path through a house.

### 1.2 Why Route Assist doesn't fit the `VisualAssistTaskDefinition` shape

Route Assist's Phase 1 interaction (§9 of the brief) is customer-driven
waypoint placement on a photo, not AI classification of an enum. There's no
provider call, no `FieldSpec`, no confidence score to evaluate — the
customer places the geometry and tags it, and Route Assist derives structured
facts from what they placed. That's a fundamentally different pipeline shape
than "send one photo, parse one classification." Trying to force it into
`VISUAL_ASSIST_TASK_KEYS` / `REGISTRY` today would mean inventing dummy
`FieldSpec`s for things that were never observed by a model at all.

**Decision:** Route Assist is a sibling domain module,
`lib/visual-assist/route-assist/`, nested under Visual Assist's path (so it
reads as a Visual Assist capability, per the brief's §4 diagram) but with its
own types, its own deterministic geometry derivation, and its own invariant
walker. It reuses `observation.ts`'s `VisualObservation<T>` pattern for the
one place Phase 2 will need it (see §7) and follows `taxonomy.ts`'s
OTHER/UNKNOWN convention and comment style, but does not import the
uncommitted task-registry/provider/confidence machinery, because depending
on unlanded, unreviewed code from a different workstream would make Route
Assist's own correctness contingent on a system it doesn't need yet. When
Visual Assist's provider/task-registry lands, Phase 2 (§7) registers
`electrical.route.assist.v1` as a normal task the same way any other task is
registered — that seam is designed in now, built later.

### 1.3 Canonical identity Route Assist reuses

- **Service identity**: `Service.templateKey` / `Service.tradeKey` (schema.prisma) —
  Route Assist results should be attributed to a service by this pair, never
  by `Service.id` alone, matching the same "stable across a rename" rule
  PriceSight's enrichment table uses.
- **Access/routing vocabulary that already exists**: `AccessClassification`
  (`ACCESSIBLE | FINISHED | UNKNOWN`) on `AnswerOption`. This is the one
  routing-adjacent concept live in the electrical tree today (see
  `new-120v-outlet`'s `below_above_access` question). Route Assist's
  `RouteSurface`/complexity vocabulary is deliberately a **different,
  additional** vocabulary — it describes the visible path, not whether the
  destination is behind finished drywall — and does not attempt to replace
  or duplicate `AccessClassification`.
- **Review routing**: the idiomatic pattern is `ResolvedRoute { status:
  "REVIEW", reason, floorPriceCents }` from `lib/routeResolver.ts`, not a
  bare boolean. Route Assist's `needsContractorReview` is designed to feed
  a `reason` string into exactly that shape once wired up, not to invent a
  parallel review flag.
- **`routeWork` / `existingSupply`** (named in `pricesight-v1.md`) do **not**
  exist in the schema or in any electrical seed file — confirmed by direct
  read. They're PriceSight's own proposed, unbuilt derived vocabulary.
  Nothing here depends on them.

### 1.3.1 Device Handoff — a desktop customer's path to the camera step

**Status, updated 10 Sep 2026 — live, not a blocker.** A desktop customer
reaching a Route Assist camera step continues on a phone via Device Handoff
(`docs/design/device-handoff-v1.md`), built as a separate, reusable
capability (`lib/device-handoff/`), not a Route-Assist-only QR
implementation. What this section originally called a blocker — no mid-flow
booking session to hand a QR code to — is resolved: `GuidedFlowSession`
persists the flow server-side (`docs/design/guided-flow-session-v1.md`), and
`RouteAssistWithHandoff.tsx` (desktop) + `HandoffLanding.tsx` (phone,
`app/[site]/handoff/[token]/page.tsx`) implement the full continuation —
desktop creates a `GuidedFlowVisualAssistTask` and a Device Handoff, the
phone's scan resolves into the SAME `GuidedFlowSession`, captures the route,
and the desktop observes completion by polling the task, all against one
canonical result — exercised end to end by
`scripts/verify-route-assist-cross-device-browser.ts`.

**Cross-device orchestration was proven end-to-end with a fixture-only
upload adapter because the development sandbox cannot establish TLS to
Cloudflare R2. Production R2 URL generation was separately verified with the
real account ID. A real-storage transport proof from an unrestricted
environment remains required before production rollout.** Concretely: the
proof script sends the phone to
`app/[site]/dev-fixtures/route-assist-handoff/[token]` instead of the real
`app/[site]/handoff/[token]`, a fixture page that renders the SAME
`HandoffLanding` component with every real API call intact
(`GuidedFlowSession`, the Visual Assist task, Device Handoff resolve/status/
complete) and only `uploadPhoto` swapped for a local object URL, the same
substitution the single-device fixture already makes with its own
`fakeUpload`. `HandoffLanding.tsx`, `lib/upload.ts`, and the real production
page are untouched. `scripts/verify-upload-presign-url.ts` separately proves
the real presign route — the actual code that builds the R2 upload URL a
real browser would receive — produces the correct
`{bucket}.{accountId}.r2.cloudflarestorage.com` endpoint and a well-formed
public URL, without making any network call (`getSignedUrl` computes a
SigV4 signature locally), closing the gap the fixture substitution leaves
open.

### 1.4 What genuinely doesn't exist yet (blockers, not conflicts)

1. **No DEDICATED Prisma model for Route Assist results — superseded, not a
   gap.** Phase 1 shipped a pure, DB-free domain library plus a documented
   model shape (§6) for review, no migration, on the stated posture that
   Visual Assist itself has none either ("no migration in this workstream,"
   per `pricesight-v1.md`). `GuidedFlowVisualAssistTask.result` (added by
   `docs/design/guided-flow-session-v1.md`) now persists a `RouteAssistResult`
   as JSON against that documented shape — one task, one canonical result,
   no separate Route-Assist-specific table, exactly as §6 anticipated.
2. **No private photo storage is live.** `lib/visual-assist/storage.ts`
   (private R2 bucket, no public URL) is uncommitted and its env vars are
   presumably unconfigured. The only *live* photo upload path is the public
   quote-photo bucket (`lib/upload.ts` → `/api/uploads/presign` → `lib/r2.ts`),
   already used for `Photo.source = CUSTOMER_PRE_BOOKING`. Route Assist's
   capture component is built against that live path via a plain callback
   prop, not a hard import, so swapping to the private bucket later is a
   one-line change at the call site, not a rewrite.
3. **No entry point in the booking tree.** `GuidedFlowEngine.tsx` walks
   `Question`/`AnswerOption` rows; there's no `InputType` value or route hook
   today that says "open Route Assist here." Wiring a real service's tree to
   invoke it needs a product decision about which question triggers it and
   what `AnswerOption`/`InputType` shape carries the result back — that's
   catalog work, out of scope for this slice, and is called out explicitly
   rather than guessed at.

None of this is a conflict with an existing invariant — it's just not built
yet, which is expected for a "first slice."

## 2. Files this touches

New, all under the isolated worktree (`feat/route-assist-v1` off `origin/main`):

```
lib/visual-assist/route-assist/
  taxonomy.ts       closed vocabularies (mode, destination type, surface,
                     obstacle, complexity, incompleteness codes)
  types.ts          RoutePoint, RouteSegment, RouteAssistResult,
                     RouteAssistIncomplete, capture input types
  geometry.ts        pure derivation from customer-placed points/segments:
                     turn (corner) detection, surface-transition counts,
                     obstacle-bypass counts, total length, same-wall heuristic
  complexity.ts       deterministic complexity classifier + suggested
                     access-opening range (concealed mode only)
  uncertainty.ts      the §22 incomplete/uncertain codes + recovery copy
  confirmation.ts     the §11 accept/adjust/retake decision + audit record
  summary.ts          §12/§13 homeowner + contractor summary text builders
  invariants.ts       forbidden-token walk over taxonomy, result fields and
                     summary text — Route Assist's own safety net (§8)
  result.ts           buildRouteAssistResult() — composes the above
  index.ts            barrel export

scripts/verify-route-assist-domain.ts   proof scenarios A–D from §25 of the
                                         brief, no DB/network/API key

components/route-assist/
  RouteAssistCapture.tsx   the customer-facing capture flow (§9–§11 of the
                            brief): photo, mark A, mark B, add/adjust
                            waypoints, tag segments, confirm
```

Nothing existing is modified.

## 3. Data model

Adapted from the brief's illustrative model. Two changes from the brief,
both because Phase 1 has to derive facts from geometry the customer actually
placed rather than assume them:

- `RoutePoint` gains an optional `obstacle?: "DOORWAY" | "WINDOW" | null` —
  the customer taps a waypoint and tags it as "route goes around this," which
  is what makes `doorwayBypassesCount`/`windowBypassesCount` a deterministic
  count instead of a guess.
- `RouteSegment.estimatedLengthFt` is customer- or contractor-entered per
  segment (a number input next to the drawn segment), not inferred from
  pixel distance — Phase 1 has no scale reference, and guessing feet from
  pixels would be exactly the "claim more precision than we have" failure
  §21 warns against. `estimatedTotalRouteLengthFt` is the sum when every
  segment has one, else `null` (never a fabricated total).

Corner counts, surface-transition counts and same-wall/different-wall are
**not** guesses — they're pure geometry over the pixel-space polyline and
the customer's own surface/obstacle tags, computed by `geometry.ts`. That's
"AI observes, deterministic logic decides" taken further than the brief
requires: in Phase 1 there's no AI in the loop at all, so there's nothing to
second-guess.

Full types are in `lib/visual-assist/route-assist/types.ts` and
`taxonomy.ts` — see those files for the exact shape; this doc doesn't
reproduce every field to avoid the two drifting.

## 4. Homeowner UX

Implemented in `components/route-assist/RouteAssistCapture.tsx`, following
the brief's §8–§12 flow and the attached mockup's visual language (marker
pins, route line, bottom confirmation sheet with distance/turns/doorway
chips, "Looks right / Adjust route" actions, and the disclaimer line "Your
electrician will confirm the final route onsite").

Steps: mode question → destination type → photo capture (native file input,
`capture="environment"`, matching the existing `PhotoReviewNotice.tsx`
pattern rather than inventing a `getUserMedia` capture UI that doesn't exist
anywhere else in the app) → tap to place A → tap to place B → an initial
straight A–B line is drawn automatically → tap the line to add a waypoint,
drag any point to adjust, tap a waypoint to tag it as a doorway/window
bypass or a surface transition → confirmation sheet.

The component takes an `onUploadPhoto: (file: File) => Promise<string>`
prop rather than importing `lib/upload.ts` directly, so it has no hard
dependency on the storefront's fetch context or the public bucket — the
caller wires in whichever upload path is live at the call site.

## 5. Deterministic integration approach

```
Electrical service reaches a routing-relevant question
   → (future) AnswerOption/InputType hook opens RouteAssistCapture
   → customer places + tags route, confirms
   → buildRouteAssistResult() → RouteAssistResult | RouteAssistIncomplete
   → caller decides what to do with it:
       - surface mode, low complexity  → feeds route facts to pricing config
         (§14 of the brief — Route Assist exposes facts, never a price)
       - concealed mode, COMPLEX/UNCERTAIN, or any incompleteness
         → ResolvedRoute-style REVIEW with a reason string
```

Route Assist never computes a price and never sets `ResolvedRoute.status`
itself — it returns a result; the caller (the service's own resolution
logic) decides what that result means for pricing/review, exactly per the
brief's §4 diagram ("the service remains authoritative about why Route
Assist is being used").

`needsContractorReview` on the result is a transparent, declared function of:
any `RouteAssistIncomplete` code present, `customerConfirmedRoute === false`,
or (concealed mode only) `concealedRouteComplexity` being `COMPLEX` or
`UNCERTAIN`. It is a starting default, meant to be a visible, reviewable rule
— not a black box — and is expected to move into contractor-configurable
policy alongside the labor-baseline pricing work (§15 of the brief), the same
way `pricesight-v1.md` keeps its thresholds `PROVISIONAL`.

## 6. Persistence — proposed shape, no migration

No migration lands in this slice, matching Visual Assist's own posture.
For review, once a caller exists:

```prisma
model RouteAssistCapture {
  id            String   @id @default(cuid())
  contractorId  String
  contractor    Contractor @relation(fields: [contractorId], references: [id])

  serviceTemplateKey String?   // Service.templateKey at capture time, null
                                // for a contractor-authored service
  serviceTradeKey    String?

  quoteId       String?   // exactly one of quoteId/lineItemId, mirrors Photo
  lineItemId    String?

  result        Json      // RouteAssistResult | RouteAssistIncomplete,
                           // serialized whole — see §3
  photoUrls     String[]  // public bucket today; private-bucket keys once
                           // lib/visual-assist/storage.ts lands

  createdAt     DateTime  @default(now())
}
```

`TENANT_SCOPED` via `contractorId`, same treatment `Photo` gets. This is a
proposal for the next slice, not something this change creates.

## 7. Safety / invariant additions

`lib/visual-assist/route-assist/invariants.ts` walks, at build/test time
(no DB, no network):

1. **Forbidden field-name tokens** on every `RouteAssistResult`/
   `RouteAssistIncomplete` field and every capture-input field: `price,
   cost, labor, hour, minute, crew, hazard, unsafe, safe, complian, code,
   nec, repair, diagnos, fault, defect, feasib, capacity, breaker, conductor,
   ampacity, boxfill, box_fill, stud, joist, header, blocking, insulation,
   recommend`. This is stricter than Visual Assist's own list where it
   overlaps, because Route Assist's entire brief (§3) is a list of things it
   must never claim — `feasib`, `capacity`, `breaker`, `conductor`,
   `ampacity`, `boxfill`, `stud`, `joist`, `header`, `blocking`,
   `insulation` are Route-Assist-specific additions the equipment-ID domain
   never needed.
2. **Forbidden taxonomy-value tokens** — same idea over every `as const`
   array in `taxonomy.ts`: no enum member may read like a diagnosis
   (`UNSAFE`, `CODE_VIOLATION`, `NEEDS_REROUTE`, `TAP_APPROVED`, etc.).
3. **`suggestedAccessOpeningsMin/Max` may only ever be present together, only
   in `CONCEALED` mode, and `Max` must be strictly greater than `Min`** — the
   brief is explicit (§2.B) that this must always read as a *range*, never a
   number, so a min-equals-max pair (which would read as an exact count) is
   rejected as a build-time invariant violation, not just a style note.
4. **Every homeowner- and contractor-facing summary string function is
   scanned for the §21 "Bad" phrase list** (`we determined the wire path`,
   `you need N holes`, `can be tapped`, `code compliant`, `no obstacles are
   inside`, etc.) against the four proof-scenario fixtures — this can only
   check the fixtures actually exercised, so it's a regression net on the
   scenarios in §25, not a proof that no future summary string could ever
   say the wrong thing; new summary branches need a fixture added to keep
   the check meaningful.
5. **`customerConfirmedRoute: false` forces `needsContractorReview: true`**
   — checked structurally on every result `result.ts` can produce, so an
   unconfirmed route can never silently look accepted downstream.

## 8. Verifier / test plan

`scripts/verify-route-assist-domain.ts`, run with `npx tsx
scripts/verify-route-assist-domain.ts` — no database, no `ANTHROPIC_API_KEY`,
no network, mirroring `verify-visual-assist-domain.ts`'s proof style.

Sections:
1. Taxonomy exhaustiveness (every enum has `UNKNOWN`; mode/destination-type
   values match the brief's list).
2. `invariants.ts` — asserts zero violations against the real registry.
3. **Proof A** — surface receptacle: 5 ft vertical + inside corner + 12 ft
   horizontal → destination `RECEPTACLE`, `SURFACE` mode, one inside corner,
   one vertical transition, `estimatedTotalRouteLengthFt = 17`,
   `customerConfirmedRoute = true`.
4. **Proof B** — surface switch: horizontal raceway + doorway bypass →
   destination `SWITCH`, one doorway bypass, `SURFACE` mode.
5. **Proof C** — surface ceiling fixture: vertical rise + wall-to-ceiling
   transition + ceiling run → destination `CEILING_LIGHT`, one
   `wallToCeilingTransitionsCount`, multi-segment route (proves the
   architecture isn't outlet-shaped, per the brief's own stated purpose for
   this scenario).
6. **Proof D** — concealed, different wall, one doorway, drywall cuts
   allowed → `CONCEALED` mode, `sameWall = false`, complexity `MODERATE` or
   `COMPLEX` (declared thresholds, not asserted exactly, since aggregation
   thresholds are meant to be contractor-tunable later), an access-opening
   range present and `Min < Max`, and — the case that matters most —
   asserts the result contains **no** hidden-path claim in any summary
   string.
7. Uncertainty path: a capture missing a destination point produces
   `RouteAssistIncomplete` with `DESTINATION_NOT_CLEAR`, never a guessed
   result.
8. Confirmation flow: `ADJUSTED`/`RETAKE` decisions never set
   `customerConfirmedRoute: true`.

### 8.1 Browser-level verification — the interactive editor, not just the domain

Domain verification above proves `buildRouteAssistResult` and its helpers
are correct for a given `points`/`segments` input. It proves nothing about
whether clicking, dragging and tagging on screen actually produces that
input — and a real pass found a defect a domain-only suite structurally
cannot catch (below).

**`app/[site]/dev-fixtures/route-assist/page.tsx`** is a committed test
fixture, not a product route (Route Assist has no product route yet — §1.4).
It mounts `RouteAssistCapture` behind a `?case=` query param selecting one of
the four proof scenarios, and exists so both a human and
`scripts/verify-route-assist-browser.ts` can drive the real component
without waiting on booking-tree integration. It lives under `app/[site]/`
rather than at the root — the same fixture also supports `?mode=handoff`,
exercising the real cross-device flow (§1.3.1) via `RouteAssistWithHandoff`,
which needs the `SiteProvider` context every real storefront page gets from
that layout.

**`scripts/verify-route-assist-browser.ts`** — raw `playwright`
(`chromium.launch()`) driven via `tsx`, the same tool and pattern
`scripts/capture-marketing-shots.ts` already uses in this repo (no
`playwright.config.ts`, no new test-framework dependency, not part of
`npm run verify` since it needs a running dev server — same posture as the
existing capture scripts). Run:

```
npx tsx scripts/verify-route-assist-browser.ts --base http://localhost:PORT
```

It drives the surface-receptacle case end-to-end (photo → A → B → add a
waypoint → **drag it** → tag both legs `WALL` with lengths 5/12 →
confirm) and the concealed case (doorway + different-wall tag →
"Different walls" / "Moderate" in the resulting summary), asserting on the
real rendered DOM and text, not on component internals.

**A real defect was found and fixed by this pass, not by the domain
suite:** `startDrag`'s window `pointermove` listener read `dragPointId`
from React state instead of closing over the `pointId` argument it was
called with. `setDragPointId` doesn't take effect until the next render, so
the listener always saw the stale (`null`) value and the coherence check
inside it (`if (!dragPointId) return`) fired on every move — dragging a
waypoint silently did nothing. No amount of testing `buildRouteAssistResult`
against hand-built `points`/`segments` arrays could have found this, because
the bug is in how the UI *produces* those arrays, not in what the domain
layer does with them once produced. Fixed in `RouteAssistCapture.tsx` by
capturing `pointId` directly in the `onMove`/`onUp` closures; `dragPointId`
state was dead after the fix (nothing else read it) and was removed.

**A second, smaller defect found in the same pass:** the drawn route line
had only its visible 1.2px stroke as its click/tap target — a real problem
for a diagonal line on a touchscreen, not just a test-precision issue. Fixed
by rendering a second, invisible 16-unit-wide line under the visible one to
carry the tap hit-area, with the visible line's own pointer events turned
off so it doesn't double-fire.

Manually verified in the browser beyond what the automated script covers:
mode/drywall question branching, all four destination-type hints threading
correctly end-to-end (`surface-receptacle`, `surface-switch`,
`surface-ceiling-light`, `concealed`), waypoint removal, "Adjust route"
preserving prior tags, a stray tap on empty canvas during edit being a safe
no-op, and the mobile (375×812) responsive layout.

## 9. Genuine blockers (for the next slice, not this one)

1. **No live private photo storage.** Route Assist photos ride the public
   quote-photo bucket for now (documented in §1.4); revisit once
   `lib/visual-assist/storage.ts` is committed and configured.
2. **No tree-integration point exists in the electrical catalog.** Deciding
   which question/`AnswerOption` opens Route Assist, and how its result
   feeds back into `resolveRoute`, is a catalog/product decision this slice
   deliberately does not make unilaterally.
3. **Aggregation thresholds in `complexity.ts` are defaults, not locked
   policy** — same posture as `pricesight-v1.md`'s `PROVISIONAL` aggregation
   layer, and for the same reason: nobody has run this against real
   contractor jobs yet.
