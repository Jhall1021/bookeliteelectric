import { appOrigin } from "@/lib/origins";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/Chrome";
import { SIGN_IN_PATH } from "@/components/marketing/content";
import Hero from "@/components/marketing/Hero";
import ControlPanel from "@/components/marketing/ControlPanel";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import { SHOTS } from "@/components/marketing/shots";
import {
  ElectricalFirst, GuidedPricing, GuidedSetup, Integrations, Journey, Outcomes,
  Pillars, PricingControl, Proof, Scheduling, WhileWereThere,
} from "@/components/marketing/Sections";

/**
 * The Price2Book marketing homepage — ADR-020.
 *
 * Section order is the handoff's final order and is not incidental: the page
 * answers "what is it" (hero, pillars), "what does my customer do" (journey),
 * "what is the differentiator" (While We're There™, Guided Pricing), "who
 * stays in control" (outcomes, pricing, scheduling), "what does it cost me to
 * adopt" (integrations, electrical template, control panel, setup), and only
 * then asks for anything.
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
        <WhileWereThere />
        <GuidedPricing />
        <Outcomes />
        <PricingControl />
        <Scheduling />
        <Integrations />
        <ElectricalFirst />
        <ControlPanel shots={SHOTS} />
        <GuidedSetup />
        <Proof />
        <EarlyAccess />
      </main>
      <MarketingFooter />
    </>
  );
}
