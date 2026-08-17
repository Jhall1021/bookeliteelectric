"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuotePricingForm({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [depositRequired, setDepositRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dollars = parseFloat(price);
    if (isNaN(dollars) || dollars <= 0) {
      setError("Enter a valid price.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/admin/quotes/${quoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotedPriceCents: Math.round(dollars * 100), depositRequired }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      setError("Something went wrong — try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-wrap items-end gap-3 border-t border-cardline pt-4">
      <div>
        <label className="text-xs font-medium text-navy">Price ($)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-32 rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric"
          placeholder="495.00"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-xs text-navy">
        <input type="checkbox" checked={depositRequired} onChange={(e) => setDepositRequired(e.target.checked)} />
        Deposit required
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-pill bg-electric px-5 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send Price to Customer"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}
