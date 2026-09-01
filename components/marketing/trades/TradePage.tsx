import Link from "next/link";
import GuidedQuestionCard from "@/components/marketing/GuidedQuestionCard";

/**
 * The shared shape of every trade page — SITEMAP.md.
 *
 * A trade page has one job: prove how deeply Price2Book understands that
 * trade. It is not a product overview with different nouns, and it does not
 * re-explain Guided Pricing or While We're There™ from scratch; it shows one
 * real example of each and links to the page that owns the mechanism.
 *
 * ELECTRICAL ESTABLISHES THE GRAMMAR SO PLUMBING DOES NOT REDESIGN IT. Every
 * trade renders through here with captured data; the route files stay
 * explicit, one per trade, because a public trade page should be a deliberate
 * release artifact rather than something a dynamic segment can resolve into
 * existence before the trade is real.
 *
 * WHAT THIS COMPONENT WILL NOT ACCEPT
 *
 * A hand-written catalog. Everything below arrives captured, which is what
 * stops the marketing site maintaining a second, slowly diverging account of
 * what a trade supports.
 */

export type TradeService = {
  key: string;
  name: string;
  description: string | null;
  questions: number;
  resolution: "priced" | "priced_with_photos" | "reviewed" | "quoted";
};

export type TradeCategory = { slug: string; name: string; services: TradeService[] };

export type TradeExample = {
  service: string;
  prompt: string;
  helpText: string | null;
  options: { label: string; routeAction: string }[];
};

export type TradePageData = {
  /** "Price2Book for Electricians" — the SEO-facing form. */
  title: string;
  lead: string;
  categories: readonly TradeCategory[];
  example: TradeExample;
  counts: Record<string, number>;
};

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

/**
 * How a service resolves, in the homeowner's terms rather than the schema's.
 *
 * Derived from bookingType and photoState by the capture — see
 * scripts/capture-trade-electrical.ts. The legend is the counter-example the
 * sitemap requires: a page that showed only priceable work would imply
 * everything is priceable, which is false and is the opposite of what the
 * product is for.
 */
const RESOLUTION: Record<string, { label: string; dot: string; text: string; legend: string }> = {
  priced: {
    label: "Priced online",
    dot: "bg-p2b-green",
    text: "text-p2b-green-deep",
    // Not "a fixed price": the same template serves a flat-rate contractor
    // and one billing time and materials, and only the first of those ends in
    // a fixed number. What is true for both is that the route resolves online
    // without going to the office.
    legend: "The questions settle the scope online, and the job can be booked without a callback.",
  },
  priced_with_photos: {
    label: "Priced, photos help",
    dot: "bg-p2b-accent",
    text: "text-p2b-accent",
    legend: "The price is settled; photos are so the technician arrives prepared, not a condition of booking.",
  },
  reviewed: {
    label: "Reviewed first",
    dot: "bg-p2b-amber-ink",
    text: "text-p2b-amber-ink",
    legend: "Photos and answers go to the office, which issues the price before the customer books.",
  },
  quoted: {
    label: "Never auto-priced",
    dot: "bg-p2b-faint",
    text: "text-p2b-muted",
    legend: "Too variable to price sight-unseen. It collects information and goes to a quote or an on-site visit.",
  },
};

