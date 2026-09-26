"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  active: boolean;
  laborCrewType: "ELECTRICIAN" | "ELECTRICIAN_AND_HELPER";
  derivedCents: number | null;
  publishedCents: number | null;
  approved: boolean;
  promisesFixedPrice: boolean;
  routePriced: boolean;
  routeReviewAvailable: boolean;
  routeReview: {
    scenarioLabel: string;
    scenarioScope: string;
    crewLabel: string;
    approvalToken: string | null;
    approvalCurrent: boolean;
    proposal: {
      totalCents: number | null;
      laborHours: number;
      laborCents: number;
      minimumAdjustmentCents: number;
      materialCostCents: number;
      materialMarkupCents: number;
    } | null;
    refusal: string | null;
  } | null;
  handoffLabel: string | null;
  breakdown: string | null;
  priceReviewBlocker: string | null;
  priceReviewBlockerCode: "MATERIALS_UNRESOLVED" | "POLICY_UNRESOLVED" | "LABOR_INPUTS_MISSING" | "ROUTE_PRICING_PENDING" | null;
};

const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

function pricingScopeNote(slug: string): string | null {
  if (slug !== "customer-supplied-smart-switch") return null;
  return "Includes replacing the switch plus basic app programming: Wi-Fi pairing and confirmation that the customer can control it. Advanced schedules, scenes, automations, account creation and network repair are not included.";
}

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
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(() => new Set());
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [crewTypes, setCrewTypes] = useState<Record<string, ServicePricing["laborCrewType"]>>(
    () => Object.fromEntries(services.map((service) => [service.serviceId, service.laborCrewType])),
  );
  const [crewPending, setCrewPending] = useState<Set<string>>(() => new Set());
  const [crewError, setCrewError] = useState<string | null>(null);

  useEffect(() => {
    setCrewTypes(Object.fromEntries(
      services.map((service) => [service.serviceId, service.laborCrewType]),
    ));
  }, [services]);
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
  const reviewableRoutes = services.filter(
    (service) => service.routePriced && !service.approved
      && service.routeReview !== null
      && service.routeReview.approvalToken !== null
      && service.routeReview.proposal !== null
      && service.routeReview.proposal.totalCents !== null,
  );
  const selectedCount = selectedPriceIds.size + selectedRouteIds.size;

  function togglePrice(serviceId: string) {
    setSelectedPriceIds((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId); else next.add(serviceId);
      return next;
    });
  }

  function toggleRoute(serviceId: string) {
    setSelectedRouteIds((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId); else next.add(serviceId);
      return next;
    });
  }

  function toggleAllReady() {
    if (selectedCount === reviewablePrices.length + reviewableRoutes.length) {
      setSelectedPriceIds(new Set());
      setSelectedRouteIds(new Set());
      return;
    }
    setSelectedPriceIds(new Set(reviewablePrices.map((service) => service.serviceId)));
    setSelectedRouteIds(new Set(reviewableRoutes.map((service) => service.serviceId)));
  }

  async function setHelperNeeded(service: ServicePricing, helperNeeded: boolean) {
    const previous = crewTypes[service.serviceId] ?? service.laborCrewType;
    const next: ServicePricing["laborCrewType"] = helperNeeded
      ? "ELECTRICIAN_AND_HELPER"
      : "ELECTRICIAN";
    if (previous === next || crewPending.has(service.serviceId)) return;

    setCrewError(null);
    setCrewTypes((current) => ({ ...current, [service.serviceId]: next }));
    setCrewPending((current) => new Set(current).add(service.serviceId));
    try {
      const response = await fetch(`/api/admin/services/${service.serviceId}/offered`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laborCrewType: next }),
      });
      const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? body?.error ?? "Could not update the crew for this service.");
      router.refresh();
    } catch (error) {
      setCrewTypes((current) => ({ ...current, [service.serviceId]: previous }));
      setCrewError(error instanceof Error ? error.message : "Could not update the crew for this service.");
    } finally {
      setCrewPending((current) => {
        const nextPending = new Set(current);
        nextPending.delete(service.serviceId);
        return nextPending;
      });
    }
  }

  async function approveSelectedPrices() {
    const items = reviewablePrices
      .filter((service) => selectedPriceIds.has(service.serviceId))
      .map((service) => ({ serviceId: service.serviceId, expectedCents: service.derivedCents! }));
    const routeItems = reviewableRoutes
      .filter((service) => selectedRouteIds.has(service.serviceId))
      .map((service) => ({
        serviceId: service.serviceId,
        expectedFingerprint: service.routeReview!.approvalToken!,
        name: service.name,
      }));
    if (items.length === 0 && routeItems.length === 0) return;
    setPublishing(true);
    setPublishError(null);
    try {
      if (items.length > 0) {
        const response = await fetch("/api/portal/price-review", {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
        });
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) throw new Error(body?.error ?? "Could not approve the selected prices.");
      }
      const routeResults = await Promise.all(routeItems.map(async (item) => {
        const response = await fetch("/api/admin/derived-pricing-approval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", serviceId: item.serviceId, expectedFingerprint: item.expectedFingerprint }),
        });
        const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
        return response.ok ? null : `${item.name}: ${body?.message ?? body?.error ?? "could not be approved"}`;
      }));
      const routeErrors = routeResults.filter((message): message is string => message !== null);
      if (routeErrors.length > 0) throw new Error(routeErrors.join(" "));
      setSelectedPriceIds(new Set());
      setSelectedRouteIds(new Set());
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
        <p className="mt-1 text-sm text-slate">Set both one-van labor rates here. Every service starts with one electrician; add a helper only where the work normally requires both people.</p>
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

      {(reviewablePrices.length > 0 || reviewableRoutes.length > 0) && (
        <div className="rounded-card border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-navy">
            Next: review the calculated customer prices
          </p>
          <p className="mt-1 text-xs text-blue-900">
            Approved service durations now flow into the suggestions below. Review the amounts,
            select only the prices you agree with, and approve them together.
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
          <p className="mt-2 text-xs text-slate">
            Every service starts with one electrician. Turn on <span className="font-semibold text-navy">Helper needed</span> only where the work normally requires both people. Changing the crew recalculates the suggestion and requires price review.
          </p>
          {crewError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {crewError}
            </p>
          )}
          {(reviewablePrices.length > 0 || reviewableRoutes.length > 0) && (
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs text-blue-900">Review the figures below, then approve any or all of them in one step. Nothing is preselected.</p>
              {reviewableRoutes.length > 0 && (
                <p className="mt-1 text-xs text-blue-900">For route-priced work, this approves the current labor, materials, policies and rates once; each customer route will still calculate from its own measured quantities.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={toggleAllReady} disabled={publishing} className="rounded-pill border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-electric disabled:opacity-50">
                  {selectedCount === reviewablePrices.length + reviewableRoutes.length ? "Clear selection" : `Select all ready (${reviewablePrices.length + reviewableRoutes.length})`}
                </button>
                <button type="button" onClick={() => { void approveSelectedPrices(); }} disabled={publishing || selectedCount === 0} className="rounded-pill bg-electric px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  {publishing ? "Approving…" : `Approve selected prices (${selectedCount})`}
                </button>
              </div>
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
                <div className="flex items-start justify-between gap-4">
                  <span className="flex items-center gap-2 text-sm font-medium text-navy">
                    {s.promisesFixedPrice && !s.routePriced && s.derivedCents !== null && !s.approved && (
                      <input type="checkbox" aria-label={`Select suggested price for ${s.name}`} checked={selectedPriceIds.has(s.serviceId)} onChange={() => togglePrice(s.serviceId)} />
                    )}
                    {s.routePriced && !s.approved && s.routeReview?.approvalToken && s.routeReview.proposal?.totalCents !== null && (
                      <input type="checkbox" aria-label={`Select route pricing for ${s.name}`} checked={selectedRouteIds.has(s.serviceId)} onChange={() => toggleRoute(s.serviceId)} />
                    )}
                    {s.name}
                  </span>
                  <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
                    {s.promisesFixedPrice ? (
                      <>
                        {s.routePriced ? (
                          s.routeReview?.proposal?.totalCents !== null && s.routeReview?.proposal ? (
                            <>
                              <span className="font-medium text-navy">{money(s.routeReview.proposal.totalCents)}</span>
                              <span className={`text-xs font-medium ${s.approved ? "text-success" : "text-amber-800"}`}>
                                {s.approved ? "Route pricing approved" : "Representative route"}
                              </span>
                            </>
                          ) : (
                            <span className={`text-xs font-medium ${s.approved ? "text-success" : "text-amber-800"}`}>
                              {s.approved ? "Route pricing approved" : "Route pricing review needed"}
                            </span>
                          )
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
                    ) : s.handoffLabel ? (
                      <span className="text-xs font-medium text-blue-800">{s.handoffLabel}</span>
                    ) : (
                      <span className="text-xs text-slate">Remote quote only — no online price</span>
                    )}
                    {(() => {
                      const helperNeeded = (crewTypes[s.serviceId] ?? s.laborCrewType) === "ELECTRICIAN_AND_HELPER";
                      const pending = crewPending.has(s.serviceId);
                      return (
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate">
                              {pending ? "Updating crew…" : helperNeeded ? "Electrician + helper" : "One electrician"}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={helperNeeded}
                              aria-label={`Helper needed for ${s.name}`}
                              title={s.active ? "Take this service offline before changing its crew." : "Use an electrician and helper for this service"}
                              disabled={pending || s.active}
                              onClick={() => { void setHelperNeeded(s, !helperNeeded); }}
                              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric disabled:cursor-not-allowed disabled:opacity-50 ${helperNeeded ? "bg-electric" : "bg-slate-300"}`}
                            >
                              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${helperNeeded ? "translate-x-5" : "translate-x-0"}`} />
                            </button>
                          </div>
                          <span className="mt-0.5 text-[11px] text-slate">Helper needed</span>
                          {s.active && <span className="mt-0.5 text-[11px] text-amber-800">Live — take offline to change crew</span>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {s.breakdown && (
                  <div className="mt-1 text-xs text-slate">{s.breakdown}</div>
                )}
                {pricingScopeNote(s.slug) && (
                  <div className="mt-1 text-xs text-slate">{pricingScopeNote(s.slug)}</div>
                )}
                {s.routePriced && s.routeReview?.proposal?.totalCents !== null && s.routeReview?.proposal && (
                  <div className="mt-1 text-xs text-slate">
                    {s.routeReview.scenarioLabel} · {s.routeReview.proposal.laborHours.toFixed(2)} labor hr · {s.routeReview.crewLabel} · labor {money(s.routeReview.proposal.laborCents + s.routeReview.proposal.minimumAdjustmentCents)} · materials {money(s.routeReview.proposal.materialCostCents + s.routeReview.proposal.materialMarkupCents)}
                  </div>
                )}
                {s.routePriced && s.routeReviewAvailable && !s.approved && (
                  <Link
                    href={`/dashboard/route-pricing-review/${s.serviceId}`}
                    className="mt-1 inline-block text-xs font-semibold text-electric hover:underline"
                  >
                    See full calculation
                  </Link>
                )}
                {s.routePriced && !s.routeReviewAvailable && !s.approved && (
                  <p className="mt-1 text-xs text-slate">
                    Your operation times still apply to this service. Its route-specific approval
                    screen is not connected yet, so it remains hidden and cannot be batch-approved.
                  </p>
                )}
                {s.promisesFixedPrice && !s.routePriced && s.derivedCents === null && s.priceReviewBlockerCode !== "ROUTE_PRICING_PENDING" && (
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
                {s.priceReviewBlockerCode === "ROUTE_PRICING_PENDING" && (
                  <p className="mt-1 text-xs text-slate">
                    Your labor units are already saved. This service needs a route-pricing review
                    screen from Price2Book; there is no fixed service duration for you to enter.
                  </p>
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
