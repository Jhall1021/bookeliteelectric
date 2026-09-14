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
1. **Runs that turn corners go to review.** Leg lengths and offcut reuse are unknown; the homeowner is offered a quote review, never a guessed price. The contractor is told this on the review step.
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

## 9b. Pilot regression gate

`npm run verify:pilot` — the pilot/relevant regression set, in one place so it cannot quietly shrink. It includes `lint-storefront-identity` (strict, no pilot exception) and `verify-pilot-strategy-eligibility`. DB-driving: run against the rehearsal branch, never alongside another DB-driving chain.

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
