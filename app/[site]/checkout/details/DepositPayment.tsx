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
 * WHY CardElement AND NOT PaymentElement
 *
 * The server accepts exactly one method — `payment_method_types: ["card"]` —
 * because the flow authorizes synchronously before the booking transaction and
 * has no step that can hand the customer off and resume.
 *
 * PaymentElement was asked to match, via `paymentMethodTypes: ["card"]`, and
 * IGNORED IT: the live browser proof showed it offering Bank and Klarna beside
 * Card on a real checkout. A customer picking either would have been refused
 * by the server after entering their details — the payment equivalent of a
 * door painted on a wall.
 *
 * CardElement cannot offer anything else. The UI is restricted by what it IS
 * rather than by an option a future Stripe.js release might interpret
 * differently, which is the only kind of restriction worth relying on here.
 *
 * The day the flow can handle a redirect or an async method is the day to
 * revisit this — not before.
 */

import { useEffect, useMemo, type MutableRefObject } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";

/**
 * What the form can ask the mounted Stripe instance to do.
 *
 * `create` turns the card into a PaymentMethod. `authenticate` finishes a
 * challenge on an intent the SERVER created and the server named — the browser
 * never creates one, and cannot change its amount.
 */
export type DepositCardApi = {
  create: () => Promise<{ paymentMethodId?: string; error?: string }>;
  authenticate: (clientSecret: string) => Promise<{ ok: boolean; error?: string }>;
};

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

function CardFields({ apiRef }: { apiRef: MutableRefObject<DepositCardApi | null> }) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    if (!stripe || !elements) { apiRef.current = null; return; }
    apiRef.current = {
      async create() {
        const card = elements.getElement(CardElement);
        if (!card) return { error: "The card form isn't ready yet — please try again." };

        const { paymentMethod, error } = await stripe.createPaymentMethod({ type: "card", card });
        if (error || !paymentMethod) {
          // Stripe's message names the actual field ("Your card number is
          // incomplete"), which is more use than anything generic here.
          return { error: error?.message ?? "We couldn't verify that card." };
        }
        return { paymentMethodId: paymentMethod.id };
      },

      /**
       * Runs the bank's challenge on the intent the server already created.
       * `handleNextAction` — NOT `confirmPayment` — because there is nothing
       * left to confirm: the intent exists, its amount is set, and the only
       * thing missing is the cardholder proving who they are.
       *
       * Its own result is not the verdict. The server re-reads the intent from
       * Stripe afterwards and decides; this only reports whether the challenge
       * could be run at all.
       */
      async authenticate(clientSecret: string) {
        const { error } = await stripe.handleNextAction({ clientSecret });
        if (error) return { ok: false, error: error.message ?? "We couldn't verify you with your bank." };
        return { ok: true };
      },
    };
    return () => { apiRef.current = null; };
  }, [stripe, elements, apiRef]);

  return (
    <div className="rounded-card border border-cardline bg-white px-4 py-3">
      <CardElement options={{ hidePostalCode: false }} />
    </div>
  );
}

export default function DepositPayment({
  depositDueCents, creditsToJob, publishableKey, stripeAccountId, apiRef,
}: {
  depositDueCents: number;
  creditsToJob: boolean;
  publishableKey: string;
  stripeAccountId: string;
  apiRef: MutableRefObject<DepositCardApi | null>;
}) {
  // No deferred-intent options: CardElement collects a card and nothing else,
  // and the PaymentIntent is still created server-side by runDepositCheckout.
  const options = useMemo(() => ({}), []);

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
          <CardFields apiRef={apiRef} />
        </Elements>
      </div>
      {/* THE HOMEOWNER IS BOOKING WITH THE CONTRACTOR.
          This said the balance was "arranged directly with your contractor",
          which tells a customer they are dealing with two companies and that
          one of them is going to hand them off. It also named Stripe, which is
          plumbing they did not ask about. The summary above already states the
          deposit and the remaining balance; this says when the rest is due, in
          the contractor's voice. */}
      <p className="mt-3 text-xs text-slate">
        Your card is charged when your booking is confirmed.
      </p>
    </div>
  );
}
