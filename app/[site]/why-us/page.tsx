"use client";

import { useIdentity, usePricingCopy } from "@/components/theme/StorefrontContext";

/**
 * The trust page — ADR-016.
 *
 * Every point here was Elite's: their New Jersey license number, their
 * flat-rate promise, their company name in the opening sentence. A provisioned
 * contractor inherited all three, which meant a storefront could advertise a
 * license its owner does not hold.
 *
 * The points are now assembled from contractor identity and the pricing model.
 * A claim that cannot be substantiated from contractor data is not made: no
 * license on file means no license bullet, not a vaguer one.
 *
 * The canonical route is /why-us. It used to be /why-elite, which was fine
 * while Elite was the only tenant and wrong the moment a second one existed:
 * a Northgate customer should never see /northgate-electric/why-elite, however
 * correctly the page says "Why Northgate".
 *
 * /why-elite still resolves — see the sibling route — because Elite's existing
 * links and bookmarks are real traffic. The compatibility route redirects for
 * EVERY contractor, not just Elite: a route that behaved differently depending
 * on who owned the storefront would be the contractor-specific branching this
 * whole architecture exists to avoid.
 */
export default function WhyUsPage() {
  const id = useIdentity();
  const copy = usePricingCopy();

  const points: { title: string; body: string }[] = [];

  if (id.license) {
    points.push({
      title: "Licensed & Insured",
      body: `Fully licensed and insured on every job — ${id.license}.`,
    });
  }

  // The pricing promise is the contractor's model talking, not this page's.
  points.push({ title: copy.trustPricingTitle, body: copy.trustPricingBody });

  points.push({
    title: "Narrow Arrival Windows",
    body: "We respect your time. Pick a window, and we'll be there within it.",
  });
  points.push({
    title: "Clean, Respectful, Professional",
    body: "We treat your home like our own — shoe covers, drop cloths, and a clean job site when we're done.",
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-ink">Local. Licensed. Trusted.</h1>
      <p className="mt-2 max-w-xl text-muted">
        {id.displayName} brings a premium, homeowner-first experience to residential
        electrical work — the kind of service you&rsquo;d expect from a polished consumer
        platform, done by real, professional electricians.
      </p>

      <dl className="mt-10 space-y-8">
        {points.map((p) => (
          <div key={p.title}>
            <dt className="font-display text-lg font-bold text-ink">{p.title}</dt>
            <dd className="mt-1 text-muted">{p.body}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
