# Storefront smoke test — 27 August 2026

Browser acceptance pass for ADR §2.2, after moving the hosted storefront to
tenant-addressed URLs. Run against a **production build** (`next build` +
`next start`), not the dev server — see "Dev-only noise" below for why that
distinction mattered.

## Result

**Pass, with four defects found and fixed.** Three were real; one was
pre-existing and older than this migration.

## Exercised

| # | Area | Result |
|---|---|---|
| 1 | Legacy redirects | pass, after fix |
| 2 | Storefront catalog | pass, after fix |
| 3 | Category → service | pass |
| 4 | Guided flow to a locked price | pass, after fix |
| 5 | Visit / cart | pass |
| 6 | Service area | **not exercisable** — see below |
| 7 | Quote path | **not exercised** — see below |
| 8 | Checkout | partial — see below |
| 9 | Direct URL / refresh | pass |
| 10 | Dummy isolation | pass |

### 1. Legacy redirects

All 307 (temporary), no loops, every target 200:

```
/                     -> /elite-electric
/services             -> /elite-electric/services
/services/:path*      -> /elite-electric/services/:path*
/troubleshooting      -> /elite-electric/troubleshooting
/my-visit             -> /elite-electric/my-visit
/checkout/:path*      -> /elite-electric/checkout/:path*
/quote/:path*         -> /elite-electric/quote/:path*
/service-area  /how-it-works  /why-elite
```

### 2–3. Catalog and navigation

13 categories in the expected order with the expected counts (13, 5, 11, 5, 7,
5, 7, 4 …), matching the ADR-006 backfill exactly. 13 images, 0 broken.
Category cards, service cards and chrome all carry the site slug. Lighting
showed 11 services with prices.

### 4. Guided flow

`new-ceiling-light`, full tree: ceiling height → floor → attic access → power
source → switch type, resolving to **$340, "price locked in for 30 days"** —
matching the catalog's "Starting at $340". A component-priced branch was
visible on the route (`+ $125` on the no-access answer), so component
resolution ran through `ContractorComponent`.

### 5. Visit

Add-to-visit routed to `/elite-electric/my-visit`, subtotal $340, quantity
controls present, while-we-there upsells listed with same-visit pricing.

### 9. Direct URL load

`/elite-electric/my-visit` loaded fresh, with the visit intact — the case that
matters, because client-side navigation can hide a provider or routing mistake
by having established context higher up the tree.

### 10. Dummy isolation

A second contractor, site and service were created, exercised, and removed.

| Case | Result |
|---|---|
| Elite site + Elite service | 200 |
| Dummy site + Elite service id | **404** |
| No site header | **404** |
| Bogus site header | **404** |
| `/smoke-dummy/services` | 1 category, "Dummy Lighting" only |
| `/elite-electric/services` | 13 categories, zero occurrences of "Dummy" |
| `/nope/services` | 404 |

Torn down immediately; one contractor remains. **While the dummy existed,
Elite's admin was broken** — `soleContractorId` throws on a second contractor
by design — which is why the window was seconds and the teardown scripted
before the setup ran.

## Defects found and fixed

**1. Six moved paths had no redirect.** `/my-visit`, `/checkout/*`, `/quote/*`,
`/service-area`, `/how-it-works`, `/why-elite` returned 404. The build cannot
know a route used to exist, so only a browser finds this.

**2. All header and footer links were root paths.** They worked *only* because
the legacy redirects caught them — so the chrome silently assumed one tenant
owned the root namespace, and would have broken outright the day those
redirects came out. Every nav click also cost a redirect. Now built from the
site slug.

**3. `PricingSettings` was misclassified as pending.** Add-to-visit returned
500: `loadPricingSettings` on the guarded client threw
`NotYetTenantScopedError`. The model has carried `contractorId` since an
earlier pass; the guard's list was never updated. Four more were in the same
state — `BusinessHours`, `ContractorMaterialSettings`, `JobberConnection`,
`ServiceArea`.

This is ADR-007a running in the *other* direction. The list is usually
suspected of understating what is unsafe; here it overstated what remained,
claiming work that was already finished. Only the schema is authoritative.

**4. Four admin surfaces read `where: { id: "default" }`.** Exposed by fixing
(3): the guard-adoption audit immediately failed those files. They were reading
the pre-tenant singleton settings row, so with two contractors every one of
them would have shown the same rate to both — a pre-existing bug older than
this migration, surfaced by reclassification. All four now key by contractor.

## Dev-only noise, not shipped

`next dev` logged `Cannot read properties of undefined (reading 'call')` on
every page, inside `NotFoundErrorBoundary`, and the header logo failed to
render. It survived a cache clear and a server restart, and it is **absent
from the production build** — zero console errors there, logo renders.
Recorded rather than fixed: it is a dev-server artifact of moving this many
files, and chasing it in `next dev` would have been chasing something that
does not ship. Worth revisiting if it appears in a real deployment.

## Not tested

- **Service area ZIP validation.** `/elite-electric/service-area` is static
  copy with no input; ZIP checking lives in the scheduling step.
- **Quote creation and viewing.** Needs a `REMOTE_QUOTE` service driven far
  enough to upload photos; not reached.
- **Checkout past the visit screen.** Availability, scheduling and booking
  were not exercised — completing a booking pushes to Jobber, which is not
  something to trigger from a smoke test.
- **Multi-service visit.** One service was added; the while-we-there list
  rendered with prices but a second item was not added.
- **Admin surfaces.** Only `/admin/login` was checked for a 200.

These are the gaps a second pass should close before the storefront carries
real traffic.

## State at the end

Gate green (11 checks), live isolation harness 105/105, reconcile 0 differing
with no recorded reason, one contractor, no fixtures left behind.
