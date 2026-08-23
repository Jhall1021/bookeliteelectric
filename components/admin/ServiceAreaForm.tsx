"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Area = { id: string; name: string; zipCodes: string[]; active: boolean };
type County = {
  state: string; county: string; total: number; usable: number;
  /** How many of this county's ZIPs are currently selected. From the server,
   *  because the browser doesn't know a county's ZIPs until it's expanded. */
  selected: number;
};
type Zip = { zip: string; city: string; type: string; population: number | null };

/**
 * Pick counties, then untick the towns you won't drive to.
 *
 * The first version of this was a textarea for pasting ZIP codes, which works
 * but asks someone to know seventy-three five-digit numbers. Counties are how
 * a contractor actually thinks about where they work — and the drill-down
 * exists because a county isn't always a sensible unit. Ocean County's
 * southern end is ninety minutes from its northern end.
 */
export default function ServiceAreaForm({
  areas,
  counties,
  referenceLoaded,
}: {
  areas: Area[];
  counties: County[];
  referenceLoaded: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [openCounty, setOpenCounty] = useState<string | null>(null);
  const [countyZips, setCountyZips] = useState<Record<string, Zip[]>>({});

  // ONE territory, deliberately.
  //
  // This used to read areas[0] out of a list, which implied multi-territory
  // support that doesn't exist — nothing else in the system knows what to do
  // with a second one. Checkout looks up the single active area and checks
  // membership; there is no zone routing, no per-zone pricing, no assignment
  // of a crew to a region.
  //
  // So: one territory, one allowlist, counties as a bulk-selection
  // convenience. If multiple territories are ever wanted, checkout and
  // dispatch have to learn about them first — this component is not the place
  // it would start.
  const area = areas[0] ?? null;
  const extraAreas = areas.length - 1;
  const selected = new Set(area?.zipCodes ?? []);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/service-area", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: area?.id, ...body }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setNote({ text: data.error ?? "Something went wrong.", warn: true });
      return;
    }
    setNote({
      text: data.warning ?? `Saved — ${data.area.zipCodes.length} ZIP codes.`,
      warn: !!data.warning,
    });
    router.refresh();
  }

  async function loadCounty(c: County) {
    const key = `${c.state}/${c.county}`;
    if (openCounty === key) {
      setOpenCounty(null);
      return;
    }
    setOpenCounty(key);
    if (countyZips[key]) return;
    const res = await fetch(
      `/api/admin/service-area?state=${c.state}&county=${encodeURIComponent(c.county)}`
    );
    if (res.ok) {
      const d = await res.json();
      setCountyZips((s) => ({ ...s, [key]: d.zips }));
    }
  }

  if (referenceLoaded === 0) {
    return (
      <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-6">
        <p className="font-medium text-navy">No ZIP code reference data loaded</p>
        <p className="mt-1 text-sm text-navy/80">
          Counties can&rsquo;t be listed until the reference table is imported. Run{" "}
          <code className="rounded bg-white px-1">npx tsx prisma/seed-zip-codes-nj.ts</code>{" "}
          for Monmouth and Ocean, or{" "}
          <code className="rounded bg-white px-1">
            npx tsx prisma/import-zip-codes.ts zips.csv
          </code>{" "}
          for a full dataset.
        </p>
      </div>
    );
  }

  if (!area) {
    return (
      <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-6">
        <p className="font-medium text-navy">No service area configured</p>
        <p className="mt-1 text-sm text-navy/80">
          Checkout refuses every booking until one exists — deliberately, so a missing
          configuration can&rsquo;t quietly let anyone book from anywhere.
        </p>
        <button
          onClick={() => send({ name: "Service Area", zipCodes: [] })}
          disabled={busy}
          className="mt-4 rounded-pill bg-electric px-5 py-2 text-sm font-semibold text-white hover:bg-electric-hover"
        >
          Create one
        </button>
      </div>
    );
  }

  // Straight from the server. The first version worked this out from the
  // drill-down data, so a county showed unticked until you expanded it —
  // which looked like the click hadn't registered.
  const countState = (c: County) => ({ on: c.selected, of: c.usable });

  // Which counties the selection actually touches, partial ones included —
  // that's the honest description of a territory, and it can't go stale the
  // way a typed-in name does.
  const selectedCounties = counties
    .filter((c) => c.selected > 0)
    .map((c) => (c.selected < c.usable ? `${c.county} (part)` : c.county));

  return (
    <div className="mt-6">
      {/* Shouldn't happen, but if a second area exists it must be visible
          rather than silently ignored — checkout only honours the first
          ACTIVE one, so a hidden second territory would be a phantom. */}
      {extraAreas > 0 && (
        <p className="mb-3 rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          There {extraAreas === 1 ? "is" : "are"} {extraAreas} other service area{" "}
          {extraAreas === 1 ? "record" : "records"} in the database. Only this one is
          used — the system supports a single territory.
        </p>
      )}

      {/* The territory's NAME used to be the heading here — it was set to
          "Monmouth County, NJ" when that was the whole territory, and stayed
          that way after other counties were added. A label that has to be
          maintained by hand will be wrong eventually, and this one already
          was.

          What's true is derived instead: whether booking is on, how many ZIPs
          are selected, and which counties they're in. */}
      <div className="flex items-start justify-between gap-4 rounded-card border border-cardline bg-white p-4 shadow-card">
        <div className="min-w-0">
          <div className="font-display text-base font-bold text-navy">
            {area.active ? "Accepting online bookings" : "Online booking is off"}
          </div>
          <div className="mt-0.5 text-sm text-slate">
            {area.zipCodes.length === 0 ? (
              <span className="text-amber-700">
                No ZIP codes selected — nobody can book
              </span>
            ) : (
              <>
                {area.zipCodes.length} ZIP codes
                {selectedCounties.length > 0 && (
                  <> across {selectedCounties.length}{" "}
                  {selectedCounties.length === 1 ? "county" : "counties"}</>
                )}
              </>
            )}
          </div>
          {selectedCounties.length > 0 && (
            <div className="mt-1 text-xs text-slate">
              {selectedCounties.join(" · ")}
            </div>
          )}
        </div>
        <button
          onClick={() => send({ active: !area.active })}
          disabled={busy}
          className={`shrink-0 rounded-pill border px-4 py-1.5 text-xs font-semibold ${
            area.active
              ? "border-cardline text-slate hover:bg-warmwhite"
              : "border-electric text-electric hover:bg-electric/5"
          }`}
        >
          {area.active ? "Turn off" : "Turn on"}
        </button>
      </div>

      {note && (
        <p
          className={`mt-3 rounded-card p-3 text-sm ${
            note.warn ? "bg-amber-50 text-amber-900" : "bg-electric/5 text-navy"
          }`}
        >
          {note.text}
        </p>
      )}

      <h2 className="mt-6 font-display text-base font-bold text-navy">Counties</h2>
      <p className="mt-0.5 text-sm text-slate">
        Tick a county to add every address in it. Open one to untick towns you
        won&rsquo;t travel to.
      </p>

      <div className="mt-3 divide-y divide-cardline rounded-card border border-cardline bg-white">
        {counties.map((c) => {
          const key = `${c.state}/${c.county}`;
          const st = countState(c);
          const isOpen = openCounty === key;
          const zips = countyZips[key];
          return (
            <div key={key}>
              <div className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={st.on > 0}
                  ref={(el) => {
                    // Partly selected reads as neither on nor off, which is
                    // exactly what it is once towns have been unticked.
                    if (el) el.indeterminate = st.on > 0 && st.on < st.of;
                  }}
                  onChange={(e) =>
                    send(
                      e.target.checked
                        ? { addCounties: [{ state: c.state, county: c.county }] }
                        : { removeCounties: [{ state: c.state, county: c.county }] }
                    )
                  }
                  disabled={busy}
                  className="h-4 w-4 shrink-0 accent-electric"
                />
                <button
                  onClick={() => loadCounty(c)}
                  className="flex min-w-0 flex-1 items-center justify-between text-left"
                >
                  <span className="text-sm text-navy">
                    {c.county} <span className="text-slate">({c.state})</span>
                  </span>
                  <span className="text-xs text-slate">
                    {st.on > 0 ? `${st.on} of ${st.of} towns` : `${st.of} towns`}
                    <span className="ml-2">{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-cardline bg-warmwhite px-3 py-2">
                  {!zips && <p className="py-2 text-xs text-slate">Loading...</p>}
                  {zips && (
                    <div className="grid gap-1 sm:grid-cols-2">
                      {zips.map((z) => {
                        const usable = z.type === "STANDARD" && (z.population ?? 0) > 0;
                        return (
                          <label
                            key={z.zip}
                            className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                              usable ? "text-navy" : "text-slate"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(z.zip)}
                              disabled={busy || !usable}
                              onChange={(e) =>
                                send(
                                  e.target.checked
                                    ? { zipCodes: [...selected, z.zip] }
                                    : { excludeZips: [z.zip] }
                                )
                              }
                              className="h-3.5 w-3.5 accent-electric"
                            />
                            <span className="font-mono">{z.zip}</span>
                            <span className="truncate">{z.city}</span>
                            {/* A PO Box or single-entity code can't be a home
                                address, so it's shown but not selectable —
                                clearer than hiding it and leaving someone
                                wondering why the count doesn't match. */}
                            {!usable && (
                              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide">
                                {z.type === "PO_BOX" ? "PO box" : z.type.toLowerCase()}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
