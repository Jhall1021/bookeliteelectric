"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Who owns the calendar. Durable contractor configuration, set here first. */
export default function SchedulingAuthorityControl({
  authority,
}: { authority: "NATIVE" | "EXTERNAL" | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(value: "NATIVE" | "EXTERNAL") {
    if (busy || authority === value) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/setup/scheduling-authority", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority: value }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Price2Book couldn't save your scheduling choice. Try again."
        );
        return;
      }

      router.refresh();
    } catch {
      setError("Price2Book couldn't save your scheduling choice. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
      <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
        <h3 className="font-display text-lg font-bold text-navy">Who should control your calendar?</h3>
        <p className="mt-1 text-sm text-slate">Price2Book needs one scheduling source of truth so customers only see times you can actually honor.</p>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {([
          ["NATIVE", "Let Price2Book manage availability", "Best if you want Price2Book to calculate open times from your working hours, capacity, and existing bookings.", "Built-in scheduling"],
          ["EXTERNAL", "Use the scheduling system I already have", "Best if another calendar or field-service platform should remain authoritative for what times are available.", "Keep your current calendar"],
        ] as const).map(([value, label, blurb, eyebrow]) => {
          const selected = authority === value;
          return (
            <label
              key={value}
              className={`group flex cursor-pointer items-start gap-4 rounded-card border p-4 transition ${
                selected ? "border-electric bg-electric/[0.04] ring-1 ring-electric/10" : "border-cardline bg-white hover:border-electric/50 hover:bg-warmwhite/40"
              }`}
            >
              <input
                type="radio" name="authority" className="mt-1 h-4 w-4 accent-electric"
                checked={selected} disabled={busy}
                onChange={() => void choose(value)}
              />
              <span className="min-w-0 flex-1">
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${selected ? "text-electric" : "text-slate"}`}>{eyebrow}</span>
                <span className="mt-0.5 block text-sm font-semibold text-navy">{label}</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate">{blurb}</span>
              </span>
              {selected && <span className="shrink-0 rounded-pill bg-electric px-2.5 py-1 text-[11px] font-semibold text-white">Selected</span>}
            </label>
          );
        })}
        {busy && <p className="text-xs text-slate">Saving your scheduling choice…</p>}
        {error && <div role="alert" className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      </div>
    </div>
  );
}
