"use client";

/**
 * The homeowner's half of the deposit.
 *
 * Card details are entered into Stripe's own iframe and never touch this app,
 * this form's state, or our servers. What comes back is a PaymentMethod id,
 * which is what the checkout route hands to the authorization.
 *
 * WHY NO PaymentIntent IS CREATED HERE
 *
 * Elements runs in deferred mode (`mode: "payment"` +
 * `paymentMethodCreation: "manual"`), so the browser produces a PaymentMethod
 * and nothing else. The intent is still created server-side inside
 * `runDepositCheckout`, which owns the ordering — authorize, commit, capture —
 * and the cancel path when the commit fails. Creating an intent here would put
 * a second author on money movement.
 *
 * WHY `paymentMethodTypes: ["card"]` IS PINNED
 *
 * The server refuses redirect-capable methods
 * (`automatic_payment_methods.allow_redirects: "never"`), because this flow
 * authorizes synchronously before the booking transaction and has no step that
 * can hand the customer off and resume. Pinning the same constraint here means
 * the customer is never OFFERED a method the server would then reject. The
 * server guard is the one that matters; this one keeps the UI honest about it.
 */

import { useEffect, useMemo, type MutableRefObject } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

export type PaymentMethodCreator = () => Promise<{ paymentMethodId?: string; error?: string }>;

/** Cached per account: loadStripe must not be called on every render. */
const stripeCache = new Map<string, ReturnType<typeof loadStripe>>();
function stripeFor(publishableKey: string, stripeAccount: string) {
  const key = `${publishableKey}::${stripeAccount}`;
  let p = stripeCache.get(key);
  // Direct charges — the PaymentMethod belongs to the connected account,
  // because the contractor is the merchant of record.
  if (!p) { p = loadStripe(publishableKey, { stripeAccount }); stripeCache.set(key, p); }
  return p;
}

function CardFields({ creatorRef }: { creatorRef: MutableRefObject<PaymentMethodCreator | null> }) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    if (!stripe || !elements) { creatorRef.current = null; return; }
    creatorRef.current = async () => {
      // Runs Stripe's own validation first. Without it, an incomplete card
      // reaches createPaymentMethod as a generic failure instead of an inline
      // "your card number is incomplete" on the field itself.
      const submitted = await elements.submit();
      if (submitted.error) return { error: submitted.error.message ?? "Please check your card details." };

      const { paymentMethod, error } = await stripe.createPaymentMethod({ elements });
      if (error || !paymentMethod) {
        return { error: error?.message ?? "We couldn't verify that card." };
      }
      return { paymentMethodId: paymentMethod.id };
    };
    return () => { creatorRef.current = null; };
  }, [stripe, elements, creatorRef]);

  return <PaymentElement options={{ layout: "tabs" }} />;
}

export default function DepositPayment({
  depositDueCents, creditsToJob, publishableKey, stripeAccountId, creatorRef,
}: {
  depositDueCents: number;
  creditsToJob: boolean;
  publishableKey: string;
  stripeAccountId: string;
  creatorRef: MutableRefObject<PaymentMethodCreator | null>;
}) {
  const options = useMemo(
    () =>
      ({
        mode: "payment" as const,
        amount: depositDueCents,
        currency: "usd",
        // The browser makes a PaymentMethod, not an intent. See the header.
        paymentMethodCreation: "manual" as const,
        // Held, not taken — the server captures after the booking commits.
        captureMethod: "manual" as const,
        paymentMethodTypes: ["card"],
      }),
    [depositDueCents]
  );

  const dollars = (depositDueCents / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 0,
  });

  return (
    <div className="rounded-card border border-cardline p-4">
      <h2 className="text-sm font-semibold text-navy">Deposit</h2>
      {/* Locked wording. The customer is booking the actual fixed-price
          project, so the deposit is stated as applied TOWARD it — not as a
          fee, and not as a payment for an estimate. */}
      <p className="mt-1 text-sm text-slate">
        A {dollars} deposit is required when booking
        {creditsToJob ? " and will be applied toward your project." : "."}
      </p>
      <div className="mt-4">
        <Elements stripe={stripeFor(publishableKey, stripeAccountId)} options={options}>
          <CardFields creatorRef={creatorRef} />
        </Elements>
      </div>
      <p className="mt-3 text-xs text-slate">
        Your card is held securely by Stripe and charged when your booking is confirmed.
        The remaining balance is arranged directly with your contractor.
      </p>
    </div>
  );
}
