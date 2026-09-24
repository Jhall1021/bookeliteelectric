"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Nullable: a contractor who has not decided a field must see an EMPTY input,
// not a confident 0. Showing zero would mean "I charge no service-call
// minimum" — a real, different business decision they never made.
type Settings = {
  crewHourRateCents: number | null;
  electricianHourRateCents: number | null;
  fixtureHeight12Percent: number | null;
  fixtureHeight14Percent: number | null;
  primaryMinimumCents: number | null;
  roundingIncrementCents: number | null;
  defaultPermitAdminCents: number | null;
};

type SettingsImpact = {
  affected: number;
  judged: number;
  raised: number;
  lowered: number;
  largestChangeCents: number;
  examples: {
    slug: string;
    kind: "standalone" | "same-visit";
    publishedCents: number;
    modelCents: number;
  }[];
};

type CompareResult = {
  message: string;
  differences?: {
    slug: string;
    name: string;
    publishedPrimary: number | null;
    modelPrimary: number | null;
    publishedAddOn: number | null;
    modelAddOn: number | null;
  }[];
};

// Nullable-aware: `Settings`'s own fields are `number | null` above (a
// contractor who hasn't decided a field must see an empty input, not a
// confident 0), so whatever renders one has to handle that here rather than
// at every call site.
function toDollars(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

function formatMoney(cents: number) {
  return `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(0)}`;
}

function dollarsToCents(value: string, label: string, allowZero: boolean): number {
  const normalized = value.trim();
  if (normalized === "") throw new Error(`${label} is required.`);
  const dollars = Number(normalized);
  if (!Number.isFinite(dollars) || dollars < 0 || (!allowZero && dollars === 0)) {
    throw new Error(`${label} must be ${allowZero ? "zero or more" : "greater than zero"}.`);
  }
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`${label} is too large.`);
  return cents;
}

function wholePercent(value: string, label: string): number {
  const normalized = value.trim();
  if (normalized === "") throw new Error(`${label} is required.`);
  const percent = Number(normalized);
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 300) {
    throw new Error(`${label} must be a whole percentage from 0 to 300.`);
  }
  return percent;
}

