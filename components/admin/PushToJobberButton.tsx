"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PushToJobberButton({ bookingId, alreadySent }: { bookingId: string; alreadySent: boolean }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setSending(true);
    setError(null);

    const res = await fetch(`/api/admin/bookings/${bookingId}/push-to-jobber`, { method: "POST" });
    setSending(false);

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
    }
  }

  if (alreadySent) {
    return <span className="text-xs font-medium text-success">✓ Sent to Jobber</span>;
  }

  return (
    <div>
      <button
        onClick={handleSend}
        disabled={sending}
        className="rounded-pill border border-electric px-4 py-1.5 text-xs font-semibold text-electric transition hover:bg-electric/5 disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send to Jobber"}
      </button>
      {error && <p className="mt-1 max-w-xs text-xs text-red-600">{error}</p>}
    </div>
  );
}
