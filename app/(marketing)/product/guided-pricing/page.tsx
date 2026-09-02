import type { Metadata } from "next";
import Link from "next/link";
import GuidedQuestionCard, { routeAction } from "@/components/marketing/GuidedQuestionCard";
import { ELECTRICAL_TEMPLATE } from "@/components/marketing/trades/electricalTemplate";

/**
 * /product/guided-pricing — SITEMAP.md, the first Product page.
 *
 * ITS JOB IS NARROW, ON PURPOSE: convince a skeptical contractor that online
 * pricing does not require trusting homeowners to diagnose their own jobs.
 * That is the objection that stops the sale, and a page that also explains
 * booking, the editor and the catalog would bury it.
 *
 * THE ARGUMENT IS COUNTED, NOT ASSERTED.
 *
 * The strongest thing this page can say is not a sentence — it is that the
 * electrical template ships 97 answers reading "I'm not sure", and that not
 * one of them resolves to a price. A contractor who believes that believes
 * the rest of the page. So the number comes from the capture, and if it ever
 * stops being true the gate fails rather than the page quietly lying.
 *
 * The same discipline covers the outcome vocabulary. The page shows the
 * RouteAction values that appear on real answers, with the count of answers
 * using each — rather than a marketing taxonomy the product is then asked to
 * fit. Notice what that produces: 193 answers ask to look before pricing
 * against 75 that price. The restraint is not a claim about the product, it
 * is a measurement of it.
 *
 * NOT A PAGE ABOUT THE EDITOR. A contractor cares what happens to their
 * customer and whether the result is safe, not what the decision-tree UI looks
 * like. The editor appears once, low, as supporting proof.
 */
export const metadata: Metadata = {
  title: "Guided Pricing — price the jobs that are clear, route the ones that aren’t",
  description:
    "Price2Book asks homeowners observable questions about the work, not technical questions they shouldn’t be expected to answer. Their answers decide whether a job can receive an approved price, belongs to a different service, needs troubleshooting, or should come to the contractor to price.",
  alternates: { canonical: "/product/guided-pricing" },
};

export const dynamic = "force-dynamic";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

const T = ELECTRICAL_TEMPLATE;

/** The outcome vocabulary, ordered by how often the template actually uses it. */
const OUTCOMES = Object.entries(T.routing as Record<string, number>)
  .sort((a, b) => b[1] - a[1]);

const PRICING_ANSWERS = (T.routing.RESOLVE_INSTANT ?? 0) + (T.routing.RESOLVE_ADJUSTED ?? 0);

