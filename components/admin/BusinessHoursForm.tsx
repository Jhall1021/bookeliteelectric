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

function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

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

  const scheduleError = minutes(hours.dayEnd) <= minutes(hours.dayStart)
    ? "Crews need to finish after they start."
    : null;

  async function save() {
    if (hours.workingDays.length === 0) {
      setNote({ text: "Pick at least one working day, or nobody can book at all.", warn: true });
      return;
    }
    if (scheduleError) {
      setNote({ text: scheduleError, warn: true });
      return;
    }

    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/business-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hours),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNote({ text: data?.error ?? "Could not save working hours. Nothing was changed.", warn: true });
        return;
      }
      if (!data || !Array.isArray(data.windows)) {
        setNote({ text: "Working hours were saved, but the arrival-window preview could not be refreshed.", warn: true });
        router.refresh();
        return;
      }
      setWindows(data.windows);
      setNote({ text: `Saved — ${data.windows.length} arrival windows a day.`, warn: false });
      router.refresh();
    } catch {
      setNote({ text: "Could not reach Price2Book. Your working hours were not changed.", warn: true });
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(hours) !== JSON.stringify(initial);

  return (
    <div className="mt-6 space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite/60 px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-electric">Your schedule</p>
          <h2 className="mt-1 font-display text-base font-bold text-navy">Days and working hours</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate">
            Pick the days and hours customers can book. Price2Book uses these to build the arrival windows shown at checkout.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <div>
            <h3 className="text-sm font-semibold text-navy">Days you work</h3>
            <p className="mt-1 text-xs leading-5 text-slate">
              These are Price2Book booking days. They do not change another scheduling system.
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
              {DAYS.map((d) => {
                const on = hours.workingDays.includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d.n)}
                    className={`min-h-10 rounded-pill border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/30 sm:px-4 ${
                      on
                        ? "border-electric bg-electric text-white shadow-sm"
                        : "border-cardline bg-white text-slate hover:border-electric/40 hover:bg-warmwhite hover:text-navy"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            {hours.workingDays.length === 0 && (
              <p className="mt-3 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Select at least one day before saving. With no days selected, customers cannot book online.
              </p>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block rounded-card border border-cardline bg-warmwhite/40 p-4">
              <span className="text-sm font-semibold text-navy">Crews start</span>
              <span className="mt-1 block text-xs text-slate">First time a customer can be offered an arrival window.</span>
              <input
                type="time"
                value={hours.dayStart}
                onChange={(e) => setHours((h) => ({ ...h, dayStart: e.target.value }))}
                className="mt-3 w-full rounded-card border border-cardline bg-white px-4 py-2.5 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
              />
            </label>
            <label className="block rounded-card border border-cardline bg-warmwhite/40 p-4">
              <span className="text-sm font-semibold text-navy">Crews finish</span>
              <span className="mt-1 block text-xs text-slate">Jobs that would run past this time are not offered.</span>
              <input
                type="time"
                value={hours.dayEnd}
                onChange={(e) => setHours((h) => ({ ...h, dayEnd: e.target.value }))}
                className="mt-3 w-full rounded-card border border-cardline bg-white px-4 py-2.5 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
              />
            </label>
          </div>

          {scheduleError && (
            <p className="mt-3 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {scheduleError} No schedule has been changed yet.
            </p>
          )}

          <label className="mt-4 block rounded-card border border-cardline p-4 sm:max-w-md">
            <span className="text-sm font-semibold text-navy">Arrival window length</span>
            <span className="mt-1 block text-xs leading-5 text-slate">How wide a promise customers see, such as “8–11 AM.”</span>
            <select
              value={hours.windowMinutes}
              onChange={(e) => setHours((h) => ({ ...h, windowMinutes: Number(e.target.value) }))}
              className="mt-3 w-full rounded-card border border-cardline bg-white px-4 py-2.5 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
            >
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
              <option value={240}>4 hours</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-card border border-cardline bg-white p-4 shadow-card sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate">Customer view</p>
            <h2 className="mt-1 font-display text-base font-bold text-navy">Arrival windows generated from your hours</h2>
          </div>
          <span className="text-xs font-medium text-slate">{windows.length} window{windows.length === 1 ? "" : "s"} per day</span>
        </div>
        <p className="mt-2 text-sm text-slate">
          {dirty ? "This preview shows the last saved schedule until you save your changes." : "This is what customers will choose from when they book."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {windows.map((w) => (
            <span
              key={w.start}
              className="rounded-card border border-cardline bg-warmwhite px-3 py-2 text-center text-sm font-medium text-navy sm:rounded-pill sm:px-4"
            >
              {w.start} – {w.end}
            </span>
          ))}
          {windows.length === 0 && (
            <span className="col-span-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No arrival windows are being generated. Check the selected days and times.
            </span>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate">
          If the final window would be shorter than an hour, Price2Book folds it into the previous window instead of showing an awkward short slot.
        </p>
      </section>

      {note && (
        <p
          role={note.warn ? "alert" : "status"}
          className={`rounded-card border p-3 text-sm ${
            note.warn ? "border-amber-200 bg-amber-50 text-amber-900" : "border-electric/15 bg-electric/5 text-navy"
          }`}
        >
          {note.text}
        </p>
      )}

      <div className="flex justify-stretch sm:justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty || hours.workingDays.length === 0 || !!scheduleError}
          className="w-full rounded-pill bg-electric px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-36"
        >
          {saving ? "Saving..." : dirty ? "Save working hours" : "Saved"}
        </button>
      </div>
    </div>
  );
}
