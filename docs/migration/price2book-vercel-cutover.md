# Price2Book Vercel cutover — plan and inventory

**Status:** PARALLEL DEPLOYMENT LIVE AND SIGNED INTO, 28 August 2026. BookElite still serves production; DNS
unchanged; no repository transfer. Two environment values outstanding.

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

## The estate is FOUR migrations, not one

Price2Book accounts now exist for GitHub, Cloudflare, Resend and Vercel. They are separate
migrations with different risk profiles, and bundling them is how a cutover becomes
unrecoverable — "one irreversible change per release" applies across systems, not just inside one.

| System | Today | Target | Reversible? | Required for the host cutover? |
|---|---|---|---|---|
| **Vercel** | `josh@econscvs.com` / `elite-9658` → `bookeliteelectric` | `admin@price2book.com` / `price2-book` | Yes — DNS points back | **Yes** |
| **DNS** | wherever `price2book.com` resolves today | Price2Book Cloudflare | Yes — repoint | **Yes**, it IS the switch |
| **Resend** | Elite-era keys and sender | Price2Book account, verified `price2book.com` | Mostly — but reputation warms slowly | **Prepare before, switch after** |
| **GitHub** | `Jhall1021/bookeliteelectric` (personal) | a Price2Book org/account | Painful — clones, remotes, history, CI | **NO** |

### The repo does NOT have to move

Vercel deploys a repository owned by a different GitHub account perfectly well, provided the
Vercel GitHub App is granted access to it. So the host cutover needs a **grant**, not a
**transfer**.

Keeping them separate matters: moving the repo changes every clone, every remote and every
existing link, and it would be happening on the same day production changes host. If the repo
should move, it should move on a day when nothing else is.

The repo name `bookeliteelectric` is legacy and will look wrong for a while. That is cosmetic and
costs nothing to leave.

### Resend needs lead time, so it starts first

Transactional mail (`RESEND_API_KEY`) and platform mail for magic links
(`PLATFORM_RESEND_API_KEY`) both currently use Elite-era credentials. Moving to the Price2Book
Resend account requires a **verified sending domain**, which means DKIM/SPF records in Cloudflare
and propagation — hours, not minutes, and sender reputation on a new domain builds over days.

So: verify the domain in Resend NOW, in parallel, and keep sending on the existing credentials
until the new ones are proven. A sign-in link that does not arrive is indistinguishable from
broken auth, and it is the first thing anyone tests after a cutover.

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
flow **including component labor increments** · cart, scheduling, checkout · transactional email ·
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


---

## Progress — 28 August 2026

### Deployed, in parallel

| | |
|---|---|
| Project | `price2book` — `prj_zB0QVq80340s2dVt7X3c1ewKgHtT`, team `price2-book` (Pro) |
| Deployment | `price2book-lwv32dlde-price2-book.vercel.app` — READY |
| Commit | recorded on the deployment as `--meta gitSha`, from a **clean tree** |
| Database | `ep-shy-butterfly-ay5t03di`, stamped `price2book-production` — **proven, not assumed** |
| BookElite | untouched, still serving, still rollback |
| DNS | unchanged |
| GitHub | not transferred |

Deployed with `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` set explicitly rather than by re-linking the
repository, so there was never a command that could have hit BookElite by mistake.

### Environment: migrated by classification

11 copied, 5 set to the new origins, 3 deliberately left behind (`STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`).

**Two values still needed.** Vercel refuses to export Secret-type variables, so these must be
entered by hand in the Price2Book project:

- `ANTHROPIC_API_KEY` — service matching
- `R2_BUCKET_NAME` — photo storage (**the one failing identity check**)

### Smoke test on the new deployment

    /elite-electric            200   renders Elite's own identity
    /elite-electric/services   200
    /elite-electric/why-us     200
    /elite-electric/why-elite  307 -> /elite-electric/why-us
    /sign-in                   200
    /dashboard                 307 -> /sign-in     (membership gate holds)
    /admin                     307 -> /dashboard   (compatibility)
    /admin/services            307 -> /dashboard/services
    /nope-not-a-tenant         404   unknown storefront refused
    /api/services/… no site    404   site-scoped

