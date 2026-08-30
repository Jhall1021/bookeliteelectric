# The live two-contractor suite

`npm run verify:tenancy`

## Why these are not in the deploy gate

Three checks prove tenant isolation by creating a second contractor and trying
to cross the boundary from it. To do that convincingly they **mutate real
tenant data and restore it**:

| suite | what it touches |
|---|---|
| `verify-tenant-isolation-live` | creates a dummy contractor, its services, materials, categories, sites |
| `verify-jobber-connection-tenancy` | **overwrites Elite's real Jobber access and refresh tokens**, then restores them |
| `verify-pricing-settings-tenancy` | **changes Elite's live labor rate**, runs the seed and reconcile, then restores it |

`npm run verify` runs inside `next build`, which runs on **every Vercel
deployment**. A build canceled, timed out, or killed part-way through one of
these would leave Elite's real Jobber tokens set to `access_elite_2`, or their
labor rate off by a cent — silently, in production, with the deploy showing
only as failed.

`verify-jobber-connection-tenancy` was briefly in the gate. That was a mistake,
corrected the same day it was noticed.

> **A check that mutates real tenant data belongs in a suite someone runs and
> watches, never in an automated gate that also runs on every deploy.**

The distinction is not "is it slow" or "does it touch the database" — plenty of
gate checks read production. It is whether a half-completed run leaves real data
wrong. `verify-checkout-atomicity` stays in the gate because it only ever writes
under its own throwaway contractor and never modifies an existing one's rows.

## When to run it

Before any release that touches tenancy, and after any destructive migration —
alongside the gate, the contract verifiers, and reconcile. It is part of the
pre-release checklist, not part of CI.
