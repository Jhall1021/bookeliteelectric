"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function CheckoutDetailsForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", zipCode: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        date: params.get("date"),
        windowStart: params.get("windowStart"),
        windowEnd: params.get("windowEnd"),
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (res.ok && data.bookingId) {
      router.push(`/checkout/confirmation/${data.bookingId}`);
    } else if (res.status === 409) {
      setError(data.error ?? "That window was just taken — please pick another time.");
    } else {
      setError("Something went wrong — please try again.");
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">Almost done</h1>
      <p className="mt-1 text-sm text-slate">We just need a few details to lock in your appointment.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {[
          { key: "name", label: "Full name", type: "text" },
          { key: "email", label: "Email", type: "email" },
          { key: "phone", label: "Phone", type: "tel" },
          { key: "address", label: "Property address", type: "text" },
          { key: "zipCode", label: "ZIP code", type: "text" },
        ].map((field) => (
          <div key={field.key}>
            <label className="text-sm font-medium text-navy">{field.label}</label>
            <input
              required
              type={field.type}
              value={form[field.key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
            />
          </div>
        ))}

        {/* Describes what actually happens today.
            This previously said the customer's card would be securely saved —
            at the moment they're handing over their address, on a form that
            never asks for a card and with no Stripe integration behind it.
            The claim goes back when card capture is real, not before. */}
        <p className="text-xs text-slate">
          Nothing to pay now — we&rsquo;ll sort payment out once the work is done. The price
          you see is the price you pay.
        </p>

        {error && (
          <div className="rounded-card bg-red-50 p-3 text-sm text-red-700">
            {error}{" "}
            <button type="button" onClick={() => router.push("/checkout/schedule")} className="font-semibold underline">
              Pick a different time
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
        >
          {submitting ? "Booking..." : "Confirm Appointment"}
        </button>
      </form>
    </main>
  );
}
