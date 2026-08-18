"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DayAvailability = {
  date: string;
  dateISO: string;
  windows: { start: string; end: string; available: boolean }[];
};

export default function ScheduleClient({ days }: { days: DayAvailability[] }) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedWindow, setSelectedWindow] = useState<number | null>(null);

  const currentDay = days[selectedDay];
  const anyAvailableThisDay = currentDay.windows.some((w) => w.available);

  function selectDay(i: number) {
    setSelectedDay(i);
    setSelectedWindow(null);
  }

  function continueToDetails() {
    if (selectedWindow === null) return;
    const win = currentDay.windows[selectedWindow];
    const params = new URLSearchParams({
      date: currentDay.date,
      windowStart: win.start,
      windowEnd: win.end,
    });
    router.push(`/checkout/details?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">Select a 3-Hour Arrival Window</h1>
      <p className="mt-1 text-sm text-slate">We'll arrive any time within your selected window.</p>

      <div className="mt-6 flex gap-2 overflow-x-auto">
        {days.map((d, i) => (
          <button
            key={i}
            onClick={() => selectDay(i)}
            className={`shrink-0 rounded-card border px-4 py-2 text-sm font-medium ${
              selectedDay === i ? "border-electric bg-electric text-white" : "border-cardline bg-white text-navy"
            }`}
          >
            {new Date(d.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {!anyAvailableThisDay && (
          <p className="rounded-card bg-warmwhite p-4 text-sm text-slate">
            Nothing open this day — try another date above.
          </p>
        )}
        {currentDay.windows.map((w, i) => (
          <button
            key={i}
            onClick={() => w.available && setSelectedWindow(i)}
            disabled={!w.available}
            className={`w-full rounded-card border p-4 text-left text-sm font-medium transition ${
              !w.available
                ? "cursor-not-allowed border-cardline bg-warmwhite text-slate/50"
                : selectedWindow === i
                ? "border-electric bg-electric/5 text-navy"
                : "border-cardline bg-white text-navy hover:border-electric/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{w.start} – {w.end}</span>
              {!w.available && <span className="text-xs">Fully booked</span>}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={continueToDetails}
        disabled={selectedWindow === null}
        className="mt-8 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40"
      >
        Continue
      </button>
    </main>
  );
}
