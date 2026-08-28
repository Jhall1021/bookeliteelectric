"use client";

import { formatCents } from "@/lib/flow-types";
import { usePricingCopy } from "@/components/theme/StorefrontContext";

type Props = {
  serviceName: string;
  priceCents: number;
  disclaimer: string | null;
  onAddToVisit: () => void;
};

export default function PriceConfirmationCard({ serviceName, priceCents, disclaimer, onAddToVisit }: Props) {
  const pcopy = usePricingCopy();
  return (
    <div className="ray-accent rounded-card border border-cardline bg-white p-8 text-center shadow-card">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-2xl text-success">
        ✓
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-ink">{pcopy.priceReadyTitle}</h2>
      <p className="text-sm text-slate">Based on your selections</p>

      <div className="mt-4 text-sm font-medium text-navy">{serviceName}</div>
      <div className="mt-1 font-display text-4xl font-bold text-navy">{formatCents(priceCents)}</div>

      {disclaimer && (
        <div className="mt-4 rounded-card border border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-900">
          {disclaimer}
        </div>
      )}

      <button
        onClick={onAddToVisit}
        className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover sm:w-auto sm:px-10"
      >
        Add to My Visit
      </button>
      <p className="mt-3 text-xs text-muted">{pcopy.priceHeldNotice}</p>
    </div>
  );
}
