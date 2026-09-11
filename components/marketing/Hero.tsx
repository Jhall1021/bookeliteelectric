import { CUSTOMER_URL, EMBED_STATUS, HERO } from "./content";
import { SHOTS } from "./shots";
import ShotFigure from "./ShotFigure";

/**
 * The first screen now leads with the result a contractor wants, then proves it
 * with the real contractor/customer product pair. The previous version put a
 * long explanation, four bullets, a payoff and three calls to action ahead of
 * the product on a phone; a visitor had to read most of the pitch before seeing
 * what Price2Book actually is.
 *
 * No new capability claims are introduced here. The stronger hierarchy is
 * built entirely from the already-approved outcome copy in content.ts.
 */
export default function Hero() {
  return (
    <section id="top" className="overflow-hidden border-b border-p2b-line/70 bg-[radial-gradient(circle_at_78%_8%,rgba(27,75,143,.07),transparent_31rem)]">
      <div className="mx-auto max-w-[1480px] px-5 pb-12 pt-10 sm:px-8 lg:px-[72px] lg:pb-16 lg:pt-[68px] xl:px-[88px]">
        <div className="grid gap-9 lg:grid-cols-12 lg:items-start lg:gap-12 xl:gap-16">
          <div className="lg:col-span-5 lg:pt-2">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="h-[2px] w-7 bg-p2b-accent" aria-hidden="true" />
              <span className="text-[12px] font-bold uppercase tracking-[0.085em] text-p2b-accent sm:text-[13px]">
                {HERO.eyebrow}
              </span>
            </div>

            {/* The contractor benefit is now the headline. It used to be the
                first small bullet six paragraphs into the mobile hero. */}
            <h1 className="max-w-[12ch] text-[42px] font-bold leading-[0.99] tracking-[-0.045em] text-p2b-ink sm:text-[52px] lg:text-[58px] xl:text-[64px]">
              {HERO.proof[0]}.
            </h1>

            <p className="mt-5 max-w-[34ch] text-[21px] font-semibold leading-[1.28] tracking-[-0.018em] text-p2b-ink-warm sm:text-[23px] lg:text-[24px]">
              {HERO.headline}
            </p>

            <p className="mt-4 max-w-[48ch] text-[16px] leading-[1.58] text-p2b-muted sm:text-[17px]">
              {HERO.body}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/how-it-fits"
                className="inline-flex min-h-12 items-center justify-center rounded-[7px] bg-p2b-accent px-6 text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(27,75,143,.16)] transition hover:-translate-y-px hover:bg-p2b-accent-hover"
              >
                {HERO.primaryCta}
              </a>
              <a
                href="/demo"
                className="inline-flex min-h-12 items-center justify-center rounded-[7px] border border-p2b-line bg-white px-5 text-[15px] font-semibold text-p2b-ink transition hover:border-p2b-accent-line hover:text-p2b-accent"
              >
                {HERO.tertiaryCta} <span className="ml-1.5" aria-hidden="true">→</span>
              </a>
            </div>

            <a href="#access" className="mt-4 inline-flex text-[14px] font-semibold text-p2b-muted hover:text-p2b-accent">
              {HERO.secondaryCta} <span className="ml-1.5" aria-hidden="true">→</span>
            </a>

            <p className="mt-6 max-w-[44ch] text-[13px] leading-5 text-p2b-muted-soft">
              {HERO.support} <span className="font-semibold text-p2b-ink-warm">{HERO.supportEmphasis}</span>
            </p>
          </div>

          <div className="min-w-0 lg:col-span-7">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-1 w-1 shrink-0 rounded-full bg-p2b-faint" aria-hidden="true" />
              <span className="text-[11px] leading-[1.4] text-p2b-muted-soft sm:text-[12px]">
                A real product screen. The contractor’s name has been changed.
              </span>
            </div>

            {/* Contractor control is the backdrop; the customer's approved
                price sits over it. That relationship explains the product much
                faster than two unrelated screenshots side by side. */}
            <div className="relative lg:pb-10">
              {SHOTS.adminServices ? (
                <div className="overflow-hidden rounded-[10px] border border-p2b-line bg-white shadow-[0_2px_8px_rgba(16,24,40,.05),0_26px_64px_-28px_rgba(16,24,40,.28)]">
                  <div className="flex items-center gap-2.5 border-b border-p2b-navy-line bg-p2b-navy-deep px-3.5 py-2.5">
                    <span className="text-[12px] font-bold text-[#F4F6F9] lg:text-[13px]">Price2Book</span>
                    <span className="rounded-full bg-white/[0.14] px-2.5 py-0.5 text-[11px] font-semibold text-[#F4F6F9]">
                      Voltmark Electric
                    </span>
                    <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-[0.09em] text-p2b-navy-muted sm:text-[10px]">
                      What you control
                    </span>
                  </div>
                  <div className="h-[285px] overflow-hidden sm:h-[360px] lg:h-[500px] xl:h-[535px]">
                    <ShotFigure
                      src={SHOTS.adminServices.full ?? SHOTS.adminServices.src}
                      alt={SHOTS.adminServices.alt}
                      width={SHOTS.adminServices.fullW ?? SHOTS.adminServices.w}
                      height={SHOTS.adminServices.fullH ?? SHOTS.adminServices.h}
                      full={SHOTS.adminServices.full}
                      fullWidth={SHOTS.adminServices.fullW}
                      fullHeight={SHOTS.adminServices.fullH}
                      className="rounded-none border-0 shadow-none hover:shadow-none"
                      sizes="(min-width: 1024px) 650px, 100vw"
                    />
                  </div>
                </div>
              ) : null}

              {SHOTS.homePrice ? (
                <div className="mt-4 overflow-hidden rounded-[10px] border border-p2b-line bg-white shadow-[0_4px_14px_rgba(16,24,40,.10),0_30px_62px_-22px_rgba(16,24,40,.34)] lg:absolute lg:-bottom-1 lg:left-0 lg:mt-0 lg:w-[62%]">
                  <div className="flex items-center gap-2.5 border-b border-p2b-line bg-p2b-canvas-alt px-3 py-2">
                    <span className="flex gap-1.5" aria-hidden="true">
                      <span className="h-2 w-2 rounded-full bg-p2b-line-dash" />
                      <span className="h-2 w-2 rounded-full bg-p2b-line-dash" />
                      <span className="h-2 w-2 rounded-full bg-p2b-line-dash" />
                    </span>
                    <span className="ml-0.5 flex-1 truncate rounded-sm bg-white px-2.5 py-1 text-[10px] text-p2b-muted sm:text-[11px]">
                      {CUSTOMER_URL}
                    </span>
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-p2b-accent sm:text-[10px]">
                      Your customer
                    </span>
                  </div>
                  <ShotFigure
                    src={SHOTS.homePrice.src}
                    alt={SHOTS.homePrice.alt}
                    width={SHOTS.homePrice.w}
                    height={SHOTS.homePrice.h}
                    full={SHOTS.homePrice.full}
                    fullWidth={SHOTS.homePrice.fullW}
                    fullHeight={SHOTS.homePrice.fullH}
                    className="rounded-none border-0 shadow-none hover:shadow-none"
                    priority
                    sizes="(min-width: 1024px) 390px, 100vw"
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 lg:mt-3">
              {["Instant Price", "Guided Estimate", "While We’re There™", "Smart Booking"].map((label) => (
                <span key={label} className="rounded-full border border-p2b-line bg-white px-3 py-1.5 text-[11px] font-semibold text-p2b-ink-warm sm:text-[12px]">
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-2.5 text-[13px] leading-5 text-p2b-muted">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-p2b-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Your page. <strong className="font-semibold text-p2b-ink">Every price and every window in it is one you set.</strong></span>
            </div>

            <p className="mt-2.5 text-[11px] leading-[1.55] text-p2b-muted-soft sm:text-[12px]">
              <span className="mr-2 rounded bg-p2b-accent-tint-strong px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.06em] text-p2b-accent sm:text-[10px]">
                {EMBED_STATUS.label}
              </span>
              {EMBED_STATUS.line}
            </p>
          </div>
        </div>

        {/* The rest of the value proposition comes after the product proof on
            mobile instead of delaying that proof. On desktop it works as a
            compact outcome rail under the two-column hero. */}
        <div className="mt-9 grid gap-3 border-t border-p2b-line pt-6 sm:grid-cols-3 lg:mt-10 lg:gap-5">
          {HERO.proof.slice(1).map((line, index) => (
            <div key={line} className="flex items-start gap-3 rounded-[9px] bg-white/55 px-3 py-2.5 sm:bg-transparent sm:px-0 sm:py-0">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-p2b-accent-tint text-[11px] font-bold text-p2b-accent">
                {index + 1}
              </span>
              <span className="text-[14px] font-semibold leading-5 text-p2b-ink sm:text-[15px]">{line}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-[17px] font-bold tracking-[-0.015em] text-p2b-ink sm:text-[19px]">{HERO.payoff}</p>
          <p className="text-[11px] text-p2b-muted-soft sm:text-[12px]">{HERO.footnote}</p>
        </div>
      </div>
    </section>
  );
}
