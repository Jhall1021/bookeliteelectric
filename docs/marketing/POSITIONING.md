# Price2Book — positioning

**Status:** settled by the owner, 28 August 2026. The marketing site is designed from this.

**Superseded in part by** [homepage-handoff-2026-08-28.docx](homepage-handoff-2026-08-28.docx),
the Final Consolidated Handoff. Where the two disagree, the handoff wins. The audience
definition below is unchanged; the product vocabulary and homepage structure come from the
handoff and are summarized under "Product vocabulary" and "Homepage order".

## The one-line pitch

> **Your pricing. Your schedule.**
>
> Give homeowners upfront prices and let them book the work you choose — without
> replacing the software you already use to run your business.

## Who we are selling to

Owner-operated and small-to-midsize **residential service contractors** who want customers
to price and book routine work online **without replacing the software they already run
their business on**.

For V1 the marketing is deliberately narrower than that. The buyer is a **residential
electrical contractor owner**, in a business where:

- the owner is still involved in operations and pricing
- there are roughly a few trucks, up to perhaps a few dozen
- there is already a repeatable residential service business
- they run Jobber or another FSM
- incoming calls and texts still consume office time
- customers routinely ask *"how much does this cost?"*
- they want online booking but not customers booking poorly scoped work
- they will not spend ServiceTitan money, and will not replace their operating system

That person is concrete. "Home-service companies" is not.

## Who we are explicitly NOT designing for

| Not | Why |
|---|---|
| **Homeowners** | They experience the storefront, but they are not the buyer. |
| **Enterprise service companies** | They expect call centers, territory management, advanced dispatch, enterprise reporting, custom workflows. |
| **Brand-new one-man shops with no pricing system** | May become customers later. Price2Book is most compelling when a functioning business wants to be easier to buy from. |
| **Anyone looking to replace Jobber** | This is the sharpest differentiator we have. |

## What we are selling against

Not *"AI-powered contractor SaaS."* Not even *"online booking software"* — there are
plenty of booking tools.

The pitch is: **let homeowners get a real price and book the right service online, using
your pricing and your schedule.** That is precisely the pair Price2Book controls, and it
stops short of pretending to become their CRM.

The site should repeat, in the contractor's own terms:

> Keep running your business in Jobber. Use Price2Book to control what customers can price
> and book online.

Telling a contractor immediately what Price2Book **isn't** is worth more than another
feature list.

## Scope of the launch site

**Built for residential service contractors. Proven first in electrical.**

Electrical gets its own strong section, because that is where there is something a
competitor cannot fake: a real service template, pricing logic, decision trees, materials
and components, a booking flow and a working storefront. Plumbing and HVAC are the
eventual market, not the launch claim.

## Product vocabulary — approved names

| Term | What it names |
|---|---|
| **Price Online · Book Online · While We're There™** | the three product pillars |
| **Guided Pricing** | the editable question / decision-tree system |
| **Guided Setup** | the onboarding experience |
| **While We're There™** | same-visit additional work. Brand line: *One trip. More done.* |

Price2Book sits between the homeowner and the contractor's existing operation:
**homeowner → Price2Book → the contractor's existing workflow.** It is deliberately not a
CRM, accounting, payroll or dispatch platform. **Do not lead with AI.**

## Color system

- **Blue / navy** — core product: pricing, scheduling, configuration, contractor control.
- **Green** — While We're There™, availability, positive and successful states.

Warm editorial character stays. The software is the hero; avoid generic contractor stock
imagery as the primary visual language.

### The logo

The delivered mark is a navy calendar with a green check, beside **Price2Book** in navy
with a green **2**, over the tagline *Your Pricing. Your schedule.* Its own colors are
`#003091` and `#3AB54A` — brighter than the page palette (`p2b-accent #1B4B8F`,
`p2b-green #2E7D5B`), which is normal for a logo and is not a reason to restate the page
in them.

Assets live in `public/marketing/`: `price2book-mark`, `price2book-wordmark`, the full
`price2book-logo` lockup, and reverse variants of the first two for the navy footer.
`app/icon.png` is the same mark as the browser-tab icon. **The header composes the mark and
the wordmark and leaves the tagline out** — at header size it is illegible, and it would sit
directly above an H1 that already says both sentences.

These are cut from the delivered 5000px artwork. The vector pack in hand contains three
earlier concepts, none of them the approved revision; ask the designer for the vector of
the final and swap it in — nothing outside `components/marketing/Chrome.tsx` and
`public/marketing/` refers to the files.

#### The favicon is global, and that is a storefront dependency

`app/icon.png` is Next's root icon convention, so **every route serves it — including
homeowner storefronts.** A homeowner on a contractor's storefront sees the contractor's
name in the tab and the Price2Book mark beside it.

**This is not new and this pass did not introduce it.** The root icon was already the only
icon in the app tree; before 31 August it drew a navy lightning bolt, which was equally
Price2Book's and merely less recognizable. What changed is that the leak is now literal
brand artwork rather than a generic glyph.

