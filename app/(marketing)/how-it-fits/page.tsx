import type { Metadata } from "next";
import Link from "next/link";
import {
  ESTIMATE_TRIPS, PRICING_MODES, SETUP_PROGRESSION, START_SMALL,
} from "@/components/marketing/content";

/**
 * /how-it-fits — SITEMAP.md.
 *
 * ONE OBJECTION: do I have to change how I run my company to use this? No —
 * start with a handful of predictable services, or take it as far as you want.
 *
 * This is the canonical home of the selective-use idea. The homepage keeps the
 * short persuasive version and will point here once it is restructured; every
 * other surface links rather than re-argues.
 *
 * WHAT IT IS NOT, and each of these was a real temptation while writing it:
 * a second product overview, an explanation of Guided Pricing, an integration
 * matrix, a catalog of electrical services, or an onboarding manual. Product
 * pages explain mechanisms. Trade pages prove depth. This one explains
 * adoption, and it is short because adoption is a small idea that people
 * disbelieve for one reason — they think the answer is all or nothing.
 *
 * NEITHER PATH IS THE ADVANCED ONE. Ten services and a whole catalog are
 * presented as equally legitimate, deliberately: a contractor who reads
 * "start small" as the beginner tier will skip it and then not adopt at all.
 */
export const metadata: Metadata = {
  title: "How Price2Book fits — start with ten services, or your whole catalog",
  description:
    "You don’t have to flat-rate your whole business. Put the jobs that generate the same phone call online, leave estimates, troubleshooting and custom work exactly as they are, and add more whenever it makes sense.",
  alternates: { canonical: "/how-it-fits" },
};

export const dynamic = "force-dynamic";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

/**
 * The work that stays where it is.
 *
 * Named specifically rather than as "your bigger jobs", because a contractor
 * checks this list for the thing they are worried about — and not finding it
 * is what makes the reassurance land.
 *
 * "ESTIMATES AND SITE VISITS" USED TO BE ON THIS LIST, AND IT WAS WRONG.
 * It was written when the only things Price2Book could do with a job were
 * price it instantly or hand it back, so an estimate was outside by
 * definition. Guided Estimates ships, so estimates are now something the
 * product does. The honest line is no longer "estimates stay outside" but
 * the distinction the page draws below: a visit the work genuinely needs is
 * not the same thing as a drive that only happened because information was
 * missing.
 *
 * What remains true is that a contractor keeps anything off the storefront
 * by simply choosing to.
 */
const STAYS = [
  "Troubleshooting and diagnostics",
  "Renovations and remodels",
  "Custom and one-off work",
  "Larger projects",
  "Anything you’d rather handle yourself",
];

