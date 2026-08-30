# Website Brand Scan — "Import Your Brand"

**29 August 2026.** Specification only, per instruction. Nothing built, Phase F
uninterrupted. Belongs to the onboarding / Platform Admin work at step 6 of the
locked sequence.

A contractor enters their existing website URL. Price2Book reads the public
site and **proposes** a brand configuration for their storefront.

> **Your list ends mid-bullet** — the ninth item is `body font` and the tenth is
> empty. I have covered what a scan of this kind normally also wants (below,
> under "Beyond your list"), but if you had something specific in mind for that
> tenth line, it is not in here.

---

## The rule everything else follows from

**The scan proposes into the theme model that already exists. It does not
invent a parallel one.**

This matters more than it sounds, because your list of nine items does not map
onto nine stored fields. The storefront's appearance is already modelled, and
the model is deliberately narrow:

```ts
ThemeChoice = { family, variant, version }   // what the contractor picked
BrandInputs = { primary?, accent? }          // the ONLY two colours they supply
```

Everything else — all twelve semantic colours (`canvas`, `surface`, `ink`,
`inkSoft`, `inkStrong`, `muted`, `mutedSoft`, `accent`, `accentHover`,
`accentInk`, `line`, `positive`) and all six shapes (`radiusCard`,
`radiusPill`, `shadowCard`, `shadowRaised`, `fontDisplay`, `fontBody`) — is
**derived** by `lib/theme/resolve.ts` from those two colours plus the chosen
variant.

`readBrandInputs` says why, in its own words:

> *"Read through one shape so a second competing brand-colour source cannot
> grow beside it."*

A scanner that writes a scraped background colour, text colour and button
colour as independent stored values **is** that second competing source. So:

| your item | where it goes |
|---|---|
| company logo | `Contractor.logoUrl` — an asset, stored directly |
| favicon | asset, only if the logo is unusable — see below |
| primary brand colour | `BrandInputs.primary` — **stored** |
| secondary / accent colour | `BrandInputs.accent` — **stored** |
| dark / text colour | **evidence**, not stored. Informs which family is proposed |
| background colour | **evidence**, not stored. Informs family + variant |
| button colour | **evidence**. Usually corroborates `accent`; a disagreement is a signal the scan guessed wrong |
| heading font | **evidence** → proposes a `family`, never a font stack |
| body font | **evidence** → same |

The scan's real output is therefore **two colours, a logo, and a recommended
`ThemeChoice`** — with the other six observations shown as the reasoning behind
the recommendation rather than as fields to edit.

That is also what keeps this on the right side of the hosted-site boundary
already drawn: *Price2Book controls structure and layout; the contractor
chooses content, photos, logo, colours.* A scan that imported a site's actual
typography and spacing would be reimplementing that site, which is the "we are
not a website agency" line.

---

## What it must never do: apply itself

Same principle as Storyboard 5's material research — *"Never automatically push
retail pricing into contractor economics."* A scan **proposes**; a person
approves. Concretely:

- The scan writes nothing to `Contractor` until a human presses Apply.
- The proposal is shown as a **live preview against the real storefront**, not
  as a list of hex codes. The design picker already renders exactly this
  (`components/portal/design/DesignPreview.tsx`), so the scan has somewhere to
  land without new UI.
- Declining is a first-class outcome that lands the contractor in the ordinary
  design picker, no worse off than if they had never scanned.
- Re-scanning later never silently overwrites a brand the contractor has since
  hand-tuned. It proposes again, against what they have.

---

## Contrast is not a new problem

`lib/theme/resolve.ts` already refuses to ship an unreadable brand, and already
reports what it had to do:

```ts
ThemeNote =
  | { kind: "brand-adjusted";  token, given, used, ratio, direction }
  | { kind: "brand-unusable";  token, given, fellBackTo }
  | { kind: "brand-missing";   token, fellBackTo }
```

`verify-theme-contrast.ts` proves it in the deploy gate — including the case
where a yellow brand still yields readable button text.

**So a scraped colour goes through the same resolver as a typed one**, and needs
no contrast logic of its own. What the scan owes the contractor is honesty about
the result:

> *"We found your blue (#1B4F9C) and used it. Your yellow (#F5D000) didn't have
> enough contrast for button text, so we darkened it to #A88C00 — here's how
> both look."*

A scan whose colours silently arrive adjusted, with no note, would be worse than
no scan: the contractor would believe their brand was imported and see something
subtly wrong.

---

## Security — this fetches a URL a stranger typed

The single most dangerous line in this feature is "Price2Book fetches the
contractor's website." That is server-side request forgery by construction
unless it is bounded.

**Required before any fetch ships:**

- **Resolve DNS first, then check the IP**, not the hostname. Refuse private and
  link-local ranges — `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`
  (and the IPv6 equivalents, including `::1` and unique-local `fc00::/7`).
  Checking the hostname alone is defeated by a domain that resolves to
  `169.254.169.254`.
- **Re-check on every redirect**, and cap redirects (3 is plenty). A public
  hostname that 302s to a private address is the classic bypass.
