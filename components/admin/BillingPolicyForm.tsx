"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  salesTaxEnabled: boolean;
  salesTaxRatePpm: number | null;
  depositAmountCents: number | null;
  depositOnEveryBooking: boolean;
  depositSubtotalThresholdCents: number | null;
  depositDurationThresholdMinutes: number | null;
};

const dollars = (c: number | null) => (c === null ? "" : String(c / 100));
const hours = (m: number | null) => (m === null ? "" : String(m / 60));
const percent = (ppm: number | null) => (ppm === null ? "" : String(ppm / 10_000));

/**
 * Two decisions, stated in the contractor's terms.
 *
 * The tax half says plainly whose judgment it is: Price2Book applies the rate,
 * the contractor decides whether tax applies and what it is. That boundary is
 * the product's, and burying it would be the kind of quiet implication nobody
 * chose.
 *
 * The deposit half is four independent switches, and the copy says OR — a
 * contractor reading "and" would configure the opposite of what they meant.
 */
export default function BillingPolicyForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [taxOn, setTaxOn] = useState(settings.salesTaxEnabled);
  const [rate, setRate] = useState(percent(settings.salesTaxRatePpm));
  const [amount, setAmount] = useState(dollars(settings.depositAmountCents));
  const [everyJob, setEveryJob] = useState(settings.depositOnEveryBooking);
  const [threshold, setThreshold] = useState(dollars(settings.depositSubtotalThresholdCents));
  const [duration, setDuration] = useState(hours(settings.depositDurationThresholdMinutes));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    const res = await fetch("/api/admin/setup/billing-policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salesTaxEnabled: taxOn,
        salesTaxRatePercent: rate === "" ? null : rate,
        depositAmountDollars: amount === "" ? null : amount,
        depositOnEveryBooking: everyJob,
        depositSubtotalThresholdDollars: threshold === "" ? null : threshold,
        depositDurationThresholdHours: duration === "" ? null : duration,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Could not save that."); setState("idle"); return; }
    setState("saved");
    router.refresh();
  }

  const field = "rounded-md border border-cardline px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Sales tax</h2>
        <p className="mt-1 text-sm text-slate">
          You decide whether sales tax applies to your work and what rate to charge.
          We apply that rate to the job and show it to the homeowner before they book.
        </p>

        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox" className="mt-1"
            checked={taxOn} onChange={(e) => { setTaxOn(e.target.checked); setState("idle"); }}
          />
          <span className="text-sm">
            <span className="font-medium text-navy">Charge sales tax on bookings</span>
            <span className="block text-slate">Added to the job total at checkout.</span>
          </span>
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate" htmlFor="rate">Rate</label>
          <input
            id="rate" value={rate} inputMode="decimal" placeholder="6.625"
            onChange={(e) => { setRate(e.target.value); setState("idle"); }}
            className={`${field} w-28`}
          />
          <span className="text-sm text-slate">%</span>
        </div>
      </section>

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Deposits</h2>
        <p className="mt-1 text-sm text-slate">
          One deposit per booking, taken when you book the job. It comes off the total —
          the homeowner pays the rest when the work is done.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate" htmlFor="amount">Deposit amount $</label>
          <input
            id="amount" value={amount} inputMode="decimal" placeholder="249"
            onChange={(e) => { setAmount(e.target.value); setState("idle"); }}
            className={`${field} w-32`}
          />
        </div>
        <p className="mt-1 text-xs text-slate">
          If a job costs less than this, we only take the job total — never more.
        </p>

        <h3 className="mt-5 text-sm font-semibold text-navy">Take a deposit when…</h3>
        <p className="text-xs text-slate">
          Any one of these is enough. You don&apos;t need them all to be true.
        </p>

        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox" className="mt-1"
            checked={everyJob} onChange={(e) => { setEveryJob(e.target.checked); setState("idle"); }}
          />
          <span className="text-sm text-navy">Every job booked online</span>
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate">The job is at least $</span>
          <input
            value={threshold} inputMode="decimal" placeholder="1000"
            onChange={(e) => { setThreshold(e.target.value); setState("idle"); }}
            className={`${field} w-28`}
            aria-label="Deposit price threshold"
          />
          <span className="text-sm text-slate">before tax</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate">It books at least</span>
          <input
            value={duration} inputMode="decimal" placeholder="4"
            onChange={(e) => { setDuration(e.target.value); setState("idle"); }}
            className={`${field} w-24`}
            aria-label="Deposit duration threshold in hours"
          />
          <span className="text-sm text-slate">hours of your day</span>
        </div>

        <p className="mt-3 text-xs text-slate">
          Leave a box empty to turn that rule off. You can also set an individual service
          to always or never need a deposit on its own page.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        {state === "saved" && <span className="text-sm text-success">Saved.</span>}
        {error && <span className="text-sm text-p2b-error-ink">{error}</span>}
      </div>
    </div>
  );
}
