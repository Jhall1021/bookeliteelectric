"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Who owns the calendar. Durable contractor configuration, set here first. */
export default function SchedulingAuthorityControl({
  authority,
}: { authority: "NATIVE" | "EXTERNAL" | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(value: "NATIVE" | "EXTERNAL") {
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/setup/scheduling-authority", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authority: value }),
    });
    setBusy(false);
    if (!res.ok) { setError("Could not save."); return; }
    router.refresh();
  }

  return (
    <div>
      <div className="space-y-2">
        {([
          ["NATIVE", "Price2Book", "We keep your availability from your working hours and bookings."],
          ["EXTERNAL", "A system I already use", "Your existing calendar decides. We never show a slot we could not check against it."],
        ] as const).map(([value, label, blurb]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-start gap-3 rounded-card border p-4 ${
              authority === value ? "border-electric bg-electric/5" : "border-cardline"
            }`}
          >
            <input
              type="radio" name="authority" className="mt-1"
              checked={authority === value} disabled={busy}
              onChange={() => choose(value)}
            />
            <span className="text-sm">
              <span className="font-medium text-navy">{label}</span>
              <span className="block text-slate">{blurb}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <div className="mt-3 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}
