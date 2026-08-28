# ADR-015 — the storefront theme system

**Status:** ACCEPTED, 28 August 2026. On the V1 path.
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


---

## Owner decision — 28 August 2026

V1 architecture approved, with the storage rule stated explicitly:

> Store contractor choices only; derive presentation from versioned Price2Book theme
> definitions. Do not persist derived fields such as button style, card style, navigation
> variant, hero treatment, spacing or typography independently on the contractor.
> Theme family + variant + pinned version are the source of truth for those values.

That rule is what makes the rest coherent. If a contractor row carried its own `buttonStyle`,
the theme they chose and the theme they are rendering would be two different things, and no
version pin could tell them apart.

Placed on the V1 path for a commercial reason, not a technical one: contractors should feel
they are giving customers *their company's* booking experience, not sending them to a generic
Price2Book page with a logo pasted on top.

### Phases

1. **Tokenize the existing Elite storefront.** Hardcoded palette becomes CSS
   custom-property-backed Tailwind tokens. Elite rendering unchanged. Wire the *existing*
   contractor brand configuration into the resolver rather than adding a second competing
   brand-colour source.
2. **Theme resolver** — `contractor brand inputs + pinned theme definition → resolved theme`.
   Derived palettes enforce accessible contrast. The contractor's original brand colour is
   preserved as an input and safe UI shades are derived from it; their stored brand is never
   silently rewritten. Automated contrast validation covers every semantic
   foreground/background pair the theme can emit.
3. **Six real V1 storefronts** — Modern & Clean A/B, Warm & Welcoming A/B, Premium A/B.
   Variants must differ **structurally**, not merely in palette.
4. **Theme selection UX** — visual previews, choose among approved designs. No low-level
   knobs for fonts, radius, shadows, spacing, card style.
5. **Versioning proof** — pin Elite to a version, create a simulated v2, prove changing the
   Price2Book definition does not alter Elite until an explicit adoption event.

### Out of scope for V1

Arbitrary website-builder controls; automatic website scraping or style extraction;
competitor theme prohibitions; custom CSS; per-component design overrides.

### The Phase 1 acceptance test, and why it is the useful one

> After Phase 1, Elite should look pixel-for-pixel effectively unchanged. That proves we've
> separated "what Elite looks like" from "hardcoded Elite CSS" before we start introducing
> other designs.

Until that separation is proven, those two facts are indistinguishable, and Contractor #2
cannot be made to look different without forking the storefront code. Procedure and recorded
hashes: `docs/migration/storefront-parity.md`.

**Result: PASSED.** Five pages, computed style of every rendered element, identical hashes
before and after. One difference surfaced — the pre-tokenization font stack computed with an
unreachable duplicate tail, because the config appended fallbacks the variable already
carried. Same typeface either way; the probe collapses duplicate families and documents why.

### Carried forward from Phase 1

- 114 uses of Tailwind's built-in palette (`text-white`, `bg-gray-…`) remain in storefront
  components. They bypass the theme exactly as a hex literal would — a dark variant needs
  `text-accent-ink` where the page says `text-white`. Not a regression, so `lint-storefront-tokens`
  reports the count rather than failing; Phase 3 is where they get migrated, driven by a
  variant that actually breaks under them.
- The admin is deliberately outside the theme system. It is Price2Book's own surface and
  should look like Price2Book whoever is signed in.
- `lib/email.ts` inlines colour because custom properties are not reliable in mail clients.
  Making transactional email theme-aware is its own piece of work.

---

## Phase 2 — resolver and contrast enforcement, 28 August 2026

`contractor brand inputs + pinned theme definition → resolved storefront theme`.

The contractor stores **choices only**: `themeKey`, `themeVersion` (a pin), and `brandColors`.
Everything else is derived at request time and never written back, which is what stops the
theme they chose and the theme they render from coming apart. The version is a pin in the same
sense as the service template: publishing v2 of a definition changes nothing for anyone until
they adopt it.

### The brand colour is an input, not a suggestion

A colour chosen for a van wrap is under no obligation to be readable as button text on an
off-white card. So the resolver **derives a shade from it** rather than rewriting what they
stored — preserving hue and saturation, trying both directions and keeping whichever moves
least, because darkening a pale brand and lightening a dark one both produce something that
no longer looks like the brand. Every adjustment is reported as a note; nothing is silent.

Button text is **chosen, not assumed**. White is right for most brand colours and wrong for a
fluorescent yellow.

### The contrast contract

`CONTRAST_PAIRS` names every foreground/background pair a storefront can actually put
together, with the ratio each must meet. It is written out rather than computed as a cross
product, because *which text lands on which surface* is a fact about the design.

`verify-theme-contrast` resolves every definition against a sweep — the hue circle at four
lightnesses and two saturations, plus white, black, the page ground itself, the fluorescents
that defeat white text, and a colour one step off the background — and measures every pair.
**400 resolutions × 19 pairs, all passing.** 122 of the 200 brand colours needed a derived
shade; none were unusable.

### Two things the verifier caught

**The contract was wrong before the palette was.** It first asserted `mutedSoft` on `canvas`
at 2.45:1 and reported Elite's shipped palette as failing. But `mutedSoft` is a dark-surface
token — all three of its uses sit on the navy hero, where it measures 6.44:1. The contract had
invented a pair the design never makes, which is exactly the failure its own comment warns
about. Fixed by naming the real ground and adding the dark-hero pairs that were missing
entirely, not by lowering a threshold.

**Validating a float and shipping its rounded neighbour.** Four brand colours resolved to
accents measuring 4.50 in the resolver and 4.49 on the page, because `ensureContrast` worked
in floating point and `toChannels` rounded to 8-bit on the way out. Everything is quantized at
the measurement boundary now: what is measured is what the stylesheet carries.

### Parity holds

The five-page computed-style proof was re-run after Phase 2. Identical hashes to the Phase 1
baseline: Elite now renders *through* the resolver and has not moved.

### Carried forward

The `elite-baseline` definition is fixed-valued on purpose — it is the parity anchor.
`modern-clean-a` is the first brand-derived definition and exists to exercise the resolver;
the six real V1 storefronts are Phase 3, and must differ **structurally**, not merely in
palette.
