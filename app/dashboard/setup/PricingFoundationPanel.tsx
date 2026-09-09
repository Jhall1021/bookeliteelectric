"use client";

import Link from "next/link";
import type { Finding } from "@/lib/onboardingReadiness";

/**
 * What you charge for time, what your materials cost, then your prices.
 *
 * In that order, because a suggested price built on an uncosted material is a
 * number nobody should look at. The third panel only appears once the first
 * two are clear.
 *
 * GUIDED SETUP NEVER APPROVES A PRICE. It shows the derived figure with its
 * breakdown and links to the service's own Pricing panel. The price-writer
 * audit treats a script stamping its own approval as a governance failure, and
 * a wizard is a script with buttons.
 */

export type ServicePricing = {
  slug: string;
  name: string;
  derivedCents: number | null;
  publishedCents: number | null;
  approved: boolean;
  promisesFixedPrice: boolean;
  breakdown: string | null;
};

const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

export default function PricingFoundationPanel({
  settings, offeredCount, unresolvedRoleCount, policyFindings, services, foundationClear,
}: {
  settings: {
    crewHourRateCents: number | null;
    primaryMinimumCents: number | null;
    roundingIncrementCents: number | null;
    defaultPermitAdminCents: number | null;
  } | null;
  /** How many services this contractor has chosen to offer — zero means there is nothing to cost yet, distinct from "chosen and fully costed". */
  offeredCount: number;
  /**
   * The real count of unresolved MATERIAL_COST_UNRESOLVED findings, already
   * scoped to offered services by the readiness engine. Shown as a count
   * here, never as its own list — MaterialBaselineBatchPanel (rendered
   * alongside this component) is the one interactive place a contractor
   * actually resolves one, and listing the same role in both places is what
   * the pricing-foundation stage's own blockers-list exclusion already
   * guards against for the page-wide list. A hardcoded 0 here (this panel's
   * previous shape) said "everything is costed" while that same panel still
   * listed real unresolved roles — this count is why that can't happen again.
   */
  unresolvedRoleCount: number;
  policyFindings: Finding[];
  services: ServicePricing[];
  foundationClear: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-navy">What you charge for time</h2>
            <p className="mt-1 text-sm text-slate">
              Your rate and minimum. Every price we work out starts here.
            </p>
          </div>
          <Link href="/dashboard/pricing-settings" className="shrink-0 text-sm font-semibold text-electric hover:underline">
            Open
          </Link>
        </div>

        {settings ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between border-b border-cardline pb-2">
              <dt className="text-slate">Crew-hour rate</dt>
              <dd className="font-medium text-navy">{money(settings.crewHourRateCents)}</dd>
            </div>
            <div className="flex justify-between border-b border-cardline pb-2">
              <dt className="text-slate">Service-call minimum</dt>
              <dd className="font-medium text-navy">{money(settings.primaryMinimumCents)}</dd>
            </div>
            <div className="flex justify-between border-b border-cardline pb-2">
              <dt className="text-slate">Rounding</dt>
              <dd className="font-medium text-navy">{money(settings.roundingIncrementCents)}</dd>
            </div>
            <div className="flex justify-between border-b border-cardline pb-2">
              <dt className="text-slate">Permit handling</dt>
              <dd className="font-medium text-navy">{money(settings.defaultPermitAdminCents)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 rounded-card bg-warmwhite p-4 text-sm text-slate">
            Not set yet. Nothing can be priced until your rate is.
          </p>
        )}

        {/* Materials markup is a Price2Book rule, not a contractor control.
            Shown so the number is not a mystery, and NOT offered as a field —
            inventing one would imply a decision that does not exist. */}
        <p className="mt-4 text-xs text-slate">
          Materials are sold at cost plus our standard markup — 30% of the first $750, 20% above
          that, applied once to the whole job rather than to each part.
        </p>
      </section>

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">What your materials cost you</h2>
        {/*
         * Three states, and only one of them is ever shown — never combined
         * with a hardcoded stand-in for whichever isn't computed here.
         * "Choose your services first" and "everything is costed" both read
         * as roleFindings.length === 0; offeredCount is what actually tells
         * them apart, since MATERIAL_COST_UNRESOLVED is scoped to offered
         * services and reports nothing when nothing is offered either.
         */}
        {offeredCount === 0 ? (
          <p className="mt-1 text-sm text-slate">Choose your services first.</p>
        ) : unresolvedRoleCount > 0 ? (
          <p className="mt-1 text-sm text-slate">
            {unresolvedRoleCount} material cost{unresolvedRoleCount === 1 ? "" : "s"} need
            {unresolvedRoleCount === 1 ? "s" : ""} your review.
          </p>
        ) : (
          <p className="mt-1 text-sm text-success">
            Everything the services you offer need is costed.
          </p>
        )}

        {/*
         * Policy decisions — a different kind of thing from a material cost
         * (which role, at what quantity, vs. a per-contractor policy like an
         * included run length) and NOT handled by MaterialBaselineBatchPanel,
         * so this stays the one place they're listed. Independent of the
         * material-cost status above: a contractor can be fully costed and
         * still have a policy left, or vice versa, and neither is
         * contradicted by the other being shown.
         */}
        {policyFindings.length > 0 && (
          <>
            <p className="mt-3 text-sm text-slate">
              {policyFindings.length} pricing polic{policyFindings.length === 1 ? "y" : "ies"} decision
              {policyFindings.length === 1 ? "" : "s"} left. Each one is asked once, however many
              services use it.
            </p>
            <ul className="mt-4 space-y-2">
              {policyFindings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  <span className="text-slate">
                    {f.message}
                    {f.href && (
                      <Link href={f.href} className="ml-1 font-medium text-electric hover:underline">
                        Fix
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {foundationClear && services.length > 0 && (
        <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Your prices</h2>
          <p className="mt-1 text-sm text-slate">
            This is what your own rate and costs work out to. Nothing is published until you
            approve it.
          </p>
          <ul className="mt-4 space-y-3">
            {services.map((s) => (
              <li key={s.slug} className="border-b border-cardline pb-3 last:border-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium text-navy">{s.name}</span>
                  <span className="text-sm">
                    {s.promisesFixedPrice ? (
                      <>
                        <span className="font-medium text-navy">{money(s.derivedCents)}</span>
                        {s.approved && s.publishedCents === s.derivedCents && (
                          <span className="ml-2 text-xs text-success">approved</span>
                        )}
                        {s.approved && s.publishedCents !== s.derivedCents && (
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
                {s.promisesFixedPrice && !s.approved && (
                  <Link
                    href="/dashboard/services"
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
