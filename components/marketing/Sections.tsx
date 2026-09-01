import Image from "next/image";
import {
  BOUNDARY_LINE, CUSTOMER_URL, EVERYWHERE, INTEGRATIONS, JOURNEY, JOURNEY_NOTE,
  OUTCOMES, PILLARS, PRICE_BREAKDOWN, PRICE_CHAIN, SETUP_PROGRESSION, START_SMALL, WINDOWS,
  WWT, WWT_EXAMPLE,
} from "./content";
import { SHOTS } from "./shots";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

/** Tag coloring shared by the four outcomes and the pillar strip. */
const TONE: Record<string, string> = {
  go: "bg-p2b-green-tint text-p2b-green-deep",
  accent: "bg-p2b-accent-tint-strong text-p2b-accent",
  review: "bg-p2b-amber-tint text-p2b-amber-ink",
  neutral: "bg-[#F0F0EC] text-p2b-muted",
};

function Arrow({ className = "h-3.5 w-3.5 shrink-0" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#A8A296" strokeWidth="2" strokeLinecap="round"
         strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * The three pillars, as a strip.
 *
 * These were three long explanatory sections plus a fourth, full-width
 * While We're There™ section with its own add-on mock-up. The mock-up went
 * because the homeowner demonstration performs the same thing with prices the
 * engine produced, and three invented add-on prices sitting a screen above a
 * live one is the page arguing with itself.
 *
 * The While We're There™ card keeps the green treatment and the approved
 * brand line, and it no longer promises the capability unconditionally — the
 * product only advertises same-visit pricing where a contractor has set one,
 * and the marketing page now says the same thing.
 */
export function Pillars() {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-12 lg:py-14">
      <div className={SHELL}>
        <h2 className="max-w-[34ch] text-[24px] font-bold leading-[1.2] tracking-[-0.022em] lg:text-[30px]">
          Give customers a price. Give them a time. Make the visit worth more.
        </h2>
        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title}
                 className={`rounded-[3px] border border-p2b-line border-t-[3px] bg-white px-[22px] pb-6 pt-5 ${
                   p.tone === "green" ? "border-t-p2b-green" : "border-t-p2b-accent"}`}>
              <div className={`text-[18px] font-bold ${p.tone === "green" ? "text-p2b-green" : "text-p2b-accent"}`}>
                {p.title}
              </div>
              <p className="mt-2.5 text-[15px] font-medium leading-[1.5] text-p2b-ink-warm">{p.lead}</p>
              <p className="mt-2 text-[14px] leading-[1.5] text-p2b-muted">{p.body}</p>
            </div>
          ))}
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
 * While We're There™ — how the second price actually works.
 *
 * The shortening pass folded this into a pillar card, and the owner was
 * right that it lost too much: "one trip, more done" is a slogan, and the
 * thing a contractor needs to understand is that a same-visit price is a
 * SECOND price they set, on the services they choose, offered only where it
 * fits. That is four sentences, not a section of atmosphere.
 *
 * The contractor card here is the one that used to sit in the hero. It works
 * now because it has something to be an example of: two services, the price
 * each carries, and the offer the homeowner gets as a result.
 *
 * The green treatment is the approved palette for same-visit and positive
 * states, and the brand line is unchanged.
 */
