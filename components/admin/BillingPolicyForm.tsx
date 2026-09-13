"use client";

import { useMemo, useState } from "react";
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

  const initial = useMemo(() => JSON.stringify({
    taxOn: settings.salesTaxEnabled,
    rate: percent(settings.salesTaxRatePpm),
    amount: dollars(settings.depositAmountCents),
    everyJob: settings.depositOnEveryBooking,
    threshold: dollars(settings.depositSubtotalThresholdCents),
    duration: hours(settings.depositDurationThresholdMinutes),
  }), [settings]);

  const current = JSON.stringify({ taxOn, rate, amount, everyJob, threshold, duration });
  const dirty = current !== initial;

  function changed(fn: () => void) {
    fn();
    setState("idle");
    setError(null);
  }

  function validate(): string | null {
    const number = (value: string) => value.trim() === "" ? null : Number(value);
    const exactlyRepresentable = (value: number | null, scale: number) => {
      if (value === null || !Number.isFinite(value)) return true;
      const scaled = value * scale;
      const rounded = Math.round(scaled);
      return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) <= 1e-7;
    };
    const taxRate = number(rate);
    const deposit = number(amount);
    const subtotal = number(threshold);
    const hoursReserved = number(duration);

    if (taxOn && (taxRate === null || !Number.isFinite(taxRate) || taxRate <= 0)) {
      return "Enter the tax rate you charge before turning sales tax on.";
    }
    if (taxRate !== null && Number.isFinite(taxRate) && !exactlyRepresentable(taxRate, 10_000)) {
      return "Sales tax rate can have no more than four decimal places.";
    }
    if (deposit !== null && (!Number.isFinite(deposit) || deposit < 0)) {
      return "Deposit amount must be a valid dollar amount of zero or more.";
    }
    if (!exactlyRepresentable(deposit, 100)) {
      return "Deposit amount can have no more than two decimal places.";
    }
    if (subtotal !== null && (!Number.isFinite(subtotal) || subtotal < 0)) {
      return "Deposit subtotal threshold must be a valid dollar amount of zero or more.";
    }
    if (!exactlyRepresentable(subtotal, 100)) {
      return "Deposit subtotal threshold can have no more than two decimal places.";
    }
    if (hoursReserved !== null && (!Number.isFinite(hoursReserved) || hoursReserved <= 0)) {
      return "Deposit duration threshold must be greater than zero hours, or left blank to turn the rule off.";
    }
    if (hoursReserved !== null && Number.isFinite(hoursReserved) && !exactlyRepresentable(hoursReserved, 60)) {
      return "Deposit duration threshold must resolve to a whole number of minutes.";
    }
    return null;
  }

  async function save() {
    if (!dirty || state === "saving") return;
    const problem = validate();
    if (problem) {
      setError(problem);
      setState("idle");
      return;
    }

    setState("saving");
    setError(null);
    try {
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
      if (!res.ok) {
        setError(json.error ?? "Could not save tax and deposit rules. Nothing was changed.");
        setState("idle");
        return;
      }
      setState("saved");
      router.refresh();
    } catch {
      // A dropped browser response does not prove the write failed. Refresh the
      // server state and make the contractor confirm it before sending another
      // billing-policy mutation against stale values.
      setError("Price2Book lost the response while saving. Refreshing the current settings now — confirm them before trying again.");
      setState("idle");
      router.refresh();
    }
  }

  const field = "w-full rounded-card border border-cardline bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10";

  return (
    <div className="space-y-5 pb-24">
      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite/55 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-navy">Sales tax</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate">
                You decide whether sales tax applies to your work and what rate to charge. Price2Book applies that rate to the job and shows it before booking.
              </p>
            </div>
            <span className={`w-fit rounded-pill px-3 py-1 text-xs font-semibold ${taxOn ? "bg-success/10 text-success" : "bg-white text-slate ring-1 ring-cardline"}`}>
              {taxOn ? "Enabled" : "Not charging tax"}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-card border border-cardline bg-white p-4 transition hover:border-electric/30">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#2452D9]"
              checked={taxOn}
              onChange={(e) => changed(() => setTaxOn(e.target.checked))}
            />
            <span>
              <span className="block text-sm font-semibold text-navy">Charge sales tax on bookings</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate">Added at checkout after the pre-tax service total is established.</span>
            </span>
          </label>

          <div className={`mt-4 rounded-card border p-4 transition ${taxOn ? "border-electric/20 bg-electric/[0.025]" : "border-cardline bg-warmwhite/45"}`}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate" htmlFor="rate">Sales tax rate</label>
            <div className="mt-2 flex max-w-xs items-center gap-2">
              <input
                id="rate"
                value={rate}
                inputMode="decimal"
                placeholder="6.625"
                disabled={!taxOn}
                onChange={(e) => changed(() => setRate(e.target.value))}
                className={`${field} disabled:cursor-not-allowed disabled:bg-warmwhite disabled:text-slate/60`}
              />
              <span className="text-sm font-semibold text-slate">%</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate">Enter the rate your business has decided to charge. Price2Book does not determine taxability or jurisdiction.</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite/55 px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-bold text-navy">Deposits</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate">
            Set one deposit amount, then choose the situations that require it. A booking needs a deposit when any enabled rule matches.
          </p>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate" htmlFor="amount">Deposit amount</label>
            <div className="mt-2 flex max-w-xs items-center gap-2">
              <span className="text-sm font-semibold text-slate">$</span>
              <input
                id="amount"
                value={amount}
                inputMode="decimal"
                placeholder="249"
                onChange={(e) => changed(() => setAmount(e.target.value))}
                className={field}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate">If the booking total is lower than the deposit amount, Price2Book takes only the booking total — never more.</p>
          </div>

          <div className="border-t border-cardline pt-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-navy">Require a deposit when…</h3>
                <p className="mt-1 text-xs text-slate">These rules are OR, not AND. Any one enabled rule is enough.</p>
              </div>
              <span className="mt-2 w-fit rounded-pill bg-warmwhite px-2.5 py-1 text-[11px] font-semibold text-slate sm:mt-0">
                Leave a numeric rule blank to turn it off
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <label className={`flex cursor-pointer items-start gap-3 rounded-card border p-4 transition ${everyJob ? "border-electric/25 bg-electric/[0.025]" : "border-cardline bg-white hover:border-electric/30"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#2452D9]"
                  checked={everyJob}
                  onChange={(e) => changed(() => setEveryJob(e.target.checked))}
                />
                <span>
                  <span className="block text-sm font-semibold text-navy">Every online booking</span>
                  <span className="mt-0.5 block text-xs text-slate">Use the deposit amount above on every job booked through Price2Book.</span>
                </span>
              </label>

              <RuleField
                title="Booking subtotal"
                description="Require a deposit when the pre-tax service total reaches this amount."
                prefix="$"
              >
                <input
                  value={threshold}
                  inputMode="decimal"
                  placeholder="1000"
                  onChange={(e) => changed(() => setThreshold(e.target.value))}
                  className={field}
                  aria-label="Deposit price threshold"
                />
              </RuleField>

              <RuleField
                title="Time reserved"
                description="Require a deposit when the booking consumes at least this many hours of the day."
                suffix="hours"
              >
                <input
                  value={duration}
                  inputMode="decimal"
                  placeholder="4"
                  onChange={(e) => changed(() => setDuration(e.target.value))}
                  className={field}
                  aria-label="Deposit duration threshold in hours"
                />
              </RuleField>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate">
              Individual services can still be configured to always require or never independently require a deposit on their own service page.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-card border border-p2b-error-line bg-p2b-error-bg px-4 py-3 text-sm text-p2b-error-ink">
          {error}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-cardline bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,30,60,0.06)] backdrop-blur sm:left-64">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0 text-sm">
            {state === "saved" && !dirty ? (
              <span className="font-medium text-success">Saved.</span>
            ) : dirty ? (
              <span className="text-slate">You have unsaved changes.</span>
            ) : (
              <span className="text-slate">Tax and deposit rules are up to date.</span>
            )}
          </div>
          <button
            onClick={save}
            disabled={state === "saving" || !dirty}
            className="shrink-0 rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleField({
  title,
  description,
  prefix,
  suffix,
  children,
}: {
  title: string;
  description: string;
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-cardline bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
        <div>
          <p className="text-sm font-semibold text-navy">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {prefix && <span className="text-sm font-semibold text-slate">{prefix}</span>}
          {children}
          {suffix && <span className="text-xs font-medium text-slate">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}