**Half of ADR-016's rule is implemented.** `generateMetadata` in `app/[site]/layout.tsx`
already takes the tab back for the contractor — title and description are theirs, and the
comment there says the browser tab belongs to the contractor, not the platform. Icons are
the half it does not set, and there is no per-contractor favicon asset to set them from.

**Recorded as a dependency, not fixed here.** Closing it means touching storefront core and
deciding where a contractor's tab icon comes from (their uploaded logo? a generated
monogram?), and the same question decides what an embedded `contractor.com/pricing` shows —
so it belongs with the storefront/Embed V1 work, not with the marketing homepage. Until
then the boundary reads: contractor name in the tab, platform mark on it.

## Where the product lives — settled 31 August 2026

**Keep your website. Add Price2Book to it.**

The normal customer-facing implementation is the contractor's own page —
`contractor.com/pricing` or `contractor.com/book` — with Price2Book inside it. The hosted
`price2book.com/<slug>` storefront is real and every contractor gets one, but it is the
fallback: for a contractor without a website, for demos, for testing. The marketing site
must not present the hosted URL as the normal experience.

**The embed itself has not shipped.** [docs/design/embed-v1.md](../design/embed-v1.md) is
status *proposed*. The homepage may show the destination and must say, in the same visual,
that it is a V1 release item being built — `EMBED_STATUS` in
`components/marketing/content.ts` is the single place that wording lives, and
`scripts/verify-marketing-homepage.ts` fails the build if the page starts describing an
installable snippet.

### One pricing engine. Everywhere customers find you.

Once the contractor has `contractor.com/pricing`, that one page is the thing they put
everywhere they already market: website, Instagram bio, Google Business Profile, Facebook,
text messages, email signatures, QR codes, trucks, yard signs, invoices, postcards.

The claim is **not** "Price2Book hosts another website for you." It is that the contractor
gets a portable pricing-and-booking capability they can attach to every place customers
find them. Service-specific deep links — an EV charger ad opening straight into EV Charger
Installation — are the intended direction and are described as such, never as available.

## Homepage order — revised 31 August 2026

Hero → three pillars (compact strip) → the homeowner experience (four words + the live
demonstration) → **one pricing engine, everywhere customers find you** → *Your pricing.
Your rules.* → *Keep the software you already use* → electrical-first template and Guided
Setup → early-access CTA.

Seven sections, down from fourteen, and roughly half the height at both desktop and mobile.

**What was removed, and why it is not missing.** Contractor control was proved six separate
times — what can be priced, what can be booked, labor and materials, Guided Pricing, the
boundary table, the two operating modes — and the boundary with a contractor's existing
software was drawn in four places. Both are now made once. Specifically:

| Removed | Where the claim lives now |
|---|---|
| The eight-module screenshot gallery | The hero, the live demo, and one Guided Pricing screenshot |
| The standalone While We're There™ section | The green pillar card, and the demo's same-visit step |
| The boundary table and the two operating-mode cards | One sentence in *Keep the software you already use* |
| *What we're measuring during the pilot* | Nowhere — empty result cards read as an unfinished page |
| The ten-question FAQ | Its answers are in the sections they belonged to; it can return as its own page |
| The invented Guided Pricing question tree | The demo asks the service's real questions |

**Every approved headline whose section was merged is still on the page**, and
`REQUIRED_COPY` in the verifier asserts it. Two headlines left with their sections and the
verifier records which, and why, rather than being silently deleted.

## Accuracy rules that constrain the copy

These are correctness constraints, not style preferences:

- **Integration status must be truthful.** Never show "Connected" against a platform that
  is not integrated. Today: Jobber is genuinely built (OAuth, booking push, crew sync, live
  availability) = *Available*; the Price2Book scheduler = *Built In*; ServiceTitan,
  Housecall Pro and Google Calendar have no code = *Coming Soon*.
- **Never imply that changing a labor rate silently changes live homeowner prices.**
  Suggested and published prices stay visibly distinct: *Price2Book can suggest. You
  approve.*
- **Do not fabricate testimonials.** Until real pilot contractors supply them, show factual
  product proof or nothing.
- **Do not advertise exact service or category counts** — they will change. "Dozens of
  residential electrical services."
- **Do not make "upselling" the language** for While We're There™, and do not present it as
  a discount or percentage-off engine. **Do not promise the capability unconditionally**
  either: the storefront only advertises same-visit pricing where the contractor has
  configured one (`scripts/verify-same-visit-promise.ts`), and the marketing page says the
  same — *"where you have set a same-visit price"*.
- **Do not describe the embed as installable.** See "Where the product lives" above.
- **Marketing prices are demonstrations, not a price list.** Examples exist to make the
  product believable, not to make a visitor argue about what an electrician charges. Prefer
  simple, familiar work — replacing an outlet, adding one — over anything whose visible
  label understates its scope. The old *TV Mounting — $495+* card is the case that made
  this a rule: the real service included a new receptacle, low-voltage rings and concealed
  cable, and the label carried none of it. Where possible take the figures from the
  generated demonstration flow, so the hero and the live demo cannot disagree.
