"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PushToJobberButton({ bookingId, alreadySent }: { bookingId: string; alreadySent: boolean }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);

  async function handleSend() {
    if (sending || alreadySent || uncertain) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/push-to-jobber`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        router.refresh();
        return;
      }

      const resultUncertain = data?.uncertain === true;
      setUncertain(resultUncertain);
      setError(
        typeof data.error === "string"
          ? data.error
          : resultUncertain
            ? "Price2Book could not confirm the final Jobber result. Check Jobber before trying again."
            : "Could not send this booking to Jobber. Try again in a moment."
      );
    } catch {
      // A lost response is not proof the external create failed. The request
      // may have reached Price2Book and Jobber before this browser lost the
      // connection, so fail closed instead of inviting a blind second send.
      setUncertain(true);
      setError(
        "Price2Book lost contact while sending this booking. Check Jobber before trying again."
      );
    } finally {
      setSending(false);
    }
  }

  if (alreadySent) {
    return <span className="text-xs font-medium text-success">✓ Sent to Jobber</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || uncertain}
        className="rounded-pill border border-electric px-4 py-1.5 text-xs font-semibold text-electric transition hover:bg-electric/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending..." : uncertain ? "Check Jobber first" : "Send to Jobber"}
      </button>
      {error && <p role="alert" className="mt-1 max-w-xs text-xs text-red-600">{error}</p>}
      {uncertain && (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-2 block text-xs font-semibold text-electric underline-offset-2 hover:underline"
        >
          Refresh booking status
        </button>
      )}
    </div>
  );
}
