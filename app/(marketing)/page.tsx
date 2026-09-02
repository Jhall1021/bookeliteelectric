import Hero from "@/components/marketing/Hero";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import {
  CatalogGrid, DemoCta, EstimateTrips, Everywhere, GuidedPricingTeaser, NotYourCRM, Pillars,
  PricingModes, StartSmall, TradeSignal, WhileWereThereTeaser,
} from "@/components/marketing/Sections";

/**
 * The Price2Book homepage — restructured 1 September 2026 once there were
 * destinations to restructure around, and again on 2 September once Guided
 * Estimates turned out to be a shipped capability rather than a future one.
 *
 * ITS JOB IS ONE SENTENCE: make a contractor understand why Price2Book
 * matters, trust that it is real, and know where to click next. Every "how
 * does it work" answer has a canonical home, so the homepage stopped being the
 * only place anything could be said — which is what let it stop saying
 * everything.
 *
 * WHAT THE SECOND PASS CHANGED, AND WHY IT WAS NOT COSMETIC.
 *
 * The page taught ONE adoption axis — how much of the catalog goes online —
 * and silently answered the second one for the reader. "Online" meant "priced
 * instantly, in public", because when the page was written those were the only
 * two endings a job could have: an automatic price, or out of the system. That
 * lost every contractor unwilling to publish a number, which is a great many
 * of them, and it was not even true.
 *
 * So two sections are new and they sit HIGH, above the mechanism teasers:
 *
 *   PricingModes    Instant Price · Guided Estimate · Onsite Visit, as three
 *                   legitimate choices rather than a maturity ladder
 *   EstimateTrips   the drive that only happened because information was
 *                   missing — a top-level reason to care, not a footnote
 *
 * THE WALKTHROUGH DID NOT CHANGE, DELIBERATELY. The hero animates a captured
 * Instant Price flow from real live data. Bending it to also demonstrate
 * Guided Estimates would mean drawing a flow nobody captured, which is the
 * exact failure the capture architecture exists to prevent. Only the prose
 * beside it broadened, so the first screen stops implying that using
 * Price2Book means publishing prices.
 *
 * The order is the argument: what it is (hero), who it is for (trades), how
 * much of my work it covers (catalog), how much of my business it touches
 * (start small), how my customers get a number (modes) — those two are the
 * adoption objection and come before any mechanism — then the reason to care,
 * the three ideas worth a teaser, the boundary, the invitation, and the ask.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main>
      {/* 1–3. What it is, who it is for, how much work it covers. */}
      <Hero />
      <TradeSignal />
      <CatalogGrid />

      {/* 4–6. The two freedoms, then the reason they matter. */}
      <StartSmall />
      <PricingModes />
      <EstimateTrips />

      {/* 7–9. What it does, and the two mechanisms worth showing. */}
      <Pillars />
      <GuidedPricingTeaser />
      <WhileWereThereTeaser />

      {/* 10–13. Where it lives, what it is not, a try, and the ask. */}
      <Everywhere />
      <NotYourCRM />
      <DemoCta />
      <EarlyAccess />
    </main>
  );
}
