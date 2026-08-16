"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function CheckoutDetailsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", zipCode: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

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
    if (data.bookingId) {
      router.push(`/checkout/confirmation/${data.bookingId}`);
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

        <p className="text-xs text-slate">
          Your card will be securely saved to hold this appointment. You won't be charged until
          the work is completed.
        </p>
        {/* Real card capture (Stripe Elements) is wired in Phase 6 — the
            payment model itself (card-on-file, capture after completion)
            is already decided and reflected in the Booking record below. */}

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
