# ADR-015 — the storefront theme system

**Status:** PROPOSED, 28 August 2026. Decision requested before implementation.
**Relates to:** ADR-012 (Contractor #2 waits for V1), ADR-014 (the template).

---

## The problem

A homeowner shopping three local electricians should not be able to tell they all run the
same software. Today they would: every storefront renders Elite's navy, Elite's type, Elite's
card treatment.

## Agreed, and not re-litigated

The shape from the product discussion is right and this ADR adopts it:

- **Curated packages, never a builder.** A contractor picks among good designs; they do not
  assemble one. Forty switches produces worse-looking sites and a support burden.
- **Template and theme are strictly separate.** ADR-014 answers *what does this contractor
  sell and how is it scoped*. This answers *what do they look like*. Two contractors on
  Electrical Template v1 must be able to look unrelated.
- **Contractor inputs are few**: theme family, chosen variant, logo, primary colour,
  optional accent, photography.
- **Price2Book keeps everything else**: typography, spacing, card and button treatment,
  navigation, category layout, Guided Pricing presentation, checkout, mobile behaviour.
- **Variant-driven components**, never `if (contractor === "elite")`.

## Four things this ADR decides differently

### 1. Store the CHOICES. Derive the presentation.

The proposed model listed ~18 columns including `buttonStyle`, `cardStyle`, `heroVariant`,
`serviceGridVariant`, `navigationVariant`. But those are Price2Book-controlled — derived
from family plus variant.

Storing them per contractor creates a copy that can disagree with its source, and then
nothing says which wins. **This codebase has been bitten by that exact shape four times**:
`id: "default"` on four config models, the global `jobberUserId` unique, the global
`Service.slug`, and a nullable `contractorId` that let ownership be ambiguous. Every one was
a stored value that could contradict the thing it was derived from.

So:

```
ContractorStorefrontTheme
  contractorId        the tenant
  themeFamily         their choice          e.g. "warm-home"
  themeVariant        their choice          e.g. "warm-b"
  themeVersion        which definition they are pinned to
  primaryColor        their brand
  accentColor         their brand, optional
  logoAssetId         their brand
  logoWhiteAssetId    their brand
  heroAssetId         their brand
```

Nine fields, all genuinely theirs. Everything else resolves from
`(themeFamily, themeVariant, themeVersion)` at render time, out of a version-controlled
theme definition — the same canonical-identity / contractor-economics split that already
works for categories, materials, components and disclaimers.

`themeVersion` is there for the same reason ADR-014 versions the template: improving a theme
must never silently restyle a live storefront.

### 2. "Looks professionally designed" is a guarantee, so it needs enforcement

A contractor supplies a primary colour. Some will supply one that fails contrast against
their theme's surfaces — pale yellow on white, mid-grey on grey. The promise that Price2Book
guarantees a professional result is not kept by hoping.

**Contrast is a correctness property, not a matter of taste.** It is the visual equivalent
of ADR-003: the same way no price publishes without approval, no palette publishes that a
homeowner cannot read.

The theme resolver computes derived shades from the primary colour and asserts WCAG AA
against every surface the theme pairs it with. Failing combinations are **adjusted by the
resolver, or the colour is refused with an explanation** — never accepted and rendered.
A permanent check in the deploy gate, in the manner of the other gates.

This also settles a question the discussion left open — deriving secondary colours
automatically is not merely a convenience. It is what makes the guarantee enforceable,
because a derived shade can be constrained and a hand-picked one cannot.

### 3. The nearby-competitor rule is advisory, and must say so

Preferring a different variant when a local competitor already uses one is a good
*recommendation*. It cannot be an invariant:

- it would make a contractor's appearance depend on who signed up first
- service areas change after onboarding, and nobody's storefront should restyle itself
  because a competitor expanded
- two contractors may legitimately insist on the same choice

So it ranks suggestions at onboarding and is **never a prohibition**. The reason a variant
was suggested or demoted is recorded, because an unexplained "you cannot have that one" is a
support mystery. At two contractors it is also premature: build the ranking hook, leave it
inert until there is a third contractor in a shared ZIP.

### 4. Website brand extraction is deferred

"Enter your URL and we detect your palette" is a genuinely good onboarding moment and a
large, long-tailed feature: fetching, CSS parsing, colour clustering, font detection, and a
real question about copying a site we do not own. It is **not** a V1 requirement — the
contractor can supply a logo and a colour in under a minute.

Recorded as a V2 idea so it is not quietly smuggled into V1 scope.

---

## What the work actually is

Not the schema. The schema is nine fields.

**430 places hardcode Elite's palette** as Tailwind classes (`text-navy`, `bg-warmwhite`,
`border-cardline`). And `Contractor.brandColors` already exists with a comment promising it
"overrides the CSS custom properties" — **no code reads it, and no such properties exist.**
Aspirational schema that reads as a working feature is worse than no schema, and it should
be either implemented or removed as part of this.

The conversion is cheaper than 430 edits, because Tailwind indirects through its config:

```
navy: "rgb(var(--brand-navy) / <alpha-value>)"
```

Every existing `text-navy` keeps working and becomes themeable in one change. That is the
unblocking move, and it is small.

The real cost is the theme definitions themselves — 5–6 families, 2–3 approved variants each,
each a genuine design rather than a palette swap. That is design work, not schema work, and
it is what makes two "Modern & Clean" storefronts look different rather than tinted.

## Scope for V1

| In | Out |
|---|---|
| the nine-field theme record | granular design controls |
| CSS-custom-property conversion | website brand extraction |
| 3 families × 2 variants, real designs | contractor-uploaded CSS or fonts |
| contrast enforcement in the gate | per-contractor layout overrides |
| logo and hero asset upload | the competitor-ranking rule (hook only, inert) |
| onboarding preview picker | |

Three families beats six half-built ones. A fourth is additive later; a broken one is not.

## The invariant this must not break

> **A theme changes presentation only. It can never change what is priced, what is
> bookable, what a homeowner is asked, or what they are charged.**

Same class as the tenant guard, and it gets the same treatment: a permanent check proving a
theme cannot reach pricing, availability, Guided Pricing logic or checkout behaviour. The
storefront may look completely different; the engine underneath is identical, and that is
provable rather than assumed.

## Sequencing

The product discussion put this before Contractor #2, which follows from ADR-012 — they
should choose how their storefront looks, not receive Elite's with a new logo.

Open question for the owner: **this or the remaining 74 template services first.** They are
independent. Template extraction is nearly mechanical now that the prerequisites are done;
the theme system is more design work than engineering. Doing the 74 first means Contractor
#2 has a full catalogue in a themed storefront; doing themes first means the visible product
is ready sooner and the catalogue lands after.
