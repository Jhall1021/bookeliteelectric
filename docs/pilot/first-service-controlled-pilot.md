# First-Service Onboarding — Controlled Pilot Package

Status: prepared, **not deployed**. Nothing here has touched production.

## 1. Scope (frozen)

| | |
|---|---|
| Trade | Electrical |
| Service | New 120V Outlet (`new-120v-outlet`, priced from the contractor's own costs) |
| Route | Straight surface-mounted run, no corners |
| Booking | That one service added to a visit |
| Contractor pricing | **Fixed price (`FLAT_RATE`) only** — a bounded pilot constraint, not a Price2Book rule |

Defined once in `lib/electrical/pilotScope.ts` (`PILOT_SCOPE`, `PILOT_LIMITATIONS`) and read by the staff view, the CLI and the verifier.

## 2. Limitations (accepted, not to be fixed during the pilot)

0. **Fixed-price contractors only.** The pilot proves the fixed-price path: configure costs and labor → approve a calculated customer price → homeowner sees that price → books at it. Derived pricing produces a fixed total, which a time-and-materials storefront never shows (it renders a labor range). So one decision, `lib/electrical/pilotEligibility.ts`, refuses a non-`FLAT_RATE` contractor at every door — wizard entry and the readiness API (`PILOT_STRATEGY_NOT_SUPPORTED` / `PILOT_STRATEGY_UNKNOWN`), derived-price approval (409), pilot activation, and homeowner pricing (REVIEW, so `/api/visit` cannot record the fixed total). Staff see `Not available for time-and-materials pricing`. Copy is `pilotSetupCopy()` in `lib/pricingCopy.ts`, keyed by `PricingStrategy`, with no flat-rate fallback. Time-and-materials onboarding is its own design, later.
1. **Runs that turn corners go to review.** Two independent reasons, both deliberate for Stage 1B:
   - **Corner labor is not calibrated.** The wizard establishes labor for the straight route's four components only. Inside, outside and flat corner labor stay UNRESOLVED — never zero, never copied from per-foot labor, never an average of the disputed NECA figures (inside/outside 12.00 C for Wiremold 2900 vs 40.00 C for metal G4000; flat corner has no evidence), and never a raceway-family figure chosen without structured product-family evidence from the contractor. A turned route therefore stops at `A component on this route has no established labor time` before pricing.
   - **Exact purchased raceway is not known.** Underneath, the takeoff for a turned route is `MATERIAL_TAKEOFF_INCOMPLETE` (`SEGMENT_GEOMETRY_REQUIRED`, `OFFCUT_POLICY_REQUIRED`): leg lengths and offcut reuse are unknown, so no package count is invented.
   The homeowner is offered a quote review, never a guessed price. Future direction (labor-family / onboarding workstream): one shared inside/outside corner calibration where the evidence and the contractor's product family support it, one flat-corner calibration — introduced when turned-route geometry becomes priceable, so the questions actually unlock customer pricing.
2. **Mixed visits.** Adding this service to a visit is proven. Other visit edits that combine it with other services (e.g. removing a primary, repricing lines) fail closed rather than reprice.
3. **Account and business setup** happen in the existing flows before the wizard.
4. **Materials & Costs is not built.** Material prices are entered and updated in the wizard; the copy says they *will* live in Materials & Costs once that screen exists. There is one record per part per contractor, so the future screen edits the same data.
5. **Validation refusals and homeowner REVIEW results are log-only** (see §6); the database keeps approvals, activation, cost changes and priced bookings.
6. **Pricing-settings changes have no durable history.** The existing `PricingSettingsChange` table has non-nullable before/after columns and cannot record an undecided-to-decided change without a schema change, which this phase deliberately did not make. The diagnostic reports *whether* settings changed since approval (from the row's timestamp), not the old values.

## 3. Readiness diagnostic

`lib/electrical/pilotDiagnostic.ts` → `loadPilotDiagnostic(db, contractorId)`. A support view over the wizard's own loader and the storefront's own resolver — not a second readiness truth.

Checks: catalog installed · pilot service present (and on calculated pricing) · materials configured · labor configured · pricing setup complete · price approved and current · service live · homeowners get a fixed price (asked through the real homeowner resolver).

Where to see it:
- **Staff:** `/platform/onboarding/<contractorId>` → "First-service pilot" section (read-only, opened through the existing staff authorization and tenant guard).
- **Terminal:** `npx tsx scripts/pilot-diagnostic.ts --slug <slug>`

## 4. Support status (friendly, no internal terms)

`Catalog not installed` → `Materials incomplete` → `Labor incomplete` → `Pricing setup incomplete` → `Price ready to approve` → `Ready to activate` → `Live`, plus `Price needs review` whenever an approved price's costs change. Each comes with a one-sentence next action and a plain-words list of what is still missing (e.g. "Wire size", "Price for Raceway channel", "Labor for Outlet installation", "Decide your service-call minimum").

## 5. Reset strategy (rehearsal contractors only)

`npx tsx scripts/pilot-reset.ts --slug <slug>` (dry run) / `--confirm`. A CLI on purpose — not an admin endpoint.

**Boundary — removed:** provisioned services and their questions, options, rules and service materials; contractor categories; pilot decisions (wire size, extra wire); material costs, product links and their cost history; material system; labor; pricing settings; price approvals; rehearsal visits, line items, quotes and photos.
**Kept:** contractor, storefront site, memberships, trade enrolment, user accounts.
**Result:** status returns to `Catalog not installed`, and the real installer accepts the contractor again (proven).

**Refused:**
- `elite-electric`, `brightpath-electric` — always.
- Any slug that is not `rv2-onboarding-pilot` or `rv2-pilot-rehearsal-*` — so arbitrary businesses and raw ids are refused.
- The stamped production database — using the existing `DatabaseIdentity` rule (stamped endpoint must *match* the live endpoint; the rehearsal branch carries a copied "price2book-production" row for a different endpoint, which is exactly what the rule distinguishes).
- A database with no identity marker.
- Any contractor with a **booking** — reset never deletes bookings.

## 6. Audit and log visibility

| Question after a session | Where the answer is |
|---|---|
| Where did the contractor stop? | Diagnostic status + "last setup activity" (from row timestamps) |
| What validation blocked them? | `[onboarding-pilot] {"event":"setup_write","outcome":"refused","status":…,"code":…}` |
| Did they approve a price? | `ContractorDerivedPricingApproval` (approved at, approved total) + `price_approval` log |
| Did activation succeed? | `Service.active` + `activation` log (with refusal code) |
| Did the homeowner get PRICED or REVIEW? | Priced: `LineItem` with its economic basis and material cost. Review: `homeowner_price` log with the refusal code |
| Did the approval go stale later? | Diagnostic "changes since approval" (from `MaterialCostEvent`, labor and settings timestamps) + `homeowner_price` with `DERIVED_PRICING_APPROVAL_STALE` |

Wizard cost writes now go through the existing `setContractorMaterialCost` / `overrideUnresolvedMaterialCost` path, so every cost change writes a `MaterialCostEvent` and recomputes dependents. Before this phase they bypassed it.

Log lines carry an explicit field allowlist: contractor id, service id, step, outcome, HTTP status, machine code, total in cents. **Never** credentials, session/cookie values, homeowner answers, names, emails, addresses or phone numbers — extra fields handed to the helper are dropped (tested).

## 7. Test contractor starting state

A designated rehearsal contractor (`rv2-pilot-rehearsal-<name>`), created with: contractor row, storefront site, Electrical trade enrolment, an owner membership for a real signed-up account. **No** catalog, material costs, material system, labor, pricing settings, approval; not live. Status: `Catalog not installed`.

## 8. Happy path

1. Contractor opens **Let's get your first service ready** → *Add Electrical services*.
2. **Materials** — how they run surface wiring (wire size, grounding, clip spacing, entry fittings, extra wire), then what they pay for each part (pack size + pack price).
3. **Labor** — their own minutes for: planning the surface run (or "No extra time"), running raceway per foot, outlet installation, mounting the box. One Save.
4. **Your pricing** — crew-hour rate, minimum labor charge, rounding, permit/admin charge (explicit "No charge" allowed).
5. **Review your price** — labor, minimum adjustment (if any), materials in whole packs, markup (rule stated), permit (if any), rounding → customer price. *Approve this price.*
6. **Go live** — *Make New 120V Outlet bookable.*
7. **Success** — "Your first service is ready to book · New 120V Outlet · $760 · Live" (with the rehearsal fixture's numbers), and three next choices.
8. A homeowner answering a 31-ft straight run gets the fixed price; the booked line records the economics that produced it.

## 9. Fail-closed cases (each proven to produce no guessed price)

| Case | Homeowner | Support status |
|---|---|---|
| Run turns corners | REVIEW | unchanged |
| A labor value cleared | REVIEW | `Labor incomplete` |
| Material setup incomplete (e.g. grounding cleared) | REVIEW | `Materials incomplete` |
| Pricing decision cleared | no price | `Pricing setup incomplete` |
| Cost changed after approval | REVIEW (`DERIVED_PRICING_APPROVAL_STALE`); service stays live | `Price needs review`, old vs new price shown |

## 9a. Scheduling duration for derived services

A priced derived line snapshots the labor that priced it: `resolveRouteWithDerivedPricing` fills `fieldLaborHours` (derived crew-hours), `techCount` (the crew size the price used — 1, `DERIVED_PRICING_TECH_COUNT`) and `estimatedMinutes = ceil(crew-hours / crew count × 60)` (`elapsedMinutesFromCrewHours`), so `/api/visit`, the schedule page, checkout's `WINDOW_TOO_LATE` rule and `Booking.estimatedDurationMinutes` receive a real duration through their existing code. Bookings made before this carry no duration and are not rewritten.

Proven by `verify-derived-duration` (the seam, the rounding, a review carries no derived duration) and `verify-derived-scheduling-browser` (a 200 ft straight route = 4.8 crew-hours → 288 min: the line stores it, the server-rendered schedule day withholds 2:00 PM – 4:30 PM under default hours, checkout refuses that window with `WINDOW_TOO_LATE`, and the booking snapshots 288).

**Every schedule day and checkout apply one fit rule to one duration.** `jobFitsWorkday` (`lib/jobber.ts`) is the only end-of-day comparison: Jobber availability, native availability and checkout's `WINDOW_TOO_LATE` call it. `visitJobDurationMinutes` (`lib/schedulingAvailability.ts`) is the only reading of a visit's length for the schedule page, `/api/availability/[date]` and checkout — the route reads the OPEN visit's line minutes from the session instead of a `?duration=` the client used to send and the route ignored (later day tabs offered windows checkout refused). An unavailable window carries `unavailableReason`: `NOT_ENOUGH_TIME` reads "Not enough time available"; `FULL` keeps "Fully booked". The deposit route's own duration sum is unchanged.

**One service date (`lib/serviceDate.ts`).** A scheduling day is a calendar day in `America/New_York` (`SCHEDULING_TIME_ZONE`, the zone arrival times are read in), passed as `YYYY-MM-DD` and stored on `ArrivalWindow.date` as that day at `00:00Z` — a date-only value, never converted through a time zone and labelled as UTC. `nextWorkingDays` returns service dates from New York's today; the schedule page labels them on the server; checkout accepts only a service date (`INVALID_SERVICE_DATE` otherwise) and finds/creates the ArrivalWindow by `serviceDateToStored`, which is the key native capacity counts by, so a storefront booking consumes capacity and `@@unique([date, startTime, endTime, serviceAreaId])` keeps one row per service-date window. The email, confirmation page, dashboard and Jobber push read the day through `serviceDateFromStored`. Before this, checkout stored the page-load timestamp, capacity never counted a storefront booking, and days came from the server's local calendar. Existing rows are not rewritten; `serviceDateFromStored` reads an old timestamp row as the day it was scheduled on, but capacity does not count old-format rows. Proven by `verify-service-date` (boundaries, DST, server-zone independence, uniqueness) and `verify-derived-scheduling-browser` (real booking → FULL / "Fully booked", second homeowner refused, one shared row).

**Before this scheduling change is released to Production (recorded, not done in Stage 1A):** ArrivalWindow rows written before `lib/serviceDate` carry the page-load timestamp, not the canonical `00:00Z` service date. Native capacity does not count them, and they can duplicate a service-date window that a new booking creates. Production needs a READ-ONLY audit first (rows whose `date` is not `00:00:00.000Z`, grouped by service area, `serviceDateFromStored(date)`, start and end time — how many, how many future-dated, how many would collide with an existing canonical row) and then, only on explicit approval, a controlled backfill that normalises future rows to `serviceDateToStored` and merges colliding rows' bookings onto one row. Past rows are read correctly as-is. The Stage 1A rehearsal booking is deliberately left in the old representation.

**Stripe.js loads only when a deposit is due.** `DepositPayment` imports `loadStripe` from `@stripe/stripe-js/pure`; the default entry injected `js.stripe.com` on every details-page load because the component is statically imported. The browser suite proves a no-deposit checkout contacts no `js.stripe.com`, `m.stripe.com` or `m.stripe.network`, and that a required deposit still requests Stripe.js — at a test boundary (intercepted `/api/checkout/deposit` with a fake key, Stripe request aborted); no Stripe credential is used, so card authorization itself is not exercised.

**Future scheduling improvement (not in scope):** native capacity counts bookings per arrival window (`nativeScheduling`), so a job longer than its window does not occupy the next one. Duration now reaches the booking; using it for capacity is a separate change.

## 9b. Pilot regression gate

`npm run verify:pilot` — the pilot/relevant regression set, in one place so it cannot quietly shrink. It includes `lint-storefront-identity` (strict, no pilot exception) and `verify-pilot-strategy-eligibility`. DB-driving: run against the rehearsal branch, never alongside another DB-driving chain.

It also drives the HOMEOWNER STOREFRONT, because Stage 1A's deployed rehearsal found the defect every earlier suite missed by POSTing `/api/visit` directly: the guided flow priced a derived service in the browser from a published base price it does not have, and sent every homeowner to photo review on the first answer. `verify-storefront-derived-pricing` covers the price-source decision, the no-economics-in-the-browser and no-writes boundaries, and the server outcomes; `verify-storefront-derived-pricing-browser` (last, needs `npx next build` first — it runs `next start` locally) walks the real pages from "Check My Price" to the price card, Add to My Visit, stale and turned-route reviews, and an unchanged published-price service. `verify-derived-duration` and `verify-derived-scheduling-browser` (also after the build, last) cover derived duration through scheduling, checkout and the booking, and the no-deposit Stripe boundary.

For a `DERIVED_RESOLVED_SCOPE` service the browser navigates the question tree and the SERVER prices the terminal answer: `POST /api/price-evaluation` (read-only; tenant from the storefront identifier) and `POST /api/visit` both consume `planNewLine` (`lib/visitLinePlanning.ts`), so the displayed and stored price come from one implementation, and a price that goes stale in between is refused at write time.

## 10. Known baseline reds (pre-existing, unchanged, not part of this pilot)

Each was run at commit `9d8df05` in a separate worktree and fails identically there.

- `verify-template-installation` check 19 — provenance stamping.
- `verify-pricing-settings-tenancy` — 7 probe contractors from other workstreams have no pricing settings; none were fabricated.
- `verify-platform-authority` — 5 platform-admin bootstrap checks that depend on this database's identity/admin state.
- `verify-material-readiness-lifecycle` — requires `REHEARSAL_DATABASE_URL`, which this workstream does not use.

Found by this phase's regression and **fixed** (both from earlier Routing V2 work, not new pilot code):
- `app/api/admin/materials-overview` read contractors' answer options through a query rooted at a shared platform model (ADR-007). It now reads the tenant rows first, under the guard.
- `Contractor.capabilities` made Stripe's unrelated `capabilities` API parameter trip the relation audit; recorded as a reviewed, anchored exception.

Verification for this phase: `verify-pilot-preparation` 61/61 (with 4 mutations on the production guard, booking refusal, log allowlist and stale-price fallback — all caught by name); full regression 34 suites/audits, 962 assertions, 0 failed.

## 11. Where the pilot should run — recommendation

**Stage 1 — rehearsal environment (recommended first).** A non-production deployment of `feat/electrical-routing-v2` bound to the Routing V2 rehearsal Neon branch (`ep-wispy-union-ayxh5fr5`). A real contractor completes onboarding at the keyboard while staff watch the "First-service pilot" section; staff play the homeowner. No real customers are exposed.

Needs from Joshua before it can happen (not done here; this workstream is not authorized to change Vercel):
- authorization to create that preview deployment and set its **preview-only** environment variables (database, auth URL);
- a decision on email for a real contractor sign-up there (a real provider, not the test mail sink);
- the pilot contractor's slug: a **real** slug is intentionally *not* resettable; use `rv2-pilot-rehearsal-*` for practice runs.

**Stage 2 — production controlled release, only after Stage 1.** Production has none of Routing V2 today. It requires merging, the schema migration (nullable pricing settings, new models, pricing method), and the existing receipt-bound controlled-release process — each separately authorized. Real homeowners should not see calculated pricing before Stage 1 has been observed end to end.
