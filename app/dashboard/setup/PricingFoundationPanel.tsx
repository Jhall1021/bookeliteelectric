"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PricingRatesInlineForm from "./PricingRatesInlineForm";

/**
 * What you charge for time, then your prices.
 *
 * In that order, because a suggested price built on an uncosted material is a
 * number nobody should look at. Readiness is per service: an unfinished job
 * stays blocked without hiding valid suggestions for other completed jobs.
 *
 * GUIDED SETUP NEVER APPROVES A PRICE SILENTLY. It shows the derived figure
 * with its breakdown. A contractor may explicitly check individual suggestions
 * and approve that reviewed batch; nothing is preselected, the server refuses
 * a stale figure, and all publication still goes through publishSuggestedPrice.
 */

export type ServicePricing = {
  serviceId: string;
  slug: string;
  name: string;
  derivedCents: number | null;
  publishedCents: number | null;
  approved: boolean;
  promisesFixedPrice: boolean;
  routePriced: boolean;
  routeReviewAvailable: boolean;
  breakdown: string | null;
  priceReviewBlocker: string | null;
  priceReviewBlockerCode: "MATERIALS_UNRESOLVED" | "POLICY_UNRESOLVED" | "LABOR_INPUTS_MISSING" | null;
};

const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

export default function PricingFoundationPanel({
  settings, services, setupWork,
}: {
  settings: {
    crewHourRateCents: number | null;
    electricianHourRateCents: number | null;
    fixtureHeight12Percent: number | null;
    fixtureHeight14Percent: number | null;
    primaryMinimumCents: number | null;
    roundingIncrementCents: number | null;
    defaultPermitAdminCents: number | null;
  } | null;
  services: ServicePricing[];
  /** Material and labor work supplied by the server page, rendered before price review. */
  setupWork: React.ReactNode;
}) {
  const router = useRouter();
  const [selectedPriceIds, setSelectedPriceIds] = useState<Set<string>>(() => new Set());
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const legacyFixedPriceServices = services.filter(
    (service) => service.promisesFixedPrice && !service.routePriced,
  );
  const awaitingSetupCount = legacyFixedPriceServices.filter(
    (service) => service.priceReviewBlocker !== null,
  ).length;
  const readyForPriceReviewCount = legacyFixedPriceServices.filter(
    (service) => service.derivedCents !== null && !service.approved,
  ).length + services.filter((service) => service.routePriced && service.routeReviewAvailable && !service.approved).length;
  const routeSetupPendingCount = services.filter(
    (service) => service.routePriced && !service.routeReviewAvailable && !service.approved,
  ).length;
  const approvedPriceCount = services.filter(
    (service) => service.promisesFixedPrice && service.approved && service.priceReviewBlocker === null,
  ).length;
  const reviewablePrices = legacyFixedPriceServices.filter(
    (service) => service.derivedCents !== null && !service.approved,
  );

  function togglePrice(serviceId: string) {
    setSelectedPriceIds((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId); else next.add(serviceId);
      return next;
    });
  }

  async function approveSelectedPrices() {
    const items = reviewablePrices
      .filter((service) => selectedPriceIds.has(service.serviceId))
      .map((service) => ({ serviceId: service.serviceId, expectedCents: service.derivedCents! }));
    if (items.length === 0) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const response = await fetch("/api/portal/price-review", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not approve the selected prices.");
      setSelectedPriceIds(new Set());
      router.refresh();
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Could not approve the selected prices.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">What you charge for time</h2>
        <p className="mt-1 text-sm text-slate">Set both one-van labor rates here. Each service uses the crew choice you made on the previous step.</p>
        <PricingRatesInlineForm settings={settings} />

        {/* Materials markup is a Price2Book rule, not a contractor control.
            Shown so the number is not a mystery, and NOT offered as a field —
            inventing one would imply a decision that does not exist. */}
        <p className="mt-4 text-xs text-slate">
          Materials are sold at cost plus our standard markup — 30% of the first $750, 20% above
          that, applied once to the whole job rather than to each part.
        </p>
      </section>

      {setupWork}

      {reviewablePrices.length > 0 && (
        <div className="rounded-card border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-navy">
            Next: review the calculated customer prices
          </p>
          <p className="mt-1 text-xs text-blue-900">
            Approved service durations now flow into the suggestions below. Review the amounts,
            select only the prices you agree with, and approve that batch explicitly.
          </p>
          <a href="#price-review" className="mt-2 inline-block text-xs font-semibold text-electric hover:underline">
            Continue to price review
          </a>
        </div>
      )}

      {services.length > 0 && (
        <section id="price-review" className="scroll-mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Your prices</h2>
          <p className="mt-1 text-sm text-slate">
            This is what your own rate and costs work out to. Nothing is published until you
            approve it.
          </p>
          {reviewablePrices.length > 0 && (
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs text-blue-900">Review the figures below and select only the ones you want to publish. Nothing is preselected.</p>
              <button type="button" onClick={() => { void approveSelectedPrices(); }} disabled={publishing || selectedPriceIds.size === 0} className="mt-2 rounded-pill bg-electric px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {publishing ? "Approving…" : `Approve selected prices (${selectedPriceIds.size})`}
              </button>
              {publishError && <p className="mt-2 text-xs text-red-700">{publishError}</p>}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
              {approvedPriceCount} prices approved
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">
              {readyForPriceReviewCount} ready for price review
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">
              {awaitingSetupCount} awaiting setup
            </span>
            {routeSetupPendingCount > 0 && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate">
                {routeSetupPendingCount} route services awaiting dedicated review
              </span>
            )}
          </div>
          <ul className="mt-4 space-y-3">
            {services.map((s) => (
              <li key={s.slug} className="border-b border-cardline pb-3 last:border-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="flex items-center gap-2 text-sm font-medium text-navy">
                    {s.promisesFixedPrice && !s.routePriced && s.derivedCents !== null && !s.approved && (
                      <input type="checkbox" aria-label={`Select suggested price for ${s.name}`} checked={selectedPriceIds.has(s.serviceId)} onChange={() => togglePrice(s.serviceId)} />
                    )}
                    {s.name}
                  </span>
                  <span className="text-sm">
                    {s.promisesFixedPrice ? (
                      <>
                        {s.routePriced ? (
                          <span className={`text-xs font-medium ${s.approved ? "text-success" : "text-amber-800"}`}>
                            {s.approved ? "Route pricing approved" : "Route pricing review needed"}
                          </span>
                        ) : s.derivedCents === null ? (
                          <span className="text-xs font-medium text-amber-800">{s.priceReviewBlocker ?? "Setup needed"}</span>
                        ) : (
                          <span className="font-medium text-navy">{money(s.derivedCents)}</span>
                        )}
                        {!s.routePriced && s.approved && s.publishedCents === s.derivedCents && (
                          <span className="ml-2 text-xs text-success">approved</span>
                        )}
                        {!s.routePriced && s.approved && s.publishedCents !== s.derivedCents && (
                          <span className="ml-2 text-xs text-amber-800">
                            published {money(s.publishedCents)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate">Quote only — nothing to price</span>
                    )}
                  </span>
                </div>
                {s.breakdown && (
                  <div className="mt-1 text-xs text-slate">{s.breakdown}</div>
                )}
                {s.routePriced && s.routeReviewAvailable && !s.approved && (
                  <Link
                    href={`/dashboard/route-pricing-review/${s.serviceId}`}
                    className="mt-1 inline-block text-xs font-semibold text-electric hover:underline"
                  >
                    Review route pricing
                  </Link>
                )}
                {s.routePriced && !s.routeReviewAvailable && !s.approved && (
                  <p className="mt-1 text-xs text-slate">
                    Your operation times still apply to this service. Its route-specific approval
                    screen is not connected yet, so it remains hidden and cannot be batch-approved.
                  </p>
                )}
                {s.promisesFixedPrice && !s.routePriced && s.derivedCents === null && (
                  <a
                    href={s.priceReviewBlockerCode === "MATERIALS_UNRESOLVED"
                      ? "/dashboard/materials"
                      : s.priceReviewBlockerCode === "POLICY_UNRESOLVED"
                        ? "/dashboard/policies"
                        : "#labor-calibration"}
                    className="mt-1 inline-block text-xs font-semibold text-electric hover:underline"
                  >
                    {s.priceReviewBlockerCode === "MATERIALS_UNRESOLVED"
                      ? "Review the missing material"
                      : s.priceReviewBlockerCode === "POLICY_UNRESOLVED"
                        ? "Continue pricing policies"
                        : "Continue labor setup"}
                  </a>
                )}
                {s.promisesFixedPrice && !s.routePriced && s.derivedCents !== null && !s.approved && (
                  <Link
                    href={`/dashboard/services/${s.serviceId}?tab=pricing`}
                    className="mt-1 inline-block text-xs font-semibold text-electric hover:underline"
                  >
                    Review and approve
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
