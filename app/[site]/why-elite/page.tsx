"use client";

import { useIdentity, usePricingCopy } from "@/components/theme/StorefrontContext";

/**
 * The trust page — ADR-016.
 *
 * Every point here was Elite's: their New Jersey licence number, their
 * flat-rate promise, their company name in the opening sentence. A provisioned
 * contractor inherited all three, which meant a storefront could advertise a
 * licence its owner does not hold.
 *
 * The points are now assembled from contractor identity and the pricing model.
 * A claim that cannot be substantiated from contractor data is not made: no
 * licence on file means no licence bullet, not a vaguer one.
 *
 * The route stays /why-elite. It is a live URL and renaming it would break
 * Elite's links to tidy an internal name — the LABEL is what customers read,
 * and that is derived.
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
