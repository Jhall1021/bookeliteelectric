import Link from "next/link";
import {
  BOUNDARY_LINE, CUSTOMER_URL, EMBED_STATUS, ESTIMATE_TRIPS, EVERYWHERE, JOURNEY, JOURNEY_NOTE,
  PRICING_MODES, SETUP_PROGRESSION, START_SMALL, TRADES, TRADE_SIGNAL,
} from "./content";
import { ELECTRICAL_TEMPLATE } from "./trades/electricalTemplate";

/**
 * The homepage's sections, after the restructure of 1 September 2026.
 *
 * THE HOMEPAGE ANSWERS "WHY CARE". It no longer answers "how does it work" —
 * six destinations do that now, and the sections that used to carry the full
 * argument are gone rather than collapsed behind accordions:
 *
 *   Rules            → /product/guided-pricing owns contractor control
 *   WhileWereThere   → /product/while-were-there owns the two-price mechanic
 *   KeepYourStack    → /integrations owns the boundary and the status matrix
 *   TradeFoundation  → /trades/electrical owns the catalog, /how-it-fits setup
 *   the full demo    → /demo owns the interactive experience
 *
 * What stayed is proof, not explanation. The hero still runs the real product,
 * the pricing-link section is still the idea the page exists to plant, and each
 * teaser below shows one real thing and then gets out of the way.
 *
 * A TEASER IS NOT A SUMMARY. Each one shows a genuine artifact — a real
 * question, a real price pair — because a homepage that only makes claims and
 * links elsewhere has moved its credibility off-page along with its detail.
 */

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

