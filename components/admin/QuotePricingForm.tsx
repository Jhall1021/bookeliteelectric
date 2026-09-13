"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuotePricingForm({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [depositRequired, setDepositRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const dollars = Number(price);
    const cents = dollars * 100;
    if (!Number.isFinite(dollars) || dollars <= 0 || !Number.isSafeInteger(cents)) {
      setError("Enter a valid price with no more than two decimal places.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotedPriceCents: cents, depositRequired }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Price2Book could not send this price. Nothing was intentionally changed.");
        return;
      }

      if (data.emailed === false) {
        setNotice(
          typeof data.emailError === "string"
            ? `Price saved, but the customer was not emailed: ${data.emailError}`
            : "Price saved, but Price2Book could not confirm that the customer was emailed."
        );
      } else {
        setNotice("Price saved and the customer was notified.");
      }
      router.refresh();
    } catch {
      // The route saves the quote before attempting the notification email, so
      // a dropped browser response may mean the price is already live. Do not
      // encourage a blind retry that could resend or overwrite the decision.
      setError("Price2Book lost the response while sending this price. Refreshing the quote now — confirm its status before trying again.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 rounded-card border border-cardline bg-warmwhite p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Your decision</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Set the customer price</h3>
          <p className="mt-1 max-w-xl text-sm text-slate">
            Review the request and photos above, then enter the price you want the customer to receive.
          </p>
        </div>
        <span className="mt-2 inline-flex w-fit items-center rounded-pill bg-white px-3 py-1 text-xs font-semibold text-slate ring-1 ring-cardline sm:mt-0">
          Sent only when you click Send price
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr_auto] sm:items-end">
        <div>
          <label htmlFor={`quote-price-${quoteId}`} className="text-sm font-semibold text-navy">Customer price</label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate">$</span>
            <input
              id={`quote-price-${quoteId}`}
              type="number"
              step="0.01"
              min="0.01"
              required
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setError(null);
                setNotice(null);
              }}
              className="w-full rounded-card border border-cardline bg-white py-2.5 pl-7 pr-3 text-sm font-medium text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
              placeholder="495.00"
            />
          </div>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-card border border-cardline bg-white px-3.5 py-2.5 text-sm text-navy">
          <input
            type="checkbox"
            checked={depositRequired}
            onChange={(e) => {
              setDepositRequired(e.target.checked);
              setError(null);
              setNotice(null);
            }}
            className="h-4 w-4 accent-electric"
          />
          <span>
            <span className="font-semibold">Require a deposit</span>
            <span className="block text-xs text-slate">Customer must complete the deposit step before booking.</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send price"}
        </button>
      </div>

      {notice && (
        <p role="status" className="mt-3 rounded-card border border-success/25 bg-success/[0.06] px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
