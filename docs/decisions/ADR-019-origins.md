# ADR-019 — three origins

**Status:** ACCEPTED, 28 August 2026 (owner decision).
**Relates to:** ADR-015, ADR-016, ADR-017, and the Vercel cutover.

---

## The addresses

| Origin | Address | Audience |
|---|---|---|
| **Platform** | `price2book.com` | Anyone. Marketing and product site. |
| **App** | `app.price2book.com` | The **contractor**: sign-in, dashboard, Services & Pricing, Guided Pricing, Storefront design, configuration. |
| **Storefront** | `price2book.com/<slug>`, later a contractor's own domain | The **homeowner**: browsing, pricing, booking. |

Contractor storefronts stay off `app.price2book.com`. That host is the contractor's management
application; the homeowner experience is a different product with a different audience, and
putting them on one address would make the boundary invisible exactly where it matters most.

## Why this is a code change and not a DNS note

Every absolute URL used to come from **one** variable, `NEXT_PUBLIC_SITE_URL`, which fed both:

- the **Jobber OAuth callback** — a contractor action, belonging to the app origin
- the **quote link emailed to a homeowner** — belonging to the storefront origin

Both worked, because there was one hostname. Neither survives the second, and the failure is
quiet: the same Next.js app serves both hosts, so a homeowner sent to the contractor application
gets a page rather than an error.

`lib/origins.ts` resolves the three separately. `verify-origins` holds them apart.

## The storefront origin is per-site

`storefrontOrigin(site)` takes the site, not nothing. A contractor bringing their own domain is a
direction already visible in `ContractorSite`, and a single global storefront origin would have to
be unpicked to reach it.

A contractor on their own domain sits at its **root**; on the shared origin they sit under their
slug. Keeping the slug on a custom domain would produce `acme.com/acme/quote/abc`, which looks
like a bug because it is one. Asserted both ways.

## No host is written into the code

`jobberRedirectUri()` used to fall back to a literal `bookeliteelectric.vercel.app`, so a
deployment with the variable unset pointed contractors at **a different deployment's callback**.
It now throws instead, naming the variable to set.

Failing to start beats silently sending a contractor's OAuth handshake somewhere else. The
verifier refuses any of our hosts appearing in shipped code — comments naming them are
documentation and are stripped before matching, a distinction learned when the comment explaining
this very fix was flagged as the defect.

## Everything falls back to the request's own origin

The variables name a **canonical** address; they are not required to run. A preview deployment, a
branch URL and localhost all work unconfigured, because a migration that makes every non-production
environment unrunnable is a migration nobody rehearses.

## New environment variables

| Variable | Value at cutover |
|---|---|
| `APP_ORIGIN` | `https://app.price2book.com` |
| `STOREFRONT_ORIGIN` | `https://price2book.com` |
| `PLATFORM_WEB_ORIGIN` | `https://price2book.com` |

`NEXT_PUBLIC_SITE_URL` is retired. `BETTER_AUTH_URL` remains, and should equal `APP_ORIGIN`.

**The Jobber Developer Center redirect URI must be updated to
`https://app.price2book.com/api/admin/jobber/callback` before any contractor reconnects.**
