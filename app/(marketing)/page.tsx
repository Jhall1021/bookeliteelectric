import Hero from "@/components/marketing/Hero";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import {
  Adoption, DemoCta, EstimateTrips, Everywhere, JourneyStrip, NotYourCRM, PricingModes,
  ProductProof, ProductTour, TradeSignal, WhatItDoes,
} from "@/components/marketing/Sections";

/**
 * The Price2Book homepage.
 *
 * THE PROBLEM THIS PASS FIXED. The page was accurate and short, and a
 * contractor still had to assemble the company in their own head. It opened
 * on a slogan and a thirty-second animation, and the six things Price2Book
 * actually does were spread across sections that each explained one mechanism
 * well. Someone who read all of it understood the product. Someone who
 * skimmed — which is everyone — did not.
 *
 * SO THE FIRST THIRD NOW ANSWERS THREE QUESTIONS IN ORDER:
 *
 *   what is this?     the hero says the category before the slogan
 *   what do I get?    six benefit tiles, skimmable in one pass
 *   is it real?       both sides of the product, in real screenshots
 *   how does it flow? the system as a customer walks it, in one line
 *
 * The tiles moved ABOVE the screenshots on 2 September. Proof is worth
 * nothing to someone who does not yet know what is being proved — the screens
 * answer "is this real", and that is the second question, not the first.
 *
 * Everything after that is the argument a contractor reads once they care:
 * how services can be handled, why estimate trips shrink, the mechanisms,
 * distribution, the boundary, and the ask.
 *
 * THE ANIMATION DID NOT DIE, IT MOVED. The hero walkthrough is captured from
 * live data and drift-checked, and it is still what /demo is built around. It
 * stopped being the way a visitor works out what the company is, because
 * inference from a moving picture is the slowest way to learn a category.
 *
 * SCREENSHOTS ARE THE REAL PRODUCT WITH THE CONTRACTOR RENAMED — the owner
 * narrowed the old demo-tenant-only rule on 2 September 2026. The capture
 * script scrubs the source tenant's address, telephone and license number as
 * well as its name, and refuses to write a file if any of it survives.
 * See scripts/capture-storefront-shots.ts and components/marketing/shots.ts.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main>
      {/* 1–4. What it is, that it is real, what it does, how it flows. */}
      <Hero />
      <WhatItDoes />
      <ProductTour />
      <JourneyStrip />

      {/* 5–6. How each service can be handled, and why that pays. */}
      <PricingModes />
      <EstimateTrips />

      {/* 7. The mechanisms, named — the Product pages explain them. */}
      <ProductProof />

      {/* 8–9. Where the pricing page lives, and what Price2Book is not. */}
      <Everywhere />
      <NotYourCRM />

      {/* 10–12. Breadth and adoption sit AFTER the product is understood —
          "ten services or your whole catalog" is a second question, and the
          page used to ask it before answering the first. */}
      <TradeSignal />
      <Adoption />
      <DemoCta />
      <EarlyAccess />
    </main>
  );
}
