# Price2Book marketing site — sitemap and page responsibilities

**Status:** design, agreed with the owner 1 September 2026. Nothing here is built
yet. Supersedes the single-page structure recorded in
[POSITIONING.md](POSITIONING.md), which stays authoritative for copy rules,
claim rules and the frozen hero.

## The governing rule

> **Product pages** explain how the mechanism works.
> **Trade pages** prove how deeply Price2Book understands that trade.
> **The homepage** explains why the contractor should care.
> **The Demo** lets them experience it.
>
> Those surfaces cross-link rather than repeat one another.

Everything below is an application of that. The failure this rule prevents is
the one the single-page site already hit: contractor control proved six times
because there was nowhere else to prove it. With destinations, each argument
gets made once, in the place that owns it.

## Why this design exists at all

A plumber or HVAC contractor landing on today's homepage sees an electrical
demonstration, an electrical hero and an electrical template section, and
concludes Price2Book is an electrical product that might expand later. That is a
positioning defect, not a copy defect — and the fix is structural.

**But the fix must not get ahead of the product.** Only electrical ships with
real service structure today. So the site states the breadth honestly and proves
it only where there is something to prove it with.

---

## Navigation

```
Product ▾ | How It Fits | Trades ▾ | Integrations | Demo | Sign In | Request Early Access
```

| Menu | Contains | Notes |
|---|---|---|
| **Product ▾** | Overview · Guided Pricing · Guided Estimates · While We're There™ · Online Booking · Website Embed & Pricing Links | |
| **How It Fits** | One page, anchored subsections | Not four pages |
| **Trades ▾** | Electrical · Plumbing — *In Build* (not clickable) | HVAC appears as a non-clickable *Next* line only if the dropdown carries it elegantly; otherwise its status lives on the homepage alone |
| **Integrations** | One page | Promoted from a homepage section |
| **Demo** | The homeowner demonstration | Its canonical home moves here |

**Held out of navigation until they ship:**

| Item | Why | Where it lives now |
|---|---|---|
| **PriceSight** | Not shipped. A nav item is a stronger claim than a paragraph. | `docs/design/pricesight-v1.md`, uncommitted |
| **`/trades/hvac`** | No template, no canonical design. An illustrative catalog in production marketing code is invented product truth, and a visual disclaimer does not make it safe. | — |
| **`/trades/plumbing`** | Template is in flight. **Freeze first, market second.** | `lib/plumbing/`, uncommitted |

---

## Trade status vocabulary

Three states, and they are claims the build must be able to check:

| Label | Means | May a trade page exist? |
|---|---|---|
| **Available now** | A canonical template is committed and a contractor could be provisioned onto it | Yes, populated from that template |
| **In build** | Implementation is underway and not frozen | No page. Dropdown shows the status, not a link |
| **Next** | Intended, nothing built | No page, no link. Homepage status line only |

Today: Electrical *available now*, Plumbing *in build*, HVAC *next*.

**A qualifier is removed only when the template is committed and frozen** — not
when it works locally, and not when it is nearly done. The homepage line becomes
`Electrical · Plumbing — available now · HVAC — next` at that point, and the
Plumbing page is built in the same pass.

**This should be gated the way integration status already is.** Both lists are
capability claims with the same failure mode, and they belong in one checked
place — see `FORBIDDEN_INTEGRATION_LABELS` and `TRUTH` in
`scripts/verify-marketing-homepage.ts`. Note the two vocabularies are
deliberately different words (*Available / Built In / Coming Soon* for
integrations) because they describe different axes; the check should hold both
without merging them.

---

## Page responsibilities

Each page below states what it owns, what it must NOT do, and where its content
comes from. "Captured" means generated from product data with a drift check, the
way the hero already works.

### Homepage — *why should I care?*

**Owns:** the argument. Hero walkthrough, the three pillars, While We're There™,
the pricing link, contractor control, selective adoption, the trade signal, and
the ask.

**Must not:** carry the depth. Once trade and product pages exist, the homepage
stops being the only place anything can be said, and should shorten again — the
sections that survive are the ones that make the case, not the ones that explain
the mechanism.

**New on it:** the multi-trade signal, near the top —

> **Built for the trades that live on service calls.**
> Electrical — available now · Plumbing — in build · HVAC — next

Added as part of the homepage restructure (step 8), not bolted on as a
standalone change first.

**Truth source:** captured — `components/marketing/heroFlow.ts`, plus the trade
status list, which becomes gated content.

### `/trades/electrical` — *do they understand my work?*

The credibility page, and the pattern-setter for every trade page after it. A
visitor should come away thinking *they have actually modeled the work my
company does.*

**Owns:** breadth and depth of the electrical catalog — real categories, real
services, real questions, real routing.

**Must not:** re-explain Guided Pricing or While We're There™ from scratch. It
shows one worked example of each, in this trade, and links to the Product page
that explains the mechanism.

**Truth source:** captured from the committed electrical template and the live
catalog, with a `--check` that fails the build on drift. Same machinery as the
hero. No hand-written service lists.

**Must include the counter-example.** A page that lists only priceable work
implies everything can be priced online, which is false and is the opposite of
the product's philosophy:

> Not every electrical call should get an online price. Known work can be
> priced. Unclear work can collect information, request photos, or route to an
> on-site visit instead.

### The reusable trade-page shape

Defined now so Electrical establishes it and Plumbing drops into it later
without redesign:

