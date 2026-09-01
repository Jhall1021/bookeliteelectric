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

**Revised.** A contractor-owned subdomain is a first-class preferred mode, not
a nicer URL further down the list — because being first-party removes the
third-party-cookie constraint entirely rather than working around it. The
embed stays the universal mode precisely because it asks nothing of the
contractor beyond pasting a snippet.

| mode | address | when |
| --- | --- | --- |
| **custom subdomain** | `pricing.contractor.com` | preferred wherever DNS can be managed. First-party: the visit cookie just works, no partitioned storage, no token seam, no framing headers |
| **embed** | `contractor.com/pricing` | the universal low-friction mode. Nothing to configure but a snippet, and it keeps the homeowner on the page they were already reading |
| **hosted** | `price2book.com/<slug>` | fallback, demos, internal testing, and contractors with no website |

The two are complements rather than rivals: a contractor can start with the
embed the day they sign up and move to a subdomain when someone is willing to
touch DNS, with the same engine and the same public link strategy behind both.
The universal-link pitch is unaffected — `pricing.contractor.com` goes on a
truck just as well as `contractor.com/pricing`.

All three resolve the same `ContractorSite` and run the same engine. The rule
to hold: **no behaviour may branch on which surface it is.** Pricing,
scheduling, tax, deposits and booking read the resolved contractor and nothing
about the frame. The only legitimate differences are presentation chrome, the
session-token seam above, and the framing headers.

That rule is now enforced rather than stated. `lib/storefrontSurface.ts`
declares the three surfaces and their base paths, `SiteProvider` carries the
surface so links are built from it rather than guessed from the URL, and
`scripts/verify-storefront-surfaces.ts` asserts the contract: a surface may not
be marked delivered without a verifier covering it, no engine module may read
the surface at all, and no customer-facing component may link to a storefront
route without its base. Both remaining conflicts below were closed by that
extraction before any embed code exists.

## Conflicts with current assumptions

Six, and the first three are load-bearing:

1. **The session cookie.** As above. Nothing in the visit flow works in a
   cross-origin frame until this is resolved.

2. ~~**`useStorefrontBase()` derives the base from the first path segment.**~~
   **CLOSED.** The base is declared by the surface and carried on the provider;
   deriving from the pathname survives only for components rendering above it,
   and `embed` joined the non-storefront segments. A verifier asserts the hook
   reads the declared surface, and that no customer-facing component links to a
   storefront route without its base — the defect that sent a homeowner adding
   a service on BrightPath's storefront to Elite's cart.

3. ~~**Storefront gates assume the hosted page is the customer surface.**~~
   **CLOSED as a silent risk.** The gates still only check `/[site]`, which is
   correct while it is the only thing delivered — but the surface list now
   records which surfaces ship and which verifiers cover each, and marking one
   delivered without coverage fails the build. The risk was never that the
   embed would be unchecked; it was that nobody would notice. That is how
   "storey" survived a green spelling gate for months: the scan read the
   remediated copy rather than the source everyone installs from.

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


## Custom domains — the split, and what is not built

**Nothing of this is delivered.** `custom-domain` stays `delivered: false` in
`lib/storefrontSurface.ts`, and the surface contract fails the build if anyone
marks it otherwise without a verifier. `storefrontBaseFor` already returns `""`
for it, so the link layer is ready and the runtime is not.

**A — runtime host resolution.** A verified hostname maps to a `ContractorSite`
and the existing engine serves it. Needs: an exact host → site mapping with one
active host mapping to exactly one contractor; resolution from the `Host`
header only, never from anything the client asserts; unknown or unverified
hosts answering as if they were never valid; and TLS terminating for the host
on the deployment platform. This is the smaller half and it is what the embed's
cookie problem is genuinely solved by — a first-party origin needs no token
seam, no partitioned storage and no framing headers.

**B — self-service domain onboarding.** DNS instructions, ownership
verification before activation, certificate issuance, and revocation that
stops resolving immediately. This is a product in its own right and is not a
prerequisite for A: a hostname can be verified and mapped by hand for the first
contractors while B is designed.

Do not let A wait for B.

## Browser-tab identity — carried, not taken

`app/[site]/layout.tsx` scopes the storefront's `title` and `description` to the
contractor (ADR-016) but not `icons`, so a root `app/icon.*` applies to
contractor storefronts as well. The parallel homepage workstream currently has
`app/icon.tsx` deleted and `app/icon.png` added in its working tree; that branch
is live and this is not the workstream to reach into.

The requirement, for after it lands:

- Price2Book marketing and admin surfaces keep Price2Book's favicon and metadata.
- Hosted and custom-domain contractor storefronts must not inherit it — they
  carry the contractor's identity where one exists.
- The **embed needs none of this**. It has no browser tab of its own: the tab
  belongs to the contractor's page, which already has their favicon. Giving the
  frame its own icon would be inventing browser chrome for something that is
  not a browsing context. This is the one surface the favicon question does not
  apply to.

Explicit pre-pilot storefront item. Not a blocker for the embed.
