import Image from "next/image";
import Link from "next/link";
import { formatCents } from "@/lib/flow-types";
import {
  BOUNDARY_LINE, CUSTOMER_URL, EMBED_STATUS, EVERYWHERE, JOURNEY, JOURNEY_NOTE, PILLARS,
  SETUP_PROGRESSION, START_SMALL, TRADES, TRADE_SIGNAL,
} from "./content";
import { HERO_FLOW } from "./heroFlow";
import { ELECTRICAL_TEMPLATE } from "./trades/electricalTemplate";
import GuidedQuestionCard from "./GuidedQuestionCard";

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
 * The three outcomes, as a strip that points at its own destinations.
 *
 * Each pillar used to expand into a section. Now each is three lines and a
 * link, because the page that owns it can say it properly and this one only
 * has to make a contractor want to know.
 */
export function Pillars() {
  return (
    <section className={`${SHELL} py-12 lg:py-14`}>
      <h2 className="max-w-[34ch] text-[24px] font-bold leading-[1.2] tracking-[-0.022em] lg:text-[30px]">
        Give customers a price. Give them a time. Make the visit worth more.
      </h2>
      <div className="mt-7 grid gap-5 md:grid-cols-3">
        {PILLARS.map((p) => (
          <Link key={p.title} href={p.href}
                className={`group rounded-[3px] border border-p2b-line border-t-[3px] bg-white px-[22px] pb-6 pt-5 hover:border-p2b-accent ${
                  p.tone === "green" ? "border-t-p2b-green" : "border-t-p2b-accent"}`}>
            <div className={`text-[18px] font-bold ${p.tone === "green" ? "text-p2b-green" : "text-p2b-accent"}`}>
              {p.title} <span aria-hidden="true" className="opacity-0 transition group-hover:opacity-100">→</span>
            </div>
            <p className="mt-2.5 text-[15px] font-medium leading-[1.5] text-p2b-ink-warm">{p.lead}</p>
            <p className="mt-2 text-[14px] leading-[1.5] text-p2b-muted">{p.body}</p>
          </Link>
        ))}
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
export function GuidedPricingTeaser() {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
        <div className="lg:col-span-5">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              Guided Pricing
            </span>
          </div>
          <h2 className="max-w-[20ch] text-[28px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[38px]">
            Price the jobs that are clear. Route the ones that aren’t.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
            Homeowners answer what they can see. Their answers decide whether the job gets your
            approved price, needs a photograph first, or belongs somewhere else entirely — and
            nobody is asked to work out what is wrong with their own house.
          </p>
          <More href="/product/guided-pricing">How Guided Pricing works</More>
        </div>
        <div className="lg:col-span-7">
          <GuidedQuestionCard example={ELECTRICAL_TEMPLATE.example} />
        </div>
      </div>
    </section>
  );
}

/**
 * While We're There™, as one idea and one price pair.
 *
 * The seven-service ladder is the product page's argument. Here it is enough
 * to show that a second price exists and is lower for a reason.
 */
export function WhileWereThereTeaser() {
  const a = HERO_FLOW.addOn;
  return (
    <section className="border-t border-p2b-green-line bg-p2b-green-tint py-14 lg:py-[72px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
        <div className="lg:col-span-6">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="h-0.5 w-[26px] bg-p2b-green" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-green-deep lg:text-xs">
              While We’re There™
            </span>
          </div>
          <h2 className="max-w-[20ch] text-[28px] font-bold leading-[1.1] tracking-[-0.022em] text-p2b-green-ink lg:text-[40px]">
            Already going there? Price the extra work like it.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-[#2C3A32]">
            A service can carry a second price — what it costs added to a visit that is already
            happening. Not a discount: what the work costs once the trip and the setup are covered.
          </p>
          <More href="/product/while-were-there">How the second price works</More>
        </div>
        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
            <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-6 py-3.5 text-[14px] font-semibold">
              {a.name}
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-p2b-line-soft px-6 py-4">
              <span className="text-[15px] text-p2b-ink-warm">As a visit of its own</span>
              <span className="text-[20px] font-bold">{formatCents(a.standaloneCents ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 bg-p2b-green-tint px-6 py-4">
              <span className="text-[15px] font-semibold text-p2b-green-ink">While we’re there</span>
              <span className="text-[20px] font-bold text-p2b-green-deep">
                {formatCents(a.sameVisitCents ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The boundary, compressed to the sentence and a link.
 *
 * The status matrix left the homepage entirely. A contractor deciding whether
 * to keep their CRM does not need six status pills to answer that; they need
 * to be told Price2Book does not want the job.
 */
export function NotYourCRM() {
  return (
    <section className={`${SHELL} py-14 lg:py-[72px]`}>
      <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
        <div className="lg:col-span-6">
          <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[38px]">
            Keep the software you already use.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
            Price2Book handles the pricing-and-booking experience. {BOUNDARY_LINE.split(". ")[1]}
          </p>
          <More href="/integrations">What connects, and what’s planned</More>
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

/**
 * "You don't have to flat-rate your whole business."
 *
 * The adoption objection, answered before the page asks for anything. Every
 * other section argues about what the product does; this one is the only place
 * that says how much of a business has to change to get value from it, which
 * is the thing a contractor is actually weighing.
 *
 * The three quoted calls do the work of a paragraph. They are the calls that
 * repeat — two about price and one about scheduling — and a contractor
 * recognizes their own week in them faster than they read a claim about it.
 */
export function StartSmall() {
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
            {START_SMALL.headline}
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
            {START_SMALL.lead}
          </p>

          {/* The calls themselves. Quoted, because a contractor hears these in
              their own voice and does not need to be told they are expensive. */}
          <div className="mt-6 flex flex-col gap-2.5 border-l-2 border-p2b-line-dash pl-5">
            {START_SMALL.calls.map((c) => (
              <p key={c} className="text-[16px] italic leading-[1.5] text-p2b-muted lg:text-[17px]">
                “{c}”
              </p>
            ))}
          </div>

          <p className="mt-6 text-[16px] leading-[1.6] text-p2b-ink-warm lg:text-[17px]">
            {START_SMALL.after}
          </p>
        </div>

        <div className="lg:col-span-6">
          <div className="grid gap-4">
            {START_SMALL.split.map((s) => (
              <div key={s.tag}
                   className={`rounded-[3px] border bg-white px-6 py-5 ${
                     s.tone === "accent" ? "border-p2b-accent-line border-l-[3px] border-l-p2b-accent" : "border-p2b-line"}`}>
                <div className={`text-[11px] font-bold uppercase tracking-[0.06em] ${
                  s.tone === "accent" ? "text-p2b-accent" : "text-p2b-muted-soft"}`}>
                  {s.tag}
                </div>
                <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-ink-warm lg:text-base">{s.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[16px] leading-[1.6] text-p2b-ink-warm lg:text-[17px]">
            {START_SMALL.scale}
          </p>
          <p className="mt-4 text-[18px] font-semibold leading-[1.4] tracking-[-0.01em] lg:text-[20px]">
            {START_SMALL.close}
          </p>
        </div>
      </div>
    </section>
  );
}
