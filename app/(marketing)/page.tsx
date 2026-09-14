import Hero from "@/components/marketing/Hero";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import {
  Adoption, DemoCta, EstimateTrips, Everywhere, NotYourCRM, PricingModes, ProductTour,
  TradeSignal, WhatItDoes,
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
 * SCANABILITY PASS — owner, 14 September 2026. The first screen and first
 * section now answer what a busy contractor decides on:
 *
 *   what is this?            the hero: the benefit, one sentence on how it
 *                            works, the four capabilities
 *   do I have to go all in?  the hero, before any screenshot: start with a
 *                            handful of services, keep your software
 *   what do I get?           six benefit tiles
 *   is it for my trade?      the trade signal, right after the tiles
 *   is it real?              both sides of the product, in real screenshots
 *
 * The page also got shorter. JourneyStrip (the customer's sequence in one
 * line) and ProductProof (the three mechanism cards) repeated what the hero,
 * the tiles, the product pages and the demo CTA already say, so both left the
 * homepage — and, being used nowhere else, the codebase.
 *
 * Everything after that is the argument a contractor reads once they care:
 * how services can be handled, why estimate trips shrink, distribution, the
 * boundary, adoption in detail, and the ask.
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
      {/* 1–3. What it is, what it does, and which trades it is for. */}
      <Hero />
      <WhatItDoes />
      <TradeSignal />

      {/* 4. That it is real — both sides of the product. */}
      <ProductTour />

      {/* 5–6. How each service can be handled, and why that pays. */}
      <PricingModes />
      <EstimateTrips />

      {/* 7–8. Where the pricing page lives, and what Price2Book is not. */}
      <Everywhere />
      <NotYourCRM />

      {/* 9–11. Adoption in detail, the demo, and the ask. */}
      <Adoption />
      <DemoCta />
      <EarlyAccess />
    </main>
  );
}
