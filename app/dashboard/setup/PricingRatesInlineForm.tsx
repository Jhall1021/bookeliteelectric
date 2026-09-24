"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  electricianHourRateCents: number | null;
  crewHourRateCents: number | null;
  fixtureHeight12Percent: number | null;
  fixtureHeight14Percent: number | null;
  primaryMinimumCents: number | null;
  roundingIncrementCents: number | null;
  defaultPermitAdminCents: number | null;
};

const dollars = (cents: number | null, fallback: string) =>
  cents === null ? fallback : (cents / 100).toFixed(2);

function cents(value: string, label: string, allowZero = true) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(`${label} must be ${allowZero ? "zero or more" : "greater than zero"}.`);
  }
  return Math.round(amount * 100);
}

function wholePercent(value: string, label: string) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 300) {
    throw new Error(`${label} must be a whole percentage from 0 to 300.`);
  }
  return amount;
}

export default function PricingRatesInlineForm({ settings }: { settings: Settings | null }) {
  const router = useRouter();
  const [electrician, setElectrician] = useState(dollars(settings?.electricianHourRateCents ?? null, "200.00"));
  const [helperCrew, setHelperCrew] = useState(dollars(settings?.crewHourRateCents ?? null, "250.00"));
  const [height12, setHeight12] = useState(String(settings?.fixtureHeight12Percent ?? 15));
  const [height14, setHeight14] = useState(String(settings?.fixtureHeight14Percent ?? 30));
  const [minimum, setMinimum] = useState(dollars(settings?.primaryMinimumCents ?? null, "225.00"));
  const [rounding, setRounding] = useState(dollars(settings?.roundingIncrementCents ?? null, "5.00"));
  const [permit, setPermit] = useState(dollars(settings?.defaultPermitAdminCents ?? null, "0.00"));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<number | null>(null);

  function payload() {
    return {
      electricianHourRateCents: cents(electrician, "One van plus electrician rate"),
      crewHourRateCents: cents(helperCrew, "One van plus electrician and helper rate"),
      fixtureHeight12Percent: wholePercent(height12, "12-foot labor increase"),
      fixtureHeight14Percent: wholePercent(height14, "14-foot labor increase"),
      primaryMinimumCents: cents(minimum, "Service-call minimum"),
      roundingIncrementCents: cents(rounding, "Rounding increment", false),
      defaultPermitAdminCents: cents(permit, "Permit and admin allowance"),
    };
  }

  async function save(acknowledgeImpact?: number) {
    if (busy) return;
    let body: ReturnType<typeof payload>;
    try { body = payload(); } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the rates and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/admin/pricing-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(acknowledgeImpact === undefined ? {} : { acknowledgeImpact }) }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.error === "IMPACT_CONFIRMATION_REQUIRED") {
        setImpact(result.impact?.affected ?? null);
        return;
      }
      if (!response.ok) throw new Error(result.message ?? result.error ?? "Could not save these rates.");
      setImpact(null);
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save these rates.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-cardline px-3 py-2 text-sm text-navy outline-none focus:border-electric focus:ring-2 focus:ring-electric/10";
  const field = (label: string, value: string, update: (value: string) => void, help: string) => (
    <label className="block">
      <span className="text-sm font-semibold text-navy">{label}</span>
      <span className="mt-0.5 block text-xs text-slate">{help}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-3 text-sm text-slate">$</span>
        <input type="number" min="0" step="0.01" required value={value} onChange={(event) => { update(event.target.value); setSaved(false); setImpact(null); }} className={`${input} pl-7`} />
      </span>
    </label>
  );

  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {field("One van + electrician", electrician, setElectrician, "Hourly rate for one electrician in one van.")}
        {field("One van + electrician and helper", helperCrew, setHelperCrew, "Hourly rate when the service needs both people.")}
        {field("Service-call minimum", minimum, setMinimum, "Minimum charge for the first service on a visit.")}
        {field("Price rounding", rounding, setRounding, "Calculated prices round up by this amount.")}
        {field("Default permit / admin", permit, setPermit, "Used only when a service has no specific allowance.")}
      </div>
      <fieldset className="mt-5 rounded-card border border-cardline bg-warmwhite/60 p-4">
        <legend className="px-1 text-sm font-semibold text-navy">Working-height labor</legend>
        <p className="mt-1 text-xs leading-5 text-slate">Fixture work at 10 feet and under uses the base labor time. The prepared policy is 15% more labor at 12 feet and 30% more at 14 feet. Save to accept it, or adjust either percentage first.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-navy">12-foot ceiling
            <span className="relative mt-1 block"><input type="number" min="0" max="300" step="1" value={height12} onChange={(event) => { setHeight12(event.target.value); setSaved(false); setImpact(null); }} className={`${input} mt-0 pr-8`} /><span className="pointer-events-none absolute right-3 top-2 text-sm text-slate">%</span></span>
            <span className="mt-1 block text-xs text-slate">Prepared value: 15% more labor.</span>
          </label>
          <label className="text-sm font-medium text-navy">14-foot ceiling
            <span className="relative mt-1 block"><input type="number" min="0" max="300" step="1" value={height14} onChange={(event) => { setHeight14(event.target.value); setSaved(false); setImpact(null); }} className={`${input} mt-0 pr-8`} /><span className="pointer-events-none absolute right-3 top-2 text-sm text-slate">%</span></span>
            <span className="mt-1 block text-xs text-slate">Prepared value: 30% more labor.</span>
          </label>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {impact !== null && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate">
        <p><strong className="text-navy">Review before saving:</strong> {impact} approved price point{impact === 1 ? "" : "s"} would no longer match the model. Customer prices will not change automatically.</p>
        <button type="button" disabled={busy} onClick={() => void save(impact)} className="mt-2 font-semibold text-electric">Save these rates anyway</button>
      </div>}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={busy || impact !== null} className="rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save rates"}</button>
        {saved && <span className="text-sm font-medium text-success">Saved</span>}
      </div>
    </form>
  );
}
