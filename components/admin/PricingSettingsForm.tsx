"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  crewHourRateCents: number;
  primaryMinimumCents: number;
  roundingIncrementCents: number;
  defaultPermitAdminCents: number;
};

function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function PricingSettingsForm({ settings }: { settings: Settings | null }) {
  const router = useRouter();
  const [rate, setRate] = useState(settings ? toDollars(settings.crewHourRateCents) : "250.00");
  const [minimum, setMinimum] = useState(settings ? toDollars(settings.primaryMinimumCents) : "225.00");
  const [rounding, setRounding] = useState(settings ? toDollars(settings.roundingIncrementCents) : "5.00");
  const [permit, setPermit] = useState(settings ? toDollars(settings.defaultPermitAdminCents) : "0.00");

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);

    const res = await fetch("/api/admin/pricing-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crewHourRateCents: Math.round(parseFloat(rate) * 100),
        primaryMinimumCents: Math.round(parseFloat(minimum) * 100),
        roundingIncrementCents: Math.round(parseFloat(rounding) * 100),
        defaultPermitAdminCents: Math.round(parseFloat(permit) * 100),
      }),
    });

    setSavingSettings(false);
    if (res.ok) {
      setSettingsSaved(true);
      router.refresh();
      setTimeout(() => setSettingsSaved(false), 2500);
    } else {
      setError("Something went wrong saving settings.");
    }
  }

  async function handleRecalculate() {
    setRecalculating(true);
    setError(null);

    const res = await fetch("/api/admin/pricing-settings/recalculate", { method: "POST" });
    setRecalculating(false);

    if (res.ok) {
      const data = await res.json();
      setResult(data);
      router.refresh();
    } else {
      setError("Recalculation failed — no prices were changed.");
    }
  }

  const inputClass = "mt-2 w-full rounded-card border border-cardline bg-white px-4 py-3 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
      <form onSubmit={handleSaveSettings} className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Company-wide model</p>
          <h2 className="mt-1 font-display text-lg font-bold text-navy">Your pricing foundation</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            These values describe how your company prices labor. They support the model; they do not publish a customer-facing price on their own.
          </p>
        </div>

        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-navy">Crew-hour rate</label>
            <p className="mt-1 text-xs leading-5 text-slate">
              One van, per hour. If a lead and helper normally work together, both are already represented in this number.
            </p>
            <div className="relative max-w-sm">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input
                type="number" step="0.01" min="0" required
                value={rate} onChange={(e) => setRate(e.target.value)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-navy">Service-call minimum</label>
            <p className="mt-1 text-xs leading-5 text-slate">The floor for the first service on a visit. Same-visit add-ons are not forced up to this minimum.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input
                type="number" step="0.01" min="0" required
                value={minimum} onChange={(e) => setMinimum(e.target.value)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-navy">Rounding increment</label>
            <p className="mt-1 text-xs leading-5 text-slate">The increment the model uses when it rounds a calculated price.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input
                type="number" step="0.01" min="0.01" required
                value={rounding} onChange={(e) => setRounding(e.target.value)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-navy">Default permit / admin allowance</label>
            <p className="mt-1 text-xs leading-5 text-slate">Used only when an individual service does not already have its own permit or administrative cost.</p>
            <div className="relative max-w-sm">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input
                type="number" step="0.01" min="0" required
                value={permit} onChange={(e) => setPermit(e.target.value)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-cardline bg-warmwhite px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate">Saving updates the model inputs only.</p>
          <button
            type="submit"
            disabled={savingSettings}
            className="rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
          >
            {savingSettings ? "Saving..." : settingsSaved ? "✓ Saved" : "Save pricing settings"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate">Read-only check</p>
          <h2 className="mt-1 font-display text-lg font-bold text-navy">Compare to the model</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            See where a published price differs from the current labor-and-material model. This check writes nothing.
          </p>
        </div>

        <div className="p-5">
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="w-full rounded-pill border border-electric px-5 py-2.5 text-sm font-semibold text-electric transition hover:bg-electric/5 disabled:opacity-50"
          >
            {recalculating ? "Checking..." : "Check for differences"}
          </button>

          {error && <p className="mt-3 rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {result && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-navy">{result.message}</p>
              {result.differences?.length > 0 ? (
                <div className="mt-3 max-h-80 overflow-y-auto rounded-card border border-cardline">
                  {result.differences.map((d: any) => (
                    <div key={d.slug} className="border-b border-cardline px-4 py-3 text-xs last:border-0">
                      <div className="font-semibold text-navy">{d.name}</div>
                      <div className="mt-1 space-y-1 text-slate">
                        {d.publishedPrimary !== null && d.modelPrimary !== null && (
                          <p>Standalone: ${(d.publishedPrimary / 100).toFixed(0)} published · ${(d.modelPrimary / 100).toFixed(0)} model</p>
                        )}
                        {d.publishedAddOn !== null && d.modelAddOn !== null && (
                          <p>Same visit: ${(d.publishedAddOn / 100).toFixed(0)} published · ${(d.modelAddOn / 100).toFixed(0)} model</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate">No service-by-service changes are made from this screen.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
