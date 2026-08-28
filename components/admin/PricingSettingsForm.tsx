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

  return (
    <div className="mt-6 max-w-xl space-y-8">
      <form onSubmit={handleSaveSettings} className="space-y-4 rounded-card border border-cardline bg-white p-6 shadow-card">
        <div>
          {/* Was "productive tech-hour", which read as a per-person rate and
              produced a second-technician charge on the TV tier twice. One
              crew is one van: a lead and a helper, both already inside this
              number. */}
          <label className="text-sm font-medium text-navy">Crew-hour rate ($ per hour, per van)</label>
          <input
            type="number" step="0.01" min="0" required
            value={rate} onChange={(e) => setRate(e.target.value)}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-navy">Service-call minimum ($)</label>
          <input
            type="number" step="0.01" min="0" required
            value={minimum} onChange={(e) => setMinimum(e.target.value)}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
          <p className="mt-1 text-xs text-slate">
            The first service on a visit never prices below this, whatever its
            duration. Set independently of the rate — lowering the rate does
            not lower this floor. Never applies to same-visit add-ons.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-navy">Rounding increment ($)</label>
          <input
            type="number" step="0.01" min="0.01" required
            value={rounding} onChange={(e) => setRounding(e.target.value)}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-navy">Default permit/admin allowance ($)</label>
          <input
            type="number" step="0.01" min="0" required
            value={permit} onChange={(e) => setPermit(e.target.value)}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
          />
          <p className="mt-1 text-xs text-slate">Used when a service has no of its own permit/admin cost on file.</p>
        </div>

        <button
          type="submit"
          disabled={savingSettings}
          className="w-full rounded-pill border border-electric py-3 text-sm font-semibold text-electric transition hover:bg-electric/5 disabled:opacity-50"
        >
          {savingSettings ? "Saving..." : settingsSaved ? "✓ Settings Saved" : "Save Settings (doesn't change prices yet)"}
        </button>
      </form>

      {/* Was "Recalculate All Prices", a red button that rewrote every
          published price from the legacy workbook fields. It would have
          reverted the whole August reconciliation in one click. Now it
          reports and writes nothing. */}
      <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-navy">Check Prices Against the Model</h2>
        <p className="mt-1 text-sm text-slate">
          Shows where a published price differs from what its crew-hours and materials
          produce. Changes nothing — publishing happens one service at a time, so a
          settings change can never quietly reprice the catalog.
        </p>

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="mt-4 rounded-pill border border-electric px-6 py-2.5 text-sm font-semibold text-electric transition hover:bg-electric/5 disabled:opacity-50"
        >
          {recalculating ? "Checking..." : "Check for Differences"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="mt-5">
            <p className="text-sm font-semibold text-navy">{result.message}</p>
            {result.differences?.length > 0 && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-card border border-cardline">
                {result.differences.map((d: any) => (
                  <div key={d.slug} className="border-b border-cardline px-3 py-2 text-xs last:border-0">
                    <div className="font-medium text-navy">{d.name}</div>
                    <div className="mt-0.5 text-slate">
                      {d.publishedPrimary !== null && d.modelPrimary !== null && (
                        <span>
                          standalone ${(d.publishedPrimary / 100).toFixed(0)} vs model $
                          {(d.modelPrimary / 100).toFixed(0)}
                        </span>
                      )}
                      {d.publishedAddOn !== null && d.modelAddOn !== null && (
                        <span className="ml-3">
                          same-visit ${(d.publishedAddOn / 100).toFixed(0)} vs model $
                          {(d.modelAddOn / 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