export default function HowItFitsPage() {
  return (
    <main>
      <section className={`${SHELL} pb-10 pt-12 lg:pb-12 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
            How it fits
          </span>
        </div>
        <h1 className="max-w-[19ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] lg:text-[64px]">
          {START_SMALL.headline}
        </h1>
        <p className="mt-6 max-w-[66ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          Price2Book can run as much — or as little — of your service work as you want, and you
          decide how each of those services hands a customer a number. You do not have to put your
          whole catalog online, and you do not have to publish your prices online.
        </p>
      </section>

      {/* 1. The calls, and what stays put. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:gap-12`}>
          <div className="lg:col-span-6">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Start with the calls you answer every day.
            </h2>
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
            <div className="rounded-[3px] border border-p2b-line bg-white px-6 py-6 lg:px-7">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-p2b-muted-soft">
                Stays exactly as it is
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {STAYS.map((s) => (
                  <li key={s} className="flex items-start gap-3">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-p2b-faint" />
                    <span className="text-[15px] leading-[1.45] text-p2b-ink-warm lg:text-base">{s}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[15px] leading-[1.55] text-p2b-muted">
                None of this has to go online for the rest to be worth doing. A service you haven’t
                turned on isn’t on your storefront, can’t be priced and can’t be booked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Two paths, neither of them the advanced one. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <h2 className="max-w-[24ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
          Ten services or your whole catalog.
        </h2>
        <p className="mt-4 max-w-[74ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
          Both are how the product is meant to be used. Neither is the beginner setting.
        </p>
        <div className="mt-8 grid gap-5 lg:mt-10 lg:grid-cols-2">
          <div className="rounded-[3px] border border-p2b-line border-t-[3px] border-t-p2b-accent bg-white px-7 py-6">
            <div className="text-[19px] font-bold text-p2b-accent">Start small</div>
            <p className="mt-3 text-[16px] leading-[1.6] text-p2b-ink-warm">
              A handful of repetitive, known-scope services — the ones you quote the same way every
              time and schedule the same way every time.
            </p>
            <p className="mt-3 text-[15px] leading-[1.55] text-p2b-muted">
              The office stops answering the same two questions. Nothing else about the week
              changes.
            </p>
          </div>
          <div className="rounded-[3px] border border-p2b-line border-t-[3px] border-t-p2b-green bg-white px-7 py-6">
            <div className="text-[19px] font-bold text-p2b-green">Go broad</div>
            <p className="mt-3 text-[16px] leading-[1.6] text-p2b-ink-warm">
              Most or all of your priceable catalog, with the work that shouldn’t be priced online
              routed the way you decide instead.
            </p>
            <p className="mt-3 text-[15px] leading-[1.55] text-p2b-muted">
              Customers price and book the bulk of your routine work themselves, and you keep the
              exceptions.
            </p>
          </div>
        </div>
        <p className="mt-7 max-w-[74ch] text-[17px] leading-[1.6] text-p2b-ink-warm">
          {START_SMALL.scale}
        </p>
      </section>

      {/* 2b. The SECOND axis. The page taught only the first until now. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={SHELL}>
          <h2 className="max-w-[24ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
            Show prices. Send estimates. Or do both.
          </h2>
          <p className="mt-4 max-w-[74ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
            How much of your catalog goes online is one decision. How those services hand a
            customer a number is a separate one — and none of these three is the advanced version
            of another.
          </p>

          <div className="mt-9 grid gap-5 lg:grid-cols-3">
            {PRICING_MODES.map((m) => (
              <div
                key={m.name}
                className="flex flex-col rounded-[3px] border border-p2b-line bg-white px-6 py-6"
              >
                <div className="text-[17px] font-semibold text-p2b-ink">{m.name}</div>
                <div className="mt-2 text-[15px] leading-[1.45] text-p2b-muted-soft">{m.forWhat}</div>
                <p className="mt-4 text-[15px] leading-[1.55] text-p2b-ink-warm lg:text-base">{m.body}</p>
                {m.note ? (
                  <p className="mt-4 border-l-2 border-p2b-accent pl-4 text-[15px] font-semibold leading-[1.5] text-p2b-ink">
                    {m.note}
                  </p>
                ) : null}
                {m.href ? (
                  <Link
                    href={m.href}
                    className="mt-5 inline-flex text-[15px] font-semibold text-p2b-accent"
                  >
                    How it works →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-[74ch] text-[16px] leading-[1.6] text-p2b-ink-warm">
            You choose service by service. Instant-price a handful and review everything else, run
            the whole catalog on estimates and publish no prices at all, or mix the three however
            the work divides.
          </p>
        </div>
      </section>

      {/* 2c. The estimate trip. A reason to care, not a feature note. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <h2 className="max-w-[26ch] text-[30px] font-bold leading-[1.1] tracking-[-0.022em] lg:text-[44px]">
          {ESTIMATE_TRIPS.headline}
        </h2>
        <p className="mt-6 max-w-[74ch] text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
          {ESTIMATE_TRIPS.lead}
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:gap-12">
          {[ESTIMATE_TRIPS.before, ESTIMATE_TRIPS.after].map((seq, i) => (
            <div key={seq.label}>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-p2b-muted-soft">
                {seq.label}
              </div>
              <ol className="mt-4 flex flex-col gap-0">
                {seq.steps.map((step, n) => (
                  <li key={step} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                          i === 1 ? "bg-p2b-accent" : "bg-p2b-faint"
                        }`}
                      />
                      {n < seq.steps.length - 1 ? (
                        <span className="w-px flex-1 bg-p2b-line-dash" />
                      ) : null}
                    </div>
                    <span
                      className={`pb-3 text-[16px] leading-[1.45] ${
                        i === 1 ? "text-p2b-ink" : "text-p2b-muted"
                      }`}
                    >
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-[74ch] border-l-2 border-p2b-line-dash pl-5 text-[16px] leading-[1.6] text-p2b-muted">
          {ESTIMATE_TRIPS.caveat}
        </p>
      </section>

      {/* 3. The governing line, in its home. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-6">
            <h2 className="max-w-[18ch] text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[42px]">
              {START_SMALL.close}
            </h2>
          </div>
          <div className="lg:col-span-6">
            <p className="text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
              Price2Book is a pricing and booking engine, not an operating model you have to adopt.
              You decide how much of your business goes into it, and you decide how customers get
              pricing once it is there. Publishing prices online is one way to use it, not the
              price of admission.
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-p2b-muted">
              It sits in front of the business you already run and handles one part of it: the
              part where a homeowner wants a price and a time without waiting for a phone call
              back.
            </p>
          </div>
        </div>
      </section>

      {/* 4. The stack stays. Briefly — Integrations owns the detail. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="lg:col-span-6">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Keep the systems you already use.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Price2Book handles pricing, qualification, availability and booking. Your CRM,
              invoicing, dispatch, payroll and job costing stay exactly where they are — it has no
              ambition to become any of them.
            </p>
            <Link href="/#integrations"
                  className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
              What connects, and what’s planned <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="lg:col-span-6">
            <div className="rounded-[3px] border border-p2b-line bg-white px-7 py-6">
              <p className="text-[16px] leading-[1.6] text-p2b-ink-warm">
                Booked work is handed to the system you already run. If you don’t run one, the
                Price2Book scheduler is built in — that is a choice, not a migration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Setup, as a philosophy rather than a manual. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:gap-12`}>
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Setup is a conversation, not a software project.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              You don’t get handed a stack of blank services and told to configure them. The trade
              knowledge is already there; what’s missing is how <em>you</em> work.
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-p2b-muted">
              And nothing goes live because a template happens to contain it. Every service you
              publish is one you decided to publish.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="flex flex-col">
              {SETUP_PROGRESSION.map((step, i) => (
                <div key={step}
                     className="flex items-baseline gap-5 border-b border-p2b-line py-4 last:border-0">
                  <span className="w-[26px] shrink-0 text-[13px] font-bold text-p2b-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[17px] text-p2b-ink-warm lg:text-lg">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Where to begin. */}
      <section className={`${SHELL} py-14 lg:py-[76px]`}>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="lg:col-span-6">
            <h2 className="max-w-[20ch] text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[40px]">
              Start with ten services. Add more when it makes sense.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Pick the work that creates the most repeated phone calls and scheduling
              back-and-forth. Put those online first. The rest of the catalog is there whenever you
              want it.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <a href="/#access"
                 className="rounded-sm bg-p2b-accent px-[30px] py-4 text-center text-base font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
                Request Early Access
              </a>
              <Link href="/#demo"
                    className="text-center text-[15px] font-medium text-p2b-ink hover:text-p2b-accent sm:text-base">
                Try the homeowner demo <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-6">
            <Link href="/trades/electrical"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                What could I turn on? <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                The electrical catalog, category by category — and which work Price2Book refuses to
                price automatically.
              </p>
            </Link>
            <Link href="/product/guided-pricing"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                What decides the price? <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                How a homeowner’s answers reach an approved price — or don’t.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
