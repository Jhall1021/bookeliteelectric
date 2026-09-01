import type { Metadata } from "next";
import Link from "next/link";
import { BOUNDARY_ROLES, INTEGRATIONS } from "@/components/marketing/content";

/**
 * /integrations — SITEMAP.md.
 *
 * ONE QUESTION: will Price2Book force me to replace the software I already run
 * my business on? The answer is no, and the page leads with the boundary
 * rather than with a logo wall, because the boundary is the actual answer and
 * the logos are only evidence for it.
 *
 * TWO AXES, NOT ONE. Native capability and external integration are different
 * things that happen to share a page. The Price2Book scheduler being Built In
 * says nothing about whether a calendar connection exists, and merging them
 * would let "Built In" read as "already connected to your stack". So they are
 * rendered as separate groups, split on the status the gate already checks —
 * "Built In" IS the native marker, which means the grouping is derived rather
 * than a second hand-maintained list to drift.
 *
 * STATUS IS NEVER WRITTEN HERE. Every label comes from INTEGRATIONS in
 * content.ts, which scripts/verify-marketing-homepage.ts holds against what
 * the code actually does. This page adds no availability language of its own,
 * and "Coming Soon" is explicitly not a date.
 *
 * WHAT IT MUST NOT BECOME: a CRM comparison, a re-explanation of Online
 * Booking or Guided Pricing, or "Price2Book for Jobber users". Jobber is the
 * concrete proof that the model works; it is not the model.
 */
export const metadata: Metadata = {
  title: "Integrations — Price2Book works alongside the software you already run",
  description:
    "Price2Book is not your CRM. It handles the customer-facing pricing and booking decision; your existing systems keep handling customer records, dispatch, invoicing, payroll and job costing.",
  alternates: { canonical: "/integrations" },
};

export const dynamic = "force-dynamic";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

/**
 * Built In is the native marker, so the split needs no new field.
 * Everything else is a connection to somebody else's system.
 */
const NATIVE = INTEGRATIONS.filter((i) => i.status === "Built In");
const EXTERNAL = INTEGRATIONS.filter((i) => i.status !== "Built In");

const STATUS_STYLE: Record<string, string> = {
  Available: "bg-p2b-green-deep text-p2b-green-tint",
  "Built In": "bg-p2b-accent text-p2b-accent-tint-strong",
  "Coming Soon": "bg-[#F0F0EC] text-p2b-muted",
};

