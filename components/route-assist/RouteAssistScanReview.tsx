"use client";

import { useEffect, useState } from "react";
import type {
  RouteAssistScanReviewItemV1,
  RouteAssistScanReviewV1,
} from "@/lib/visual-assist/route-assist/scanReview";

export type RouteAssistScanReviewSelectionV1 = {
  acceptedReviewItemIds: string[];
  reviewFingerprint: string;
};

type Props = {
  review: RouteAssistScanReviewV1;
  onApply: (selection: RouteAssistScanReviewSelectionV1) => void;
  disabled?: boolean;
};

function itemLabel(item: RouteAssistScanReviewItemV1): string {
  switch (item.kind) {
    case "MEASURED_LENGTH":
      return `${item.routeId}: ${String(item.value)} ft measured route`;
    case "SURFACE":
      return `${item.routeId}: ${String(item.value).toLowerCase()} surface`;
    case "PHYSICAL_TURN":
      return `${item.routeId}: ${String(item.value).toLowerCase()} physical turn`;
    case "OBSTACLE":
      return `${item.routeId}: ${String(item.value).toLowerCase()} obstacle`;
  }
}

/**
 * Human-authority surface between room-scan candidates and Route Assist graph
 * acceptance.
 *
 * This component never receives raw provider output and never constructs an
 * acceptance object. It returns only review-item IDs plus the fingerprint for
 * the exact review the customer saw. The domain layer rebuilds canonical values
 * from those IDs and refuses a stale fingerprint.
 *
 * A changed fingerprint also clears local checkbox state immediately. That is
 * a UX guard, not the authority guard: the domain still verifies the fingerprint
 * because browser state is never trusted.
 */
export default function RouteAssistScanReview({ review, onApply, disabled = false }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected([]);
  }, [review.fingerprint]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function apply() {
    onApply({
      acceptedReviewItemIds: [...selected],
      reviewFingerprint: review.fingerprint,
    });
  }

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      data-testid="route-assist-scan-review"
      data-review-fingerprint={review.fingerprint}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Review what the scan observed</h2>
          <p className="mt-1 text-sm text-slate-500">Nothing is selected automatically.</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
          <div className="text-xs text-slate-500">Complete measured route</div>
          <div className="font-semibold text-slate-900">
            {review.completeMeasuredRouteLengthFt ?? "—"} ft
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {review.items.map((item) => (
          <label
            key={item.id}
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              item.canApplyToRouteGraph ? "border-slate-200" : "border-amber-200 bg-amber-50"
            }`}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selected.includes(item.id)}
              disabled={disabled || !item.canApplyToRouteGraph}
              onChange={() => toggle(item.id)}
              data-review-item-id={item.id}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900">{itemLabel(item)}</span>
              <span className="mt-1 block text-xs text-slate-500">
                Evidence: {item.basis} · provider confidence {Math.round(item.confidence * 100)}%
              </span>
              {!item.canApplyToRouteGraph && (
                <span className="mt-1 block text-xs font-medium text-amber-700">
                  Visible evidence only — no Route Assist V1 graph mapping.
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={apply}
        disabled={disabled}
        className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        Apply selected facts to route
      </button>
    </section>
  );
}
