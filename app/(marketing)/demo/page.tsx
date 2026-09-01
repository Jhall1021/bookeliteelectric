import type { Metadata } from "next";
import Link from "next/link";
import HomeownerDemo from "@/components/marketing/HomeownerDemo";
import { JourneyIntro } from "@/components/marketing/Sections";
import { JOURNEY_NOTE } from "@/components/marketing/content";

/**
 * /demo — SITEMAP.md, the demonstration's canonical home.
 *
 * THE SAME DEMO, MOVED. Not a simplified one, not a prettier one, not a
 * marketing rebuild with a nicer flow. It renders the identical component the
 * homepage renders, against the identical generated fixture — every question,
 * every price and every routing decision produced by the real engine walking a
 * real service's real tree.
 *
 * The temptation on a page like this is to smooth the flow: fewer questions,
 * a cleaner path, no reroute. Every one of those edits would make the demo a
 * drawing of the product, which is the failure the hero exists to avoid. If
 * the walk feels long, that is the product being careful, and a contractor
 * evaluating it deserves to see that rather than a version that flatters it.
 *
 * WHAT THE HOMEPAGE KEEPS is the hero walkthrough and the four-word journey —
 * proof and an invitation. The full interactive experience is here, which is
 * what lets the homepage stop explaining the same thing twice.
 */
export const metadata: Metadata = {
  title: "Try the homeowner demo — price and book a real service",
  description:
    "Walk a real electrical service through its real questions to a real price, add same-visit work, and pick an arrival window. Every question and price comes from the same engine that runs the product. Nothing here books an appointment.",
  alternates: { canonical: "/demo" },
};

export const dynamic = "force-dynamic";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

export default function DemoPage() {
  return (
    <main>
      <section className={`${SHELL} pb-2 pt-12 lg:pb-4 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
            The homeowner experience
          </span>
        </div>
        <h1 className="max-w-[20ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] lg:text-[60px]">
          Try it the way your customer would.
        </h1>
        <p className="mt-6 max-w-[70ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          A real service from a demonstration contractor, with its real questions. The price, and
          the decision to book it or send it for review, come from the same engine that runs the
          product — not from a script written for this page.
        </p>
        <p className="mt-4 max-w-[70ch] text-[16px] leading-[1.6] text-p2b-muted">
          {JOURNEY_NOTE} Answer honestly, or answer “I’m not sure” — what happens differently is
          the point. Nothing here books an appointment.
        </p>
      </section>

      {/* The four-word spine, then the thing itself. Both are the homepage's
          components, unchanged: a second implementation would drift. */}
      <JourneyIntro />
      <HomeownerDemo />

      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-6">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[36px]">
              That was one service. There are dozens.
            </h2>
            <p className="mt-4 text-[17px] leading-[1.6] text-p2b-ink-warm">
              What you just walked is one path through one job. The catalog behind it carries the
              same structure for every service in the trade — including the work Price2Book will
              not price automatically at all.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-6">
            <Link href="/trades/electrical"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                See the whole electrical catalog <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                Every category and service, and how each one resolves for a homeowner.
              </p>
            </Link>
            <Link href="/product/guided-pricing"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                Why it asked what it asked <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                How observable answers become an approved price — or don’t.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