export default function PricingSettingsForm({ settings }: { settings: Settings | null }) {
  const router = useRouter();
  const [rate, setRate] = useState(settings ? toDollars(settings.crewHourRateCents) : "250.00");
  const [electricianRate, setElectricianRate] = useState(settings ? toDollars(settings.electricianHourRateCents) : "200.00");
  const [height12, setHeight12] = useState(String(settings?.fixtureHeight12Percent ?? 15));
  const [height14, setHeight14] = useState(String(settings?.fixtureHeight14Percent ?? 30));
  const [minimum, setMinimum] = useState(settings ? toDollars(settings.primaryMinimumCents) : "225.00");
  const [rounding, setRounding] = useState(settings ? toDollars(settings.roundingIncrementCents) : "5.00");
  const [permit, setPermit] = useState(settings ? toDollars(settings.defaultPermitAdminCents) : "0.00");

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [pendingImpact, setPendingImpact] = useState<SettingsImpact | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  function payload() {
    return {
      crewHourRateCents: dollarsToCents(rate, "Crew-hour rate", true),
      electricianHourRateCents: dollarsToCents(electricianRate, "Electrician-only crew-hour rate", true),
      fixtureHeight12Percent: wholePercent(height12, "12-foot labor increase"),
      fixtureHeight14Percent: wholePercent(height14, "14-foot labor increase"),
      primaryMinimumCents: dollarsToCents(minimum, "Service-call minimum", true),
      roundingIncrementCents: dollarsToCents(rounding, "Rounding increment", false),
      defaultPermitAdminCents: dollarsToCents(permit, "Default permit / admin allowance", true),
    };
  }

  function changed() {
    setPendingImpact(null);
    setSettingsSaved(false);
    setSaveError(null);
  }

  async function saveSettings(acknowledgeImpact?: number) {
    if (savingSettings) return;

    let body: ReturnType<typeof payload>;
    try {
      body = payload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Check the pricing values and try again.");
      return;
    }

    setSavingSettings(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/pricing-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(acknowledgeImpact !== undefined ? { acknowledgeImpact } : {}) }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setPendingImpact(null);
        setSettingsSaved(true);
        router.refresh();
        setTimeout(() => setSettingsSaved(false), 2500);
        return;
      }

      if (res.status === 409 && data.error === "IMPACT_CONFIRMATION_REQUIRED" && data.impact) {
        setPendingImpact(data.impact as SettingsImpact);
        return;
      }

      setSaveError(typeof data.error === "string" ? data.error : "Something went wrong saving settings. Nothing was changed.");
    } catch {
      setSaveError("Could not reach Price2Book. Check your connection and try again; nothing was changed.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setPendingImpact(null);
    await saveSettings();
  }

  async function handleRecalculate() {
    if (recalculating) return;
    setRecalculating(true);
    setCompareError(null);
    try {
      const res = await fetch("/api/admin/pricing-settings/recalculate", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setResult(data as CompareResult);
        router.refresh();
      } else {
        setCompareError(typeof data.error === "string" ? data.error : "Comparison failed — no prices were changed.");
      }
    } catch {
      setCompareError("Could not reach Price2Book. Try the comparison again when your connection is available.");
    } finally {
      setRecalculating(false);
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
          <div>
            <label className="text-sm font-semibold text-navy">One van + electrician</label>
            <p className="mt-1 text-xs leading-5 text-slate">What you charge per hour for one van with one electrician.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input type="number" step="0.01" min="0" required value={electricianRate}
                onChange={(e) => { setElectricianRate(e.target.value); changed(); }}
                className={`${inputClass} pl-8`} />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-navy">One van + electrician and helper</label>
            <p className="mt-1 text-xs leading-5 text-slate">What you charge per hour when both people are assigned to the service.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input type="number" step="0.01" min="0" required value={rate}
                onChange={(e) => { setRate(e.target.value); changed(); }}
                className={`${inputClass} pl-8`} />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-navy">Service-call minimum</label>
            <p className="mt-1 text-xs leading-5 text-slate">The floor for the first service on a visit. Same-visit add-ons are not forced up to this minimum.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input type="number" step="0.01" min="0" required value={minimum}
                onChange={(e) => { setMinimum(e.target.value); changed(); }}
                className={`${inputClass} pl-8`} />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-navy">Rounding increment</label>
            <p className="mt-1 text-xs leading-5 text-slate">The increment the model uses when it rounds a calculated price.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input type="number" step="0.01" min="0.01" required value={rounding}
                onChange={(e) => { setRounding(e.target.value); changed(); }}
                className={`${inputClass} pl-8`} />
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="text-sm font-semibold text-navy">Working-height labor</p>
            <p className="mt-1 text-xs leading-5 text-slate">10 feet and under uses the base time. These increases apply to ordinary fixture work at higher ceilings.</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-navy">12-foot ceiling (%)<input type="number" min="0" max="300" step="1" required value={height12} onChange={(e) => { setHeight12(e.target.value); changed(); }} className={inputClass} /></label>
              <label className="text-xs font-medium text-navy">14-foot ceiling (%)<input type="number" min="0" max="300" step="1" required value={height14} onChange={(e) => { setHeight14(e.target.value); changed(); }} className={inputClass} /></label>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-navy">Default permit / admin allowance</label>
            <p className="mt-1 text-xs leading-5 text-slate">Used only when an individual service does not already have its own permit or administrative cost.</p>
            <div className="relative max-w-sm">
              <span className="pointer-events-none absolute left-4 top-[22px] text-sm text-slate">$</span>
              <input type="number" step="0.01" min="0" required value={permit}
                onChange={(e) => { setPermit(e.target.value); changed(); }}
                className={`${inputClass} pl-8`} />
            </div>
          </div>
        </div>

        {saveError && (
          <div role="alert" className="mx-6 mb-6 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        {pendingImpact && (
          <div className="mx-6 mb-6 rounded-card border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-navy">Review the model impact before saving</p>
            <p className="mt-1 text-sm leading-6 text-slate">
              These inputs would leave <strong className="text-navy">{pendingImpact.affected}</strong> of {pendingImpact.judged} published price points outside the current model tolerance. No customer price will change from this save.
            </p>
            <div className="mt-3 grid gap-2 text-xs text-slate sm:grid-cols-3">
              <div className="rounded-md bg-white px-3 py-2"><strong className="block text-navy">{pendingImpact.raised}</strong> model prices higher</div>
              <div className="rounded-md bg-white px-3 py-2"><strong className="block text-navy">{pendingImpact.lowered}</strong> model prices lower</div>
              <div className="rounded-md bg-white px-3 py-2"><strong className="block text-navy">{formatMoney(pendingImpact.largestChangeCents)}</strong> largest gap</div>
            </div>
            {pendingImpact.examples.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-slate">
                {pendingImpact.examples.map((example) => (
                  <p key={`${example.slug}-${example.kind}`}>
                    <span className="font-medium text-navy">{example.slug}</span> · {example.kind === "standalone" ? "standalone" : "same visit"}: {formatMoney(example.publishedCents)} published → {formatMoney(example.modelCents)} model
                  </p>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={savingSettings}
                onClick={() => void saveSettings(pendingImpact.affected)}
                className="rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">
                {savingSettings ? "Saving…" : `Save and acknowledge ${pendingImpact.affected} differences`}
              </button>
              <button type="button" disabled={savingSettings} onClick={() => setPendingImpact(null)}
                className="rounded-pill border border-cardline bg-white px-5 py-2.5 text-sm font-semibold text-navy disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-cardline bg-warmwhite px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate">Saving updates model inputs only. Published customer prices remain unchanged.</p>
          <button type="submit" disabled={savingSettings || Boolean(pendingImpact)}
            className="rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">
            {savingSettings ? "Saving..." : settingsSaved ? "✓ Saved" : "Save pricing settings"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate">Read-only check</p>
          <h2 className="mt-1 font-display text-lg font-bold text-navy">Compare to the model</h2>
          <p className="mt-2 text-sm leading-6 text-slate">See where a published price differs from the current labor-and-material model. This check writes nothing.</p>
        </div>

        <div className="p-5">
          <button onClick={() => void handleRecalculate()} disabled={recalculating}
            className="w-full rounded-pill border border-electric px-5 py-2.5 text-sm font-semibold text-electric transition hover:bg-electric/5 disabled:opacity-50">
            {recalculating ? "Checking..." : "Check for differences"}
          </button>

          {compareError && <p role="alert" className="mt-3 rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{compareError}</p>}

          {result && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-navy">{result.message}</p>
              {result.differences && result.differences.length > 0 ? (
                <div className="mt-3 max-h-80 overflow-y-auto rounded-card border border-cardline">
                  {result.differences.map((d) => (
                    <div key={d.slug} className="border-b border-cardline px-4 py-3 text-xs last:border-0">
                      <div className="font-semibold text-navy">{d.name}</div>
                      <div className="mt-1 space-y-1 text-slate">
                        {d.publishedPrimary !== null && d.modelPrimary !== null && <p>Standalone: {formatMoney(d.publishedPrimary)} published · {formatMoney(d.modelPrimary)} model</p>}
                        {d.publishedAddOn !== null && d.modelAddOn !== null && <p>Same visit: {formatMoney(d.publishedAddOn)} published · {formatMoney(d.modelAddOn)} model</p>}
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
