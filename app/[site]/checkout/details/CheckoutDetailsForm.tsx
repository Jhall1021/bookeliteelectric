"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSite, useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import DepositPayment, { type DepositCardApi } from "./DepositPayment";

type DepositInfo = {
  depositDueCents: number;
  subtotalCents?: number;
  salesTaxRatePpm?: number | null;
  salesTaxCents?: number;
  totalWithTaxCents?: number;
  remainingCents?: number;
  creditsToJob?: boolean;
  ready?: boolean;
  stripeAccountId?: string | null;
  publishableKey?: string | null;
};

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

  // What this visit owes, asked of the server rather than assumed from a slug.
  // `null` while unknown: the button stays disabled until the answer arrives,
  // because "Confirm" on a deposit service before the card field has mounted
  // would submit a booking with no payment method.
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const cardApi = useRef<DepositCardApi | null>(null);

  useEffect(() => {
    let live = true;
    siteFetch("/api/checkout/deposit")
      .then((r) => (r.ok ? r.json() : { depositDueCents: 0 }))
      .then((d: DepositInfo) => { if (live) setDeposit(d); })
      .catch(() => { if (live) setDeposit({ depositDueCents: 0 }); });
    return () => { live = false; };
  }, [siteFetch]);

  const depositDue = (deposit?.depositDueCents ?? 0) > 0;
  const depositBlocked = depositDue && !(deposit?.ready && deposit.publishableKey && deposit.stripeAccountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setTimeConflict(false);

    // The card is turned into a PaymentMethod BEFORE the booking request, so a
    // card the customer mistyped fails here — with no booking attempted and
    // nothing authorized — rather than somewhere inside checkout.
    let paymentMethodId: string | undefined;
    if (depositDue) {
      const api = cardApi.current;
      if (!api) {
        setSubmitting(false);
        setError("The payment form isn't ready yet — please wait a moment and try again.");
        return;
      }
      const result = await api.create();
      if (result.error || !result.paymentMethodId) {
        setSubmitting(false);
        setError(result.error ?? "We couldn't verify that card.");
        return;
      }
      paymentMethodId = result.paymentMethodId;
    }

    const book = (extra: Record<string, unknown>) =>
      siteFetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          date: params.get("date"),
          windowStart: params.get("windowStart"),
          windowEnd: params.get("windowEnd"),
          ...extra,
        }),
      });

    let res = await book({ paymentMethodId });
    let data = await res.json();

    // The bank wants the cardholder to authenticate. This is a real card, not
    // a declined one: no booking exists yet, and the SAME intent is waiting.
    // The customer completes the challenge and we ask the server to finish —
    // sending the intent id, never a new authorization.
    if (res.ok && data.requiresAction && typeof data.clientSecret === "string") {
      const api = cardApi.current;
      const authed = api
        ? await api.authenticate(data.clientSecret)
        : { ok: false, error: "The payment form isn't ready yet — please try again." };

      if (!authed.ok) {
        setSubmitting(false);
        // No booking, no capture. The hold expires on its own.
        setError(authed.error ?? "We couldn't verify you with your bank, so nothing was charged.");
        return;
      }

      // The server re-reads the intent from Stripe and decides. Whatever the
      // browser believes happened is not the verdict.
      res = await book({ resumePaymentIntentId: data.paymentIntentId });
      data = await res.json();
    }

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

  const money = (c: number) =>
    (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  /** 66_250 -> "6.625%". Mirrors lib/salesTax's formatRate for the browser. */
  const rate = (ppm: number) => `${(ppm / 10_000).toFixed(3).replace(/\.?0+$/, "")}%`;

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

        {/* THE WHOLE FINANCIAL PICTURE, BEFORE THEY CONFIRM.
            Subtotal, the tax and the rate it came from, the total, what is due
            today and what is left. The homeowner is booking with the
            contractor; nothing here names Price2Book, Stripe or anybody's
            internal software, because none of that is theirs to think about. */}
        {deposit && deposit.totalWithTaxCents !== undefined && (
          <div className="rounded-card border border-cardline bg-warmwhite p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate">Service subtotal</span>
              <span className="text-navy">{money(deposit.subtotalCents ?? 0)}</span>
            </div>
            {(deposit.salesTaxCents ?? 0) > 0 && (
              <div className="mt-1 flex justify-between">
                <span className="text-slate">
                  Sales tax{deposit.salesTaxRatePpm ? ` (${rate(deposit.salesTaxRatePpm)})` : ""}
                </span>
                <span className="text-navy">{money(deposit.salesTaxCents ?? 0)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-cardline pt-2 font-semibold">
              <span className="text-navy">Total</span>
              <span className="text-navy">{money(deposit.totalWithTaxCents ?? 0)}</span>
            </div>
            {deposit.depositDueCents > 0 && (
              <>
                <div className="mt-2 flex justify-between">
                  <span className="text-slate">Deposit due today</span>
                  <span className="text-navy">{money(deposit.depositDueCents)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-slate">Remaining balance</span>
                  <span className="text-navy">{money(deposit.remainingCents ?? 0)}</span>
                </div>
                <p className="mt-3 text-xs text-slate">
                  Your deposit will be applied to the total. The remaining balance will be
                  due when the work is complete.
                </p>
              </>
            )}
          </div>
        )}

        {/* Card capture is real as of Release #4, so the deposit block appears
            for services that carry one. Everything else still pays nothing up
            front, and is still told exactly that. */}
        {depositDue && deposit?.ready && deposit.publishableKey && deposit.stripeAccountId ? (
          <DepositPayment
            depositDueCents={deposit.depositDueCents}
            creditsToJob={deposit.creditsToJob ?? true}
            publishableKey={deposit.publishableKey}
            stripeAccountId={deposit.stripeAccountId}
            apiRef={cardApi}
          />
        ) : depositDue ? (
          <div className="rounded-card bg-amber-50 p-3 text-sm text-amber-900">
            Online booking for this service isn&rsquo;t available right now. Please call us and
            we&rsquo;ll get you scheduled.
          </div>
        ) : (
          <p className="text-xs text-slate">
            Nothing to pay now — the price you see is the price you pay.
          </p>
        )}

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
          disabled={submitting || deposit === null || depositBlocked}
          className="w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
        >
          {submitting
            ? "Booking..."
            : depositDue
              ? `Confirm & Pay ${((deposit?.depositDueCents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })} Deposit`
              : "Confirm Appointment"}
        </button>
      </form>
    </main>
  );
}
