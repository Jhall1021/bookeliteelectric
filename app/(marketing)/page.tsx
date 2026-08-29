import { appOrigin } from "@/lib/origins";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/Chrome";
import { SIGN_IN_PATH } from "@/components/marketing/content";
import Hero from "@/components/marketing/Hero";
import ControlPanel from "@/components/marketing/ControlPanel";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import { SHOTS } from "@/components/marketing/shots";
import {
  Boundary, ElectricalFirst, Faq, GuidedPricing, GuidedSetup, Integrations, Journey,
  Outcomes, Pillars, PricingControl, Proof, Scheduling, WhileWereThere,
} from "@/components/marketing/Sections";

/**
 * The Price2Book marketing homepage — ADR-020.
 *
 * Section order is the handoff's final order and is not incidental: the page
 * answers "what is it" (hero, pillars), "what does my customer do" (journey),
 * "does it really work" (the real product screens, moved up from two-thirds
 * down), "what is the differentiator" (Guided Pricing, While We're There™),
 * "who stays in control" (outcomes, pricing, scheduling), "what is it NOT"
 * (the boundary and the two operating modes), "what does it cost me to adopt"
 * (integrations, electrical template, setup), answers the objections (FAQ),
 * and only then asks for anything.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  // Resolved rather than hardcoded, so a preview deployment sends people to
  // its own portal instead of production's. Falls back to a relative path,
  // which is correct on any host that serves both.
  const signInHref = `${appOrigin() ?? ""}${SIGN_IN_PATH}`;

  return (
    <>
      <MarketingHeader signInHref={signInHref} />
      <main>
        <Hero />
        <Pillars />
        <Journey />

        {/* Moved up from two-thirds down the page. The real storefront and the
            real contractor screens are the strongest evidence here, and they
            were arriving long after most visitors had decided. */}
        <ControlPanel shots={SHOTS} />

        <GuidedPricing />
        <Outcomes />
        <WhileWereThere />
        <PricingControl />
        <Scheduling />
        <Boundary />
        <Integrations />
        <ElectricalFirst />
        <GuidedSetup />
        <Proof />
        <Faq />
        <EarlyAccess />
      </main>
      <MarketingFooter />
    </>
  );
}