export default function TradePage({ data }: { data: TradePageData }) {
  const used = [...new Set(data.categories.flatMap((c) => c.services.map((s) => s.resolution)))];

  return (
    <main>
      {/* 1. The trade's own hero. */}
      <section className={`${SHELL} pb-10 pt-12 lg:pb-12 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
            Trades
          </span>
        </div>
        <h1 className="max-w-[18ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] lg:text-[64px]">
          {data.title}
        </h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          {data.lead}
        </p>
      </section>

      {/* 2–4. Breadth, what gets priced, and what does not — one artifact.
             Listing the services by name proves more than a count would, and
             the marker on each says how it resolves, so the honest half of the
             story is in the same view as the impressive half. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={SHELL}>
          <h2 className="max-w-[26ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
            Start with real trade knowledge — not an empty booking form.
          </h2>
          <p className="mt-4 max-w-[80ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
            Dozens of residential electrical services, and every one below ships with the questions that change its scope, the materials it
            consumes and the rules that decide whether it can be priced online at all. You supply
            the rates and policies; none of your economics are in here.
          </p>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
            {used.map((r) => (
              <span key={r} className="flex items-center gap-2 text-[13px] text-p2b-muted">
                <span className={`h-2 w-2 shrink-0 rounded-full ${RESOLUTION[r].dot}`} />
                {RESOLUTION[r].label}
              </span>
            ))}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3">
            {data.categories.map((c) => (
              <div key={c.slug} className="rounded-[3px] border border-p2b-line bg-white px-5 py-5">
                <div className="text-[16px] font-bold">{c.name}</div>
                <ul className="mt-3 flex flex-col gap-2">
                  {c.services.map((s) => (
                    <li key={s.key} className="flex items-start gap-2.5">
                      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${RESOLUTION[s.resolution].dot}`} />
                      <span className="text-[14px] leading-[1.45] text-p2b-ink-warm">{s.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 continued. The counter-example, stated rather than implied. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[36px]">
              Not every call should get an online price.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Known work can be priced. Unclear work can collect information, ask for photos, or
              route to an on-site visit instead — and the catalog decides which is which before a
              homeowner ever sees a number.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-7">
            {used.map((r) => (
              <div key={r} className="flex items-start gap-3.5 rounded-[3px] border border-p2b-line bg-white px-5 py-4">
                <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${RESOLUTION[r].dot}`} />
                <div>
                  <div className={`text-[15px] font-semibold ${RESOLUTION[r].text}`}>{RESOLUTION[r].label}</div>
                  <p className="mt-1 text-[15px] leading-[1.55] text-p2b-muted">{RESOLUTION[r].legend}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. One real Guided Pricing question, chosen for shape by the capture:
             the question whose answers do the most DIFFERENT things. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-12`}>
          <div className="lg:col-span-5">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="h-0.5 w-[26px] bg-p2b-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
                Guided Pricing
              </span>
            </div>
            <h2 className="text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[36px]">
              One question. Three different outcomes.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              A homeowner answers something they can see. What happens next is the contractor’s
              rule, not a guess — and it is why the same service can price instantly for one
              customer and go to review for another.
            </p>
            <Link href="/#rules"
                  className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
              How Guided Pricing works <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="lg:col-span-7">
            <GuidedQuestionCard example={data.example} />
          </div>
        </div>
      </section>

      {/* 5 + 9. Selective use, then out to the pages that own the mechanism. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-6">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[36px]">
              You don’t have to turn all of it on.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Start with the handful of jobs that generate the same phone call every week. The rest
              of the catalog is there when you want it, and your bigger work keeps running exactly
              the way it runs today.
            </p>
            <Link href="/#start-small"
                  className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
              How selective adoption works <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="lg:col-span-6">
            <div className="flex flex-col gap-3">
              {[
                { href: "/#wwt", t: "While We’re There™", b: "The second price you set, for work added to a visit already booked." },
                { href: "/#rules", t: "Online booking", b: "Availability from your hours, your crews and how long the job actually takes." },
                { href: "/#demo", t: "Try the homeowner demo", b: "Walk a real service to a real price, with the questions this catalog asks." },
              ].map((l) => (
                <Link key={l.href} href={l.href}
                      className="group rounded-[3px] border border-p2b-line bg-white px-5 py-4 hover:border-p2b-accent">
                  <div className="text-[16px] font-semibold group-hover:text-p2b-accent">
                    {l.t} <span aria-hidden="true">→</span>
                  </div>
                  <p className="mt-1 text-[15px] leading-[1.5] text-p2b-muted">{l.b}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
