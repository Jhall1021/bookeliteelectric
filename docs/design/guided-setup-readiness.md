# Guided Setup — the readiness model

**Status:** design for review. Nothing implemented. 31 Aug 2026.

Guided Setup is an **orchestrator**. It owns no rules of its own. Every
question it asks is already answered somewhere in this codebase, and the whole
value of the thing is that it asks them in an order a contractor can follow —
not that it re-decides them.

The failure mode to design against is a second validation system that
disagrees with the first. A wizard that thinks a service is ready while §1.4
thinks it is not would be worse than no wizard, because the contractor would
believe it.

## 1. The readiness state model

**Readiness is derived, never stored.** It is a pure function of data the
existing systems already own, computed on demand:

```
readiness(contractorId) -> {
  stages: Stage[]          // seven, in order
  blockers: Finding[]      // a homeowner would be harmed, or the system refuses
  warnings: Finding[]      // safe, but the contractor should know
  canLaunch: boolean       // no blockers anywhere
}

Stage = {
  key, title,
  status: "blocked" | "incomplete" | "warning" | "ready",
  findings: Finding[],
  href                     // the existing portal module that fixes it
}

Finding = { code, severity: "blocker" | "warning", message, serviceSlug? , href? }
```

`Finding` deliberately matches the `Blocker = { code, message }` vocabulary
already in `lib/pricingReadiness.ts`, so per-service readiness lifts into
setup readiness without translation.

**Why derived and not stored.** A stored flag goes stale the moment a
contractor edits a price, disconnects Jobber or a material cost moves — and it
would be stale in the dangerous direction, saying ready when it is not.
Deriving costs one query pass and cannot lie.

**What IS stored** is only what nobody else records — see §5.

## 2. Blocker and warning rules

A **blocker** means: a real homeowner, right now, would either be unable to
complete a booking, or would complete one the contractor cannot honor.
A **warning** means: safe, but the contractor is leaving something on the table
or should look before launch.

### Stage 1 — Business

| Code | Severity | Rule |
|---|---|---|
| `BUSINESS_NAME_MISSING` | blocker | `Contractor.name` empty — the storefront cannot render |
| `SITE_MISSING` | blocker | no active `ContractorSite` — there is no address to send anyone to |
| `COUNTRY_MISSING` | blocker | `countryCode` null — `checkCountry()` refuses before any Stripe call |
| `CONTACT_MISSING` | warning | no `phone` and no `supportEmail` — the scheduling-outage screen has nothing to offer |
| `LICENSE_MISSING` | warning | `licenseNumber` empty where the trade expects one |
| `BRANDING_DEFAULTS` | warning | no logo or theme chosen |

### Stage 2 — Trade & canonical template

| Code | Severity | Rule |
|---|---|---|
| `NO_SERVICES` | blocker | contractor owns no `Service` rows — nothing to sell |
| `TEMPLATE_NOT_INSTALLED` | blocker | no service carries a `templateVersionId` and none was authored by hand |
| `TEMPLATE_UPDATE_PENDING` | warning | `template-update --status` reports unadopted changes |

V1 installs **Electrical** through the existing `provision-from-template`.
That script already refuses to write a single economic value, so everything it
creates arrives unresolved by construction — which is exactly the state the
next stage exists to clear.

### Stage 3 — Pricing foundation

| Code | Severity | Rule |
|---|---|---|
| `PRICING_SETTINGS_MISSING` | blocker | no `PricingSettings` row — `loadPricingSettings` throws, and §1.4 cannot even ask what a tree promises |
| `LABOR_RATE_UNSET` | blocker | `crewHourRateCents` ≤ 0 |
| `MINIMUM_UNSET` | warning | `primaryMinimumCents` = 0 — legal, but every short job prices at labor alone |
| `MATERIAL_COSTS_UNRESOLVED` | blocker | any intended service has `materialCostResolved: false` or non-empty `unresolvedMaterialKeys` |
| `MATERIAL_COST_ON_HOLD` | blocker | `publicationHold()` returns a reason for any intended service |

### Stage 4 — Services & pricing review

Per service, from `lib/pricingReadiness.ts` and `lib/activationOutcome.ts`:

| Code | Severity | Rule |
|---|---|---|
| `PRICE_NOT_APPROVED` | blocker | tree promises a fixed price (`pricePromiseOf().promisesFixedPrice`) and `publishedPriceApprovedAt` is null |
| `PRICE_UNDERIVABLE` | blocker | `suggestPrimaryPrice()` yields null — an input is missing, not zero |
| `TREE_HAS_DEAD_ROUTE` | blocker | any route resolves to nothing |
| `TREE_UNBOUNDED` | warning | a pricing route exists with no review route behind it — the scope is unenforced |
| `PRICE_DRIFTED` | warning | published price ≠ currently derived — needs re-approval, never auto-correction |
| `SUGGESTED_NOT_APPROVED` | warning | a derived price exists and the contractor has not accepted it |

