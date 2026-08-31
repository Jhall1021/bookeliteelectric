"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The smallest writable surface that proves the state transitions.
 *
 * Not the wizard. Two decisions a contractor genuinely owns — who schedules,
 * and what they sell — and nothing else. Neither writes a price, an approval
 * or an activation; those keep their own paths, because a setup screen that
 * could publish would be a setup screen that publishes by accident.
 */

type Svc = { id: string; slug: string; name: string; offered: boolean; active: boolean };

export default function SetupControls({
  authority,
  services,
}: {
  authority: "NATIVE" | "EXTERNAL" | null;
  services: Svc[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, body: unknown, key: string) {
    setBusy(key); setError(null);
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.message ?? data.error ?? "Could not save."); return; }
    router.refresh();
  }

  const offeredCount = services.filter((s) => s.offered).length;

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Who owns your calendar?</h2>
        <p className="mt-1 text-sm text-slate">
          This decides what has to be true before a homeowner can pick a time.
        </p>
        <div className="mt-4 space-y-2">
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
                type="radio"
                name="authority"
                className="mt-1"
                checked={authority === value}
                disabled={busy !== null}
                onChange={() => send("/api/admin/setup/scheduling-authority", { authority: value }, value)}
              />
              <span className="text-sm">
                <span className="font-medium text-navy">{label}</span>
                <span className="block text-slate">{blurb}</span>
              </span>
            </label>
          ))}
        </div>
        {authority === null && (
          <p className="mt-3 text-xs text-amber-800">Not answered yet — nothing can be booked until it is.</p>
        )}
      </section>

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">What do you offer?</h2>
        <p className="mt-1 text-sm text-slate">
          Tick the work you actually do. This does not price anything or put it on your
          storefront — it tells us what to check.{" "}
          <span className="font-medium text-navy">{offeredCount} of {services.length} selected.</span>
        </p>
        <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto">
          {services.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-card px-3 py-2 text-sm hover:bg-warmwhite">
                <input
                  type="checkbox"
                  checked={s.offered}
                  disabled={busy !== null}
                  onChange={(e) =>
                    send("/api/admin/setup/selection", { serviceId: s.id, offered: e.target.checked }, s.id)
                  }
                />
                <span className="text-navy">{s.name}</span>
                {s.active && <span className="ml-auto text-xs text-success">Live</span>}
              </label>
            </li>
          ))}
        </ul>
      </section>

      {error && <div className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}
