"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CrewMember = { id: string; name: string; eligibleForWebsiteBookings: boolean };

export default function CrewEligibilityPanel({ crewMembers }: { crewMembers: CrewMember[] }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    const res = await fetch("/api/admin/jobber/crews/sync", { method: "POST" });
    setSyncing(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Sync failed.");
    }
  }

  async function handleToggle(id: string, current: boolean) {
    await fetch(`/api/admin/jobber/crews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eligibleForWebsiteBookings: !current }),
    });
    router.refresh();
  }

  return (
    <div className="mt-6 max-w-xl">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="rounded-pill border border-electric px-5 py-2 text-sm font-semibold text-electric transition hover:bg-electric/5 disabled:opacity-50"
      >
        {syncing ? "Syncing..." : "Sync From Jobber"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {crewMembers.length === 0 ? (
        <p className="mt-4 text-sm text-slate">
          No crew members synced yet — click "Sync From Jobber" to pull your team list.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-cardline rounded-card border border-cardline bg-white">
          {crewMembers.map((c) => (
            <label key={c.id} className="flex items-center justify-between p-4 text-sm">
              <span className="text-navy">{c.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate">
                  {c.eligibleForWebsiteBookings ? "Eligible" : "Not eligible"}
                </span>
                <input
                  type="checkbox"
                  checked={c.eligibleForWebsiteBookings}
                  onChange={() => handleToggle(c.id, c.eligibleForWebsiteBookings)}
                />
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
