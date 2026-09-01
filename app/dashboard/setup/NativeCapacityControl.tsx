"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The one number native scheduling needs.
 *
 * Shown only when Price2Book keeps the calendar, because it is meaningless
 * otherwise — an external provider's own calendar answers this.
 *
 * Deliberately not a crew list. Asking "how many jobs at once" gets a
 * contractor to an honest answer in one box; asking them to enter their people
 * would be a staffing model they did not ask for, and Price2Book would still
 * have to guess how many of them go to a job.
 */
export default function NativeCapacityControl({
  concurrentJobs,
}: { concurrentJobs: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(concurrentJobs === null ? "" : String(concurrentJobs));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving"); setError(null);
    const res = await fetch("/api/admin/setup/native-capacity", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concurrentJobs: value === "" ? null : value }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Could not save."); setState("idle"); return; }
    setState("saved");
    router.refresh();
  }

  return (
    <section className="mt-4 rounded-card border border-cardline bg-white p-5">
      <h3 className="font-display text-base font-bold text-navy">
        How many jobs can your company handle at the same time?
      </h3>
      <p className="mt-1 text-sm text-slate">
        We use this so we never offer a homeowner more appointments in the same
        arrival window than you could actually service. If you run two vans that
        can each be on a job at once, that&apos;s 2.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          value={value}
          inputMode="numeric"
          onChange={(e) => { setValue(e.target.value); setState("idle"); }}
          placeholder="e.g. 2"
          aria-label="Jobs at the same time"
          className="w-28 rounded-md border border-cardline px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        {state === "saved" && <span className="text-sm text-success">Saved.</span>}
        {error && <span className="text-sm text-p2b-error-ink">{error}</span>}
      </div>
    </section>
  );
}
