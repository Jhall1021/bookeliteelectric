import Hero from "@/components/marketing/Hero";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import {
  DemoCta, Everywhere, GuidedPricingTeaser, NotYourCRM, Pillars, StartSmall, TradeSignal,
  WhileWereThereTeaser,
} from "@/components/marketing/Sections";

/**
 * The Price2Book homepage — restructured 1 September 2026, once there were
 * destinations to restructure around.
 *
 * ITS JOB IS ONE SENTENCE: make a contractor understand why Price2Book
 * matters, trust that it is real, and know where to click next. Every "how
 * does it work" answer now has a canonical home, so the homepage stopped being
 * the only place anything could be said — which is what let it stop saying
 * everything.
 *
 * WHAT LEFT, AND WHERE IT WENT. Not hidden behind accordions; removed:
 *
 *   the interactive demo    → /demo
 *   contractor control      → /product/guided-pricing
 *   the two-price argument  → /product/while-were-there
 *   scheduling detail       → /product/online-booking
 *   the integration matrix  → /integrations
 *   the electrical catalog  → /trades/electrical
 *   adoption in full        → /how-it-fits
 *
 * WHAT DID NOT LEAVE IS THE PROOF. The hero still runs the real product
 * against captured live data, the Guided Pricing teaser still shows a real
 * question, and While We're There™ still shows a real price pair. Moving the
 * explanation off-page was the point; moving the credibility off-page would
 * have been a different and much worse change.
 *
 * The order is the argument: what it is (hero), who it is for (trades), what
 * it does (pillars), how much of my business it touches (start small) — that
 * one moved high deliberately, because it is the objection that stops people
 * reading — then the three ideas worth a teaser, the boundary, the invitation,
 * and the ask.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <TradeSignal />
      <Pillars />
      <StartSmall />
      <GuidedPricingTeaser />
      <WhileWereThereTeaser />
      <Everywhere />
      <NotYourCRM />
      <DemoCta />
      <EarlyAccess />
    </main>
  );
}
