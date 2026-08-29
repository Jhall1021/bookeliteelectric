import { HERO, HERO_CONTROL } from "./content";

/**
 * The hero's job is stated in the handoff: the contractor should understand
 * instantly that "you control this → your customer sees this". So the two
 * cards are one visual, not two — the contractor's settings sit behind and
 * above, the homeowner's result overlaps in front of them.
 *
 * The overlap only exists from lg up. Below that the cards stack in reading
 * order (what you set, then what they see), which keeps the same sentence
 * without relying on absolute positioning at a width that cannot hold it.
 */
export default function Hero() {
  return (
    <section id="top" className="mx-auto max-w-[1440px] px-5 pb-16 pt-14 lg:px-[88px] lg:pb-[84px] lg:pt-[92px]">
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

          <p className="mt-6 max-w-[34ch] text-[17px] leading-[1.5] text-p2b-ink-warm lg:mt-[30px] lg:text-xl">
            {HERO.body}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 lg:mt-[38px]">
            <a href="#access"
               className="rounded-sm bg-p2b-accent px-[30px] py-4 text-center text-base font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
              {HERO.primaryCta}
            </a>
            <a href="#demo"
               className="rounded-sm border border-p2b-ink px-[30px] py-4 text-center text-[15px] font-medium text-p2b-ink hover:border-p2b-accent hover:text-p2b-accent sm:border-0 sm:px-0 sm:py-0 sm:text-base">
              {HERO.secondaryCta} <span aria-hidden="true">→</span>
            </a>
          </div>

          <p className="mt-6 text-[14px] text-p2b-muted lg:mt-[38px] lg:text-[15px]">
            {HERO.support} <span className="font-medium text-p2b-ink">{HERO.supportEmphasis}</span>
          </p>
          <p className="mt-2.5 text-[13px] text-p2b-muted-soft lg:text-sm">{HERO.footnote}</p>
        </div>

        <div className="lg:relative lg:col-span-6 lg:pb-[34px] lg:pl-[34px] lg:pt-2">
          {/* Behind: what the contractor set. */}
          <div className="overflow-hidden rounded-[3px] border border-p2b-accent-line bg-[#F2F5FA] lg:absolute lg:right-0 lg:top-0 lg:w-[430px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-p2b-accent-line bg-p2b-accent-tint-strong px-[18px] py-[11px]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent">
                Contractor · what you set
              </span>
              {/* An unlabelled price in a hero reads as a price the platform
                  sets, which is the opposite of what this section claims. */}
              <span className="text-[11px] font-medium text-p2b-muted">Example contractor setup</span>
            </div>
            <div className="px-[18px] pb-4 pt-[18px]">
              <div className="mb-3.5 text-[15px] font-semibold">Replace Existing Ceiling Fan</div>
              {HERO_CONTROL.map((row) => (
                <div key={row.k}
                     className="flex justify-between border-b border-[#E4EAF3] py-2 text-sm last:border-0">
                  <span className="text-p2b-muted">{row.k}</span>
                  <span className={`font-semibold ${row.tone === "green" ? "text-p2b-green-deep" : "text-p2b-ink"}`}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* In front: what the homeowner sees. */}
          <div className="mt-5 overflow-hidden rounded-[3px] border border-p2b-line bg-white shadow-[0_2px_6px_rgba(20,24,31,.05),0_18px_48px_rgba(20,24,31,.10)] lg:relative lg:mt-[236px] lg:w-[400px]">
            <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-[18px] py-[11px]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
                Homeowner · what they see
              </span>
            </div>
            <div className="p-6">
              <div className="text-[15px] font-semibold">Replace Existing Ceiling Fan</div>
              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-[44px] font-bold tracking-[-0.03em]">$375</span>
                <span className="text-sm text-p2b-muted">all-in</span>
              </div>
              <div className="my-[18px] h-px bg-p2b-line" />
              <div className="mb-2.5 text-[13px] text-p2b-muted">Thursday</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-sm border-[1.5px] border-p2b-green bg-p2b-green-tint px-1.5 py-2.5 text-center">
                  <div className="text-[13px] font-semibold text-p2b-green-deep">8–11</div>
                  <div className="mt-0.5 text-[11px] text-p2b-green">available</div>
                </div>
                <div className="rounded-sm border border-p2b-line px-1.5 py-2.5 text-center text-[13px] font-semibold">11–2</div>
                <div className="rounded-sm border border-p2b-line px-1.5 py-2.5 text-center text-[13px] font-semibold opacity-40">2–4:30</div>
              </div>
              <div className="mt-4 rounded-sm bg-p2b-ink p-[13px] text-center text-[15px] font-semibold text-p2b-canvas">
                Book This Window
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2.5 lg:pl-1">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1B4B8F" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span className="text-sm text-p2b-muted">
              <span className="font-semibold text-p2b-ink">You control this</span> → your customer sees this.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