export function WhileWereThere() {
  return (
    <section id="wwt" className="border-t border-p2b-green-line bg-p2b-green-tint py-14 lg:py-[72px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-12`}>
        <div className="lg:col-span-5">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="h-0.5 w-[26px] bg-p2b-green" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-green-deep lg:text-xs">
              {WWT.eyebrow}
            </span>
          </div>
          <h2 className="text-[32px] font-bold leading-[1.06] tracking-[-0.022em] text-p2b-green-ink lg:text-[44px]">
            {WWT.headline[0]}
            <br />
            {WWT.headline[1]}
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-[#2C3A32] lg:mt-6 lg:text-lg">
            {WWT.lead}
          </p>

          <div className="mt-7 flex flex-col gap-4">
            {WWT.mechanic.map((m) => (
              <div key={m.t} className="border-l-2 border-p2b-green pl-4">
                <div className="text-[15px] font-semibold text-p2b-green-ink">{m.t}</div>
                <p className="mt-1 text-[15px] leading-[1.5] text-[#3F4E45]">{m.b}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-green-deep">
                For the homeowner
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-[#3F4E45]">{WWT.forHomeowner}</p>
            </div>
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-green-deep">
                For the contractor
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-[#3F4E45]">{WWT.forContractor}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-7">
          {/* What you set. The card from the hero, with both services on it —
              the one being booked and the one being offered alongside. */}
          <div className="overflow-hidden rounded-[3px] border border-p2b-accent-line bg-[#F2F5FA]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-p2b-accent-line bg-p2b-accent-tint-strong px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent">
                Contractor · what you set
              </span>
              {/* An unlabeled price reads as a price the platform sets, which
                  is the opposite of what this section claims. */}
              <span className="text-[11px] font-medium text-p2b-muted">Example setup</span>
            </div>
            <div className="grid gap-x-8 sm:grid-cols-2">
              {WWT_EXAMPLE.set.map((s, i) => (
                <div key={s.service}
                     className={`px-5 pb-4 pt-4 ${i === 0 ? "border-b border-[#E4EAF3] sm:border-b-0 sm:border-r" : ""}`}>
                  <div className="text-[15px] font-semibold">{s.service}</div>
                  <div className={`mb-2.5 mt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                    i === 1 ? "text-p2b-green-deep" : "text-p2b-muted-soft"}`}>
                    {s.note}
                  </div>
                  {s.rows.map((row) => (
                    <div key={row.k}
                         className="flex justify-between gap-4 border-b border-[#E4EAF3] py-2 text-sm last:border-0">
                      <span className="text-p2b-muted">{row.k}</span>
                      {/* "Not set" is a real state, not a blank: a service with
                          no same-visit price can only be the main job. It is
                          styled as absence rather than as a value. */}
                      <span className={`shrink-0 font-semibold ${
                        row.tone === "green" ? "text-p2b-green-deep"
                        : row.tone === "muted" ? "font-normal text-p2b-faint" : "text-p2b-ink"}`}>
                        {row.v}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="border-t border-[#E4EAF3] px-5 py-3 text-[13px] leading-[1.5] text-p2b-muted">
              {WWT_EXAMPLE.readAcross}
            </p>
          </div>

          <div className="flex items-center gap-2.5 pl-1">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F5B41" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
            <span className="text-sm text-[#3F4E45]">
              <span className="font-semibold text-p2b-green-ink">You set this</span> → your customer is
              offered this.
            </span>
          </div>

          {/* What they see. */}
          <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
            <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
                Homeowner · the visit they booked
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[16px] font-semibold">{WWT_EXAMPLE.primary.name}</span>
              <span className="text-[22px] font-bold">{WWT_EXAMPLE.primary.price}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-[3px] border-[1.5px] border-p2b-green bg-white">
            <div className="bg-p2b-green px-5 py-3.5 text-white">
              <div className="text-[15px] font-bold">While We’re There™</div>
              <div className="mt-0.5 text-sm text-[#D2E7DB]">Since we’re already coming out, you can add:</div>
            </div>
            {/* The storefront's own treatment, not a marketing one: the
                same-visit figure in the positive color, the standalone price
                struck through beside it, and the words that say which is
                which. See app/[site]/services/[category]/page.tsx. */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="text-[15px] lg:text-base">{WWT_EXAMPLE.addOn.name}</span>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-baseline justify-end gap-2">
                    <span className="text-[17px] font-bold text-p2b-green-deep">{WWT_EXAMPLE.addOn.price}</span>
                    <span className="text-[13px] text-p2b-muted line-through">{WWT_EXAMPLE.addOn.alone}</span>
                  </div>
                  <div className="text-[12px] text-p2b-muted">while we’re there</div>
                </div>
                <span className="rounded-sm border-[1.5px] border-p2b-green px-5 py-1.5 text-sm font-semibold text-p2b-green-deep">
                  Add
                </span>
              </div>
            </div>
            <div className="flex items-baseline justify-between border-t border-p2b-line-soft bg-p2b-green-tint px-5 py-3">
              <span className="text-[14px] font-semibold text-p2b-green-ink">Visit total</span>
              <span className="text-lg font-bold text-p2b-green-ink">{WWT_EXAMPLE.total}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
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
 * "Your pricing. Your rules." — every control claim, said once.
 *
 * MERGED, NOT CUT. This section replaces five that each proved the same
 * thing from a different angle: what can be priced, what can be booked,
 * labor and materials, the four outcomes, and Guided Pricing. Their approved
 * headlines survive as the subheads here, which is the point of merging
 * rather than deleting — "shorten this" is an instruction about length, never
 * a license to lose the sentences somebody chose.
 *
 * The correctness constraint from POSITIONING.md is unchanged and lives in
 * the accent panel: nothing may imply that changing a labor rate silently
 * republishes live homeowner prices.
 */
export function Rules() {
  const shot = SHOTS.guidedPricing;
  return (
    <section id="rules" className={`${SHELL} py-14 lg:py-[72px]`}>
      <h2 className="max-w-[22ch] text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[44px]">
        Your pricing. Your rules.
      </h2>
      <p className="mt-5 max-w-[70ch] text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
        You decide what goes live. Price2Book works from the services you turn on, your labor and
        material costs and your policies — and nothing reaches a homeowner until you approve it.
      </p>

      {/* Services → questions → your economics → suggestion → approval →
          published. The whole argument, in one line the eye can follow. */}
      <div className="mt-8 flex flex-wrap items-center gap-x-2.5 gap-y-2.5 lg:mt-10">
        {PRICE_CHAIN.map((link, i) => (
          <div key={link} className="flex items-center gap-2.5">
            <span className={`rounded-sm px-3.5 py-2 text-[14px] ${
              i === PRICE_CHAIN.length - 1
                ? "bg-p2b-accent font-semibold text-p2b-canvas"
                : "border border-p2b-line bg-white text-p2b-ink-warm"}`}>
              {link}
            </span>
            {i < PRICE_CHAIN.length - 1 && <Arrow />}
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-2 lg:gap-12">
        <div>
          <h3 className="text-[21px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[26px]">
            Your labor. Your materials. Your rules.
          </h3>

          <div className="mt-5 border-l-[3px] border-p2b-accent bg-p2b-accent-tint px-5 py-5">
            <div className="text-[18px] font-bold text-p2b-accent lg:text-[20px]">
              Price2Book can suggest. You approve.
            </div>
            {/* A correctness constraint from POSITIONING.md: nothing here may
                imply that changing a labor rate silently republishes live
                homeowner prices. */}
            <p className="mt-2.5 text-[15px] leading-[1.6] text-p2b-ink-warm">
              Change your pricing inputs and Price2Book recalculates a suggestion. A suggested
              price and a published price are never the same thing until you say so.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-[3px] border border-p2b-line bg-white">
            <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-5 py-3 text-[14px] font-semibold">
              New 120V Outlet
            </div>
            {PRICE_BREAKDOWN.map((b) => (
              <div key={b.k} className="flex items-center justify-between gap-4 border-b border-p2b-line-soft px-5 py-2.5">
                <span className="text-[14px] text-p2b-ink-warm">{b.k}</span>
                <span className="text-right text-[13px] text-p2b-muted">{b.v}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-p2b-accent-tint px-5 py-3">
              <span className="text-[14px] font-semibold text-p2b-accent">Suggested</span>
              <span className="text-xl font-bold text-p2b-accent">$280</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-p2b-line px-5 py-3">
              <span className="text-[14px] font-semibold">Published</span>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">$280</span>
                <span className="rounded-sm bg-p2b-ink px-3 py-1 text-[12px] font-semibold text-p2b-canvas">
                  Approved by you
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[21px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[26px]">
            You decide what can be booked.
          </h3>

          <p className="mt-5 text-[16px] leading-[1.6] text-p2b-ink-warm lg:text-[17px]">
            A price isn’t permission to put anything anywhere on your calendar. You choose which
            services are offered and bookable at all, and availability reflects your hours, eligible
            crews and how long the job actually takes.
          </p>
          <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
            Nobody should be able to book a four-hour job when there are only two hours left in
            the day.
          </p>

          <div className="mt-6 rounded-[3px] border border-p2b-line bg-white px-5 py-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
              Thursday
            </span>
            <div className="mt-3.5 grid gap-3 sm:grid-cols-3">
              {WINDOWS.map((w) => (
                <div key={w.time}
                     className={`rounded-sm border p-3.5 ${
                       w.open ? "border-[#CFE3D8] bg-[#F3F9F5]" : "border-p2b-line bg-p2b-surface-warm"}`}>
                  <div className={`text-[15px] font-semibold ${w.open ? "text-p2b-ink" : "text-p2b-faint"}`}>
                    {w.time}
                  </div>
                  <div className={`mt-1.5 text-[13px] ${w.open ? "text-p2b-green-deep" : "text-p2b-faint"}`}>
                    {w.note}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-11 grid gap-9 border-t border-p2b-line pt-10 lg:mt-14 lg:grid-cols-12 lg:gap-12 lg:pt-12">
        <div className="lg:col-span-5">
          <h3 className="text-[21px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[26px]">
            You decide what happens next.
          </h3>
          <p className="mt-4 text-[15px] leading-[1.6] text-p2b-muted lg:text-base">
            Service by service, an answer can release a price, ask for the photos you need, hold the
            price until you have looked, or go to a quote you write yourself.
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            {OUTCOMES.map((o) => (
              <div key={o.tag} className="flex flex-wrap items-center gap-3">
                <span className={`w-[118px] shrink-0 rounded-sm px-2.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.05em] ${TONE[o.tone]}`}>
                  {o.tag}
                </span>
                <span className="text-[15px] text-p2b-ink-warm">{o.body}</span>
              </div>
            ))}
          </div>
        </div>

        {/* The real editor, not a drawing of one. Guided Pricing is the part
            of the product a contractor is most likely to disbelieve, so the
            page shows the screen instead of describing it. */}
        {shot && (
          <figure className="lg:col-span-7">
            <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
              <Image
                src={shot.src} alt={shot.alt} width={shot.w} height={shot.h}
                sizes="(min-width: 1024px) 720px, 100vw" className="w-full"
              />
            </div>
            <figcaption className="mt-3 text-sm text-p2b-muted">
              The Guided Pricing editor: your questions, your answers, and what each answer does.
              Shown with a demonstration contractor.
            </figcaption>
          </figure>
        )}
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
 * recognises their own week in them faster than they read a claim about it.
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

/** Status pill coloring. "Coming Soon" is deliberately the quietest. */
const STATUS_STYLE: Record<string, string> = {
  Available: "bg-p2b-green-deep text-p2b-green-tint",
  "Built In": "bg-p2b-accent text-p2b-accent-tint-strong",
  "Coming Soon": "bg-p2b-navy-line text-p2b-navy-soft",
};

/**
 * "Keep the software you already use." — the boundary, the integrations and
 * the trade template, in one section.
 *
 * The page used to say "we are not replacing your CRM" in four places: an
 * integrations section, a boundary table, two operating-mode cards and an FAQ
 * answer. It is one sentence now, and it is the first thing in the section
 * that names the platforms.
 *
 * INTEGRATION STATUS IS CHECKED, NOT WRITTEN. See content.ts and
 * scripts/verify-marketing-homepage.ts.
 */
export function KeepYourStack() {
  return (
    <section id="integrations" className="bg-p2b-navy py-14 text-[#F4F6F9] lg:py-[72px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-start`}>
        <div className="lg:col-span-5">
          <h2 className="text-[30px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[42px]">
            Keep the software you already use.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-navy-text lg:mt-6 lg:text-lg">
            Keep your website. Keep running your business where you already run it. Price2Book sits
            between the homeowner and the workflow you have.
          </p>
          <p className="mt-4 text-[15px] leading-[1.6] text-p2b-navy-text lg:text-base">
            {BOUNDARY_LINE}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
          {INTEGRATIONS.map((i) => (
            <div key={i.name}
                 className="flex items-start justify-between gap-3 rounded-[3px] border border-p2b-navy-line bg-p2b-navy-card px-5 py-4">
              <div>
                <div className="text-[15px] font-semibold lg:text-[16px]">{i.name}</div>
                <div className="mt-1 text-[13px] leading-[1.45] text-p2b-navy-soft">{i.body}</div>
              </div>
              <span className={`mt-0.5 shrink-0 rounded-sm px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] lg:text-[11px] ${STATUS_STYLE[i.status]}`}>
                {i.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Why this is not a form builder, and what setup is.
 *
 * Two sections became one short one. The electrical template is the thing a
 * competitor cannot fake and it earns its paragraph; Guided Setup is a
 * progression, not a four-screen essay, so it is shown as one.
 *
 * Deliberately no exact service or category count — POSITIONING.md forbids
 * advertising a number that will change.
 */
export function TradeFoundation() {
  return (
    <section className={`${SHELL} py-14 lg:py-[72px]`}>
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              Electrical first
            </span>
          </div>
          <h2 className="text-[28px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[38px]">
            Start with real trade knowledge — not an empty booking form.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
            Price2Book starts with residential electrical service structure already built: the
            services homeowners call about, the questions that change the job, material roles,
            routing rules, and the situations that shouldn’t receive an automatic price.
          </p>
          <p className="mt-4 text-[15px] text-p2b-muted lg:text-base">
            Dozens of residential electrical services, with the questions and materials behind each
            one. You don’t inherit another contractor’s prices — you apply{" "}
            <span className="font-semibold text-p2b-ink-warm">your economics and your policies</span>{" "}
            to the trade knowledge underneath.
          </p>
        </div>

        <div className="lg:col-span-6">
          <div className="rounded-[3px] border border-p2b-line bg-white px-6 py-6 lg:px-8 lg:py-7">
            <h3 className="text-[19px] font-bold leading-[1.2] tracking-[-0.022em] lg:text-[22px]">
              Setup is a conversation, not a form.
            </h3>
            <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted lg:text-base">
              You answer questions about how you work and what you charge. Price2Book builds a
              starting catalog from the trade template, and you review the services, the suggested
              prices and the customer experience before any of it goes live.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              {SETUP_PROGRESSION.map((g, i) => (
                <div key={g} className="flex items-center gap-3">
                  <span className="w-[22px] shrink-0 text-[13px] font-bold text-p2b-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[15px] text-p2b-ink-warm">{g}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
