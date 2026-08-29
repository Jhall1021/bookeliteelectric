# ADR-020 — the marketing homepage

**Status:** ACCEPTED, 28 August 2026 (owner decision).
**Relates to:** ADR-012 (Contractor #2 is a release candidate), ADR-014, ADR-015, ADR-016,
ADR-019 (three origins), and [POSITIONING.md](../marketing/POSITIONING.md).

**Sources.** The copy is the Final Consolidated Handoff,
[homepage-handoff-2026-08-28.docx](../marketing/homepage-handoff-2026-08-28.docx). The design is
preserved verbatim in [homepage-design/](../marketing/homepage-design/) — `Main.dc.html` (desktop),
`Mobile.dc.html`, `canvas.json`. Where handoff and design disagree, the handoff wins; where
POSITIONING.md and the handoff disagree, the handoff wins.

---

## What was built

`/` on a `price2book.com` host, in the fourteen approved sections and their approved order:

> hero → three pillars → four steps → While We're There™ → Guided Pricing → four outcomes →
> your labour/materials/rules → you decide what can be booked → keep the software you already
> use → electrical-first template → contractor control panel → Guided Setup → proof → CTA

It is a route group, `app/(marketing)/`, so it adds a shell without adding a path segment. It
loads Archivo; storefronts keep their own faces through `--t-font-*`.

## The homepage reaches `/` only because the legacy redirects do not

The ten legacy Elite redirects in `next.config.mjs` claim `/`, `/services`, `/why-elite` and
seven more. They now carry `missing: NOT_PRICE2BOOK`, so they fire on every host EXCEPT
`price2book.com`. That host condition is the only thing separating Price2Book's homepage from
Elite's storefront root, and it is verified in both directions by
`scripts/verify-legacy-redirect-scope.ts` rather than assumed — too wide swallows the marketing
site, too narrow 404s a customer's bookmark.

## Its own palette, deliberately

Every other colour in `tailwind.config.ts` resolves to a CSS custom property so a contractor's
resolved theme can repaint the storefront at request time. The marketing site belongs to the
platform, so a contractor's choice must never reach it — `bg-canvas` on a marketing page would
silently inherit whichever theme happened to be in `:root`.

So the marketing site gets `p2b.*`: literal hex, its own namespace, the approved design's values.
`scripts/lint-storefront-tokens.ts` skips `components/marketing/` and `app/(marketing)/`, and
`scripts/verify-marketing-homepage.ts` asserts the opposite rule there — that no contractor-themed
token appears in them. Two linters, one seam, pointing in opposite directions on purpose.

## Copy that is a correctness constraint, not a style choice

Four lines on that page are claims about what the software does. Each is one careless edit from
becoming false while still reading well, so each is asserted by the gate:

| Claim | Rule |
|---|---|
| **Integration status** | Jobber *Available*, Price2Book Scheduler *Built In*, ServiceTitan / Housecall Pro / Google Calendar *Coming Soon*. "Connected" is forbidden outright — it reads as a live link to a contractor's own account, which is a per-contractor runtime fact and cannot be true of a marketing page at all. |
| **Suggested vs published** | "Price2Book can suggest. You approve." Nothing may imply that changing a labour rate silently republishes live homeowner prices. |
| **Proof** | The proof cards render empty. A number there is a fabricated result until a pilot contractor supplies a real one. |
| **Counts** | "Dozens of residential electrical services" — never an exact number, which will change. |

## The CTA split

**Request Early Access** is the primary action and the only filled button; **Sign In** is a plain
link. ADR-012 holds Contractor #2 as a release candidate rather than a self-serve signup, so a
page that read as instant access would promise what the product deliberately does not do.

Sign In resolves through `appOrigin()` rather than a hardcoded `https://app.price2book.com`, so a
preview deployment links to its own portal instead of production's.

The form writes `EarlyAccessRequest` — **platform-owned**, and one of the very few models that is.
A lead is not a tenant: there is no `contractorId` to scope by, and inventing an association to
give the row a home would turn an unauthenticated public POST into a write inside somebody's
tenant. It is classified explicitly in `lib/tenantGuard.ts`, because that registry fails closed.

## Screenshots are of a contractor who does not exist

The homepage shows real product surfaces. Those surfaces carry a contractor's pricing, customers,
bookings and addresses, so the one thing a screenshot must never contain is a real tenant — and a
screenshot is a publication that cannot be un-published. The owner named a second reason: hero
imagery carrying Elite's name would quietly make Price2Book look like Elite's software rather than
a platform.

`scripts/demo-contractor.ts` provisions **Voltmark Electric** through the shipped path from the
real electrical template, prices it through the same `suggestPrimaryPrice` the dashboard uses, and
deletes itself afterwards. Its telephone number is in the 555-01xx range reserved for fiction and
its address is a `.example` domain that can never resolve. It has no street address or licence
number at all, because the identity resolver omits an incomplete one entirely — inventing a
plausible address for a business that does not exist would be fabricating a record.

`scripts/capture-marketing-shots.ts` asserts the page names Voltmark and does not contain "Elite
Electric" **before the shutter opens**. That guard is not decoration: it is what stops a stale
sign-in cookie from publishing a real contractor's screen, a failure nothing downstream would
catch because the image would look exactly as intended.

Surfaces that are not presentation-ready are not faked. Crew Eligibility is empty without a
connected Jobber account; Photo Review is an empty queue. Both render an honest "Coming soon"
frame, and `capture-marketing-shots.ts` records **why** in a `notReady` field rather than by
silently omitting them.

### Two deviations from the design, both narrow

1. **The control-panel module list.** The handoff prefixes it "Possible modules". One of the eight
   — While We're There™ — has no dedicated dashboard surface to photograph, while Storefront Design
   is a real, finished one. A section whose whole claim is that the customer's experience traces
   back to a control should name the controls that exist. While We're There™ keeps its own full
   section above.
2. **The storefront strip.** The headline says "everything your customer sees", and the storefront
   *is* that; the grid below is the controls behind it.

## Three defects this work uncovered

Each was found by trying to photograph the product, and each would have shipped to Contractor #2.

1. **`components/home/Hero.tsx` hardcoded Elite's photograph** — logo on the technician's shirt —
   as a module constant, and every contractor's storefront rendered it. The hero is now
   contractor-owned identity (`Contractor.heroImageUrl`). There is deliberately no fallback image:
   a shared stock hero repeats the mistake more quietly, because it still tells a visitor that
   unrelated businesses are one business. A contractor with no hero gets a themed panel. Elite's
   row was backfilled with the same file, so Elite's storefront is unchanged.
2. **The Jobber connect panel said "log in with your real Elite Electric account"** to every
   contractor. Also `Elite crews (normally 1)`, `What Elite pays`, and `the Elite TV mounts`.
3. **`{count} services`** pluralised as "1 services" on the storefront.

## What this does NOT authorize

Deploying and verifying the homepage lets the apex safely point at Price2Book. It does **not**
move Elite storefront traffic. Jobber browser OAuth consent, a real end-to-end booking, and
confirmation-email acceptance remain separate cutover gates.

## Verification

`scripts/verify-marketing-homepage.ts` — 53 static checks, 15 more against a live host. Run in the
deploy gate.