- **Sample questions must be homeowner-observable.** Quantity, what is already there,
  access, the room. Never self-diagnosis, never trade terminology, never a safety or code
  determination, and never fake complexity added to make a decision tree look clever.
- **The hero walkthrough is captured, never authored.** Its questions, order, wording,
  routing, prices and arrival windows come from a live contractor catalog via
  `scripts/capture-hero-flow.ts`, and `--check` in the deploy gate fails the build when
  production moves. Two consequences worth stating: the walk is as long as the real tree
  (five questions to a price, not three), and **the repo's seed files are not a source of
  truth for prices** — see [stale-seed-prices-2026-09-01](../debt/stale-seed-prices-2026-09-01.md).
- **Anything that claims product state must come from product state.** The one defect that
  survived every check in the hero pass was the one piece of UI state still asserted by
  hand: a header reading "1 service in your visit" above a cart holding two. Everything
  sourced from the capture was correct because the capture made it correct. This is the
  rule for any future product demonstration on the marketing site, and it is why the hero
  renders real storefront components instead of copies of them.

## The site becomes more than one page — 1 September 2026

The information architecture, the page responsibilities and the trade status
rules now live in [SITEMAP.md](SITEMAP.md). This file stays authoritative for
copy rules, claim rules and the frozen hero; that one owns what each surface is
for. The governing split: product pages explain the mechanism, trade pages prove
the depth, the homepage says why it matters, the demo lets them try it.

**Trade claims are capability claims.** Electrical is available now; plumbing is
in build; HVAC is next. A qualifier comes off only when that trade's template is
committed and frozen — never when it merely works.

## Visual Assist — the claim boundary, written before the feature ships

**Status: NOT MARKETABLE.** Recorded 1 September 2026 so the positioning survives
until implementation reaches marketing — not because any of it may be said yet.

At the time of writing there is no homeowner-reachable Visual Assist flow.
Thirteen files under `lib/visual-assist/` are uncommitted, nothing in `app/` or
`components/` references them, and there is no surface to upload a photo to for
identification. **No homepage section, no nav item, and no "In build" card**
until a real customer-facing flow exists and its interaction shape is stable
enough to capture without staging.

### The positioning, preserved

> **They don't have to know what it's called. They can show Price2Book.**

### The architecture boundary — say this whenever the feature is described

> Visual Assist identifies clearly observable equipment and configuration. The
> homeowner confirms it. The contractor's approved Price2Book rules still
> determine scope and price.

The order matters and is the whole safety argument: photo → identify what is
visible → **homeowner confirms** → normal Guided Pricing continues → the
contractor's approved pricing applies. Identification never reaches a price
without a human agreeing to it first.

### Never marketed as

- AI diagnosis
- AI electrician
- AI plumber
- photo estimating
- AI repair recommendations
- AI-generated pricing
- automatic code or safety inspection

Nor with the vocabulary of the implementation — classifier, multimodal,
computer vision, confidence score, model, inference. The visitor's takeaway is
"my customer can take a picture instead of knowing the technical name", and
every one of those words moves them away from it.

### What may be said TODAY, and is

The shipped half of the same promise, in the Guided Pricing teaser and gated
against overreach:

- a homeowner describes the work in their own words and the matcher finds the
  service — the phrase and the match are captured in `demoFlow.ts`
- "I'm not sure" is a valid answer on every tree and never resolves to a price
- photos are **collected** where a route needs them, for preparation or for the
  office to look before pricing

**Photos are collected. Nothing reads them.** Any wording implying Price2Book
identifies equipment from a photograph is the claim that has to wait, and
`scripts/verify-marketing-homepage.ts` fails the build on it.

## The hero is closed — 1 September 2026

`ffe6dcd` and `c1c24d5` are the finished hero. **No further polishing** unless an actual
visual or product defect appears; a demonstration that keeps being adjusted stops being a
demonstration of anything stable.

The shape it settled into, for anyone building the next one:

> live truth → read-only capture → deterministic fixture → real storefront components →
> contractor-themed island → build-breaking drift detection

**Future direction, explicitly not current scope.** The cart, scheduling and confirmation
frames are still composed in the island's theme, because those surfaces are pages rather
than extractable components. They should eventually migrate to real storefront components
for the same reason `ServiceIntro`, `QuestionStep` and `PriceConfirmationCard` earned their
place — and the "1 service in your visit" defect is the evidence: it happened in composed
chrome, and it could not have happened in a component fed by the fixture. There is no need
to do that work now, and no reason to open the hero to do it.

## Call to action

**Request Early Access** — not self-serve signup.

Per [ADR-012](../decisions/PRICE2BOOK-ARCHITECTURE-DECISIONS.md), Contractor #2 is a
release-candidate onboarding held until V1, so the site must not imply broad
self-service. The CTA and the product roadmap have to tell the same story.

## Why this is written down

The same reason the architecture decisions are. A positioning this specific is easy to
blur back into "software for home-service businesses" one sentence at a time, and every
such blur costs the differentiator that makes the product legible in the first place.
