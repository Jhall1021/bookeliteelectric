import { EMBED_STATUS, HERO } from "./content";
import Image from "next/image";
import { SHOTS } from "./shots";

/**
 * The hero — the contractor's own website, with their price inside it.
 *
 * ONE CARD, NOT TWO. A "Contractor · what you set" card used to sit behind
 * this one, so the hero read "you control this → your customer sees this".
 * The claim was right and the example was doing it badly: the card's most
 * interesting row was "While We're There™ +$95" against no named addition,
 * which is a price for nothing. Both the card and that pairing moved to the
 * While We're There™ section, where the mechanic is explained and the numbers
 * have something to attach to.
 *
 * What is left is the sentence the page most needs to land in three seconds —
 * keep your website, add Price2Book to it — carried by an address bar rather
 * than by a paragraph.
 *
 * The frame is a mock-up of the DESTINATION, and the embed that puts
 * Price2Book inside a contractor's page has not shipped. EMBED_STATUS.line
 * sits directly under it saying so, in the same visual, rather than in a
 * footnote further down that an interested reader would not meet until after
 * they had believed the picture.
 */
export default function Hero() {
  return (
    <section id="top" className="mx-auto max-w-[1440px] px-5 pb-14 pt-12 lg:px-[88px] lg:pb-[72px] lg:pt-[76px]">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-10">
        <div className="lg:col-span-6">
          <div className="mb-6 flex items-center gap-2.5 lg:mb-[26px]">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              {HERO.eyebrow}
            </span>
          </div>

          <h1 className="text-[42px] font-bold leading-[1.02] tracking-[-0.022em] sm:text-6xl lg:text-[78px] lg:leading-[0.99]">
            {HERO.headline[0]}
            <br />
            {HERO.headline[1]}
          </h1>

          <p className="mt-6 max-w-[44ch] text-[17px] leading-[1.5] text-p2b-ink-warm lg:mt-[30px] lg:text-xl">
            {HERO.body}
          </p>

          {/* The three outcomes, in the contractor's terms. The body says what
              the product does; this says what it is worth. */}
          <p className="mt-5 text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] text-p2b-ink lg:text-[21px]">
            {HERO.payoff}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 lg:mt-9">
            <a href="#access"
               className="rounded-sm bg-p2b-accent px-[30px] py-4 text-center text-base font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
              {HERO.primaryCta}
            </a>
            <a href="/how-it-fits"
               className="rounded-sm border border-p2b-ink px-[30px] py-4 text-center text-[15px] font-medium text-p2b-ink hover:border-p2b-accent hover:text-p2b-accent sm:border-0 sm:px-0 sm:py-0 sm:text-base">
              {HERO.secondaryCta} <span aria-hidden="true">→</span>
            </a>
            {/* The demo is still here and still real — it just stopped being
                the way a visitor works out what the company is. */}
            <a href="/demo"
               className="text-center text-[15px] font-medium text-p2b-muted hover:text-p2b-accent sm:text-base">
              {HERO.tertiaryCta} <span aria-hidden="true">→</span>
            </a>
          </div>

          <p className="mt-6 text-[14px] text-p2b-muted lg:mt-8 lg:text-[15px]">
            {HERO.support} <span className="font-medium text-p2b-ink">{HERO.supportEmphasis}</span>
          </p>
          <p className="mt-2.5 text-[13px] text-p2b-muted-soft lg:text-sm">{HERO.footnote}</p>
        </div>

        <div className="min-w-0 lg:col-span-6 lg:pl-[34px] lg:pt-2">
          {/* The contractor's own page, with the real product running inside
              it. The static price card that used to sit here showed the END of
              the story; this shows the story. Everything in it is captured
              from a live catalog — see HeroWalkthrough. */}
          {/* FRAMING, OUTSIDE THE ISLAND — 2 September 2026.
              The captured storefront carries that contractor's own no-estimates
              line, which is TRUE of the Elite service being demonstrated and
              must not be overridden: it is that contractor's product state,
              not Price2Book's positioning. But
              beside corporate copy offering Guided Estimates it could read as
              the only model on offer. So the label sits outside the island and
              names the configuration, leaving the capture untouched. That the
              two can disagree is the point — the contractor picks per service. */}
          {/* WAS THE ANIMATED WALKTHROUGH — 2 September 2026.
              It is honest, captured from live data, and drift-checked, and it
              is still the centerpiece of /demo. But it asked a visitor to
              WATCH something for thirty seconds before they knew what they
              were looking at, and the first screen is not where a company
              should be inferred. A still of the same product says it at a
              glance: a real storefront, a real question, a real approved
              price. The moving version is one click away. */}
          <div className="min-w-0 lg:mx-auto lg:w-[560px]">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-1 w-1 shrink-0 rounded-full bg-p2b-faint" aria-hidden="true" />
              <span className="text-[12px] leading-[1.4] text-p2b-muted-soft lg:text-[13px]">
                A real storefront. The contractor’s name has been changed.
              </span>
            </div>
            {SHOTS.homePrice ? (
              <figure className="overflow-hidden rounded-[5px] border border-p2b-line bg-white shadow-[0_2px_4px_rgba(16,24,40,.05),0_16px_40px_-14px_rgba(16,24,40,.22)]">
                <Image src={SHOTS.homePrice.src} alt={SHOTS.homePrice.alt}
                       width={SHOTS.homePrice.w} height={SHOTS.homePrice.h}
                       priority sizes="(min-width: 1024px) 560px, 100vw" className="h-auto w-full" />
              </figure>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2.5 lg:mx-auto lg:w-[500px]">
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1B4B8F" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              {/* The control claim, kept in the hero as one line now that the
                  card that used to make it has moved to While We're There™. */}
              <span className="text-sm text-p2b-muted">
                Your page. <span className="font-semibold text-p2b-ink">Every price and every window in it is one you set.</span>
              </span>
            </div>
            <p className="text-[13px] leading-[1.55] text-p2b-muted-soft">
              <span className="mr-2 rounded-sm bg-p2b-accent-tint-strong px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[0.05em] text-p2b-accent">
                {EMBED_STATUS.label}
              </span>
              {EMBED_STATUS.line}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
