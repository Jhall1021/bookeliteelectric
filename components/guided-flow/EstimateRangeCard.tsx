"use client";

import { formatCents } from "@/lib/flow-types";
import { usePricingCopy } from "@/components/theme/StorefrontContext";
import type { Estimate } from "@/lib/timeAndMaterials";

/**
 * What a homeowner sees under TIME_AND_MATERIALS — ADR-018.
 *
 * The counterpart to PriceConfirmationCard, and deliberately a different
 * object: a fixed price is a promise and a range is not, so it must not look
 * like one. The rate is shown, the hours are shown, and the arithmetic is
 * shown, because a range a customer cannot check is just a bigger number.
 *
 * NO WORDING IS AUTHORED HERE. Every sentence comes from lib/pricingCopy.ts
 * keyed by strategy. Contractual language must not live inside calculation or
 * presentation code, where changing it means a deploy and nobody can find it.
 */
export default function EstimateRangeCard(
  { serviceName, estimate, disclaimer }:
  { serviceName: string; estimate: Estimate; disclaimer?: string | null },
) {
  const copy = usePricingCopy();

  if (!estimate.ok) {
    // Fails visibly rather than showing a number nobody stands behind.
    return (
      <div className="rounded-card border border-cardline bg-surface p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-ink">{copy.noPriceLabel}</h2>
        <p className="mt-2 text-sm text-muted">
          We need a closer look at this one before we can give you a figure.
        </p>
      </div>
    );
  }

  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={strong ? "font-display text-base font-bold text-ink" : "text-sm font-medium text-ink"}>
        {value}
      </span>
    </div>
  );

  const range = (lo: number, hi: number) =>
    lo === hi ? formatCents(lo) : `${formatCents(lo)}–${formatCents(hi)}`;
  const hours = estimate.lowHours === estimate.highHours
    ? `${estimate.lowHours} hours`
    : `${estimate.lowHours}–${estimate.highHours} hours`;

  return (
    <div className="rounded-card border border-cardline bg-surface p-6 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
        {copy.resolvedPriceLabel}
      </div>
      <h2 className="mt-1 font-display text-xl font-bold text-ink">{serviceName}</h2>

      <div className="mt-4 divide-y divide-line border-y border-line">
        {row("Our labor rate", `${formatCents(estimate.crewHourRateCents)} / crew hour`)}
        {row("Estimated time", hours)}
        {estimate.materialCents !== null && row("Estimated materials", formatCents(estimate.materialCents))}
      </div>

      {/* The emphasised figure is labelled for what it COVERS. With materials
          disclosed separately, this range is labor — naming it a total would
          promote it into the whole bill in the reader's head, which is the one
          misreading this layout must not permit. */}
      <div className="mt-3">
        {row(copy.resolvedPriceLabel, range(estimate.lowTotalCents, estimate.highTotalCents), true)}
      </div>

      {/* Materials are disclosed rather than quoted — see lib/timeAndMaterials.
          Both sentences are authored in the pricing copy, not here. */}
      {copy.materialsNotice && (
        <p className="mt-4 text-sm text-muted">{copy.materialsNotice}</p>
      )}

      {/* The qualification travels with the number rather than living in terms
          nobody reads. Authored in the pricing copy, not here. */}
      {copy.estimateNotice && (
        <p className="mt-3 rounded-card bg-canvas px-4 py-3 text-sm text-muted">{copy.estimateNotice}</p>
      )}

      {/* The service's own caveat, carried through exactly as the flat-rate
          card carries it. Scope wording does not depend on how it is priced. */}
      {disclaimer && <p className="mt-3 text-sm text-muted">{disclaimer}</p>}
    </div>
  );
}
