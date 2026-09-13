"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  connected: boolean;
  ready: boolean;
};

export default function StripeConnectionActions({ connected, ready }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledReturn = useRef(false);
  const [busy, setBusy] = useState<"connect" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function beginOnboarding() {
    if (busy !== null) return;
    setBusy("connect");
    setError(null);
    try {
      const res = await fetch("/api/admin/stripe/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.onboardingUrl !== "string") {
        setError(typeof data.error === "string" ? data.error : "Stripe setup could not be started. Try again.");
        return;
      }
      window.location.assign(data.onboardingUrl);
    } catch {
      // This request can create and persist a connected Stripe account before
      // returning the hosted onboarding URL. A dropped browser response is
      // therefore ambiguous; refresh local state before inviting another
      // connect attempt instead of assuming nothing happened.
      setError("Price2Book lost the response while starting Stripe setup. Refreshing the payment status now — confirm it before trying again.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function refreshReadiness({ cleanUrl = false }: { cleanUrl?: boolean } = {}) {
    if (busy !== null) return;
    setBusy("refresh");
    setError(null);
    try {
      const res = await fetch("/api/admin/stripe/readiness", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.reason === "string"
          ? data.reason
          : typeof data.error === "string"
            ? data.error
            : "Stripe status could not be refreshed. Try again.");
        return;
      }
      if (cleanUrl) router.replace("/dashboard/payments");
      router.refresh();
    } catch {
      // Readiness refresh persists Stripe facts. If the response disappears,
      // re-render from server state rather than telling the contractor the
      // refresh definitely failed.
      setError("Price2Book lost the response while checking Stripe. Refreshing the saved payment status now.");
      if (cleanUrl) router.replace("/dashboard/payments");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (handledReturn.current) return;
    const stripeState = searchParams.get("stripe");
    if (stripeState !== "return" && stripeState !== "refresh") return;
    handledReturn.current = true;

    if (stripeState === "refresh") {
      // Stripe uses refresh_url when an onboarding link expires or must be
      // replaced. Generate a fresh account link rather than leaving the
      // contractor on a dead callback page.
      void beginOnboarding();
      return;
    }

    // A normal Stripe return means the hosted flow ended. Stripe remains the
    // authority on readiness, so ask again before the page claims anything.
    void refreshReadiness({ cleanUrl: true });
  }, [searchParams]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!ready && (
          <button
            type="button"
            onClick={beginOnboarding}
            disabled={busy !== null}
            className="inline-flex items-center justify-center rounded-pill bg-electric px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-electric/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "connect" ? "Opening Stripe…" : connected ? "Continue Stripe setup" : "Connect Stripe"}
          </button>
        )}
        {connected && (
          <button
            type="button"
            onClick={() => void refreshReadiness()}
            disabled={busy !== null}
            className="inline-flex items-center justify-center rounded-pill border border-cardline bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "refresh" ? "Checking Stripe…" : ready ? "Recheck Stripe status" : "Check setup status"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="max-w-xl text-xs leading-relaxed text-red-700">{error}</p>}
    </div>
  );
}
