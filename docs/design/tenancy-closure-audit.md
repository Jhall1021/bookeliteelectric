# Tenancy closure audit

**Invariant.** Contractor A can never read, mutate, price, schedule, pay
against, or administer Contractor B's data, even if A supplies a valid
identifier belonging to B.

**Status:** closed for Contractor #2, with two named limits below. 31 Aug 2026.

## How tenant identity is established

Four trusted sources, and nothing else:

| Surface | Source of tenancy |
|---|---|
| Authenticated admin | session → active `ContractorMembership` → contractor |
| Public storefront | `x-price2book-site` → `ContractorSite.publicId` → contractor |
| Booking continuity | `(contractorId, sessionId, OPEN)` — contractor FIRST |
| Stripe webhook | `event.account` → connected account → contractor |

A supplied `contractorId` is never trusted on its own.
`resolveAdminContractor` checks it against the caller's own active
memberships and answers *"No such contractor for this account"* whether it is
absent or simply someone else's — so the error cannot be used to enumerate
tenants.

Every call into Jobber and Stripe takes its contractor from `ctx.contractorId`
or `site.contractorId`. **No request body supplies a contractor id to any of
them.**

## What was audited

All 41 API routes, classified by how each resolves tenancy; every route
accepting `serviceId`, `bookingId`, `visitId`, `customerId`, `quoteId`,
`crewMemberId`, `slug` or `dateISO`; the 30 tenant-owned models; and the
singleton/default-row assumptions that would work for Contractor #1 and
cross-contaminate Contractor #2.

**Every `id: "default"` reference in the codebase is now a comment recording
its own removal.** Pricing settings, business hours, the Jobber connection and
the service-area read were all once singletons; each is keyed by contractor.

**Unguarded access to tenant data: 6 sites, all classified, 0 unexplained.**
The Stripe webhook (no session or site header exists on a webhook — tenancy
comes from `event.account`, and the query is scoped by `booking → visit` by
hand) and five Jobber OAuth calls (run outside any request context, take
`contractorId` explicitly).

## Negative tests — real ids, not invented ones

A probe with a made-up id proves only that no such row exists. These use
**Elite's actual primary keys**, read beforehand, and try to reach them from a
throwaway contractor's context — what a hostile or careless caller would
actually do.

`verify-cross-tenant-resource-access` (16 checks) covers `serviceId`,
`visitId`, `bookingId`, `customerId`, `quoteId`, `crewMemberId`,
`serviceAreaId`, `pricingSettingsId`, `materialId`, `questionId` and
`paymentEventId` — `findUnique` and `findFirst` both refused; a real `UPDATE`
against Elite's service (inside a transaction that always rolls back) changes
nothing; counts exclude the other tenant; and **a live booking session from
Elite's storefront resolves to nothing under another contractor**.

`verify-tenant-isolation-live` (30 checks) covers the mechanism underneath:
reads outside any context throw, injected filters return null, nested includes
and two-level traversals stay inside the tenant, concurrent interleaved
requests never cross, and `asPlatform` removes context rather than granting
access.

## Two limits, named rather than implied

**`ContractorSite` is cross-tenant readable, deliberately.** Reading it is what
*establishes* tenant context, so requiring context would be circular. It is
defensible only while it stays routing data, so that is now asserted: the row
carries no field matching price, cost, deposit, customer, email, phone or
address. If that ever changes, the check fails.

**A platform-rooted nested read still bypasses the guard.** Documented as a
blind spot in `verify-tenant-isolation-live` rather than fixed — it is a known
property of rooting a query at a platform model and traversing into tenant
data. No current code path does it.

## Standing obligations

These are conditions of the closure, not observations about it.

1. **`ContractorSite` stays routing/identity data.** It may remain
   platform-readable only while it holds no contractor economics, customer
   data, pricing, payment or other sensitive tenant-owned state. Guarded by
   `verify-cross-tenant-resource-access`, which fails if a field matching
   price/cost/deposit/customer/email/phone/address ever appears on it.
2. **Any future platform-rooted nested read gets an explicit isolation
   review.** No current code path has that shape. It is not a defect today and
   it is not a license tomorrow.
3. **The full cross-tenant suite is rerun during the first persistent
   Contractor #2 onboarding** — `verify-cross-tenant-resource-access`,
   `verify-tenant-isolation-live`, `audit-unguarded-tenant-access`,
   `audit-guard-adoption`, `verify-booking-tenancy`,
   `verify-tenant-context-retention`. Every proof today runs against a tenant
   the test creates and destroys; a second tenant that PERSISTS exercises
   ordering, cookies, sessions and cached context that a transient one cannot.

## Verdict

**Ready for Contractor #2.** Tenant identity comes from trusted server-side
context on every surface; ownership is enforced by the guard rather than by
each route remembering to check; and the negative tests use valid foreign ids
rather than malformed ones.

The one thing this audit does NOT cover is a second contractor actually
existing: every cross-tenant proof runs against a throwaway tenant created and
destroyed by the test. That is the right shape for a guard, but the first real
Contractor #2 onboarding is still the moment to re-run all of it.
