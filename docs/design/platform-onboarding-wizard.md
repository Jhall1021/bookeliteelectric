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

## Idempotency

Repeat create → `SLUG_TAKEN` with the first contractor's id (the page resumes there); concurrent creates → one row, by the unique constraint. Repeat owner → same membership (`already`). Repeat trade → same enrolment (`setTradeEnrolment`'s own rule). Repeat install → the installer's own `CATALOG_ALREADY_INSTALLED`, reported as done; concurrent installs on one instance share one promise. Launch reports every service's outcome (activated / already live / refused with code / failed) — a partial launch is a partial report.

## Verification

`scripts/verify-platform-onboarding.ts` (in `npm run verify`, after the read-model verifier): refusals for signed-out, non-staff and unknown ids on every command; row shape after create; sequential and concurrent duplicate submission for create, owner, trade and install; no membership at creation; every installed service inactive; launch refused with blockers and activating nothing; foreign tenant untouched; progress re-derived after every step; index isolation; pure progress rule; structural rules (import allowlist, every write inside a door, the two owned writes only, install never touches activation, launch asks the engine first and activates only via `activateService`, one readiness engine, no request reads in the module, no writes or clients on pages/actions, FormData never passed onward, explicit launch confirmation). Fixtures are run-unique and proven gone.

The two existing gates were widened, not weakened: `SURFACE_POLICY` gains the wizard's imports; the request-access rule enumerates the three pages that may read the request and what each may read; the "platform side never writes" rule names `lib/platformOnboarding.ts` as the second permitted writer next to the bootstrap.

## Deferred, deliberately

1. **Owner invitation by email.** `ContractorInvitation` has a schema and no code (no mint, no accept, no mail). The wizard attaches an existing verified account; the page says so and points at `/sign-up`.
2. **Staff entry into a contractor's dashboard.** Pricing, service area, scheduling, calendar and payments are the owner's work in their own dashboard; the wizard links there and says an owner session is needed. No impersonation.
3. **Cross-instance install race.** Two instances installing the same catalog at the same moment is the same window the contractor's own route has; narrowed here by one-promise-per-contractor, not closed (would need an advisory lock inside the installer's transaction).
4. **Lifting the one-owned-business rule** (`ALREADY_OWNS_ANOTHER`) — a product decision.
5. **Stamping `completedAt`** on launch — the field has no writer anywhere; not invented here.
6. **A second trade**, template re-install or top-up — V1 rules of the authorities, unchanged.