- **Refuse non-`http(s)` schemes**, and refuse ports other than 80/443.
- **Hard timeout and response size cap.** A scan is not a crawler: one page,
  a few seconds, a few megabytes.
- **Fetch from an egress path with no cloud metadata access.** If the app ever
  runs somewhere with an instance metadata endpoint, the IP rules above are the
  only thing between a typed URL and a credential.

**The fetched page is untrusted data, never instructions.** If a later version
sends page text to a model to summarise what the company does, that text is
attacker-controlled: a contractor's site — or a site they do not own but typed
in — can contain "ignore previous instructions". Treat scraped content as
quoted data at every layer, and never let it reach a tool-using context.

**Every extracted value is validated before it is shown**, not merely before it
is stored:

- colours must parse as colours, and are normalised to hex; anything else is
  discarded rather than passed through
- fonts must map to a known, licensable family; an unrecognised name becomes
  "we couldn't match this", never a raw stack
- the logo must be a real image, within a size cap, of a plausible aspect ratio;
  an SVG is sanitised or rasterised, because an SVG is a script container

---

## Fonts: match, don't import

A site's font is frequently licensed to that site. Price2Book cannot
redistribute it, and `fontDisplay` / `fontBody` are theme-owned shapes rather
than free text.

So the scan reads the fonts as **evidence for a family recommendation**:

| observed | suggests |
|---|---|
| geometric / grotesque sans throughout | `modern-clean` |
| serif headings, humanist body | `premium` |
| rounded, high-warmth sans | `warm-welcoming` |
| nothing recognisable | `baseline` |

And says so plainly — *"your site uses a serif for headings, so we've suggested
Premium"* — rather than pretending it matched the typeface. Four families ×
two variants is a small enough space that a wrong guess costs one click.

---

## Ownership

Importing a logo means copying an image from a website into our product. The
step should carry an explicit assertion — *"I confirm this is my business's
website and I own or am licensed to use this logo"* — recorded with the scan.

Not legal theatre: onboarding is staff-operated, the URL may be typed by a
Price2Book employee rather than the contractor, and a mistyped domain scrapes
somebody else's brand. The assertion is also the thing that makes that mistake
visible.

---

## Failure modes, and why the scan must degrade quietly

A meaningful share of contractor websites will defeat this, and the feature is
only good if failing is unremarkable:

| case | behaviour |
|---|---|
| JS-rendered site (no server HTML) | fall back to favicon + `og:image`, propose colours only if confident |
| Cloudflare / bot challenge | fail cleanly, offer manual entry |
| parked domain, or no site | skip the step entirely |
| Wix/Squarespace stock theme | colours are the template's, not the brand's — propose, flag low confidence |
| logo is a wordmark on a coloured field | keep it; that is what `logoWhiteUrl` exists for |
| site is a Facebook page | out of scope for V1; say so rather than half-working |

**Confidence must be shown, not hidden.** "We're fairly sure about your blue,
less sure about the accent" is useful; a uniformly confident wrong answer is
not. Low confidence on every axis should route to the design picker rather than
present a bad proposal.

---

## Beyond your list

Cheap to extract, useful, and not in your nine:

- **`og:image`** — often a better hero source than anything on the page, and
  `Contractor.heroImageUrl` already exists.
- **Business name as written** — the exact capitalisation and whether they use
  "&" or "and". Small, and getting it wrong reads as sloppy on the storefront.
- **Phone and service-area text** — pre-fills two onboarding fields that are
  otherwise typed by hand. Proposed, never applied, same as everything else.
- **Whether a Price2Book embed is already present** — the same check Storyboard
  6 needs for "Embed detected", available for free during the scan.

Deliberately **not** proposed: taglines and marketing copy. Importing a
competitor-written sentence into a storefront that then quotes prices is a
different kind of risk, and the copy is Price2Book's product.

---

## Audit

The scan is a platform action on a contractor's account, so it records like one
— per the audit model already specified: platform user, contractor, action, old
value, new value, timestamp.

Two entries, not one:

1. **Scanned** — the URL, when, who, what was proposed, and the confidence.
2. **Applied** — only if a human applied it, with the before and after of every
   field it changed.

A scan that was run and rejected is worth keeping. "We tried importing their
brand and it produced nothing usable" is exactly the kind of thing support needs
six weeks later, and an audit that records only successes cannot say it.

---

## V1 boundary

**In:** one page fetch, logo, favicon fallback, primary and accent colour, font
evidence, a recommended `ThemeChoice`, a live preview, explicit apply, ownership
assertion, audit.

**Out:** multi-page crawling, headless-browser rendering, automatic re-scans on
a schedule, logo background removal, colour extraction from photographs,
importing layout or spacing, generating copy.

The success test is not "the scan is accurate". It is:

> **A contractor who scans their site reaches a storefront they are happy with
> in fewer clicks than one who uses the design picker — and a contractor whose
> scan fails is no worse off than if the button had not been there.**
