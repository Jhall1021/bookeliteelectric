# ADR-016 — contractor identity, and the pricing-model boundary

**Status:** ACCEPTED, 28 August 2026.
**Relates to:** ADR-014 (the template), ADR-015 (the theme system).

---

## The three-layer contract

    contractor identity + brand inputs
      + pinned Price2Book theme family / variant / version
      + contractor pricing model
        -> resolved customer storefront

Each layer owns its own data and none reaches into another. A theme definition never carries a
company name. Identity never carries a color ramp. Neither decides how a price is calculated.

That separation is what lets Contractor A run Premium B on flat rate while Contractor B runs the
same Premium B on time and materials, with neither theme knowing anything about pricing.

## A — identity

The theme system could already give a provisioned contractor their own composition and their own
color. The storefront would still have published Elite's logo, name, street, phone and **New
Jersey license number** — because those were written into the components every contractor renders.

Now resolved from contractor configuration at the `[site]` boundary, alongside the theme.

**The editable surface is deliberately small**: short name, legal name, logo, phone, support
email, address, license label and number, service-area label and image. Enough to stop a
contractor appearing as somebody else. Not a CMS.

**Incomplete means omitted, never defaulted.** A contractor with no license on file renders no
license line. An address shows whole or not at all — half of one looks like a bug because it is.
Nothing falls back to another contractor's value, ever.

Converted: header (logo, nav labels, CTA), footer (all of it), the trust page, the service-area
page and section, the home page, the safety escalation in ServiceFinder, and transactional email
— which now sends under the contractor's name, phone and sender address, because the customer
hired them and not the platform.

## B — the pricing-model boundary

`PricingStrategy` is recorded now, and the customer-facing surface made neutral, **without**
building the T&M engine. Phase 3 had just created six places pricing language is presented, every
one inheriting copy written for a flat-rate business.

    FLAT_RATE           scope -> approved fixed price          "Your price: $1,125" / "Book at this price"
    TIME_AND_MATERIALS  scope -> estimated duration + materials "Estimated total: $900-$1,400" / "Authorize service"

Presentation and interpretation only. It **never mutates the canonical service or template
structure** — same question tree, same components, same scope, read differently at the end.

One default per contractor. No per-service overrides in V1: a catalog where some services quote
fixed and others estimate is a support problem before it is a feature.

Price2Book still does no time tracking and no invoicing. The FSM owns actual hours, actual
materials and the final invoice, under either model.

Copy lives in `lib/pricingCopy.ts` keyed by strategy, and components take it as data. **A theme
decides what a headline looks like; it must never decide what the headline claims.**

## The permanent verifier

`lint-storefront-identity` refuses two things in any generic customer-facing component:

- **identity** — a specific business's name, logo, phone, address, license or territory
- **fixed-price assumptions** — "know your price", "upfront fixed price", "accept quote",
  "skip the estimate"

It exists because this class of bug has now been found four times, each invisible because the page
looked right on Elite, which is the only storefront anyone opens.

On its first run it found 3 hardcoded identity strings and **16 fixed-price assumptions** — most
of them in the guided flow, none of which the earlier passes had noticed.

## Proofs

**Elite renders identically through its data.** Per-element computed-style fingerprints against
the Phase 3 baseline: **155 elements, identical multiset.** The backfill sets Elite's values
character for character, because a tidied address would pass review and fail the proof.

Two regressions were caught by that proof and would not have been caught by looking:

- Routing the header CTA through `primaryCta` changed Elite's chrome from "Book Service" to
  "Book Your Service". The header now has its own `headerCta`.
- De-branding the root metadata left every storefront titled "Price2Book". The `[site]` layout
  supplies per-contractor metadata now — the tab and the share card belong to the contractor.
- Rewriting the home page's service-area block, I added a call to action the original never had.
  License to change the *content* of a heading is not license to add an element.

**A second contractor appears as themselves.** Northgate Electric — Mesa AZ, an ROC license, a
different phone — on Premium B with TIME_AND_MATERIALS: hero reads "Know the Rate. See the
Range.", how-it-works reads "See Your Estimate", the footer carries an Arizona license, and a
scan for `Elite|732-204|Monmouth|17272|Allaire|New Jersey` returns **nothing**.

## The `/why-us` route

The canonical route was `/why-elite`, which was fine while Elite was the only tenant and wrong the
moment a second one existed. A Northgate customer should never be looking at
`/northgate-electric/why-elite`, however correctly the page says "Why Northgate".

Resolved without a destructive migration:

- `/[site]/why-us` is canonical, and every internal link points at it.
- `/[site]/why-elite` remains as a **compatibility route** — Elite's existing links and bookmarks
  are real traffic.
- The redirect is **unconditional**. It does not check whether the storefront belongs to Elite. A
  route behaving one way for one contractor and another way for everyone else is exactly the
  branching this architecture exists to avoid, and "only Elite has old links" stops being true the
  first time anyone else's URL changes.
- The old slug stays in `RESERVED_HOSTED_SLUGS`: a contractor taking it would shadow those links.
- `lint-storefront-identity` refuses any new link to the compatibility route. Such a link would
  *work*, which is why nothing else would report it.

**307, not 308, for now.** A permanent redirect is cached by browsers indefinitely and is the hard
one to walk back — it waits until external links are observed behaving (search results, the Google
Business profile, anything printed). Promoting it is one import and one call: `permanentRedirect`
in place of `redirect`.

Verified for both contractors: `/elite-electric/why-elite` → 307 → `/elite-electric/why-us`, and
`/theme-preview/why-elite` → 307 → `/theme-preview/why-us`. Elite's home page fingerprint is
unchanged at 155 elements.