### Two things this phase found

**The gate depended on git to enumerate files.** A CLI deploy ships no `.git`, so all seven
verifiers threw and the first deployment failed on `Command failed: git ls-files` — a gate failing
for a reason unrelated to anything it checks. `sourceFiles()` prefers git and falls back to a
filesystem walk; proven by running the whole gate with git stubbed to exit 127.

**The identity verifier encoded a stale assumption.** It asserted that destinations must match the
URL being probed, which stopped being true the moment ADR-019 named three canonical origins: a
preview deployment legitimately points its Jobber callback at `app.price2book.com`, because that
is the URL registered with Jobber. It compares against the configured origins now.

### Next

1. Owner enters the two Secret-type variables.
2. Point `app.price2book.com` at this project. **Additive** — a new subdomain, not a change to the
   apex, so nothing currently served moves.
3. Run the full acceptance list.
4. Only then: DNS for the apex, and canonical status.


---

## app.price2book.com is live — 28 August 2026

    server: Vercel · HTTP 200 · valid TLS
    identity          production, db stamp price2book-production, matches expected
    auth base         https://app.price2book.com
    jobber callback   https://app.price2book.com/api/admin/jobber/callback
    storefront origin https://price2book.com     (a different host — ADR-019 holds)

**Signed in end to end.** Magic link requested at `app.price2book.com/sign-in`, delivered from
`admin@price2book.com`, returned to `app.price2book.com` — not to a `*.vercel.app` URL — and landed
on `/dashboard` showing Price2Book's chrome beside Elite Electric & Lighting.

That return address is the check worth naming: `BETTER_AUTH_URL` can only be proven on a real
hostname, because on a preview URL the fallback is indistinguishable from the configured value.

The apex is untouched. `price2book.com` still serves the marketing page, BookElite still serves
production, no repository moved.

### Three cached answers, three false facts

Everything that went wrong in this migration had the same shape: something answered confidently
about a question other than the one being asked.

| What looked true | What was actually true |
|---|---|
| A Neon branch named `production` | It was empty; the real one was identified by endpoint |
| `vercel project ls` → "one project" | The CLI's saved default scope; the target was a different **account** |
| `app.price2book.com` → NXDOMAIN | A cached negative answer; three public resolvers said otherwise |

And one that looked like a different problem than it was: **HTTP 525** reads as an SSL failure and
was a Cloudflare proxy-mode setting. Grey cloud, fixed in a minute.

The habit that resolved all four was the same — ask an independent source, and prefer an
identifier over a name.

### Who can sign in

One user, one membership: `josh@econscvs.com`, OWNER of Elite Electric & Lighting.

Better Auth will send a link to **any** address and create a `User` for it, but the portal gates on
an authenticated **membership** (ADR-005). An address with no membership signs in successfully and
is then bounced from `/dashboard` back to `/sign-in` with no explanation — which reads as broken
auth and is the tenant boundary working.

That silent bounce is a real rough edge. It belongs with the **invitations flow**, already
deferred, and should not be fixed during a cutover.


---

## Deployed matrix — 28 August 2026

Run against `app.price2book.com` with one explicitly-named test contractor,
`__deployment-proof-DELETE-ME__`, created and deleted inside the same run.
**35 of 35.**

| Proven on the deployed host | |
|---|---|
| Second storefront resolves | own name, own AZ ROC licence, own phone |
| Identity isolated | zero matches for `Elite\|732-204-7003\|Monmouth\|17272\|Allaire\|New Jersey` |
| Six themes render | six distinct token signatures — canvas 250/251/247, radii 12/16/18/10/2/0px |
| Brand is an input | the accent is **identical** across all six themes |
| Assets load | CSS, four JS chunks and a `.woff2` all 200 with content |
| T&M renders | "Know the Rate. See the Range." and a T&M payload block |
| Flat Rate intact | Elite keeps its fixed-price promise and gets **no** T&M block |
| No cross-tenant access | own service 200; no site identifier 404; unknown site 404 |
| Deleted | contractor gone, site gone, storefront 404s |
| Elite untouched | theme and pricing state byte-identical before and after |

