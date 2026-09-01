# Embed V1

**Status:** proposed. Release-hardening item #4, and a core release milestone
rather than post-launch polish.

The contractor keeps their website. `contractor.com/pricing` carries a small
stable snippet; Price2Book powers questions, qualification, pricing, review,
scheduling, tax, deposit and booking inside it. The contractor's site is the
presentation and the entry point. Nothing sensitive moves off Price2Book.

## The shape

```html
<div id="p2b"></div>
<script src="https://price2book.com/embed.js" data-site="pub_xxx" async></script>
```

`embed.js` is a loader and nothing else: it reads `data-site`, injects an
iframe at `https://price2book.com/embed/<publicId>`, and manages height. All UI
lives inside the iframe and is centrally deployed, so the contractor installs
the snippet once and never touches it again when our UI changes. That is the
whole reason for the loader-plus-iframe split rather than a script that renders
into the host page: rendering into the host page means our markup and CSS meet
their theme, and every update becomes their problem.

The iframe renders **the existing storefront engine** under a different route
segment. `/embed/<publicId>` is a sibling of `/[site]`, not a second
implementation — same resolver, same pricing, same scheduling, same checkout.

## What already fits

Tenant routing is the part that is genuinely ready. `requireSiteFromRequest`
takes `x-price2book-site` or `?site=` and resolves an opaque `publicId`; the
comment in `SiteContext` already says publicId is a routing key, not a
credential, and that the server re-resolves it on every request and trusts
nothing else the client says about tenancy. An embed is exactly that shape —
a page that knows its publicId and nothing else. `useSiteFetch` already sends
the header.

Deep links also mostly exist: `data-service="ev-charger-installation"` (or
`?service=`) maps onto the queue that `queuedServiceHref` already drives, so an
Instagram ad or a QR code can open at EV Charger Installation instead of a
generic catalog.

## The problem that decides the design

**The visit session is a `SameSite=Lax`, `httpOnly` cookie** — `elite_session_id`
in `lib/session.ts`. In a cross-origin iframe it is a third-party cookie:
`Lax` is not sent at all, and even `SameSite=None; Secure` is blocked by
Safari's ITP and Firefox's Total Cookie Protection and is on its way out in
Chrome. So the cart does not survive a single navigation inside the embed. This
is not a detail to discover during implementation; it is the thing the
implementation is organised around.

Three options, and the recommendation is the third:

1. **`SameSite=None; Partitioned` (CHIPS).** Smallest change, works in Chrome,
   partitioned per top-level site — which is the behaviour we want anyway,
   since a visit belongs to one contractor's page. Does not cover Safari and
   Firefox reliably. Not sufficient alone.
2. **Storage Access API.** Requires a user gesture and a permission prompt
   before the first add-to-visit. A prompt asking to "allow price2book.com to
   use cookies" in the middle of pricing a light fixture will cost bookings.
3. **An explicit visit token, held in the iframe's own storage.** The embed
   creates or reads a token in its `sessionStorage` — partitioned per
   top-level site by every current browser, with no prompt — and sends it as a
   header on API calls, exactly as `publicId` is sent today. The server treats
   it the same way it treats the cookie: as a session identifier that is
   **not** a tenant, resolved only ever as `findOpenVisit(db, contractorId,
   sessionId)`. ADR-011 already established that ordering and it is what makes
   this safe.

Option 3 removes the cookie dependency for the embed and leaves the hosted
storefront on cookies unchanged. `lib/session.ts` grows one seam — read the
token from a header if present, else the cookie — and nothing else in the stack
learns the difference.

## Framing must become an allowlist

There is currently no `frame-ancestors` and no `X-Frame-Options` anywhere in
the app, so today any site can frame the whole product, dashboard included.
Shipping an embed makes that a decision rather than an oversight:

- `/embed/*` sends `frame-ancestors` naming that contractor's registered
  origins. A new field — `ContractorSite.embedOrigins String[]` — with the
  contractor entering their domain during setup.
- Everything else, `/dashboard` above all, sends `frame-ancestors 'none'`.

An unregistered origin should get a clear "this page isn't registered for this
Price2Book account" rather than a blank frame, or the contractor's first
experience of the embed is a white box with nothing in the console they can
read.

## Payments inside a frame

The deposit flow authorizes synchronously before the local transaction and
handles 3DS with `handleNextAction`. Inside a cross-origin iframe that needs
`allow="payment"` on the frame, and the 3DS challenge must be allowed to open
its own layer rather than being clipped by the host page's CSS. This is the
part of the embed most likely to fail silently on a specific card, so it wants
a real browser proof against a 3DS test card before it is called done — the
same way the original deposit work was proved.

## Hierarchy, and keeping one engine

1. `contractor.com/pricing` with the embed — the recommended default.
2. `book.contractor.com` — a custom hosted subdomain. Worth noting this one
   solves the cookie problem outright by being first-party, so it is the better
   answer for a contractor who can manage DNS, not merely a nicer URL.
3. `price2book.com/<slug>` — fallback, demos, internal testing, no-website
   contractors.

All three resolve the same `ContractorSite` and run the same engine. The rule
to hold: **no behaviour may branch on which surface it is.** Pricing,
scheduling, tax, deposits and booking read the resolved contractor and nothing
about the frame. The only legitimate differences are presentation chrome, the
session-token seam above, and the framing headers.

## Conflicts with current assumptions

Six, and the first three are load-bearing:

1. **The session cookie.** As above. Nothing in the visit flow works in a
   cross-origin frame until this is resolved.

2. **`useStorefrontBase()` derives the base from the first path segment.** It
   returns `/${first}` unless the segment is in `NON_STOREFRONT_SEGMENTS`
   (`admin`, `api`, `_next`). Under `/embed/<publicId>/...` it would return
   `/embed`, and every internal link would be wrong. This is the same class of
   defect as the `/my-visit` bug fixed this session — where a homeowner adding
   a service on BrightPath's storefront was navigated to Elite's cart — so it
   should be fixed by making the hook embed-aware, not by another convention.

3. **Storefront gates assume the hosted page is the customer surface.**
   `verify-storefront-price-promise`, `verify-same-visit-promise`,
   `lint-storefront-identity` and the category and cross-reference rules all
   check `/[site]`. If the embed becomes the real surface and the gates keep
   checking the fallback, they go green while the thing customers use is
   unchecked. That is precisely how "storey" survived: the live scan was green
   because it was scanning the remediated copy rather than the source. Whatever
   the embed renders must be covered by the same checks.

4. **Setup tells the contractor their address is the hosted slug.** "Homeowners
   book you at /brightpath-electric" is now the fallback address, not the
   headline. Setup should be asking for their website and handing them the
   snippet.

5. **Storefront identity and theming.** Logo, colors and hero exist to make the
   hosted page look like the contractor. Inside their own site that work is
   partly redundant and partly a liability — an embed that imposes its own
   brand on their page looks broken. The embed likely wants a neutral,
   inheriting presentation, which is a real design decision and not a
   configuration flag.

6. **Attribution.** Making `contractor.com/pricing` the universal link moves
   referrer and UTM handling onto their page. If we want to know that a booking
   came from an Instagram QR code, the loader has to forward that context, and
   it must do so without becoming a way to pass anything the server would
   trust.