function Arrow({ className = "h-3.5 w-3.5 shrink-0" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#A8A296" strokeWidth="2" strokeLinecap="round"
         strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** The read-more affordance every teaser ends on. */
function More({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}
          className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

/**
 * The breadth signal, near the top and read from the checked source.
 *
 * A plumber who lands on an electrical demonstration concludes this is an
 * electrical product. The fix is structural, not a sentence — but the sentence
 * has to be honest too, so the statuses come from TRADES rather than from copy,
 * and only Electrical is a link because only Electrical has a page.
 */
export function TradeSignal() {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-9 lg:py-11">
      <div className={`${SHELL} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10`}>
        <h2 className="max-w-[24ch] text-[20px] font-bold leading-[1.25] tracking-[-0.022em] lg:text-[24px]">
          {TRADE_SIGNAL}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          {TRADES.map((t, i) => (
            <div key={t.name} className="flex items-center gap-3">
              {t.href ? (
                <Link href={t.href} className="group flex items-baseline gap-2">
                  <span className="text-[17px] font-semibold text-p2b-ink group-hover:text-p2b-accent">
                    {t.name}
                  </span>
                  <span className="text-[13px] text-p2b-green-deep">{t.status}</span>
                </Link>
              ) : (
                <span className="flex items-baseline gap-2">
                  <span className="text-[17px] font-semibold text-p2b-faint">{t.name}</span>
                  <span className="text-[13px] text-p2b-muted-soft">{t.status}</span>
                </span>
              )}
              {i < TRADES.length - 1 && <span className="text-p2b-line-dash" aria-hidden="true">·</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Guided Pricing, as a teaser with one real question on it.
 *
 * The 97/0 proof, the route-action counts and the contractor-control argument
 * all live on the product page. What is left here is the promise and one
 * captured example — enough that the claim is not merely asserted.
 */

/**
 * Show prices. Send estimates. Or do both.
 *
 * THE SECOND ADOPTION AXIS, ON THE HOMEPAGE. StartSmall answers "how much of
 * my catalog?"; this answers "and how do those services hand someone a
 * number?" — a question the page used to answer by assumption, always with
 * "instantly, in public".
 *
 * DELIBERATELY NOT A PROGRESSION. No numbering, no basic/advanced framing, no
 * visual weight separating the three. A contractor who publishes nothing and
 * reviews every job is a full customer, and the layout has to say that before
 * the words get a chance to.
 *
 * Onsite Visit has no link because it is not a Price2Book feature — it is the
 * outcome where the product gets out of the way, and inventing a page for it
 * would be a capability claim about routing that nothing here needs.
 */
export function PricingModes() {
  return (
    <section id="pricing-modes" className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
      <div className={SHELL}>
        <h2 className="max-w-[22ch] text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[44px]">
          Show prices. Send estimates. Or do both.
        </h2>
        <p className="mt-5 max-w-[74ch] text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
          {START_SMALL.publishing}
        </p>

        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {PRICING_MODES.map((m) => (
            <div key={m.name} className="flex flex-col rounded-[3px] border border-p2b-line bg-white px-6 py-6">
              <div className="text-[17px] font-semibold text-p2b-ink lg:text-[18px]">{m.name}</div>
              <div className="mt-2 text-[15px] leading-[1.45] text-p2b-muted-soft">{m.forWhat}</div>
              <p className="mt-4 flex-1 text-[15px] leading-[1.55] text-p2b-ink-warm lg:text-base">{m.body}</p>
              {m.note ? (
                <p className="mt-4 border-l-2 border-p2b-accent pl-4 text-[15px] font-semibold leading-[1.5] text-p2b-ink">
                  {m.note}
                </p>
              ) : null}
              {m.href ? (
                <Link href={m.href} className="mt-5 inline-flex text-[15px] font-semibold text-p2b-accent">
                  How it works →
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        <p className="mt-8 text-[18px] font-semibold leading-[1.4] tracking-[-0.01em] text-p2b-ink lg:text-[20px]">
          You decide which services work which way.
        </p>
      </div>
    </section>
  );
}

/**
 * How much of your business goes in — with just enough catalog to prove it.
 *
 * REPLACES TWO SECTIONS. StartSmall argued "you can start with ten services";
 * CatalogGrid argued "we know real service work" with a thirteen-tile
 * photograph grid. They were adjacent halves of one adoption story, and the
 * grid alone was costing roughly a screen and a half of height to prove a
 * point a single counted sentence proves.
 *
 * THE BREADTH IS STILL COUNTED, NOT CLAIMED. The numbers come from the
 * captured template, so they move when the catalog moves. /trades/electrical
 * owns the depth; this owns the fact that depth exists.
 */
export function Adoption() {
  const T = ELECTRICAL_TEMPLATE;
  return (
    <section id="start-small" className={`${SHELL} py-14 lg:py-[72px]`}>
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              {START_SMALL.eyebrow}
            </span>
          </div>
          <h2 className="max-w-[20ch] text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[42px]">
            Start with ten services — or take it as far as you want.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
            {START_SMALL.lead}
          </p>
          <div className="mt-6 flex flex-col gap-2 border-l-2 border-p2b-line-dash pl-5">
            {START_SMALL.calls.slice(0, 3).map((c) => (
              <p key={c} className="text-[16px] italic leading-[1.5] text-p2b-muted">“{c}”</p>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="grid gap-4">
            {START_SMALL.split.map((x) => (
              <div key={x.tag}
                   className={`rounded-[3px] border bg-white px-6 py-5 ${
                     x.tone === "accent" ? "border-p2b-accent-line border-l-[3px] border-l-p2b-accent" : "border-p2b-line"}`}>
                <div className={`text-[11px] font-bold uppercase tracking-[0.06em] ${
                  x.tone === "accent" ? "text-p2b-accent" : "text-p2b-muted-soft"}`}>
                  {x.tag}
                </div>
                <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-ink-warm lg:text-base">{x.body}</p>
              </div>
            ))}
          </div>

          {/* The catalog, as one counted line instead of a photograph grid. */}
          <p className="mt-6 text-[16px] leading-[1.6] text-p2b-ink-warm lg:text-[17px]">
            Electrical contractors start from a canonical catalog of{" "}
            <strong className="font-semibold text-p2b-ink">{T.categoryCount} categories</strong> and{" "}
            <strong className="font-semibold text-p2b-ink">{T.serviceCount} services</strong>, already
            carrying the questions that change each job. Rename it, reprice it, hide what you don’t do.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/trades/electrical" className="text-[15px] font-semibold text-p2b-accent">
              See the Electrical catalog →
            </Link>
            <Link href="/how-it-fits" className="text-[15px] font-semibold text-p2b-accent">
              See how Price2Book fits your business →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One product-proof band, where three sections used to be.
 *
 * Pillars summarized the mechanisms, then Guided Pricing and While We're
 * There™ each got a full section repeating the summary with evidence. That
 * made sense when the homepage was the only place the argument could be made.
 * It stopped making sense the moment those pages shipped, and the homepage
 * kept carrying them anyway.
 *
 * THE DEEP PROOF DELIBERATELY IS NOT HERE. The 97-answers-and-none-priced
 * count belongs to /product/guided-pricing; the real price pair belongs to
 * /product/while-were-there; duration and capacity belong to
 * /product/online-booking. Those pages exist precisely so this band can sell
 * the idea and hand off the explanation.
 */
export function ProductProof() {
  return (
    <section className="border-t border-p2b-line py-14 lg:py-[72px]">
      <div className={SHELL}>
        <h2 className="max-w-[24ch] text-[28px] font-bold leading-[1.14] tracking-[-0.022em] lg:text-[38px]">
          Built for the work between the phone call and the truck roll.
        </h2>
        {/* The approved Pillars line. The section it titled is gone; the
            sentence is too good to lose, and it says what the three blocks
            below do in one breath. */}
        <p className="mt-4 max-w-[70ch] text-[17px] leading-[1.6] text-p2b-ink-warm">
          Give customers a price. Give them a time. Make the visit worth more.
        </p>
        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {[
            { name: "Guided Pricing", href: "/product/guided-pricing", cta: "Learn about Guided Pricing",
              line: "Price clear work. Route the rest correctly." },
            { name: "While We’re There™", href: "/product/while-were-there", cta: "See While We’re There",
              line: "Price additional work for the visit you’re already making." },
            { name: "Online Booking", href: "/product/online-booking", cta: "See Online Booking",
              line: "Show the appointment times that actually fit the work." },
          ].map((f) => (
            <div key={f.name} className="flex flex-col rounded-[3px] border border-p2b-line bg-white px-6 py-6">
              <div className="text-[17px] font-semibold text-p2b-ink lg:text-[18px]">{f.name}</div>
              <p className="mt-3 flex-1 text-[16px] leading-[1.5] text-p2b-ink-warm">{f.line}</p>
              <Link href={f.href} className="mt-5 inline-flex text-[15px] font-semibold text-p2b-accent">
                {f.cta} →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Fewer estimate trips — the commercial payoff, not another mechanism page.
 *
 * WAS TWO TALL COLUMNS of seven and four bulleted steps, which read as a
 * process diagram and cost about a screen. The argument never needed the
 * ceremony: two lines, arrowed, make the same point faster.
 *
 * THE TARGET STAYS NARROW. Not site visits — the drive whose only purpose was
 * collecting what the homeowner could have sent. And no percentage, because
 * nobody has measured one; verify-marketing-homepage fails the build on it.
 */
export function EstimateTrips() {
  return (
    <section id="estimate-trips" className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
      <div className={SHELL}>
        <h2 className="max-w-[26ch] text-[30px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[44px]">
          {ESTIMATE_TRIPS.headline}
        </h2>
        <p className="mt-6 max-w-[74ch] text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
          {ESTIMATE_TRIPS.lead}
        </p>

        <div className="mt-9 flex flex-col gap-5">
          {[ESTIMATE_TRIPS.before, ESTIMATE_TRIPS.after].map((seq, i) => (
            <div key={seq.label}
                 className={`rounded-[3px] border bg-white px-6 py-5 ${
                   i === 1 ? "border-p2b-accent-line border-l-[3px] border-l-p2b-accent" : "border-p2b-line"}`}>
              <div className={`text-[11px] font-bold uppercase tracking-[0.06em] ${
                i === 1 ? "text-p2b-accent" : "text-p2b-muted-soft"}`}>
                {seq.label}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
                {seq.steps.map((step, n) => (
                  <div key={step} className="flex items-center gap-2.5">
                    <span className={`text-[15px] ${i === 1 ? "text-p2b-ink" : "text-p2b-muted"}`}>{step}</span>
                    {n < seq.steps.length - 1 && <Arrow className="h-3 w-3 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-7 max-w-[74ch] text-[16px] leading-[1.6] text-p2b-muted">
          {ESTIMATE_TRIPS.caveat}
        </p>
        <Link href="/product/guided-estimates" className="mt-5 inline-flex text-[16px] font-semibold text-p2b-accent">
          How Guided Estimates works →
        </Link>
      </div>
    </section>
  );
}

export function NotYourCRM() {
  return (
    <section className={`${SHELL} py-14 lg:py-[72px]`}>
      <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
        <div className="lg:col-span-6">
          <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[38px]">
            Add Price2Book without rebuilding your business.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
            Keep the software you already use. Price2Book handles the pricing-and-booking
            experience. {BOUNDARY_LINE.split(". ")[1]}
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/integrations" className="text-[15px] font-semibold text-p2b-accent">
              Integrations →
            </Link>
            <Link href="/how-it-fits" className="text-[15px] font-semibold text-p2b-accent">
              How It Fits →
            </Link>
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="rounded-[3px] border border-p2b-line bg-white px-7 py-6">
            <h3 className="text-[19px] font-bold leading-[1.2]">Setup is a conversation, not a form.</h3>
            <p className="mt-3 text-[16px] leading-[1.6] text-p2b-muted">
              Start from the trade knowledge, tell Price2Book how you actually work, review what
              would become bookable, and approve it. Nothing goes live because a template contains
              it.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
              {SETUP_PROGRESSION.map((step, i) => (
                <div key={step} className="flex items-center gap-2.5">
                  <span className="text-[14px] text-p2b-ink-warm">{step}</span>
                  {i < SETUP_PROGRESSION.length - 1 && <Arrow className="h-3 w-3 shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The demo entry point, replacing the demo itself.
 *
 * The hero already proved the product runs. This is the invitation, and the
 * four-word spine so a visitor knows what they would be walking into.
 */
export function DemoCta() {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
      <div className={`${SHELL} grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12`}>
        <div className="lg:col-span-6">
          <h2 className="max-w-[20ch] text-[28px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[38px]">
            This is what your customer does.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
            {JOURNEY_NOTE}
          </p>
        </div>
        <div className="lg:col-span-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {JOURNEY.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <span className="rounded-sm border border-p2b-line bg-white px-3.5 py-2 text-[14px] font-medium text-p2b-ink-warm">
                  {step}
                </span>
                {i < JOURNEY.length - 1 && <Arrow />}
              </div>
            ))}
          </div>
          <Link href="/demo"
                className="mt-6 inline-block rounded-sm border border-p2b-ink px-[26px] py-3.5 text-[15px] font-medium text-p2b-ink hover:border-p2b-accent hover:text-p2b-accent">
            Try the Homeowner Demo <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * The four steps, as four words above the demonstration that performs them.
 *
 * The written journey used to be its own section of numbered cards, and it
 * described an experience the page could simply run. What survives is the
 * spine — choose, answer, price, book — because the demo card below is a
 * product surface and a reader deserves to know what they are about to watch.
 */
export function JourneyIntro() {
  return (
    <div className={`${SHELL} pt-14 lg:pt-16`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <div>
          <div className="mb-4 flex items-center gap-2.5">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              The homeowner experience
            </span>
          </div>
          <h2 className="text-[28px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[38px]">
            This is what your customer does.
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:pb-1.5">
          {JOURNEY.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <span className="rounded-sm border border-p2b-line bg-white px-3.5 py-2 text-[14px] font-medium text-p2b-ink-warm">
                {step}
              </span>
              {i < JOURNEY.length - 1 && <Arrow />}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-5 max-w-[86ch] text-[15px] leading-[1.6] text-p2b-muted lg:text-base">
        {JOURNEY_NOTE}
      </p>
    </div>
  );
}

/**
 * "One pricing engine. Everywhere customers find you."
 *
 * The section the shortening pass bought room for. It is deliberately not an
 * icon grid: one link in the middle, the places it can go around it, and a
 * reader who gets the idea before they finish reading the headline.
 *
 * The forward-looking half is labeled as forward-looking. Service-specific
 * links are the intended next step and are not something a contractor can
 * paste into an ad today.
 */
export function Everywhere() {
  return (
    <section id="everywhere" className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center`}>
        <div className="lg:col-span-5">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              Your pricing link
            </span>
          </div>
          <h2 className="text-[30px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[42px]">
            {EVERYWHERE.headline}
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm lg:mt-6 lg:text-lg">
            {EVERYWHERE.body}
          </p>
          <div className="mt-6 border-l-[3px] border-p2b-line pl-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
              {EVERYWHERE.directionLabel}
            </div>
            <p className="mt-1.5 text-[15px] leading-[1.55] text-p2b-muted">{EVERYWHERE.direction}</p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-[3px] border border-p2b-line bg-white px-5 py-8 lg:px-10 lg:py-10">
            <div className="mx-auto flex max-w-[420px] items-center gap-3 rounded-sm border-[1.5px] border-p2b-accent bg-p2b-accent-tint px-4 py-3.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1B4B8F" strokeWidth="1.8" strokeLinecap="round"
                   strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
              </svg>
              <span className="truncate text-[15px] font-semibold text-p2b-accent lg:text-base">
                {CUSTOMER_URL}
              </span>
            </div>

            <div className="mx-auto mt-1 h-6 w-px bg-p2b-line-dash" />

            <div className="flex flex-wrap justify-center gap-2.5">
              {EVERYWHERE.channels.map((c) => (
                <span key={c}
                      className="rounded-sm border border-p2b-line bg-p2b-surface-warm px-3.5 py-2 text-[14px] text-p2b-ink-warm">
                  {c}
                </span>
              ))}
            </div>

            <p className="mt-7 text-center text-[14px] leading-[1.55] text-p2b-muted">
              The same page, everywhere. Change a price once and every one of these is already
              pointing at the new one.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