1. Trade-specific hero — *Price2Book for Electricians* / *for Plumbers*
2. Category breadth — the trade's real categories, at a glance
3. What can be priced online — service examples from the catalog
4. What routes elsewhere — review, photos, on-site; the counter-example above
5. The selective-use message — start with ten, not the whole catalog
6. One Guided Pricing example, in this trade
7. One While We're There™ example, in this trade
8. Booking and scheduling treatment for this trade's job durations
9. Links into the Product pages for mechanism

Page titles are the SEO-facing form: **Price2Book for Electricians**,
**Price2Book for Plumbers**, **Price2Book for HVAC Contractors**.

### Product pages — *how does it work?*

Six pages: Overview, Guided Pricing, Guided Estimates, While We're There™,
Online Booking, Website Embed & Pricing Links.

**Own:** the mechanism, once each. Guided Pricing owns the decision tree and
routing. Guided Estimates owns contractor-set pricing. While We're There™ owns
the two-price model. Online Booking owns availability, duration and capacity.
Embed owns where the pricing page lives and how a link travels.

#### `/product/guided-estimates` — *can I quote remotely without publishing prices?*

**The answer is yes, and the page proves it from shipped behavior.** Guided
Estimates crossed the same gate every other row is held to: `REMOTE_QUOTE`
services carrying no published price, answers whose `photosBlockBooking` holds
the price back until named photographs arrive, a tenant-guarded contractor
review queue at `app/dashboard/quotes`, and a customer approval route. It is in
production use, so it gets a link rather than a status label.

**Owns:** customer-guided information collection · the photographs a job
requires · contractor review · the contractor-set estimate · remote quoting ·
and the reduction of unnecessary estimate trips.

**Must not:** imply software determines the estimate — a person sets every one.
Imply photographs are interpreted — they are collected and looked at. Imply
every job is remotely quotable. Become Guided Pricing #2. Or treat the estimate
path as a failure or fallback from instant pricing.

**Guided Pricing and Guided Estimates are siblings.** Same guided flow, two
endings: one releases a price the contractor already approved, the other hands
the contractor a scoped job to price. Neither is the advanced version.

**Sourced from `components/marketing/guidedEstimates.ts`**, generated by
`scripts/capture-guided-estimates.ts` and drift-checked in the build. The page
may claim nothing the capture does not contain — the standing risk on a page
like this is inventing a tidy estimate workflow the product does not run.

**Must not:** carry trade catalogs. Examples here are illustrative of the
mechanism; the proof that it is deep lives on trade pages.

**Embed & Pricing Links carries `EMBED_STATUS`** — the embed has not shipped, and
a dedicated page makes the claim louder, not quieter.

### How It Fits — *what do I have to change?*

One page, anchored subsections: start with 10 services · run your whole catalog ·
show prices or send estimates · fewer estimate trips · conversational onboarding ·
keep your existing workflow.

**Owns:** the adoption objection, on BOTH of its axes. A contractor makes two
independent decisions, and this page used to teach only the first:

| | |
|---|---|
| **How much goes in?** | a handful of services ←→ most or all of the catalog |
| **How do those services price?** | Instant Price · Guided Estimate · Onsite Visit |

Neither axis is a progression. Ten instant-priced services and a fifty-service
catalog that publishes no prices at all are both the product used as designed.
That combination is what *"Price2Book fits your business"* now means, and the
section must leave a contractor knowing **both** freedoms: I don't have to put
my whole catalog online, and I don't have to publish my prices online.

**Also owns the estimate-trip argument** — *"go on estimates because the job
needs you there, not because you needed more information."* The target is
narrow on purpose: not site visits, but the drive that only happened because
information was missing. No percentage claims; there is no measurement.

**Must not:** become a second homepage. It answers one question.

### Integrations — *does it fit my stack?*

**Owns:** Jobber, the built-in scheduler, and what is planned. The status list is
already a correctness constraint and stays gated.

**Must not:** restate the boundary argument at length. One sentence, then the
list.

### `/demo` — *let me try it*

**Owns:** the full homeowner demonstration, deep-linkable and shareable.

**Risk to manage:** the demo is the single most persuasive thing on the site, and
moving it wholesale off the homepage removes the page's best proof. The homepage
should keep a compact entry point — the four-word journey strip and an invitation
— with the full experience living here. Losing the entry point entirely is not
the intent of "move the demo to /demo".

---

## Build order

1. This document — sitemap and page responsibilities. **← we are here**
2. Homepage multi-trade signal, as part of the restructure in step 8
3. `/trades/electrical`, captured from real template and catalog data
4. Product detail pages
5. How It Fits
6. Integrations
7. Move the full demo to `/demo`
8. Restructure and shorten the homepage around these destinations
9. `/trades/plumbing` — only after its template is frozen and committed
10. PriceSight — only when it can be demonstrated truthfully
11. HVAC — only when there is a canonical HVAC product behind the claim

Steps 9–11 are gated on the product, not on marketing capacity. They do not
block the rest.

## Rules carried forward from the homepage pass

These apply to every page on this list, and are why the hero survived review:

- **Anything that claims product state comes from product state.** Captured, not
  typed. A dollar figure in JSX is a bug — enforced today for
  `components/marketing`, and the check should extend to whatever directories
  these pages live in.
- **A capability claim is checked, not written.** Integration statuses, trade
  statuses and the embed's status are all the same class.
- **Freeze first, market second.** No marketing page is built against an
  implementation that is still moving.
- **Show the counter-example.** Every surface that shows what can be priced
  online also shows what should not be.
