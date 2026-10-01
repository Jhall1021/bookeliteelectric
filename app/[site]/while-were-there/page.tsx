import type { Metadata } from "next";
import Link from "next/link";
import { storefrontBaseFor } from "@/lib/storefrontSurface";

export const metadata: Metadata = {
  title: "While We’re There Pricing",
  description:
    "Learn how eligible additional work can receive a lower price when it is completed during the same service visit.",
};

const DETAILS = [
  {
    title: "Start with your main service",
    body: "The first service establishes the visit and includes the time and cost of getting the crew, tools, and vehicle to your home.",
  },
  {
    title: "Add other work to the same visit",
    body: "Once a service is in My Visit, eligible additions show their While We’re There price. You will see the price before you book.",
  },
  {
    title: "One trip can mean a lower price",
    body: "When being on-site already saves setup or travel time, that saving is reflected in the additional service price.",
  },
];

export default function WhileWereTherePage({ params }: { params: { site: string } }) {
  const base = storefrontBaseFor(params.site);

  return (
    <main className="mx-auto max-w-4xl px-6 py-14 sm:py-16">
      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="bg-navy px-7 py-10 text-white sm:px-10 sm:py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">
            One visit. More done.
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-bold sm:text-4xl">
            How While We&rsquo;re There pricing works
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/80">
            When you have more than one eligible service completed during the same visit,
            additional work may cost less because the crew is already at your home.
          </p>
        </div>

        <div className="grid gap-0 sm:grid-cols-3">
          {DETAILS.map((detail, index) => (
            <div
              key={detail.title}
              className="border-b border-cardline p-7 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
                {index + 1}
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-navy">{detail.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate">{detail.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-card border border-cardline bg-white p-7 shadow-card">
          <h2 className="font-display text-xl font-bold text-navy">What to expect</h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-slate">
            <li>Your main service keeps its regular first-service price.</li>
            <li>Eligible additions display their lower price after something is in My Visit.</li>
            <li>The services must be completed as part of the same scheduled visit.</li>
            <li>Removing the main service may cause another item to become the main service.</li>
          </ul>
        </div>

        <div className="rounded-card border border-cardline bg-warmwhite p-7">
          <h2 className="font-display text-xl font-bold text-navy">Does every service cost less?</h2>
          <p className="mt-3 text-sm leading-6 text-slate">
            Not always. Some jobs require the same labor, materials, or dedicated setup whether
            they are first or added later. Those services may keep the same price. Work that needs
            additional measurements or review will still be priced after those details are known.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate">
            The price shown in My Visit is the price that applies to your selected combination of work.
          </p>
        </div>
      </section>

      <div className="mt-10 rounded-card border border-cardline bg-white p-7 text-center shadow-card">
        <h2 className="font-display text-xl font-bold text-navy">Ready to build your visit?</h2>
        <p className="mt-2 text-sm text-slate">
          Choose your first service, then browse again to see eligible additional-work pricing.
        </p>
        <Link
          href={`${base}/services`}
          className="mt-5 inline-flex rounded-pill bg-electric px-7 py-3 font-semibold text-white transition hover:bg-electric-hover"
        >
          Browse Services
        </Link>
      </div>
    </main>
  );
}
