import Hero from "@/components/marketing/Hero";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import {
  Adoption, DemoCta, EstimateTrips, Everywhere, NotYourCRM, PricingModes, ProductProof,
  TradeSignal,
} from "@/components/marketing/Sections";

/**
 * The Price2Book homepage.
 *
 * ITS JOB IS ONE SENTENCE: make a contractor understand why Price2Book
 * matters, trust that it is real, and know where to click next. It sells the
 * ideas and hands off the explanation — every "how does it work" answer has a
 * canonical page now.
 *
 * THREE PASSES, AND THE THIRD FIXED WHAT THE SECOND BROKE.
 *
 * 1 Sept — built the destination pages and moved the explanations off here.
 * 2 Sept — added Guided Estimates, because it turned out to be shipped rather
 *          than future. Both new sections earned their place. But nothing was
 *          REMOVED to pay for them, so the page grew from ~7,145px to 8,826px
 *          — longer, not more focused, which was the opposite of the point.
 * 2 Sept — this pass. Removal only, no new ideas. The space the destination
 *          pages created finally got spent.
 *
 * WHAT WAS DELETED OUTRIGHT, not shrunk:
 *
 *   CatalogGrid            a 13-tile photograph grid proving breadth that one
 *                          counted sentence proves → merged into Adoption
 *   StartSmall             the other half of the same adoption story → Adoption
 *   Pillars                a summary of three mechanisms → ProductProof
 *   GuidedPricingTeaser    the summary again, with evidence that now lives on
 *                          /product/guided-pricing → ProductProof
 *   WhileWereThereTeaser   likewise, for /product/while-were-there
 *
 * The rule applied throughout: if a Product page owns the mechanism, the
 * homepage may name it and link to it, and may not explain it. Deep proof —
 * the 97 unsure answers, the real price pair, duration arithmetic — belongs
 * to the pages built to carry it.
 *
 * THE HERO WALKTHROUGH IS UNTOUCHED. It animates a captured Instant Price
 * flow from live data, including the contractor's own "No estimates" line,
 * which is true of that service. A framing label sits OUTSIDE the island
 * naming the configuration, so one contractor's choice is not read as
 * Price2Book's only model.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main>
      {/* 1–2. What it is, and who it is for. */}
      <Hero />
      <TradeSignal />

      {/* 3–5. The two freedoms, and why the second one pays. */}
      <Adoption />
      <PricingModes />
      <EstimateTrips />

      {/* 6. Name the mechanisms; the Product pages explain them. */}
      <ProductProof />

      {/* 7–10. Where it lives, what it is not, a try, and the ask. */}
      <Everywhere />
      <NotYourCRM />
      <DemoCta />
      <EarlyAccess />
    </main>
  );
}
