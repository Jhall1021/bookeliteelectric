"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Hours = {
  workingDays: number[];
  dayStart: string;
  dayEnd: string;
  windowMinutes: number;
  minWindowMinutes: number;
};

const DAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 0, label: "Sun" },
];

/**
 * Working days and hours.
 *
 * The arrival windows customers pick from are GENERATED from these, not
 * entered separately — otherwise the two drift apart and a contractor can
 * offer a 4pm window on a day that ends at 4:30. The preview below shows
 * exactly what a customer will see, because the generation rule (blocks from
 * the start, remainder folded in if it's too short) isn't obvious from the
 * inputs alone.
 */
export default function BusinessHoursForm({
  initial,
  initialWindows,
}: {
  initial: Hours;
  initialWindows: { start: string; end: string }[];
}) {
  const router = useRouter();
  const [hours, setHours] = useState<Hours>(initial);
  const [windows, setWindows] = useState(initialWindows);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);

  function toggleDay(n: number) {
    setHours((h) => ({
      ...h,
      workingDays: h.workingDays.includes(n)
        ? h.workingDays.filter((d) => d !== n)
        : [...h.workingDays, n].sort(),
    }));
  }

  async function save() {
    setSaving(true);
    setNote(null);
    const res = await fetch("/api/admin/business-hours", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hours),
    });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setNote({ text: data.error ?? "Something went wrong.", warn: true });
      return;
    }
    setWindows(data.windows);
    setNote({ text: `Saved — ${data.windows.length} arrival windows a day.`, warn: false });
    router.refresh();
  }

  const dirty = JSON.stringify(hours) !== JSON.stringify(initial);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-navy">Days we work</h2>
        <p className="mt-0.5 text-sm text-slate">
          Which days customers can book. This is ours to decide — it doesn&rsquo;t come from
          Jobber, so you don&rsquo;t have to block days off there to keep them off the website.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = hours.workingDays.includes(d.n);
            return (
              <button
                key={d.n}
                onClick={() => toggleDay(d.n)}
                className={`rounded-pill border px-4 py-2 text-sm font-semibold transition ${
                  on
                    ? "border-electric bg-electric text-white"
                    : "border-cardline text-slate hover:bg-warmwhite"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {hours.workingDays.length === 0 && (
          <p className="mt-3 text-sm text-amber-700">
            No days selected — nobody would be able to book at all.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-navy">Crews start</span>
            <input
              type="time"
              value={hours.dayStart}
              onChange={(e) => setHours((h) => ({ ...h, dayStart: e.target.value }))}
              className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 focus:border-electric"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-navy">Crews finish</span>
            <input
              type="time"
              value={hours.dayEnd}
              onChange={(e) => setHours((h) => ({ ...h, dayEnd: e.target.value }))}
              className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 focus:border-electric"
            />
            <span className="mt-1 block text-xs text-slate">
              A job that would run past this isn&rsquo;t offered — a five-hour job stops
              appearing in the afternoon windows.
            </span>
          </label>
        </div>

        <label className="mt-4 block sm:w-1/2">
          <span className="text-sm font-medium text-navy">Arrival window length</span>
          <select
            value={hours.windowMinutes}
            onChange={(e) => setHours((h) => ({ ...h, windowMinutes: Number(e.target.value) }))}
            className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 focus:border-electric"
          >
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
            <option value={240}>4 hours</option>
          </select>
          <span className="mt-1 block text-xs text-slate">
            How wide a window we promise — &ldquo;someone will arrive between 8 and 11&rdquo;.
          </span>
        </label>
      </div>

      <div className="rounded-card border border-cardline bg-warmwhite p-6">
        <h2 className="font-display text-base font-bold text-navy">
          What customers will see
        </h2>
        <p className="mt-0.5 text-sm text-slate">
          Generated from the hours above, so the two can&rsquo;t drift apart.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {windows.map((w) => (
            <span
              key={w.start}
              className="rounded-pill border border-cardline bg-white px-4 py-2 text-sm text-navy"
            >
              {w.start} – {w.end}
            </span>
          ))}
          {windows.length === 0 && (
            <span className="text-sm text-amber-700">No windows — check the times.</span>
          )}
        </div>
        {/* The last window is often shorter, and that's deliberate rather than
            a rounding accident — worth saying so nobody "fixes" it. */}
        <p className="mt-3 text-xs text-slate">
          The last window is whatever time is left in the day. If that would be
          under an hour it gets folded into the one before it.
        </p>
      </div>

      {note && (
        <p
          className={`rounded-card p-3 text-sm ${
            note.warn ? "bg-amber-50 text-amber-900" : "bg-electric/5 text-navy"
          }`}
        >
          {note.text}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving || !dirty || hours.workingDays.length === 0}
        className="rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-50"
      >
        {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
      </button>
    </div>
  );
}
