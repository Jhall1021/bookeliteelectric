import {
  GUIDED_PRICING_BULLETS, GUIDED_PRICING_TREE, INTEGRATIONS, OUTCOMES, PILLARS,
  PRICE_BREAKDOWN, PROOF_METRICS, SETUP_PROGRESSION, SETUP_STAGES, SHIPS_WITH_SERVICE,
  STEPS, WINDOWS, WWT_ADDONS,
} from "./content";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

/** Tag colouring shared by Guided Pricing actions and the four outcomes. */
const TONE: Record<string, string> = {
  go: "bg-p2b-green-tint text-p2b-green-deep",
  accent: "bg-p2b-accent-tint-strong text-p2b-accent",
  review: "bg-p2b-amber-tint text-p2b-amber-ink",
  neutral: "bg-[#F0F0EC] text-p2b-muted",
};

function Check({ stroke = "#1B4B8F", className = "h-[15px] w-[15px]" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round"
         strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function Pillars() {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[78px]">
      <div className={SHELL}>
        <h2 className="max-w-[30ch] text-[28px] font-bold leading-[1.2] tracking-[-0.022em] lg:text-4xl">
          Give customers a price. Give them a time. Make the visit worth more.
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3 lg:mt-11">
          {PILLARS.map((p) => (
            <div key={p.title}
                 className={`rounded-[3px] border border-p2b-line border-t-[3px] bg-white px-[26px] pb-[30px] pt-7 ${
                   p.tone === "green" ? "border-t-p2b-green" : "border-t-p2b-accent"}`}>
              <div className={`text-[21px] font-bold ${p.tone === "green" ? "text-p2b-green" : "text-p2b-accent"}`}>
                {p.title}
              </div>
              <p className="mt-3.5 text-base leading-[1.55] text-p2b-ink-warm">{p.lead}</p>
              <p className="mt-3 text-[15px] leading-[1.55] text-p2b-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Journey() {
  return (
    <section id="how" className={`${SHELL} py-16 lg:py-[84px]`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted lg:text-xs">
        What the homeowner does
      </p>
      <h2 className="mt-4 max-w-[24ch] text-[30px] font-bold leading-[1.2] tracking-[-0.022em] lg:mt-[18px] lg:text-[40px]">
        Four steps, and none of them is a phone call.
      </h2>
      <div className="mt-9 grid gap-6 sm:grid-cols-2 lg:mt-[46px] lg:grid-cols-4 lg:gap-[22px]">
        {STEPS.map((s) => (
          <div key={s.n} className="border-t-2 border-p2b-accent pt-5">
            <div className="text-[13px] font-bold text-p2b-accent">{s.n}</div>
            <div className="mt-3 text-[19px] font-semibold">{s.title}</div>
            <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-muted">{s.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-[17px] text-p2b-ink-warm lg:mt-10">
        The price they see is a price <span className="font-semibold">you approved</span>. The window they
        choose is a window <span className="font-semibold">you opened</span>.
      </p>
    </section>
  );
}

export function WhileWereThere() {
  return (
    <section id="wwt" className="border-t border-p2b-green-line bg-p2b-green-tint py-16 lg:py-[84px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-start`}>
        <div className="lg:col-span-5">
          <div className="mb-5 flex items-center gap-2.5 lg:mb-[22px]">
            <div className="h-0.5 w-[26px] bg-p2b-green" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-green-deep lg:text-xs">
              While We’re There™
            </span>
          </div>
          <h2 className="text-[36px] font-bold leading-[1.06] tracking-[-0.022em] text-p2b-green-ink lg:text-[50px]">
            One trip.
            <br />
            More done.
          </h2>
          <p className="mt-6 text-[17px] leading-[1.6] text-[#2C3A32] lg:mt-[26px] lg:text-lg">
            Once a customer books their primary service, Price2Book can show additional work at your
            approved same-visit price.
          </p>
          <div className="mt-7 flex flex-col gap-4 lg:mt-[30px]">
            <div className="border-l-2 border-p2b-green pl-4">
              <div className="text-[15px] font-semibold text-p2b-green-ink">For the homeowner</div>
              <p className="mt-1 text-[15px] leading-[1.5] text-[#3F4E45]">
                Get more done during the same visit, for less.
              </p>
            </div>
            <div className="border-l-2 border-p2b-green pl-4">
              <div className="text-[15px] font-semibold text-p2b-green-ink">For the contractor</div>
              <p className="mt-1 text-[15px] leading-[1.5] text-[#3F4E45]">
                Make a visit you’re already sending a technician to worth more.
              </p>
            </div>
          </div>
          {/* The handoff is explicit that this is not a discount engine and not
              "upselling" — the sentence below is the whole reason the section
              is allowed to talk about price at all. */}
          <p className="mt-7 text-[15px] leading-[1.55] text-[#4A5951]">
            Same-visit pricing reflects the incremental labour, materials and direct costs once the trip
            and setup are already covered — not an arbitrary percentage off.
          </p>
        </div>

        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
            <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-6 py-3.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
                Your visit
              </span>
            </div>
            <div className="flex items-center justify-between px-6 py-[22px]">
              <span className="text-[17px] font-semibold">Install New Ceiling Fan</span>
              <span className="text-[26px] font-bold">$375</span>
            </div>
          </div>
          <div className="mt-3.5 overflow-hidden rounded-[3px] border-[1.5px] border-p2b-green bg-white">
            <div className="bg-p2b-green px-6 py-4 text-white">
              <div className="text-[15px] font-bold">While We’re There™</div>
              <div className="mt-0.5 text-sm text-[#D2E7DB]">Since we’re already coming out, you can add:</div>
            </div>
            {WWT_ADDONS.map((a) => (
              <div key={a.name}
                   className="flex items-center justify-between gap-4 border-b border-[#EEF3F0] px-6 py-[18px] last:border-0">
                <span className="text-[15px] lg:text-base">{a.name}</span>
                <div className="flex items-center gap-3 lg:gap-[18px]">
                  <span className="text-[17px] font-bold text-p2b-green-deep">{a.price}</span>
                  <span className="rounded-sm border-[1.5px] border-p2b-green px-5 py-2 text-sm font-semibold text-p2b-green-deep">
                    Add
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function GuidedPricing() {
  return (
    <section id="guided" className={`${SHELL} py-16 lg:pb-20 lg:pt-[88px]`}>
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="mb-5 flex items-center gap-2.5 lg:mb-[22px]">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              Guided Pricing
            </span>
          </div>
          <h2 className="text-[32px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[46px]">
            Ask the questions that change the price.
          </h2>
          <p className="mt-6 text-[17px] leading-[1.6] text-p2b-ink-warm lg:mt-[26px] lg:text-lg">
            You already know which questions you ask before giving someone a price. Price2Book lets you
            build that conversation into your website.
          </p>
          <div className="mt-7 flex flex-col gap-2.5 lg:mt-7">
            {GUIDED_PRICING_BULLETS.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <Check />
                <span className="text-[15px] text-p2b-ink-warm lg:text-base">{b}</span>
              </div>
            ))}
          </div>
          <p className="mt-7 text-[17px] font-semibold leading-[1.55] lg:mt-[30px]">
            Your expertise, turned into a customer experience.
          </p>
          <p className="mt-3 text-[15px] leading-[1.55] text-p2b-muted">
            Price2Book doesn’t start with a booking form. It starts by understanding the job.
          </p>
        </div>

        <div className="rounded-[3px] border border-p2b-line bg-white px-5 pb-8 pt-7 lg:col-span-7 lg:px-8 lg:pb-[34px] lg:pt-[30px]">
          <div className="text-base font-bold">Replace Ceiling Fixture</div>
          {GUIDED_PRICING_TREE.map((t) => (
            <div key={t.q} className="mt-5">
              <div className="ml-[11px] h-4 w-px bg-p2b-line-dash" />
              <div className="mt-2 rounded-[3px] border border-p2b-accent-line bg-[#F7F9FC] px-[18px] py-4">
                <div className="text-[15px] font-semibold">{t.q}</div>
                <div className="mt-3 flex flex-col gap-2">
                  {t.answers.map((a) => (
                    <div key={a.label} className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="min-w-[140px] rounded-sm border border-p2b-line bg-white px-[11px] py-[5px] text-sm">
                        {a.label}
                      </span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A8A296"
                           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                      <span className={`rounded-sm px-[11px] py-[5px] text-[13px] font-semibold ${TONE[a.tone]}`}>
                        {a.action}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Outcomes() {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-16 lg:py-20">
      <div className={SHELL}>
        <h2 className="text-[30px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[40px]">
          You decide what happens next.
        </h2>
        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:mt-11 lg:grid-cols-4">
          {OUTCOMES.map((o) => (
            <div key={o.tag}
                 className="flex flex-col rounded-[3px] border border-p2b-line bg-white px-[22px] pb-7 pt-[26px]">
              <div className={`self-start rounded-sm px-[11px] py-[5px] text-[11px] font-bold uppercase tracking-[0.05em] ${TONE[o.tone]}`}>
                {o.tag}
              </div>
              <div className="mt-4 text-lg font-semibold leading-[1.3]">{o.title}</div>
              <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-muted">{o.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-[74ch] text-[17px] text-p2b-ink-warm lg:mt-9">
          Price2Book doesn’t force every job through the same funnel. You choose the right path service
          by service.
        </p>
      </div>
    </section>
  );
}

export function PricingControl() {
  return (
    <section className={`${SHELL} py-16 lg:pb-20 lg:pt-[88px]`}>
      <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-6">
          <h2 className="text-[32px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[46px]">
            Your labour.
            <br />
            Your materials.
            <br />
            Your rules.
          </h2>
          {/* The distinction below is a correctness constraint from
              POSITIONING.md: nothing here may imply that changing a labour
              rate silently republishes live homeowner prices. */}
          <div className="mt-8 border-l-[3px] border-p2b-accent bg-p2b-accent-tint px-6 py-[22px]">
            <div className="text-[21px] font-bold text-p2b-accent">Price2Book can suggest. You approve.</div>
            <p className="mt-3 text-base leading-[1.6] text-p2b-ink-warm">
              Change your pricing inputs and Price2Book can recalculate suggested prices. You review and
              approve every published change.
            </p>
          </div>
          <p className="mt-6 text-[15px] leading-[1.6] text-p2b-muted">
            A suggested price and a published price are never the same thing until you say so.
          </p>
        </div>

        <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white lg:col-span-6">
          <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-6 py-4 text-[15px] font-semibold">
            Replace Existing Ceiling Fan
          </div>
          {PRICE_BREAKDOWN.map((b) => (
            <div key={b.k}
                 className="flex items-center justify-between gap-4 border-b border-p2b-line-soft px-6 py-[15px]">
              <span className="text-[15px] text-p2b-ink-warm">{b.k}</span>
              <span className="text-right text-[14px] text-p2b-muted lg:text-[15px]">{b.v}</span>
            </div>
          ))}
          <div className="flex items-center justify-between bg-p2b-accent-tint px-6 py-5">
            <span className="text-[15px] font-semibold text-p2b-accent">Suggested Price</span>
            <span className="text-2xl font-bold text-p2b-accent">$375</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-p2b-line px-6 py-[18px]">
            <span className="text-[15px] font-semibold">Published Price</span>
            <div className="flex items-center gap-3.5">
              <span className="text-xl font-bold">$375</span>
              <span className="rounded-sm bg-p2b-ink px-3.5 py-1.5 text-[13px] font-semibold text-p2b-canvas">
                Approved by you
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Scheduling() {
  return (
    <section className="border-t border-p2b-line py-16 lg:py-20">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center`}>
        <div className="rounded-[3px] border border-p2b-line bg-white px-6 py-7 lg:col-span-7 lg:px-[30px] lg:py-7">
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
            Thursday
          </span>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:mt-[18px]">
            {WINDOWS.map((w) => (
              <div key={w.time}
                   className={`rounded-sm border p-4 ${
                     w.open ? "border-[#CFE3D8] bg-[#F3F9F5]" : "border-p2b-line bg-p2b-surface-warm"}`}>
                <div className={`text-[15px] font-semibold ${w.open ? "text-p2b-ink" : "text-p2b-faint"}`}>
                  {w.time}
                </div>
                <div className={`mt-2 text-[13px] ${w.open ? "text-p2b-green-deep" : "text-p2b-faint"}`}>
                  {w.note}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5">
          <h2 className="text-[30px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[44px]">
            You decide what can be booked.
          </h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm lg:mt-6 lg:text-lg">
            A price isn’t permission to put anything anywhere on your calendar. You choose your working
            hours, bookable services, eligible crews and available windows.
          </p>
          <p className="mt-4 text-[15px] leading-[1.6] text-p2b-muted lg:mt-[18px] lg:text-base">
            Nobody should be able to book a four-hour job when there are only two hours left in the day.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Status pill colouring. "Coming Soon" is deliberately the quietest. */
const STATUS_STYLE: Record<string, string> = {
  Available: "bg-p2b-green-deep text-p2b-green-tint",
  "Built In": "bg-p2b-accent text-p2b-accent-tint-strong",
  "Coming Soon": "bg-p2b-navy-line text-p2b-navy-soft",
};

export function Integrations() {
  return (
    <section id="integrations" className="bg-p2b-navy py-16 text-[#F4F6F9] lg:py-[84px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-start`}>
        <div className="lg:col-span-5">
          <h2 className="text-[32px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[46px]">
            Keep the software you already use.
          </h2>
          <p className="mt-6 text-[17px] leading-[1.6] text-p2b-navy-text lg:mt-[26px] lg:text-lg">
            Price2Book is the pricing and booking layer in front of your business — not a replacement for
            the systems behind it.
          </p>
          <p className="mt-5 text-[15px] leading-[1.6] text-p2b-navy-text lg:text-base">
            Already running on a field-service platform? Keep it. Running lean on a calendar? That works
            too. Not using scheduling software at all? Use ours.
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:col-span-7">
          {INTEGRATIONS.map((i) => (
            <div key={i.name}
                 className="flex items-center justify-between gap-4 rounded-[3px] border border-p2b-navy-line bg-p2b-navy-card px-6 py-5">
              <div>
                <div className="text-[16px] font-semibold lg:text-[17px]">{i.name}</div>
                <div className="mt-1 text-[13px] text-p2b-navy-soft lg:text-sm">{i.body}</div>
              </div>
              <span className={`shrink-0 rounded-sm px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] lg:text-xs ${STATUS_STYLE[i.status]}`}>
                {i.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ElectricalFirst() {
  return (
    <section className={`${SHELL} py-16 lg:py-[84px]`}>
      <div className="flex items-center gap-2.5">
        <div className="h-0.5 w-[26px] bg-p2b-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
          Electrical first
        </span>
      </div>
      <div className="mt-6 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <h2 className="text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[44px]">
            Start with real trade knowledge — not an empty booking form.
          </h2>
          <p className="mt-6 text-[17px] leading-[1.6] text-p2b-ink-warm lg:mt-[26px] lg:text-lg">
            Price2Book starts with residential electrical service structure already built: common
            services, Guided Pricing questions, material roles, routing rules, and the situations that
            shouldn’t receive an automatic price.
          </p>
          <div className="mt-7 border-l-[3px] border-p2b-accent bg-p2b-accent-tint px-[22px] py-5">
            <p className="text-base leading-[1.6]">
              You don’t inherit another contractor’s prices. You apply{" "}
              <span className="font-semibold">your economics and your policies</span> to the underlying
              trade knowledge.
            </p>
          </div>
          {/* Deliberately no exact count — POSITIONING.md forbids advertising
              a number that will change. */}
          <p className="mt-6 text-[15px] text-p2b-muted lg:text-base">
            Dozens of residential electrical services, with the questions and materials behind each one.
          </p>
        </div>
        <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white lg:col-span-6">
          <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-6 py-[15px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
              What ships with a service
            </span>
          </div>
          {SHIPS_WITH_SERVICE.map((s) => (
            <div key={s.t} className="flex items-start gap-3.5 border-b border-p2b-line-soft px-6 py-[17px] last:border-0">
              <Check stroke="#2E7D5B" className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="text-[15px] font-semibold">{s.t}</div>
                <div className="mt-1 text-sm text-p2b-muted">{s.b}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GuidedSetup() {
  return (
    <section className={`${SHELL} py-16 lg:py-[84px]`}>
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="mb-5 flex items-center gap-2.5 lg:mb-[22px]">
            <div className="h-0.5 w-[26px] bg-p2b-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
              Guided Setup
            </span>
          </div>
          <h2 className="text-[32px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[46px]">
            Setup is a conversation, not a form.
          </h2>
          <p className="mt-6 text-[17px] leading-[1.6] text-p2b-ink-warm lg:mt-[26px] lg:text-lg">
            Answer a few questions about how you work and what you charge. Price2Book builds your
            starting setup from there.
          </p>
          <p className="mt-5 text-[15px] leading-[1.6] text-p2b-muted lg:text-base">
            You don’t get handed a stack of blank services and told to figure it out.
          </p>
        </div>
        <div className="lg:col-span-7">
          <div className="flex flex-col">
            {SETUP_STAGES.map((u) => (
              <div key={u.n} className="flex flex-col gap-2 border-b border-p2b-line py-6 sm:flex-row sm:gap-[26px]">
                <div className="w-[30px] shrink-0 text-sm font-bold text-p2b-accent">{u.n}</div>
                <div className="shrink-0 text-[17px] font-semibold sm:w-[230px] lg:text-lg">{u.title}</div>
                <p className="text-[15px] leading-[1.55] text-p2b-muted lg:text-base">{u.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {SETUP_PROGRESSION.map((g) => (
              <span key={g}
                    className="rounded-sm border border-p2b-accent-line bg-[#F7F9FC] px-3.5 py-2 text-sm text-p2b-ink-warm">
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Proof() {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-start`}>
        <div className="lg:col-span-5">
          <h2 className="text-[26px] font-bold leading-[1.2] tracking-[-0.022em] lg:text-[32px]">
            Proof, once there is proof.
          </h2>
          <p className="mt-5 text-[15px] leading-[1.6] text-p2b-muted lg:text-base">
            Price2Book is being run on a working electrical business first. When pilot contractors have
            numbers worth showing, these are what we’ll show.
          </p>
        </div>
        {/* Empty on purpose. Fabricating a number here would be the single
            easiest way to make the rest of this page untrustworthy. */}
        <div className="grid grid-cols-2 gap-3.5 lg:col-span-7 lg:grid-cols-3">
          {PROOF_METRICS.map((m) => (
            <div key={m} className="rounded-[3px] border border-dashed border-p2b-line-dash bg-white px-[18px] pb-5 pt-[18px]">
              <div className="text-[22px] font-bold text-[#C4BEB1]" aria-hidden="true">[ ]</div>
              <div className="mt-2 text-sm leading-[1.4] text-p2b-muted">{m}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