**Suggested prices are never approved by Guided Setup.** It shows the derived
figure and links to the publish action; the contractor presses it. This is not
a UI preference — the price-writer audit treats a script stamping its own
approval as a governance failure, and a wizard is a script with buttons.

### Stage 5 — Scheduling

The mode is a **declared** fact (§5), because the correct answer to zero crew
depends on it:

| Code | Severity | Rule |
|---|---|---|
| `SCHEDULING_MODE_UNDECLARED` | blocker | neither standalone nor external chosen |
| `BUSINESS_HOURS_MISSING` | blocker | no `BusinessHours` — no windows can be generated |
| `SERVICE_AREA_EMPTY` | blocker | no active `ServiceArea`, or zero ZIPs — checkout refuses every address |
| `PROVIDER_NOT_CONNECTED` | blocker | mode = external, no `JobberConnection` |
| `PROVIDER_TOKEN_INVALID` | blocker | mode = external, connection present, a probe raises `SchedulingUnavailableError` |
| `NO_ELIGIBLE_CREW` | blocker | mode = external and zero `eligibleForWebsiteBookings` — **a configuration failure, not an empty calendar** |
| `NO_ELIGIBLE_CREW` | *(not raised)* | mode = standalone — legitimate; native configuration is authoritative |

### Stage 6 — Payments

Checked **against the services the contractor intends to activate**, not
globally:

| Code | Severity | Rule |
|---|---|---|
| `STRIPE_NOT_CONNECTED` | blocker *(conditional)* | any intended service has `depositCents > 0` and no `stripeAccountId` |
| `STRIPE_NOT_READY` | blocker *(conditional)* | as above and `connectReadiness().ready` is false — reason passed straight through |
| `DEPOSIT_WITHOUT_STRIPE` | blocker | a deposit is configured on a service whose contractor cannot take one |
| `NO_DEPOSITS_CONFIGURED` | *(nothing)* | a contractor taking no deposits needs no Stripe. Not a warning — it is a legitimate business model |

Note the conditionality: Stripe is only a blocker for contractors who
actually charge deposits. Making it universal would block launch for a
business that has no reason to connect it.

### Stage 7 — Review & Launch

Launch readiness answers one question: **can a real homeowner price and book
something right now, safely?**

| Code | Severity | Rule |
|---|---|---|
| `NOTHING_ACTIVATABLE` | blocker | zero services are both ready and intended |
| any blocker above | blocker | inherited |
| `PRE_WORK_WITHOUT_DEPOSIT` | warning | a pre-work service takes no deposit — allowed, but unusual |
| `SINGLE_SERVICE_LAUNCH` | warning | exactly one service — fine, worth confirming |

## 3. Data each stage needs

| Stage | Reads |
|---|---|
| Business | `Contractor`, `ContractorSite` |
| Trade | `Service` count, `templateVersionId`, template-update status |
| Pricing foundation | `PricingSettings`, `Service.materialCostResolved`, `unresolvedMaterialKeys`, `servicesOnHold()` |
| Services | per-service tree + `suggestPrimaryPrice` + `pricePromiseOf` + approval stamp |
| Scheduling | declared mode, `BusinessHours`, `ServiceArea`, `JobberConnection`, `JobberCrewMember` |
| Payments | intended services' `depositCents`, `Contractor` Stripe columns |
| Launch | everything above, plus the activation set |

## 4. What each stage calls — all existing

| Stage | Existing system |
|---|---|
| Trade install | `scripts/provision-from-template.ts` |
| Pricing foundation | `PATCH /api/admin/pricing-settings`, `lib/materialHolds.ts` |
| Price derivation | `lib/pricing.ts` — `suggestPrimaryPrice` / `suggestWwtPrice` |
| Price publication | `PATCH /api/admin/services/[id]/pricing` with `action: "publish"` — **the only way a price is ever approved** |
| Service readiness | `lib/pricingReadiness.ts`, `lib/activationOutcome.ts` |
| Activation guard | `scripts/verify-public-pricing.ts` (§1.4, outcome-aware) |
| Deposit config | `PATCH /api/admin/services/[id]/pre-work` |
| Scheduling | `lib/jobber.ts`, `lib/businessHours.ts`, `/api/admin/service-area` |
| Payments | `lib/stripeConnect.ts` — `connectReadiness()` |
| Destinations | `lib/portalModules.ts` — every fix links to the module that already does it |

**Nothing new is built for any of these.** Guided Setup calls them and renders
their answers.

## 5. New persistence — one table, three facts

Everything else is derived. This records only what no existing system knows:

