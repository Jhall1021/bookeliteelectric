import type { Metadata } from "next";
import Link from "next/link";
import { formatCents } from "@/lib/flow-types";
import { HERO_FLOW } from "@/components/marketing/heroFlow";

/**
 * /product/while-were-there — SITEMAP.md.
 *
 * ITS NARROW JOB: show why the price for extra work during a visit already
 * booked can legitimately differ from the price for making a separate trip,
 * and show that Price2Book handles that automatically without becoming a
 * coupon system.
 *
 * THE LANGUAGE CONSTRAINT IS THE DESIGN CONSTRAINT. "Not a discount" is easy
 * to assert and hard to believe, so the page proves it instead: a ladder of
 * real services showing the same-visit price against the standalone one, in
 * order of how long the work takes. A discount would be one percentage
 * applied to everything. What the catalog actually does is take the trip out
 * — so the gap is widest on a twenty-minute job whose standalone price is
 * mostly the trip, and narrowest on a two-hour job that is mostly work.
 *
 * Nobody could have written that table. It had to be read.
 *
 * WHAT THIS PAGE DOES NOT DO: re-prove general contractor control, which
 * /product/guided-pricing owns, or explain scheduling, which Online Booking
 * will. The placement rule below is the same-visit rule specifically — whether
 * two services can share a visit at all — and it is not a claim about whether
 * the work fits in the day, which is the scheduler's job and is said there.
 */
export const metadata: Metadata = {
  title: "While We’re There™ — a price that reflects the trip you’re already making",
  description:
    "Additional work during a visit already booked can carry a different price, because the trip and the setup are already covered. Not a discount: a second price the contractor sets, applied only where the work can actually be placed on the visit.",
  alternates: { canonical: "/product/while-were-there" },
};

export const dynamic = "force-dynamic";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

/** Shortest work first, so the gap can be watched closing as the hours grow. */
const LADDER = [...HERO_FLOW.sameVisitExamples]
  .filter((e) => e.standaloneCents && e.sameVisitCents)
  .sort((a, b) => (a.crewHours ?? 0) - (b.crewHours ?? 0));

/** The worked example: the pair the homepage and the hero both already use. */
const PRIMARY = HERO_FLOW.primary;
const ADD_ON = HERO_FLOW.addOn;
const ELIGIBILITY = HERO_FLOW.sameVisitEligibility;

const hours = (h: number | null) => (h == null ? "—" : `${h} hr`);

