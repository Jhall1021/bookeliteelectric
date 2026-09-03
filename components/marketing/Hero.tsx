import { CUSTOMER_URL, EMBED_STATUS, HERO } from "./content";
import { SHOTS } from "./shots";
import ShotFigure from "./ShotFigure";

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
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-accent lg:text-[15px]">
              {HERO.eyebrow}
            </span>
          </div>

          <h1 className="max-w-[17ch] text-[36px] font-bold leading-[1.06] tracking-[-0.022em] sm:text-[46px] lg:text-[56px] lg:leading-[1.03]">
            {HERO.headline}
          </h1>

          <p className="mt-5 max-w-[50ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:mt-6 lg:text-[19px]">
            {HERO.body}
          </p>

          {/* Four outcomes, scannable without reading the paragraph above. A
              contractor who skims the hero should still leave with the four
              things Price2Book removes from their day. */}
          <ul className="mt-6 grid gap-x-7 gap-y-2.5 sm:grid-cols-2">
            {HERO.proof.map((line) => (
              <li key={line} className="flex gap-2.5 text-[15px] leading-[1.4] text-p2b-ink lg:text-base">
                <svg viewBox="0 0 20 20" fill="none" stroke="#1B4B8F" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round"
                     className="mt-[3px] h-[15px] w-[15px] shrink-0" aria-hidden="true">
                  <path d="M4 10.5 8 14.5 16 5.5" />
                </svg>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] text-p2b-ink lg:text-[21px]">
            {HERO.payoff}
          </p>

          {/* ORDER CHANGED: understanding before commitment. "See How It
              Works" is the filled button because someone who just landed is
              not ready to ask for access to a thing they cannot yet describe. */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <a href="/how-it-fits"
               className="rounded-sm bg-p2b-accent px-[30px] py-4 text-center text-base font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
              {HERO.primaryCta}
            </a>
            <a href="#access"
               className="rounded-sm border border-p2b-ink px-[30px] py-4 text-center text-[15px] font-medium text-p2b-ink hover:border-p2b-accent hover:text-p2b-accent sm:border-0 sm:px-0 sm:py-0 sm:text-base">
              {HERO.secondaryCta} <span aria-hidden="true">→</span>
            </a>
            {/* The demo is still real and still linked — it just stopped being
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
            {/* OVERLAPPED, NOT STACKED.
                Two panels in a column cost ~950px and the laptop fold is 800:
                the customer screen landed above it, the control screen did
                not. Only its navy bar peeked in, so the first screen said
                "customers can get a price" and never showed the half that
                says "you set the rules".

                So the catalog becomes the BACKDROP and the price card floats
                over it. Same two screenshots, same lightbox, a third of the
                height — and the arrangement carries the argument the stack
                could only imply: the customer's experience sits inside the
                system the contractor controls.

                Overlap only from lg. Below that they stack, because a card on
                top of another card at 390px hides more than it says. */}
            <div className="relative lg:pb-8">
              {SHOTS.adminServices ? (
                <div className="overflow-hidden rounded-[8px] border border-p2b-line bg-white shadow-[0_2px_6px_rgba(16,24,40,.06),0_22px_50px_-20px_rgba(16,24,40,.24)]">
                  <div className="flex items-center gap-2.5 border-b border-p2b-line bg-p2b-navy-deep px-3.5 py-2.5">
                    <span className="text-[12px] font-bold text-[#F4F6F9] lg:text-[13px]">Price2Book</span>
                    <span className="rounded-full bg-[rgba(255,255,255,.14)] px-2.5 py-0.5 text-[11px] font-semibold text-[#F4F6F9]">
                      Voltmark Electric
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-p2b-navy-muted">
                      What you control
                    </span>
                  </div>
                  <div className="h-[290px] overflow-hidden lg:h-[320px]">
                    <ShotFigure src={SHOTS.adminServices.full ?? SHOTS.adminServices.src}
                                alt={SHOTS.adminServices.alt}
                                width={SHOTS.adminServices.fullW ?? SHOTS.adminServices.w}
                                height={SHOTS.adminServices.fullH ?? SHOTS.adminServices.h}
                                full={SHOTS.adminServices.full} fullWidth={SHOTS.adminServices.fullW}
                                fullHeight={SHOTS.adminServices.fullH}
                                className="rounded-none border-0 shadow-none hover:shadow-none"
                                sizes="(min-width: 1024px) 560px, 100vw" />
                  </div>
                </div>
              ) : null}

              {SHOTS.homePrice ? (
                <div className="mt-4 overflow-hidden rounded-[8px] border border-p2b-line bg-white shadow-[0_3px_10px_rgba(16,24,40,.10),0_26px_54px_-18px_rgba(16,24,40,.34)] lg:absolute lg:-bottom-1 lg:left-0 lg:mt-0 lg:w-8/12">
                  <div className="flex items-center gap-2.5 border-b border-p2b-line bg-p2b-canvas-alt px-3 py-2">
                    <span className="flex gap-1.5" aria-hidden="true">
                      <span className="h-2 w-2 rounded-full bg-p2b-line-dash" />
                      <span className="h-2 w-2 rounded-full bg-p2b-line-dash" />
                      <span className="h-2 w-2 rounded-full bg-p2b-line-dash" />
                    </span>
                    <span className="ml-0.5 flex-1 truncate rounded-sm bg-white px-2.5 py-1 text-[11px] text-p2b-muted lg:text-[12px]">
                      {CUSTOMER_URL}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-p2b-accent">
                      Your customer
                    </span>
                  </div>
                  <ShotFigure src={SHOTS.homePrice.src} alt={SHOTS.homePrice.alt}
                              width={SHOTS.homePrice.w} height={SHOTS.homePrice.h}
                              full={SHOTS.homePrice.full} fullWidth={SHOTS.homePrice.fullW}
                              fullHeight={SHOTS.homePrice.fullH}
                              className="rounded-none border-0 shadow-none hover:shadow-none"
                              priority sizes="(min-width: 1024px) 350px, 100vw" />
                </div>
              ) : null}
            </div>

            {/* The four handling modes, under the composition where they read
                as a caption to both panels rather than a divider between. */}
            <div className="mt-5 flex flex-wrap gap-x-2 gap-y-2 lg:mt-4">
              {["Instant Price", "Guided Estimate", "While We\u2019re There\u2122", "Smart Booking"].map((t) => (
                <span key={t}
                      className="rounded-full border border-p2b-line bg-white px-3 py-1.5 text-[12px] font-semibold text-p2b-ink-warm lg:text-[13px]">
                  {t}
                </span>
              ))}
            </div>
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