### The one failure was the probe, not the deployment

The first run reported "all six themes identical on the wire". They were not. The page carries
**two** token blocks by design — the root layout's base, then the storefront's override — and the
assertion matched the first `--t-canvas` every time, so it read the base on all six.

A bad probe is indistinguishable from a broken deployment until you look at the page. It now
targets the `storefront-theme` block, and additionally asserts the accent is constant across
themes — something the original check could not have caught in either direction.

### Elite's theme changed during the session

`elite-electric` moved from `baseline/a` to `warm-welcoming/a` at 20:43 UTC — the design picker
working as built, during the first dashboard session. Not caused by this proof: the before/after
fingerprint captured it as the starting state and proved it unchanged throughout.

Worth a deliberate decision rather than leaving it as a side effect of exploring, since Elite is a
live business.

---

## The apex moved — 29 August 2026

`price2book.com` now serves Price2Book's marketing homepage from the Price2Book Vercel project.
This was the step ADR-019 and ADR-020 held until the homepage was deployed and verified.

| Name | Before | Now |
|---|---|---|
| `price2book.com` | Squarespace ("Compare. Book. Build."), A `13.248.243.5` / `76.223.105.230` | Vercel, A `216.150.1.1` / `216.150.16.1` |
| `www.price2book.com` | Squarespace 301 to apex | Vercel **308** to apex |
| `app.price2book.com` | Price2Book portal | unchanged |
| Elite | `bookeliteelectric.vercel.app` | unchanged — still the rollback |

Domains were attached with `scripts/vercel-domains.ts`, which asserts account, team AND project id
against the API and refuses before writing. The estate has two Vercel accounts holding
similarly-named projects; this is the same lesson as the Neon branch named `production`.

### Two things that looked like failures and were not

**A live site nobody had mentioned.** The apex was serving an existing Squarespace page. It
answered `200`, so a status-code check would have called the cutover finished while the marketing
site was nowhere in sight. What settled it was reading the body: `Server: DPS/2.0.0`, and none of
"Your pricing.", "Your schedule." or "Request Early Access" present. **Identify a deployment by
what it serves, not by whether something answers.**

**`www` already had a record.** Cloudflare refused a second one. It did not need it: `www` was
already a CNAME to the apex, and once the apex pointed at Vercel, `www` followed it there. Vercel
reported `points here yes` for both names on the existing record. The published
`f81826c7b00c5e9c.vercel-dns-016.com` target is one valid way to point `www` at Vercel; a CNAME to
an apex that already points there is another.

### The gap between DNS and HTTPS

For about six and a half minutes the apex served the homepage over **HTTP** while HTTPS failed the
TLS handshake — `curl` reporting `SSL_ERROR_SYSCALL`, Firefox `PR_END_OF_FILE_ERROR`. That is
Vercel issuing the certificate, not a misconfiguration, and the two things worth checking to tell
"slow" from "never" are: no CAA record forbidding the CA, and port 80 reachable to answer the
challenge. Both held, and the certificate arrived on its own.

### Verified after the move

- `scripts/verify-marketing-homepage.ts --host https://price2book.com` — **68 passed, 0 failed**
- `scripts/verify-legacy-redirect-scope.ts --host https://price2book.com` — **19 passed, 0 failed**
- All four addresses canonicalise onto `https://price2book.com`
- Elite renders identically on the old and new deployments, hero photograph intact — the
  `heroImageUrl` backfill preserved parity, checked rather than assumed

### Still NOT authorized by this

Elite storefront traffic has not moved. Jobber browser OAuth consent, a real booking end to end,
and confirmation-email acceptance remain separate cutover gates.
