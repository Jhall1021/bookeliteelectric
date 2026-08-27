"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSite, useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";

export default function CheckoutDetailsForm() {
  // Storefront navigation must carry the site slug. These were root paths,
  // working only because the legacy Elite redirects catch them — the whole
  // client-side navigation layer was masked by those redirects.
  const base = useStorefrontBase();
  // ADR §2.2 — customer-facing calls carry the storefront identifier.
  const siteFetch = useSiteFetch();
  const site = useSite();
  const router = useRouter();
  const params = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the failure is about the chosen TIME. "Pick a different time"
  // is the right action for a taken window and nonsense for an out-of-area
  // ZIP — offering it there sends the customer to change something that
  // has nothing to do with why they were refused.
  const [timeConflict, setTimeConflict] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", zipCode: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setTimeConflict(false);

    const res = await siteFetch("/api/checkout", {
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
      // Site-scoped. This was a root path, which worked only because the
      // legacy redirects catch it — on the ONE flow where a customer has just
      // been charged the price and must land somewhere correct.
      router.push(`/${site.hostedSlug}/checkout/confirmation/${data.bookingId}`);
    } else if (res.status === 409) {
      setTimeConflict(true);
      setError(data.error ?? "That window was just taken — please pick another time.");
    } else {
      // The route sends a human-readable `message` for the rejections a
      // customer can act on: an out-of-area ZIP, a malformed one, no
      // configured coverage. Those were all being discarded and replaced with
      // "Something went wrong — please try again", which tells someone
      // outside the service area to retry the thing that cannot work, and
      // sends them to pick a different time for a problem that has nothing to
      // do with time.
      setError(
        typeof data.message === "string"
          ? data.message
          : "Something went wrong — please try again."
      );
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
            {error}
            {timeConflict && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => router.push(`${base}/checkout/schedule`)}
                  className="font-semibold underline"
                >
                  Pick a different time
                </button>
              </>
            )}
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
