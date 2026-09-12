"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CrewMember = { id: string; name: string; eligibleForWebsiteBookings: boolean };

export default function CrewEligibilityPanel({ crewMembers }: { crewMembers: CrewMember[] }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligibleCount = crewMembers.filter((member) => member.eligibleForWebsiteBookings).length;

  async function handleSync() {
    if (syncing || updatingId !== null) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/jobber/crews/sync", { method: "POST" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not sync Jobber users. Nothing was changed.");
    } catch {
      setError("Could not reach Price2Book. Check your connection and try the sync again.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggle(id: string, current: boolean) {
    if (syncing || updatingId !== null) return;
    setUpdatingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobber/crews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eligibleForWebsiteBookings: !current }),
      });

      if (res.ok) {
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not update crew eligibility. Nothing was changed.");
    } catch {
      setError("Could not reach Price2Book. Check your connection and try again; nothing was changed.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 rounded-card border border-cardline bg-warmwhite/55 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-navy">
            {eligibleCount} of {crewMembers.length} synced user{crewMembers.length === 1 ? "" : "s"} count toward booking capacity
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate">
            Syncing refreshes the Jobber user list. It does not make anyone eligible automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || updatingId !== null}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-pill border border-electric px-5 py-2.5 text-sm font-semibold text-electric transition hover:bg-electric/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync from Jobber"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {crewMembers.length === 0 ? (
        <div className="rounded-card border border-dashed border-cardline bg-white px-5 py-10 text-center">
          <p className="text-sm font-semibold text-navy">No Jobber users have been synced yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate">
            Sync your team list first, then choose which people should count when Price2Book checks whether a customer-facing arrival window has capacity.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-cardline bg-warmwhite/45 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate sm:px-5">
            <span>Jobber user</span>
            <span>Website bookings</span>
          </div>
          <div className="divide-y divide-cardline">
            {crewMembers.map((c) => {
              const updating = updatingId === c.id;
              return (
                <label key={c.id} className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy">{c.name}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {c.eligibleForWebsiteBookings
                        ? "Counts toward bookable Jobber capacity."
                        : "Ignored when Price2Book checks website capacity."}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className={`hidden rounded-pill px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                      c.eligibleForWebsiteBookings ? "bg-success/10 text-success" : "bg-warmwhite text-slate"
                    }`}>
                      {updating ? "Updating…" : c.eligibleForWebsiteBookings ? "Eligible" : "Not eligible"}
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#2452D9]"
                      checked={c.eligibleForWebsiteBookings}
                      disabled={syncing || updatingId !== null}
                      aria-label={`${c.eligibleForWebsiteBookings ? "Remove" : "Add"} ${c.name} ${c.eligibleForWebsiteBookings ? "from" : "to"} website booking capacity`}
                      onChange={() => handleToggle(c.id, c.eligibleForWebsiteBookings)}
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