export default function IntegrationsPage() {
  return (
    <main>
      <section className={`${SHELL} pb-10 pt-12 lg:pb-12 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
            Integrations
          </span>
        </div>
        <h1 className="max-w-[16ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] lg:text-[64px]">
          Price2Book is not your CRM.
        </h1>
        <p className="mt-6 max-w-[66ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          It handles one part of the business: the customer-facing pricing and booking decision.
          Everything else — your customer records, your dispatch, your invoicing, your payroll —
          keeps happening exactly where it happens now.
        </p>
      </section>

      {/* 3 + 4. The division of responsibility, read across. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={SHELL}>
          <h2 className="max-w-[26ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
            Keep running the rest of your business where it already lives.
          </h2>
          <p className="mt-4 max-w-[78ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
            This is a division of responsibility, not a list of connections. Nothing on the right
            requires an integration to keep working — it keeps working because Price2Book does not
            want that job.
          </p>

          <div className="mt-8 grid gap-5 lg:mt-10 lg:grid-cols-2">
            <div className="rounded-[3px] border border-p2b-accent-line bg-white px-7 py-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-p2b-accent">
                Price2Book owns
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {BOUNDARY_ROLES.ours.map((r) => (
                  <li key={r} className="flex items-start gap-3">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-p2b-accent" />
                    <span className="text-[15px] leading-[1.45] text-p2b-ink lg:text-base">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[3px] border border-p2b-line bg-white px-7 py-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-p2b-muted-soft">
                Your systems keep owning
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {BOUNDARY_ROLES.theirs.map((r) => (
                  <li key={r} className="flex items-start gap-3">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-p2b-faint" />
                    <span className="text-[15px] leading-[1.45] text-p2b-ink-warm lg:text-base">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Status — the two axes, kept apart. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <h2 className="max-w-[24ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
          What works today.
        </h2>
        <p className="mt-4 max-w-[78ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
          Two different things live below, and it matters that they are not the same. Something
          built into Price2Book needs nothing from you. A connection to a system you already run
          needs that system to be connected.
        </p>

        <div className="mt-8 lg:mt-10">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-p2b-accent">
            Built into Price2Book
          </div>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            {NATIVE.map((i) => (
              <div key={i.name}
                   className="flex items-start justify-between gap-4 rounded-[3px] border border-p2b-accent-line bg-white px-6 py-5">
                <div>
                  <div className="text-[17px] font-semibold">{i.name}</div>
                  <div className="mt-1 text-[14px] leading-[1.45] text-p2b-muted">{i.body}</div>
                </div>
                <span className={`mt-0.5 shrink-0 rounded-sm px-3 py-1 text-[11px] font-bold uppercase tracking-[0.04em] ${STATUS_STYLE[i.status]}`}>
                  {i.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-9">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-p2b-muted-soft">
            Connects to what you already run
          </div>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            {EXTERNAL.map((i) => (
              <div key={i.name}
                   className="flex items-start justify-between gap-4 rounded-[3px] border border-p2b-line bg-white px-6 py-5">
                <div>
                  <div className="text-[17px] font-semibold">{i.name}</div>
                  <div className="mt-1 text-[14px] leading-[1.45] text-p2b-muted">{i.body}</div>
                </div>
                <span className={`mt-0.5 shrink-0 rounded-sm px-3 py-1 text-[11px] font-bold uppercase tracking-[0.04em] ${STATUS_STYLE[i.status]}`}>
                  {i.status}
                </span>
              </div>
            ))}
          </div>
          {/* Said once, plainly. "Coming Soon" has meant a promise on enough
              other websites to be worth disowning here. */}
          <p className="mt-5 max-w-[74ch] text-[15px] leading-[1.55] text-p2b-muted">
            Coming Soon means we intend to build it. It is not a date, and nothing above is
            scheduled for you.
          </p>
        </div>
      </section>

      {/* 6. Two ways to schedule — architecture only. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:gap-12`}>
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Two ways to schedule.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              One of them is always the authority on your availability, and Price2Book never
              guesses which. That is the whole architectural choice — the mechanism behind it
              belongs on another page.
            </p>
            <Link href="/product/online-booking"
                  className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
              How booking decides what to offer <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            <div className="rounded-[3px] border border-p2b-line border-t-[3px] border-t-p2b-accent bg-white px-6 py-5">
              <div className="text-[17px] font-bold text-p2b-accent">Your platform</div>
              <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-ink-warm">
                Connect the field-service platform you already use. Its calendar is the truth, and
                booked work lands back in it.
              </p>
            </div>
            <div className="rounded-[3px] border border-p2b-line border-t-[3px] border-t-p2b-green bg-white px-6 py-5">
              <div className="text-[17px] font-bold text-p2b-green">Price2Book</div>
              <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-ink-warm">
                No platform to connect? The scheduler is built in. Choosing it is a decision, not a
                migration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. No rip-and-replace. */}
      <section className={`${SHELL} py-14 lg:py-[76px]`}>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="lg:col-span-6">
            <h2 className="max-w-[20ch] text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[40px]">
              Start without a rip-and-replace project.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Adding Price2Book is not a migration. Nothing has to be exported, no team has to be
              retrained, and the work you don’t put online carries on exactly as it does today.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-6">
            <Link href="/how-it-fits"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                How much of the business to start with <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                Ten services or your whole catalog — and what stays exactly where it is.
              </p>
            </Link>
            <a href="/#access"
               className="rounded-sm bg-p2b-accent px-[30px] py-4 text-center text-base font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
              Request Early Access
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
