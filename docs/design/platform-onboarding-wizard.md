# Founder Onboarding Wizard — MVP

Branch `feat/platform-onboarding-wizard-mvp`, from `51768f4`. One platform operator (the founder); no staff roles, impersonation, queues or approval chains. Every protection stays: platform authentication by grant, tenant isolation, guarded writes, the existing activation and launch authorities, explicit confirmation before launch, and the release controls.

## Reuse map — who owns each decision

| Step | Authority reused | Where |
|---|---|---|
| Contractor identity | `validateIdentity`, `createContractorRecord`, `slugTaken`, `isUniqueViolation` — extracted from `createContractorForUser`, whose behavior is unchanged | `lib/contractorCreation.ts` |
| Owner | `ContractorMembership` upsert on its unique key; accounts come only from sign-up with a verified address (`lib/auth.ts`) | `lib/platformOnboarding.ts` (the one write this module owns) |
| Trade | `setTradeEnrolment(guarded, id, key)` | `lib/tradeEnrolment.ts` |
| Catalog | `templateVersionSource` → `preflight` → `installCatalog` (unguarded client, as the contractor's own route passes it) | `lib/templateProvisioning.ts` |
| Checklist / readiness | `assessOnboarding`, via `contractorFactsFor` — never recomputed | `lib/onboardingReadiness.ts`, `lib/platformReadModel.ts` |
| Payments fact | `connectReadiness` via the read model | `lib/stripeConnect.ts` |
| Launch | `activateService` per offered service, after `assessOnboarding.canLaunch` | `lib/serviceActivation.ts` |
| Authorization | `withPlatformFor`, `withPlatformContractorFor` (grant by user id, then `withContractor(id, "platform-session")`) | `lib/platformContext.ts` |
| Pricing, service area, scheduling, calendar, payments, storefront, catalog editing | existing dashboard screens, linked, not duplicated | `/dashboard/*` |

## Shape

- **`lib/platformOnboarding.ts`** — the command layer. `beginContractorFor`, `attachOwnerFor`, `enrolTradeFor`, `installTradeTemplateFor`, `launchContractorFor`; reads `onboardingStatusFor`, `onboardingIndexFor`; pure `onboardingProgress`, `noticeText`. Every mutation runs inside a door callback. Request-bound forms take `prisma` + `currentUser()` the way the read model's do.
- **`app/platform/onboarding/page.tsx`** — start a contractor; list every contractor with derived progress.
- **`app/platform/onboarding/[contractorId]/page.tsx`** — one contractor's resumable wizard: six steps, the readiness stages, links to the owner's screens, what still blocks launch and why, launch with confirmation.
- **`app/platform/onboarding/actions.ts`** — server actions: read form fields in place, call one command, redirect with a notice code. No client in scope.
- Entry points: Overview and Contractors headers, a per-row "Onboarding" link in the directory, shell nav.

## Progress is derived, never stored

| Word | Fact |
|---|---|
| not started | the tenant exists; no owner, no trade, no services |
| in progress | some of owner / trade / catalog done |
| blocked | all three done; `assessOnboarding` still names blockers (the owner's work) |
| ready | `canLaunch` |
| launched | at least one live service |

`ContractorOnboarding.completedAt` still has no writer; "finished" stays derived.

## Review corrections (first pass)

- **Owner-work is described, never linked.** `/dashboard/*` resolves its contractor from the signed-in user's membership and contractor-choice cookie, not from the page that linked it; a founder who owns a business would land in their own editors from another contractor's wizard. The wizard names the screen and path as text and says an owner session is needed. Verified by syntax tree: every `href` the onboarding pages render is a literal under `/platform`; a dynamic href or anything under `/dashboard` fails the gate.
- **One slug authority.** `validateIdentity` asks `hostedSlugProblem` (lib/siteRouting.ts: shape, boundaries, doubled hyphens, the reserved list) plus creation's own 48-character ceiling; `slugify` trims after the cut. The create form's `pattern` is the shared `SLUG_INPUT_PATTERN`. Regressions: reserved words, `north--side`, boundaries at 2/3/48/49, generated slugs (`Dashboard` refused, long names never end on a hyphen), an ordinary slug. Self-serve creation is unchanged except where it previously accepted an address the storefront would refuse to serve.
- **Partial launch is visible and resumable, without stored state.** The status now carries every offered service's live flag and, for those not live, the activation guard's verdict read fresh (`activationRefusal`), so the outcomes survive the redirect and a reload. `onboardingProgress` says "launched" only when no offered service is pending; with some live and some pending it is "ready" (retry open) or "blocked" (the engine names why). The retry goes through `activateService` and reports already-live services as such. `launchContractorFor` takes an injectable `activate` defaulting to the real function — the only seam, used by the verifier to interpose a concurrent state change so a genuinely mixed launch is proven through the real guards; the readiness gate is not injectable and the request-bound form passes nothing.

- **Guard verdicts are read lazily and a few at a time.** The offered/live counts progress needs are read in every state; per-service `activationRefusal` verdicts are evaluated only when the page can show or act on them — something live, or ready to launch — and then through `mapWithConcurrency` with a bound of 3, results in the offered list's order (name, then id). Blocked with nothing live, a 75-service catalog costs one query, not hundreds. `onboardingStatusFor` takes an injectable `refusalFor` defaulting to the real guard, used by the verifier to count calls and measure peak concurrency; the request-bound form passes nothing.

The mixed-launch regression reads `basePrice` and `publishedPriceApprovedAt` to assert launching invented no price; `scripts/audit-price-writers.ts` lists the verifier with that reason, as it lists the other price-reading verifiers.

## Retire, and the lifted owner rule (7 September 2026)

- **Retire is the reversible form of delete.** `retireContractorFor` sets `Contractor.active` false, every `ContractorSite` inactive and every `Service` inactive in one transaction, and deletes nothing: catalog, materials, memberships, quotes, bookings and payment records stay. The founder types the slug back and ticks a confirmation; a mismatch refuses before anything is read. Retiring twice is one retire. Progress derives as `retired` from `Contractor.active`; the attention rule yields nothing for a retired contractor; the index lists it under Retired; the Control Center links to the onboarding page, which carries the retire section. Reinstating is not built yet; the data is ready for it.
- **One account may own several businesses when the platform attaches it.** `attachOwnerFor` no longer refuses an account that owns another business. The self-serve create endpoint keeps its own one-business guard, an anti-abuse rule on a public form.

## Idempotency

Repeat create → `SLUG_TAKEN` with the first contractor's id (the page resumes there); concurrent creates → one row, by the unique constraint. Repeat owner → same membership (`already`). Repeat trade → same enrolment (`setTradeEnrolment`'s own rule). Repeat install → the installer's own `CATALOG_ALREADY_INSTALLED`, reported as done; concurrent installs on one instance share one promise. Launch reports every service's outcome (activated / already live / refused with code / failed) — a partial launch is a partial report.

## Verification

`scripts/verify-platform-onboarding.ts` (in `npm run verify`, after the read-model verifier): refusals for signed-out, non-staff and unknown ids on every command; row shape after create; sequential and concurrent duplicate submission for create, owner, trade and install; no membership at creation; every installed service inactive; launch refused with blockers and activating nothing; foreign tenant untouched; progress re-derived after every step; index isolation; pure progress rule; structural rules (import allowlist, every write inside a door, the two owned writes only, install never touches activation, launch asks the engine first and activates only via `activateService`, one readiness engine, no request reads in the module, no writes or clients on pages/actions, FormData never passed onward, explicit launch confirmation). Fixtures are run-unique and proven gone.

The two existing gates were widened, not weakened: `SURFACE_POLICY` gains the wizard's imports; the request-access rule enumerates the three pages that may read the request and what each may read; the "platform side never writes" rule names `lib/platformOnboarding.ts` as the second permitted writer next to the bootstrap.

## Deferred, deliberately

1. **Owner invitation by email.** `ContractorInvitation` has a schema and no code (no mint, no accept, no mail). The wizard attaches an existing verified account; the page says so and points at `/sign-up`.
2. **Staff entry into a contractor's dashboard.** Pricing, service area, scheduling, calendar and payments are the owner's work in their own dashboard; the wizard links there and says an owner session is needed. No impersonation.
3. **Cross-instance install race.** Two instances installing the same catalog at the same moment is the same window the contractor's own route has; narrowed here by one-promise-per-contractor, not closed (would need an advisory lock inside the installer's transaction).
4. ~~Lifting the one-owned-business rule~~ — lifted for platform-attached owners on 7 September 2026; the self-serve guard stays.
5. **Stamping `completedAt`** on launch — the field has no writer anywhere; not invented here.
6. **A second trade**, template re-install or top-up — V1 rules of the authorities, unchanged.
