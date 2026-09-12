"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PushToJobberButton({ bookingId, alreadySent }: { bookingId: string; alreadySent: boolean }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (sending || alreadySent) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/push-to-jobber`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        router.refresh();
        return;
      }

      setError(
        typeof data.error === "string"
          ? data.error
          : "Could not send this booking to Jobber. Nothing was marked as sent; try again."
      );
    } catch {
      setError("Could not reach Price2Book. Check your connection and try again; nothing was marked as sent.");
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
        disabled={sending}
        className="rounded-pill border border-electric px-4 py-1.5 text-xs font-semibold text-electric transition hover:bg-electric/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send to Jobber"}
      </button>
      {error && <p role="alert" className="mt-1 max-w-xs text-xs text-red-600">{error}</p>}
    </div>
  );
}