export default function GuidedPricingPage() {
  return (
    <main>
      <section className={`${SHELL} pb-10 pt-12 lg:pb-12 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
            Guided Pricing
          </span>
        </div>
        <h1 className="max-w-[20ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] lg:text-[64px]">
          Price the jobs that are clear. Route the ones that aren’t.
        </h1>
        <p className="mt-6 max-w-[70ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          Price2Book asks homeowners observable questions about the work — not technical questions
          they shouldn’t be expected to answer. Their answers decide whether the job can receive an
          approved price, belongs to a different service, needs troubleshooting, or should come to
          you to price.
        </p>
        <p className="mt-5 max-w-[70ch] text-[16px] leading-[1.6] text-p2b-muted">
          This page is about the first of those. When you would rather review the work yourself
          before anyone sees a number,{" "}
          <Link href="/product/guided-estimates" className="font-semibold text-p2b-accent">
            Guided Estimates
          </Link>{" "}
          is the same guided flow ending in your review instead of a published price — a sibling of
          this, not a fallback from it.
        </p>
      </section>

      {/* 1. What it does — and the number that settles the objection. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-6">
            <h2 className="max-w-[24ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Nobody is asked to diagnose their own house.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              The questions establish <span className="font-semibold">scope</span> — what is already
              there, how far it is, what it is going to power. Things a homeowner can look at and
              answer. They never ask what is wrong electrically, because that is the job you are
              being paid to determine.
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-p2b-muted">
              And when a homeowner doesn’t know, saying so is an answer. Every tree carries the
              escape hatch, and it is never a shortcut to a price.
            </p>
          </div>
          <div className="lg:col-span-6">
            <div className="rounded-[3px] border border-p2b-line bg-white px-7 py-8 lg:px-9 lg:py-10">
              <div className="text-[52px] font-bold leading-none tracking-[-0.03em] text-p2b-accent lg:text-[64px]">
                {T.unsure.total}
              </div>
              <p className="mt-3 text-[17px] leading-[1.5] text-p2b-ink-warm">
                answers in the electrical template read <span className="font-semibold">“I’m not sure”</span>.
              </p>
              <div className="my-6 h-px bg-p2b-line" />
              <div className="text-[52px] font-bold leading-none tracking-[-0.03em] text-p2b-green-deep lg:text-[64px]">
                {T.unsure.pricedAutomatically}
              </div>
              <p className="mt-3 text-[17px] leading-[1.5] text-p2b-ink-warm">
                of them resolve to a price. Not one.
              </p>
              <p className="mt-6 text-[13px] leading-[1.5] text-p2b-muted-soft">
                Counted from the canonical electrical template, and re-counted on every build.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. One question, three outcomes — real, and chosen by shape. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              One question can change the outcome.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              This is a real question from the electrical template, and the three things its answers
              do are the whole idea. The same service prices instantly for one customer, becomes a
              different job for the second, and waits for a photograph for the third.
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-p2b-muted">
              None of those outcomes is a guess, and none of them asks the homeowner to know
              anything they can’t see from where they are standing.
            </p>
          </div>
          <div className="lg:col-span-7">
            <GuidedQuestionCard example={T.example} />
          </div>
        </div>
      </section>

      {/* 3. The outcome vocabulary — measured, not invented. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={SHELL}>
          <h2 className="max-w-[26ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
            Not every path ends in a price.
          </h2>
          <p className="mt-4 max-w-[76ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
            You decide what happens next. These are the things an answer is allowed to do, with the
            number of answers in the electrical template that do each. It is worth reading the first two numbers together:
            more answers ask to look at the job than release a price.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3">
            {OUTCOMES.map(([action, count]) => {
              const a = routeAction(action);
              return (
                <div key={action} className="rounded-[3px] border border-p2b-line bg-white px-5 py-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`rounded-sm px-3 py-1 text-[12px] font-semibold ${a.tone}`}>
                      {a.label}
                    </span>
                    <span className="text-[22px] font-bold tracking-[-0.02em] text-p2b-ink">{count}</span>
                  </div>
                  <p className="mt-3 text-[15px] leading-[1.55] text-p2b-muted">{a.means}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-7 max-w-[76ch] text-[16px] leading-[1.6] text-p2b-ink-warm lg:text-[17px]">
            {PRICING_ANSWERS} answers release a price. {T.routing.PHOTO_REVIEW} ask for a look first.
            That ratio is not a policy anyone wrote on this page — it is what the trade template
            does, counted.
          </p>
        </div>
      </section>

      {/* 4. Contractor control — owned here, once. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Your pricing. Your rules.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              The template brings the trade structure. What any of it costs, and whether a customer
              ever sees it, is yours. Your labor. Your materials. Your rules.
            </p>
            <p className="mt-4 text-[19px] font-bold leading-[1.3] text-p2b-accent lg:text-[21px]">
              Price2Book can suggest. You approve.
            </p>
          </div>
          <div className="flex flex-col gap-3.5 lg:col-span-7">
            {[
              {
                t: "A suggested price is not a published one",
                b: "Price2Book calculates from your rates, materials and policies. Nothing reaches a homeowner until you approve it, and changing an input does not silently republish what is already live.",
              },
              {
                t: "You choose which services are on at all",
                b: "A service you have not turned on isn’t on your storefront, can’t be priced and can’t be booked. Start with ten; the rest of the catalog waits.",
              },
              {
                t: "You choose where known work ends",
                b: "Service by service, an answer can release a price, ask for photos, hold the price until you have looked, or go to a quote you write yourself.",
              },
              {
                t: "The questions are yours to change",
                b: "Edit the prompt, the answers, and what each answer does. The trade template is a starting point, not a rule about how you run your business.",
              },
            ].map((c) => (
              <div key={c.t} className="rounded-[3px] border border-p2b-line border-l-[3px] border-l-p2b-accent bg-white px-6 py-5">
                <div className="text-[17px] font-semibold">{c.t}</div>
                <p className="mt-2 text-[15px] leading-[1.55] text-p2b-muted lg:text-base">{c.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Out to the trade page, which proves the breadth. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-6">
            <h2 className="max-w-[20ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[36px]">
              See it in a real trade.
            </h2>
            <p className="mt-4 text-[17px] leading-[1.6] text-p2b-ink-warm">
              This page explains the mechanism. The trade pages show how much of a trade it has
              actually been used to model — every category, every service, and which of them
              Price2Book refuses to price automatically.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-6">
            <Link href="/trades/electrical"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                Price2Book for Electricians <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                {T.categories.length} categories of residential electrical work, and what each
                service does when a homeowner answers.
              </p>
            </Link>
            <Link href="/#demo"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                Try it as a homeowner <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                Walk a real service to a real price, and see what happens when you answer
                “I’m not sure”.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
