"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NativeCapacityControl({
  concurrentJobs,
}: { concurrentJobs: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(concurrentJobs === null ? "" : String(concurrentJobs));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (state === "saving") return;

    const trimmed = value.trim();
    if (trimmed !== "" && !/^\d+$/.test(trimmed)) {
      setError("Enter a whole number of jobs, or leave this blank to clear the capacity.");
      setState("idle");
      return;
    }

    if (trimmed !== "") {
      const jobs = Number(trimmed);
      if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 100) {
        setError("Enter a booking capacity between 1 and 100 jobs.");
        setState("idle");
        return;
      }
    }

    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/setup/native-capacity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrentJobs: trimmed === "" ? null : trimmed }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof json.error === "string"
            ? json.error
            : "Price2Book couldn't save your booking capacity. Try again."
        );
        setState("idle");
        return;
      }

      setState("saved");
      router.refresh();
    } catch {
      setError("Price2Book couldn't save your booking capacity. Check your connection and try again.");
      setState("idle");
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
      <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-electric">Booking capacity</p>
            <h3 className="mt-1 font-display text-base font-bold text-navy">How many jobs can you handle at the same time?</h3>
          </div>
          {concurrentJobs !== null && (
            <span className="rounded-pill bg-success/10 px-3 py-1 text-xs font-semibold text-success">Capacity set</span>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <p className="max-w-2xl text-sm leading-relaxed text-slate">
          Price2Book uses this number to avoid offering more appointments in the same arrival window than your team can actually cover.
        </p>

        <div className="mt-4 rounded-card border border-cardline bg-warmwhite/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Example</p>
          <p className="mt-1 text-sm text-navy">Two vans that can each be on a separate job at the same time = <span className="font-bold">2 jobs</span>.</p>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="native-capacity" className="block text-xs font-semibold text-navy">Jobs at the same time</label>
            <input
              id="native-capacity"
              value={value}
              inputMode="numeric"
              onChange={(e) => { setValue(e.target.value); setState("idle"); setError(null); }}
              placeholder="e.g. 2"
              aria-invalid={error ? true : undefined}
              className="mt-1.5 w-36 rounded-card border border-cardline bg-white px-3 py-2.5 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
            />
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={state === "saving"}
            className="rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-60"
          >
            {state === "saving" ? "Saving..." : state === "saved" ? "Saved" : "Save capacity"}
          </button>
        </div>

        {state === "saved" && <p className="mt-3 text-sm font-medium text-success">Your booking capacity is saved.</p>}
        {error && <div role="alert" className="mt-3 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-p2b-error-ink">{error}</div>}
      </div>
    </section>
  );
}