```prisma
model ContractorOnboarding {
  id             String   @id @default(cuid())
  contractorId   String   @unique
  /// Which stage the contractor was last on. Resumability, nothing more —
  /// it never gates anything, so a wrong value cannot unblock a launch.
  currentStage   String   @default("business")
  /// Stage -> acknowledgedAt. "I have looked at my prices" is a fact about
  /// the human, and no other table could hold it.
  acknowledged   Json     @default("{}")
  /// STANDALONE | EXTERNAL. The one genuinely new domain fact: it decides
  /// whether zero eligible crew is legitimate or a readiness failure, and
  /// nothing in the schema records it today.
  schedulingMode String?
  launchedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

Tenant-scoped, so it joins `TENANT_SCOPED_MODELS` in the guard.

**Deliberately NOT stored:** readiness status, blocker lists, per-service
"approved for launch" flags, or a copy of any price. The intended-activation
set is derived — a service is *intended* when it is active already, or has an
approved published price and is not yet active. A contractor does not intend
to launch something they have not priced, and inferring it costs nothing while
a stored flag would drift.

## 6. Recommended first slice

**The readiness engine and a read-only report. No wizard.**

1. `lib/onboardingReadiness.ts` — the pure function above, calling only
   existing systems.
2. `scripts/verify-onboarding-readiness.ts` — proves it against two fixtures
   that already exist and disagree: **Elite**, which is fully live and must
   come back `canLaunch: true` with zero blockers, and a **freshly
   template-provisioned throwaway**, which must come back blocked on exactly
   the things `provision-from-template` deliberately leaves unresolved. If the
   engine cannot tell those two apart, it is wrong.
3. `/dashboard/setup` — the seven stages, their findings, and a link per
   finding to the module that fixes it.

**Why this first.** It is the whole product decision made testable before any
screen exists. It cannot break anything — it writes nothing, and needs no
migration, because `schedulingMode` is only required at Stage 5 and can be
inferred for the slice (a contractor with a `JobberConnection` is external).

**Second slice** adds `ContractorOnboarding` and the declared mode. **Third**
adds stage navigation and acknowledgements. The wizard screens come last,
against a readiness model already proven.


---

# Slice one — built 31 Aug 2026

`lib/onboardingReadiness.ts`, `scripts/verify-onboarding-readiness.ts` (16
checks, in the deploy gate) and a read-only `/dashboard/setup`. No writes, no
migration, no wizard.

## The two fixtures disagree, which is the point

| | Elite | Fresh provision |
|---|---|---|
| `canLaunch` | **true** | **false** |
| blockers | 0 | 5 |
| warnings | 32 | 4 |
| intended services | 71 | 0 |

Fresh blockers: `SITE_MISSING`, `COUNTRY_MISSING`,
`PRICING_SETTINGS_MISSING`, `SERVICE_AREA_EMPTY`, `NOTHING_ACTIVATABLE` —
which is exactly the shape of what `provision-from-template` leaves behind. It
installs a full electrical catalog and refuses to write a single economic
value, so the catalog exists and nothing about it can be sold yet.

## A rule that was wrong, caught by the fixture

`BUSINESS_HOURS_MISSING` was written as a blocker. Elite has **no
`BusinessHours` row at all** and has been taking bookings throughout, because
`loadBusinessHours` returns `DEFAULT_BUSINESS_HOURS` when the row is absent. A
homeowner can book; the contractor simply has not said whether those hours are
theirs.

It is now `BUSINESS_HOURS_DEFAULTED`, a warning. This is the entire argument
for checking an orchestrator against a live tenant rather than reasoning about
it: the rule was plausible, and it would have told Elite they could not launch
while they were demonstrably launched.

## The missing domain fact

**There is no contractor-owned enablement fact.** `active` means already live.
A template-provisioned service the contractor has not thought about is
indistinguishable from one they have decided to sell.

Intent is therefore inferred, and deliberately **outcome-aware** rather than
"has an approved price" — a `REMOTE_QUOTE` service legitimately has no
`basePrice`, and making price the universal proxy would silently drop every
quote-only service out of the payment and launch checks:

| Signal | Reason recorded |
|---|---|
| `active` | already live |
| promises a price + approved | priced and approved, not yet live |
| promises no price + has a tree | resolves by quote or review, and has a tree |

The third arm is the weak one. When no service is live, the assessment says so
in `notes` rather than presenting an inference as a fact.

**Recommendation for slice two:** add the enablement fact to
`ContractorOnboarding` alongside `schedulingMode` — a contractor-owned set of
services selected for launch. Until then the proxy stands, and it is reported.

## Scheduling mode

Inferred for this slice: a contractor with a `JobberConnection` is external.
Proven both ways — zero eligible crew is legitimate standalone and a blocker
once Jobber is the authority. Explicit `schedulingMode` becomes authoritative
at Stage 5.
