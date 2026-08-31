"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import { useIdentity } from "@/components/theme/StorefrontContext";

type Window = { start: string; end: string; available: boolean };
type DayMeta = { date: string; dateISO: string };

export default function ScheduleClient({
  days,
  initialWindows,
  estimatedDurationMinutes,
  initiallyUnavailable = false,
}: {
  days: DayMeta[];
  initialWindows: Window[];
  estimatedDurationMinutes: number | null;
  /** The first day's availability could not be verified on the server. */
  initiallyUnavailable?: boolean;
}) {
  const siteFetch = useSiteFetch();
  // Resolved from THIS contractor, and omitted when they have not supplied
  // one. A fallback here would put another contractor's phone number on the
  // one screen where a stuck customer is most likely to call it.
  const { phone, phoneHref } = useIdentity();
  // Storefront navigation carries the site slug. These were root paths,
  // working only because the legacy Elite redirects catch them.
  const base = useStorefrontBase();
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedWindow, setSelectedWindow] = useState<number | null>(null);
  const [windows, setWindows] = useState<Window[]>(initialWindows);
  const [loading, setLoading] = useState(false);
  // Distinct from "no windows are free". We do not know, so we do not say.
  const [unavailable, setUnavailable] = useState(initiallyUnavailable);

  async function selectDay(i: number) {
    setSelectedDay(i);
    setSelectedWindow(null);
    setLoading(true);

    // Fresh check against the real Jobber calendar every time — no
    // caching, no stale snapshot from whenever the page first loaded.
    const url = new URL(`/api/availability/${days[i].dateISO}`, window.location.origin);
    if (estimatedDurationMinutes) url.searchParams.set("duration", String(estimatedDurationMinutes));
    // useSiteFetch, not a bare fetch: /api/availability now resolves the
    // contractor from the storefront identifier, so a plain fetch 404s.
    const res = await siteFetch(url, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setWindows(data.windows);
      setUnavailable(false);
    } else if (res.status === 503) {
      // We could not reach the calendar. Show nothing rather than everything:
      // this used to fall through with the previous day's windows still on
      // screen, which is the same fabrication by a slower route.
      setWindows([]);
      setUnavailable(true);
    }
    setLoading(false);
  }

  const currentDay = days[selectedDay];
  const anyAvailableThisDay = windows.some((w) => w.available);

  async function retry() { await selectDay(selectedDay); }

  function continueToDetails() {
    if (selectedWindow === null) return;
    const win = windows[selectedWindow];
    const params = new URLSearchParams({
      date: currentDay.date,
      windowStart: win.start,
      windowEnd: win.end,
    });
    router.push(`${base}/checkout/details?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">Select an Arrival Window</h1>
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
        {loading && <p className="text-sm text-slate">Checking real-time availability...</p>}

        {/* "We could not check" is not "nothing is free", and the customer is
            told which one it is. Offering every window during an outage was a
            promise about a calendar nobody had read — and the next screen
            would have taken a deposit for it. */}
        {!loading && unavailable && (
          <div className="rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">We can&rsquo;t check our schedule right now</div>
            <p className="mt-1">
              This is temporary and nothing has been booked or charged. Please try again in a
              moment
              {phone ? (
                <>
                  , or call us on{" "}
                  <a href={phoneHref ?? undefined} className="whitespace-nowrap font-semibold underline">
                    {phone}
                  </a>{" "}
                  and we&rsquo;ll book you in.
                </>
              ) : (
                "."
              )}
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 rounded-pill bg-electric px-5 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !unavailable && !anyAvailableThisDay && (
          <p className="rounded-card bg-warmwhite p-4 text-sm text-slate">
            Nothing open this day — try another date above.
          </p>
        )}
        {!loading && !unavailable &&
          windows.map((w, i) => (
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
