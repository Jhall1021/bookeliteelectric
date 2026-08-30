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

## Homepage order

Hero → three pillars → four steps → While We're There™ → Guided Pricing → four customer
outcomes → *Your labor. Your materials. Your rules.* → *You decide what can be booked* →
*Keep the software you already use* → electrical-first template → contractor control panel
→ Guided Setup → proof (when it exists) → early-access CTA.

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
  a discount or percentage-off engine.

## Call to action

**Request Early Access** — not self-serve signup.

Per [ADR-012](../decisions/PRICE2BOOK-ARCHITECTURE-DECISIONS.md), Contractor #2 is a
release-candidate onboarding held until V1, so the site must not imply broad
self-service. The CTA and the product roadmap have to tell the same story.

## Why this is written down

The same reason the architecture decisions are. A positioning this specific is easy to
blur back into "software for home-service businesses" one sentence at a time, and every
such blur costs the differentiator that makes the product legible in the first place.