export default function WhileWereTherePage() {
  return (
    <main>
      <section className={`${SHELL} pb-10 pt-12 lg:pb-12 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-green" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-green-deep lg:text-xs">
            While We’re There™
          </span>
        </div>
        <h1 className="max-w-[19ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] text-p2b-green-ink lg:text-[64px]">
          One visit. More work. A price that reflects the trip you’re already making.
        </h1>
        <p className="mt-5 text-[21px] font-bold leading-[1.2] tracking-[-0.022em] text-p2b-green-deep lg:text-[26px]">
          One trip. More done.
        </p>
        <p className="mt-5 max-w-[68ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          A service can carry two prices: what it costs as a visit of its own, and what it costs
          added to a visit that is already happening. The second is not a discount — it is what the
          work costs once somebody is already standing there.
        </p>
      </section>

      {/* 1. The mechanic, on one real service. */}
      <section className="border-t border-p2b-green-line bg-p2b-green-tint py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-5">
            <h2 className="max-w-[20ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] text-p2b-green-ink lg:text-[38px]">
              Two prices. One service.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-[#2C3A32]">
              Both are numbers the contractor sets. Price2Book decides which one applies from the
              context — whether this is the job the visit is for, or work being added to a visit
              that is already booked.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
              <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-6 py-3.5 text-[14px] font-semibold">
                {ADD_ON.name}
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-p2b-line-soft px-6 py-4">
                <div>
                  <div className="text-[15px] font-semibold">As a visit of its own</div>
                  <p className="mt-1 text-[14px] text-p2b-muted">Carries the trip, the setup and the service-call floor.</p>
                </div>
                <span className="shrink-0 text-[22px] font-bold">{formatCents(ADD_ON.standaloneCents ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 bg-p2b-green-tint px-6 py-4">
                <div>
                  <div className="text-[15px] font-semibold text-p2b-green-ink">
                    Added to a visit already booked
                  </div>
                  <p className="mt-1 text-[14px] text-[#3F4E45]">
                    The incremental labor and materials, once the trip is already covered.
                  </p>
                </div>
                <span className="shrink-0 text-[22px] font-bold text-p2b-green-deep">
                  {formatCents(ADD_ON.sameVisitCents ?? 0)}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-p2b-muted-soft">
              A real pair from a working electrical catalog. The contractor set both.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Why it exists — and the proof that it is not a percentage off. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              This is not a discount.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              A discount is one number taken off everything. What is actually removed here is the
              second trip — no second truck roll, no second arrival, no second setup, and the
              service-call floor already met by the job that brought you out.
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-p2b-muted">
              Which is why the gap is not a fixed percentage. Read the table in order of hours: on
              a twenty-minute job, most of the standalone price is the trip, so removing it changes
              the number a great deal. On a two-hour job it barely moves, because almost all of that
              price is the work.
            </p>
          </div>

          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
              <div className="grid grid-cols-12 gap-2 border-b border-p2b-line bg-p2b-surface-warm px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-p2b-muted-soft">
                <div className="col-span-5">Service</div>
                <div className="col-span-2 text-right">Crew time</div>
                <div className="col-span-2 text-right">Its own visit</div>
                <div className="col-span-3 text-right">While we’re there</div>
              </div>
              {LADDER.map((e) => (
                <div key={e.slug}
                     className="grid grid-cols-12 items-center gap-2 border-b border-p2b-line-soft px-5 py-3 last:border-0">
                  <div className="col-span-5 text-[14px] leading-[1.35] text-p2b-ink-warm">{e.name}</div>
                  <div className="col-span-2 text-right text-[13px] text-p2b-muted">{hours(e.crewHours)}</div>
                  <div className="col-span-2 text-right text-[14px] text-p2b-ink">
                    {formatCents(e.standaloneCents ?? 0)}
                  </div>
                  <div className="col-span-3 text-right text-[15px] font-bold text-p2b-green-deep">
                    {formatCents(e.sameVisitCents ?? 0)}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-[1.5] text-p2b-muted-soft">
              Every figure captured from a working electrical catalog and re-read on each build. If
              these were a discount, one percentage would run down the column.
            </p>
          </div>
        </div>
      </section>

      {/* 3. The placement rule — real, and bounded. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:gap-12`}>
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              It is only offered when it can actually be done.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Not every pairing works, and the honest thing is to never offer the ones that don’t —
              rather than take the request and refuse it at checkout.
            </p>
          </div>
          <div className="flex flex-col gap-3.5 lg:col-span-7">
            {[
              {
                t: "Some work can only ever be the main job",
                b: "A service with no same-visit price cannot be demoted to an addition. One of those on a visit is fine — it carries the trip. Two cannot share one, so the second is never offered.",
              },
              {
                t: "The check happens before the offer, not after",
                b: "Price2Book asks whether the addition can be placed on this particular visit before showing it. A homeowner never meets a refusal at the cart for something they were invited to add.",
              },
              {
                t: "The promise is only made where it can be kept",
                b: "A contractor whose catalog carries no same-visit prices sees no same-visit messaging at all. The storefront does not advertise a capability that contractor has not configured.",
              },
              {
                t: "Whether it fits in the day is a scheduling question",
                b: "Placement decides whether two services can share a visit. How long the visit runs, and whether it fits the hours you opened, is the scheduler’s job — and it is answered there.",
              },
            ].map((c) => (
              <div key={c.t} className="rounded-[3px] border border-p2b-line border-l-[3px] border-l-p2b-green bg-white px-6 py-5">
                <div className="text-[17px] font-semibold text-p2b-green-ink">{c.t}</div>
                <p className="mt-2 text-[15px] leading-[1.55] text-p2b-muted lg:text-base">{c.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. The moment itself. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Where the homeowner meets it.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              After the main job is priced and on the visit — never before. The offer only makes
              sense once there is a trip to share, and the price shown is the one that applies
              because there is.
            </p>
            <Link href="/#demo"
                  className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
              Walk it as a homeowner <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
              <div className="border-b border-[#EEEAE1] bg-p2b-surface-warm px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
                The visit they booked
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-[16px] font-semibold">{PRIMARY.name}</span>
                <span className="text-[20px] font-bold">{formatCents(PRIMARY.priceCents)}</span>
              </div>
            </div>
            <div className="mt-3.5 overflow-hidden rounded-[3px] border-[1.5px] border-p2b-green bg-white">
              <div className="bg-p2b-green px-6 py-3.5 text-white">
                <div className="text-[15px] font-bold">While We’re There™</div>
                <div className="mt-0.5 text-sm text-[#D2E7DB]">Since we’re already coming out, you can add:</div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <span className="text-[15px] lg:text-base">{ADD_ON.name}</span>
                <div className="text-right">
                  <div className="flex items-baseline justify-end gap-2">
                    <span className="text-[17px] font-bold text-p2b-green-deep">
                      +{formatCents(ADD_ON.sameVisitCents ?? 0)}
                    </span>
                    <span className="text-[13px] text-p2b-muted line-through">
                      {formatCents(ADD_ON.standaloneCents ?? 0)}
                    </span>
                  </div>
                  <div className="text-[12px] text-p2b-muted">while we’re there</div>
                </div>
              </div>
              <div className="flex items-baseline justify-between border-t border-p2b-line-soft bg-p2b-green-tint px-6 py-3">
                <span className="text-[14px] font-semibold text-p2b-green-ink">Visit total</span>
                <span className="text-lg font-bold text-p2b-green-ink">
                  {formatCents(HERO_FLOW.totalCents)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Contractor control — only the part this page owes. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-6">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[36px]">
              You decide which work is worth offering this way.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              A same-visit price is set per service, by you, and a service without one is simply
              never offered as an addition. In the catalog behind the examples above,{" "}
              <span className="font-semibold">{ELIGIBILITY.withSameVisitPrice} of {ELIGIBILITY.live}</span>{" "}
              live services carry one — a choice that contractor made service by service, not a
              setting they switched on.
            </p>
            <Link href="/product/guided-pricing"
                  className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
              How pricing gets approved in the first place <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="lg:col-span-6">
            <Link href="/trades/electrical"
                  className="group block rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                See the electrical catalog <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                Every category and service Price2Book has modeled for electrical, and which of them
                it refuses to price automatically.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
