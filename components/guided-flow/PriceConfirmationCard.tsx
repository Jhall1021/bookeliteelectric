"use client";

import { formatCents } from "@/lib/flow-types";
import { usePricingCopy } from "@/components/theme/StorefrontContext";

type Props = {
  serviceName: string;
  /** Overrides the button wording. See Service.ctaLabel. */
  ctaLabel?: string | null;
  priceCents: number;
  disclaimer: string | null;
  onAddToVisit: () => void;
  repeatItemLabel?: string | null;
  quantity?: number;
  maxQuantity?: number;
  onQuantityChange?: (quantity: number) => void;
  additionalPriceCents?: number | null;
  additionalPriceIsStartingAt?: boolean;
  busy?: boolean;
  /**
   * Optional, editable context to carry to the technician — B.4. Both
   * props must be supplied together; when they are, a labeled, editable
   * field renders above the button. Omit both for every ordinary resolved
   * service (the vast majority): visually and behaviorally unchanged.
   */
  note?: string;
  onNoteChange?: (value: string) => void;
  noteLabel?: string;
};

export default function PriceConfirmationCard({
  serviceName, ctaLabel, priceCents, disclaimer, onAddToVisit, note, onNoteChange, noteLabel,
  repeatItemLabel, quantity = 1, maxQuantity = 20, onQuantityChange,
  additionalPriceCents, additionalPriceIsStartingAt = false, busy = false,
}: Props) {
  const pcopy = usePricingCopy();
  const repeatItemPlural = repeatItemLabel?.endsWith("switch")
    ? `${repeatItemLabel}es`
    : repeatItemLabel
      ? `${repeatItemLabel}s`
      : null;
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

      {repeatItemLabel && onQuantityChange && (
        <div className="mt-5 rounded-card border border-blue-200 bg-blue-50 p-4 text-left">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold text-navy">How many matching {repeatItemPlural}?</span>
              <span className="mt-1 block text-xs leading-5 text-slate">
                Choose the total now. We’ll reuse these answers and price every additional item at the reduced While We’re There rate.
              </span>
            </span>
            <select
              aria-label={`Number of matching ${repeatItemPlural}`}
              value={quantity}
              onChange={(event) => onQuantityChange(Number(event.target.value))}
              className="min-w-20 rounded-card border border-cardline bg-white px-3 py-2 text-base font-semibold text-navy"
            >
              {Array.from({ length: maxQuantity }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>
          {additionalPriceCents !== null && additionalPriceCents !== undefined && (
            <p className="mt-3 text-sm font-medium text-success">
              Each additional matching item {additionalPriceIsStartingAt ? "starts at " : "is "}
              {formatCents(additionalPriceCents)}.
            </p>
          )}
          <p className="mt-1 text-xs text-slate">If any location has a different setup, add that one separately.</p>
        </div>
      )}

      {onNoteChange && (
        <label className="mt-4 block text-left">
          <span className="text-xs font-medium text-slate">
            {noteLabel ?? "What should we tell the technician?"}
          </span>
          <textarea
            value={note ?? ""}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-card border border-cardline p-2 text-sm text-ink"
          />
        </label>
      )}

      <button
        onClick={onAddToVisit}
        disabled={busy}
        className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-10"
      >
        {busy ? "Adding…" : quantity > 1 ? `Add ${quantity} to My Visit` : ctaLabel ?? "Add to My Visit"}
      </button>
      <p className="mt-3 text-xs text-muted">{pcopy.priceHeldNotice}</p>
    </div>
  );
}
