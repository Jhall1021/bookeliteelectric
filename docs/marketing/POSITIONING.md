# Price2Book — positioning

**Status:** settled by the owner, 28 August 2026. The marketing site is designed from this.

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
| **Enterprise service companies** | They expect call centres, territory management, advanced dispatch, enterprise reporting, custom workflows. |
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

## Homepage structure

1. **Your pricing. Your schedule.**
2. The homeowner journey, shown immediately
3. *You decide what can be priced online*
4. *You decide what can be booked*
5. *Works with the software you already use*
6. The electrical template and product
7. Contractor control screenshots
8. Setup and onboarding
9. Pricing / early-access CTA

## Call to action

**Request Early Access** — not self-serve signup.

Per [ADR-012](../decisions/PRICE2BOOK-ARCHITECTURE-DECISIONS.md), Contractor #2 is a
release-candidate onboarding held until V1, so the site must not imply broad
self-service. The CTA and the product roadmap have to tell the same story.

## Why this is written down

The same reason the architecture decisions are. A positioning this specific is easy to
blur back into "software for home-service businesses" one sentence at a time, and every
such blur costs the differentiator that makes the product legible in the first place.
