"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const WINDOWS = [
  { start: "8:00 AM", end: "11:00 AM" },
  { start: "11:00 AM", end: "2:00 PM" },
  { start: "2:00 PM", end: "5:00 PM" },
  { start: "5:00 PM", end: "8:00 PM" },
];

// Phase 2 stub: generates the next 5 weekdays client-side with all four
// windows always "open." Real capacity (ArrivalWindow.capacityBooked vs.
// capacityTotal, admin-configured per service area) is Phase 6 —
// this establishes the UI and the selection → checkout handoff.
function nextWeekdays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  while (days.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(new Date(cursor));
  }
  return days;
}

export default function SchedulePage() {
  const router = useRouter();
  const days = nextWeekdays(5);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedWindow, setSelectedWindow] = useState<number | null>(null);

  function continueToDetails() {
    if (selectedWindow === null) return;
    const date = days[selectedDay];
    const win = WINDOWS[selectedWindow];
    const params = new URLSearchParams({
      date: date.toISOString(),
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
            onClick={() => setSelectedDay(i)}
            className={`shrink-0 rounded-card border px-4 py-2 text-sm font-medium ${
              selectedDay === i ? "border-electric bg-electric text-white" : "border-cardline bg-white text-navy"
            }`}
          >
            {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {WINDOWS.map((w, i) => (
          <button
            key={i}
            onClick={() => setSelectedWindow(i)}
            className={`w-full rounded-card border p-4 text-left text-sm font-medium ${
              selectedWindow === i ? "border-electric bg-electric/5 text-navy" : "border-cardline bg-white text-navy"
            }`}
          >
            {w.start} – {w.end}
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
