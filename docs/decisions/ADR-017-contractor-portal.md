# ADR-017 — the contractor portal

**Status:** ACCEPTED, 28 August 2026.
**Baseline:** §17 "Contractor control panel" of the Final Consolidated Handoff
(`docs/marketing/homepage-handoff-2026-08-28.docx`), plus the approved product vocabulary in
[POSITIONING.md](../marketing/POSITIONING.md).
**Relates to:** ADR-005 (identity vs authorization), ADR-012, ADR-015, ADR-016.

---

## The baseline, and what was missing from it

The handoff supplies the portal's organising idea and its vocabulary:

> **Everything your customer sees traces back to something you control.**

and its sharpest constraint:

> Do not turn this into a generic CRM dashboard. Every screenshot should reinforce the narrow
> Price2Book product boundary.

Named modules: Services & Pricing, Guided Pricing, While We're There™, Hours & Availability,
Service Area, Crew Eligibility, Integrations, Photo Review.

**A caveat worth recording.** The 27 August handoff cites
`PRICE2BOOK-PRODUCT-BOUNDARY-AND-EMBED-ARCHITECTURE.md` for the product boundary and the
hosted-page-versus-embed decision. **That document is not in the repo**, and
`PRICE2BOOK-ARCHITECTURE-DECISIONS.md` marks its contents `[UNVERIFIED]` and unrecoverable. So
the portal is built from §17 and POSITIONING.md, which are present and specific. Nothing here
invents a boundary the owner did not state — but if that missing ADR resurfaces and disagrees,
it should be read against this.

## Vocabulary — `/sign-in` and `/dashboard`

"Admin" described a system operator. These are contractors signing in to their own business's
controls, and the URL is part of what the product tells them it is.

`/admin`, `/admin/login` and all nine module paths remain as **compatibility redirects** — 307,
for the same reason as `/why-elite`: a permanent redirect is cached indefinitely and is the hard
one to walk back, and magic-link emails already sent carry `/admin` as their callback.
`verify-portal-shell` asserts everything left under `app/admin` is a redirect, and that no live
link points into `/admin`.

`dashboard`, `sign-in`, `sign-out`, `choose`, `portal` and `onboarding` join
`RESERVED_HOSTED_SLUGS`. A contractor taking one as their storefront address would shadow the
portal itself — the sharpest version of the van-sticker problem that list exists to prevent.

## The tenant boundary is a membership, not a session

The portal gates on an authenticated **contractor membership**. A valid session with no
membership is refused, because identity alone grants nothing (ADR-005).

**Nothing is selected implicitly.** An account belonging to two contractors is sent to `/choose`.
Defaulting to the first membership would be indistinguishable from working correctly right up
until somebody published a price on the wrong company's storefront — silent, plausible, and the
worst kind of failure.

The selection is stored in `p2b.contractor`, a **choice, not a credential**: it narrows an account
to a membership it already has and can never grant one. Every read re-validates it through the
same membership check, so a forged value resolves to "not yours". Proven: a request carrying only
that cookie and no session is refused to `/sign-in`.

`/choose` lives outside `/dashboard` on purpose — a chooser under the layout that redirects to it
would redirect to itself forever.

## Price2Book's surface, not the contractor's

The storefront wears the contractor's identity and their chosen design (ADR-015, ADR-016). The
portal wears Price2Book's: navy and blue per the approved colour system, green reserved for While
We're There™ and availability rather than spent on navigation.

The contractor's name is shown at all times. This account can belong to more than one business
and nothing is ever chosen for them, so "which business am I changing" must never be a question
the screen leaves open.

`verify-portal-shell` asserts the chrome does not adopt the contractor's storefront theme. A
portal that took on each contractor's palette would make it ambiguous whose software this is —
most damagingly on the very screen where they choose what their customers see.

## The boundary is asserted, not remembered

`OUT_OF_SCOPE` names what the portal is not: CRM, invoicing, payroll, dispatch, time tracking,
marketing, business reporting. The verifier refuses a module that strays into them, and the
overview page **states** the boundary rather than implying it.

This is the erosion path Price2Book is most exposed to: one plausible tile at a time, each
defensible alone.

## Real numbers, or none

The overview's three figures are live reads — services bookable online, work waiting on review,
the current storefront design. A dashboard with placeholder numbers is worse than one with none:
it teaches the contractor not to trust the screen.

## What this found

Moving the module pages out of `app/admin` took them out of `lint-storefront-identity`'s skip
path, and it immediately caught the Jobber page telling **whoever was signed in** to "connect your
Elite Electric Jobber account". The portal is contractor-facing, so it is now scanned like any
other surface — a hardcoded company name there is the same bug wearing different clothes.

## Proofs

`verify-portal-shell` — 29 checks across the product boundary, the tenant boundary, the
vocabulary migration and the branding separation. In the gate.

Driven by hand: the portal renders the handoff's headline, its four-part chain, all eleven modules
under their approved names, and real counts. Unauthenticated requests to every `/dashboard` path
are refused to `/sign-in`. All six `/admin` paths redirect. Elite's storefront: 155 elements,
fingerprint multiset identical to the Phase 3 baseline.

## Deferred

Guided Setup (the onboarding experience), the theme-update/adoption UI, invitations, and platform
staff separation. The T&M engine stays with Services & Pricing / Guided Pricing.
