# Price2Book Vercel cutover — plan and inventory

**Status:** BLOCKED at step 1, 28 August 2026. Inventory and audit of the SOURCE account complete.
The target is a separate Vercel account and this machine holds no credential for it.

Same shape as ADR-013: identify → rehearse → prove → cut over → retain rollback. This moves the
**application host**. The database does not move — Price2Book Neon is already production.

---

## Step 1 — identify the target. IT IS A SEPARATE VERCEL ACCOUNT

The target is **not** another team under the BookElite account. It is a different Vercel account
entirely:

| | Account | Holds |
|---|---|---|
| Source | `josh@econscvs.com` (`jhall1021`), team `elite-9658` | `bookeliteelectric` — today's production |
| Target | `admin@price2book.com` | the Price2Book project |

This was not obvious, and the tooling actively hid it. `vercel project ls` reported "one project"
because the CLI has a saved default scope; the REST API reported the same because the credential
on this machine belongs to `josh@econscvs.com`. Both were answering truthfully about the wrong
account. **A confident answer from the wrong scope is the same failure as a confident answer from
a mis-named branch** — see ADR-013.

### What this changes

- **No project transfer.** Two accounts means the new project is created and configured
  independently; nothing moves between them.
- **Rollback is cleaner.** BookElite stays whole under its own account, untouched by anything done
  in the other. It is not a sibling project that could be edited by accident.
- **DNS is the switch.** With no shared Vercel scope, the cutover moment is where
  `price2book.com` resolves — not a Vercel setting.
- **Both credentials are needed at once.** During the parallel run, BookElite must stay reachable
  under `josh@econscvs.com` while Price2Book is built under `admin@price2book.com`. So access to
  the target account should be a **scoped access token**, not a CLI re-login: logging in as one
  account logs out of the other, and the parallel run needs both.

### Access still required

An access token created under `admin@price2book.com` (Vercel → Settings → Tokens), placed in
`.env.local` as `VERCEL_TOKEN=…`. It is gitignored, never printed, and revocable from the
dashboard when the cutover is done.

## Step 2 — environment inventory and classification

All 17 variables on `bookeliteelectric`, classified. Values were never read; names, targets and
code usage only.

### A. Price2Book platform configuration — RECREATE

| Variable | Notes |
|---|---|
| `PLATFORM_RESEND_API_KEY` | Platform mail (magic links). Read in the auth path. |
| `PLATFORM_FROM_EMAIL` | Platform sender. |
| `NEXT_PUBLIC_SITE_URL` | **Hostname-dependent — see step 6.** |

### B. Production secrets — RECREATE, values re-entered by the owner

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Points at Price2Book Neon. **Verify by endpoint, never by name.** |
| `BETTER_AUTH_SECRET` | Session signing. Carrying the same value keeps existing sessions valid across cutover; rotating it signs everyone out. Owner's call. |
| `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET` | **Callback is hostname-dependent — see step 6.** |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Photo storage. |
| `RESEND_API_KEY` | Transactional mail (booking confirmations, quotes). |
| `ANTHROPIC_API_KEY` | Service matching. |

### C. Obsolete — DO NOT RECREATE

| Variable | Why |
|---|---|
| `STRIPE_SECRET_KEY` | **Read by no code.** `grep` for `STRIPE\|stripe` across every tracked `.ts`/`.tsx` returns nothing. |
| `STRIPE_PUBLISHABLE_KEY` | As above. Price2Book takes no payments — that is the FSM's. |

Cloning the legacy environment wholesale would carry both forward and quietly imply a payments
capability the product does not have.

### D. Read by code but NOT currently set — decide deliberately

| Variable | Behaviour when unset |
|---|---|
| `BETTER_AUTH_URL` | Falls back to `VERCEL_PROJECT_PRODUCTION_URL` on production. **Once a custom domain exists this must be set explicitly**, or magic links return to `*.vercel.app`. |
| `RESEND_FROM_EMAIL` | Falls back to `Price2Book <onboarding@resend.dev>`. Fine until a verified sender exists. |
| `EXPECTED_DATABASE_IDENTITY` | Used by `verify-database-identity`. Setting it on the new project makes the gate refuse a wrong database at build time. **Recommended.** |
| `WRITE_FREEZE` | Deliberately unset. The application-level freeze from ADR-013; set to `1` only during a cutover window. |

### E. Contractor-specific data that must NOT be an env var

None found. Contractor identity, branding, pricing and Jobber tokens are all per-contractor
database rows (ADR-016, ADR-018). Worth stating: this was true of neither the storefront nor the
mail sender three weeks ago.

---

## Step 6 — hostname-sensitive audit

Everything that changes when the application's address changes:

| Thing | Where | Consequence |
|---|---|---|
| Magic-link return URL | `lib/auth.ts` `resolveBaseUrl()` | Explicit `BETTER_AUTH_URL` wins; else `VERCEL_PROJECT_PRODUCTION_URL` on production. **A link is only valid for the host it was issued from.** |
| Allowed origins | `lib/auth.ts` `trustedOrigins()` | Production sign-in already failed once with `INVALID_ORIGIN` because the production domain was missing from this list. A new domain must be reachable through it. |
| **Jobber OAuth callback** | `lib/jobber.ts` — `${NEXT_PUBLIC_SITE_URL ?? "https://bookeliteelectric.vercel.app"}/api/admin/jobber/callback` | **Must also be registered in the Jobber app settings.** Changing the host without updating Jobber breaks reconnection — and the fallback is a BookElite URL. |
| Quote email links | `lib/email.ts` — `${NEXT_PUBLIC_SITE_URL ?? "https://bookeliteelectric.com"}/quote/…` | Links already sent point at the old host. Another reason BookElite must keep serving. |
| Storefront addresses | `ContractorSite.hostedSlug` | Path-based, so host-independent. Elite's public URLs change host but not shape. |
| DNS / Cloudflare | External | `price2book.com` is not in Vercel; wherever it is pointed today must be re-pointed. |

---

## Steps 7–10 — sequence once unblocked

7. Bring the Price2Book project up **in parallel**. BookElite keeps serving until proven.
8. Run the acceptance list against the new deployment (see below).
9. Point domains, make it canonical.
10. **BookElite retained, marked legacy/rollback. Not deleted, not repurposed.**

### Acceptance list

`/sign-in` · magic-link callback · `/dashboard` · membership selection and isolation · Elite
storefront · a second contractor storefront · all six themes · Flat Rate guided flow · T&M guided
flow **including component labour increments** · cart, scheduling, checkout · transactional email ·
Jobber availability · Jobber OAuth · cross-tenant refusals · `/admin/*` and `/why-elite`
compatibility redirects.

`scripts/verify-deployment-identity.ts`, reading `/api/deployment-identity`, covers the identity half mechanically. The rest is a
scripted walk-through, not a claim.

---

## The rule this migration inherits

> Never identify a production database by project name, branch name, or environment label alone.

It applies unchanged to the **host**. A Vercel project called "price2book" proves nothing about
which deployment serves traffic, which database it holds a URL for, or where its callbacks point.
Prove the project id, the deployment id, the database endpoint and identity marker, the domains,
and the callback destinations — every one of them, from the running deployment.
