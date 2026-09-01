import { appOrigin } from "@/lib/origins";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/Chrome";
import { SIGN_IN_PATH } from "@/components/marketing/content";
import Hero from "@/components/marketing/Hero";
import HomeownerDemo from "@/components/marketing/HomeownerDemo";
import EarlyAccess from "@/components/marketing/EarlyAccess";
import {
  Everywhere, JourneyIntro, KeepYourStack, Pillars, Rules, TradeFoundation, WhileWereThere,
} from "@/components/marketing/Sections";

/**
 * The Price2Book marketing homepage — ADR-020, shortened 31 August 2026.
 *
 * SEVEN SECTIONS, DOWN FROM FOURTEEN. The old page answered every question a
 * contractor could have, in order, and each answer was true. It was also
 * roughly twice as long as the argument needed, because contractor control
 * was proved six separate times and the boundary with their existing software
 * was drawn in four places.
 *
 * The order now: what is it and where does it live (hero), what does it do
 * (pillars), what does my customer actually experience (the live
 * demonstration), how does one visit become worth more (While We're There™),
 * where can I put it (the pricing link — new, and the thing the page never
 * said before), who is in control (one section, not five), what do I keep and
 * why is this not a form builder, and only then the ask.
 *
 * WHILE WE'RE THERE™ CAME BACK, and deliberately. The first pass folded it
 * into a pillar card, which reduced the product's most distinctive mechanic to
 * a slogan. It is a section again — a shorter one that explains the second
 * price rather than admiring it — and it absorbed the contractor-control card
 * that used to sit in the hero without an example to belong to.
 *
 * Removed rather than moved: the eight-module screenshot gallery, the boundary
 * table and operating modes, the pilot-metrics section, and the FAQ. Every
 * claim any of them made that was not already made elsewhere is now made once,
 * in the section it belongs to. What is genuinely gone is recorded in
 * docs/marketing/POSITIONING.md.
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

        {/* The demo explains the product faster than any section describing
            it, so it sits high and the written journey is reduced to the four
            words above it. */}
        <JourneyIntro />
        <HomeownerDemo />

        {/* Immediately after the demonstration, which ends on a visit: the
            same-visit price is the next thing that happens to that visit, and
            most readers will not have clicked far enough to meet it live. */}
        <WhileWereThere />

        <Everywhere />
        <Rules />
        <KeepYourStack />
        <TradeFoundation />
        <EarlyAccess />
      </main>
      <MarketingFooter />
    </>
  );
}
