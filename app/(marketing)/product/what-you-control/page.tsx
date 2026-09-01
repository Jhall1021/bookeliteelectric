import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SHOTS } from "@/components/marketing/shots";
import { ELECTRICAL_TEMPLATE } from "@/components/marketing/trades/electricalTemplate";

/**
 * /product/what-you-control — the contractor's panel.
 *
 * WHY THIS PAGE EXISTS SEPARATELY. The other Product pages answer "what does
 * the homeowner experience?". This one answers the question a contractor asks
 * immediately afterwards and that no amount of customer-side polish settles:
 * who decides the number. A contractor who suspects the software prices their
 * work does not buy the software.
 *
 * SO THE ARGUMENT IS OWNERSHIP, NOT FEATURES. Every screen below is included
 * because it shows a decision that stays with the contractor — the price, the
 * question, the outcome of an answer, the hours, the area. A tour of the admin
 * panel for its own sake would be a tour of a UI; this is a tour of who holds
 * the pen.
 *
 * THE SCREENSHOTS ARE THE DEMONSTRATION CONTRACTOR, AND THAT IS A RULE.
 * Voltmark Electric, from scripts/demo-contractor.ts. Never a real tenant —
 * see the note in components/marketing/shots.ts. A screenshot is a
 * publication, and a real contractor's prices and customers cannot be
 * un-published once they are on a marketing page.
 */
export const metadata: Metadata = {
  title: "What you control — your prices, your questions, your calendar",
  description:
    "Price2Book publishes what you approve. The price, the questions a homeowner answers, what each answer does, the hours you work and the area you cover are all yours to set, and nothing reaches a customer until you say so.",
  alternates: { canonical: "/product/what-you-control" },
};

export const dynamic = "force-dynamic";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

/**
 * The tour. Ordered by the objection each one answers, not by the panel's own
 * navigation — "who sets the price" comes first because it is the question
 * that stops the sale.
 */
const SCREENS = [
  {
    shot: SHOTS.servicesPricing,
    eyebrow: "Services & Pricing",
    title: "Your catalog, and what each job costs.",
    body:
      "Every service you offer, with its price, its labor hours, its same-visit price and its materials. Change any of it and the storefront reflects it immediately — there is no rebuild, no redeploy and nobody to ask.",
    points: [
      "Prices are yours. Price2Book can calculate a suggestion; publishing it is a separate, deliberate act.",
      "Labor hours and materials sit beside the price, so a number can be explained rather than just asserted.",
      "A service can be priced and bookable, quote-only, or hidden from customers entirely.",
    ],
  },
  {
    shot: SHOTS.guidedPricing,
    eyebrow: "Guided Pricing",
    title: "The questions, and what each answer does.",
    body:
      "The decision tree behind every service. You write the question, you write the answers, and you choose what each answer does — continue, adjust the price, ask for a photograph, or send the job somewhere it can be handled properly.",
    points: [
      "Questions are asked in the order you set. The first one is where every customer starts.",
      "An answer can carry a price adjustment, and a disclaimer shown with that price.",
      `An answer can also refuse to price the job. The electrical template ships ${ELECTRICAL_TEMPLATE.unsure.total} answers meaning “I’m not sure”, and ${ELECTRICAL_TEMPLATE.unsure.pricedAutomatically} of them resolve to a price.`,
    ],
  },
  {
    shot: SHOTS.storefrontDesign,
    eyebrow: "Storefront",
    title: "How it looks, without a redesign project.",
    body:
      "Pick a layout and preview it with your own logo, colors and photography before anything changes. Your branding is an input to the design, not something bolted on after it.",
    points: [
      "Preview with your own company first. The current design stays live until you choose another.",
      "The same catalog and the same pricing sit behind every layout.",
    ],
  },
  {
    shot: SHOTS.hoursAvailability,
    eyebrow: "Hours & Availability",
    title: "When you work, and how much you take on.",
    body:
      "The windows a homeowner can choose from come from the hours you set here. Nothing is bookable outside them, and a day that is full stops offering itself.",
    points: [
      "If you run scheduling in Jobber, availability reads your real calendar instead.",
      "Booked work lands where you already look for it, rather than in a second place to check.",
    ],
  },
] as const;

export default function WhatYouControlPage() {
  return (
    <main>
      <section className={`${SHELL} pb-10 pt-12 lg:pb-12 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
            What you control
          </span>
        </div>
        <h1 className="max-w-[20ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] lg:text-[64px]">
          Everything your customer sees traces back to something you set.
        </h1>
        <p className="mt-6 max-w-[70ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          Price2Book does not price your work. It publishes what you approve, asks the questions you
          wrote, and books the hours you said you were available. Here is where each of those
          decisions lives.
        </p>
      </section>

      {SCREENS.map((s, i) => (
        <section
          key={s.eyebrow}
          className={`border-t border-p2b-line py-14 lg:py-[72px] ${
            i % 2 === 1 ? "bg-p2b-canvas-alt" : ""
          }`}
        >
          <div className={`${SHELL} grid gap-9 lg:grid-cols-12 lg:items-center lg:gap-12`}>
            <div className="lg:col-span-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
                {s.eyebrow}
              </div>
              <h2 className="mt-3 max-w-[20ch] text-[28px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[36px]">
                {s.title}
              </h2>
              <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">{s.body}</p>
              <ul className="mt-6 flex flex-col gap-3">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15px] leading-[1.5] text-p2b-muted">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-p2b-accent" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* The frame is deliberate: a screenshot presented flush reads as
                part of the page, and a visitor should be able to tell where
                Price2Book's marketing stops and the product begins. */}
            <div className="lg:col-span-7">
              {s.shot ? (
                <figure className="overflow-hidden rounded-[6px] border border-p2b-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.16)]">
                  <Image
                    src={s.shot.src}
                    alt={s.shot.alt}
                    width={s.shot.w}
                    height={s.shot.h}
                    sizes="(min-width: 1024px) 58vw, 100vw"
                    className="h-auto w-full"
                  />
                </figure>
              ) : null}
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={SHELL}>
          <h2 className="max-w-[26ch] text-[26px] font-bold leading-[1.14] tracking-[-0.02em] lg:text-[34px]">
            The screens above are a demonstration company.
          </h2>
          <p className="mt-5 max-w-[70ch] text-[17px] leading-[1.6] text-p2b-ink-warm">
            Voltmark Electric is not a real contractor. Price2Book does not put a customer’s prices,
            catalog or bookings on its own marketing pages — yours included, once you are on it.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/demo"
              className="rounded-full bg-p2b-accent px-6 py-3 text-[15px] font-semibold text-white"
            >
              See the customer’s side
            </Link>
            <Link
              href="/product/guided-pricing"
              className="rounded-full border border-p2b-line px-6 py-3 text-[15px] font-semibold text-p2b-ink"
            >
              How Guided Pricing works
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
