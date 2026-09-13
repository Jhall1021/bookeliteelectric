"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Area = { id: string; name: string; zipCodes: string[]; active: boolean };
type County = {
  state: string; county: string; total: number; usable: number;
  selected: number;
};
type Zip = { zip: string; city: string; type: string; population: number | null };

/**
 * Pick counties, then untick the towns you won't drive to.
 * Counties are the bulk-selection unit; ZIPs remain the actual checkout
 * allowlist. This component deliberately manages one territory only.
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

  const area = areas[0] ?? null;
  const extraAreas = areas.length - 1;
  const selected = new Set(area?.zipCodes ?? []);

  async function send(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/service-area", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: area?.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote({
          text: typeof data.error === "string" ? data.error : "Could not save the service area. Nothing was changed.",
          warn: true,
        });
        return;
      }
      const savedZipCount = Array.isArray(data.area?.zipCodes) ? data.area.zipCodes.length : null;
      setNote({
        text: typeof data.warning === "string"
          ? data.warning
          : savedZipCount !== null
            ? `Saved — ${savedZipCount} ZIP codes.`
            : "Service area saved.",
        warn: typeof data.warning === "string",
      });
      router.refresh();
    } catch {
      // A service-area write may have committed before the browser lost the
      // response. Refresh from the server instead of encouraging a blind retry
      // that could toggle booking or ZIP membership a second time.
      setNote({
        text: "Price2Book lost the response while saving. Refreshing the current service area now — confirm it before trying again.",
        warn: true,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function loadCounty(c: County) {
    const key = `${c.state}/${c.county}`;
    if (openCounty === key) {
      setOpenCounty(null);
      return;
    }
    setOpenCounty(key);
    if (countyZips[key]) return;
    try {
      const res = await fetch(
        `/api/admin/service-area?state=${c.state}&county=${encodeURIComponent(c.county)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.zips)) {
        setNote({ text: "Could not load this county's ZIP codes. Try opening it again.", warn: true });
        return;
      }
      setCountyZips((s) => ({ ...s, [key]: data.zips }));
    } catch {
      setNote({ text: "Could not reach Price2Book to load this county's ZIP codes.", warn: true });
    }
  }

  if (referenceLoaded === 0) {
    return (
      <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-5 sm:p-6">
        <p className="font-medium text-navy">No ZIP code reference data loaded</p>
        <p className="mt-1 text-sm leading-6 text-navy/80">
          Counties cannot be listed until the reference table is imported. Run <code className="rounded bg-white px-1">npx tsx prisma/seed-zip-codes-nj.ts</code> for Monmouth and Ocean, or <code className="rounded bg-white px-1">npx tsx prisma/import-zip-codes.ts zips.csv</code> for a full dataset.
        </p>
      </div>
    );
  }

  if (!area) {
    return (
      <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-5 sm:p-6">
        <p className="font-medium text-navy">No service area configured</p>
        <p className="mt-1 text-sm leading-6 text-navy/80">
          Checkout refuses every booking until one exists, so a missing configuration cannot quietly accept work from anywhere.
        </p>
        <button
          type="button"
          onClick={() => send({ name: "Service Area", zipCodes: [] })}
          disabled={busy}
          className="mt-4 w-full rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Creating..." : "Create service area"}
        </button>
      </div>
    );
  }

  const countState = (c: County) => ({ on: c.selected, of: c.usable });
  const selectedCounties = counties
    .filter((c) => c.selected > 0)
    .map((c) => (c.selected < c.usable ? `${c.county} (part)` : c.county));

  return (
    <div className="mt-6 space-y-5 sm:space-y-6">
      {extraAreas > 0 && (
        <p className="rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          There {extraAreas === 1 ? "is" : "are"} {extraAreas} other service area {extraAreas === 1 ? "record" : "records"} in the database. Only this one is used — the system supports a single territory.
        </p>
      )}

      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite/60 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-electric">Booking coverage</p>
              <h2 className="mt-1 font-display text-lg font-bold text-navy">
                {area.active ? "Online booking is on" : "Online booking is off"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate">
                {area.zipCodes.length === 0 ? (
                  <span className="font-medium text-amber-700">No ZIP codes are selected, so nobody can book online.</span>
                ) : (
                  <>{area.zipCodes.length} ZIP codes across {selectedCounties.length} {selectedCounties.length === 1 ? "county" : "counties"}.</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => send({ active: !area.active })}
              disabled={busy}
              className={`w-full shrink-0 rounded-pill border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 sm:w-auto ${
                area.active
                  ? "border-cardline bg-white text-slate hover:bg-warmwhite"
                  : "border-electric bg-electric/5 text-electric hover:bg-electric/10"
              }`}
            >
              {busy ? "Saving..." : area.active ? "Turn booking off" : "Turn booking on"}
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-cardline bg-warmwhite/40 p-4">
              <div className="text-2xl font-bold text-navy">{area.zipCodes.length}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate">ZIP codes</div>
            </div>
            <div className="rounded-card border border-cardline bg-warmwhite/40 p-4">
              <div className="text-2xl font-bold text-navy">{selectedCounties.length}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate">Counties reached</div>
            </div>
            <div className="rounded-card border border-cardline bg-warmwhite/40 p-4">
              <div className={`text-sm font-bold ${area.active && area.zipCodes.length > 0 ? "text-success" : "text-amber-700"}`}>
                {area.active && area.zipCodes.length > 0 ? "Accepting bookings" : "Not bookable"}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate">Checkout status</div>
            </div>
          </div>

          {selectedCounties.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedCounties.map((county) => (
                <span key={county} className="rounded-pill border border-cardline bg-white px-3 py-1.5 text-xs font-medium text-navy">{county}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {note && (
        <p role={note.warn ? "alert" : "status"} className={`rounded-card border p-3 text-sm ${note.warn ? "border-amber-200 bg-amber-50 text-amber-900" : "border-electric/15 bg-electric/5 text-navy"}`}>
          {note.text}
        </p>
      )}

      <section className="rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate">Choose where you travel</p>
          <h2 className="mt-1 font-display text-base font-bold text-navy">Counties and towns</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate">
            Select a county to add its residential ZIP codes. Open a county to remove specific towns that are outside your practical travel area.
          </p>
        </div>

        <div className="divide-y divide-cardline">
          {counties.map((c) => {
            const key = `${c.state}/${c.county}`;
            const st = countState(c);
            const isOpen = openCounty === key;
            const zips = countyZips[key];
            return (
              <div key={key}>
                <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.county}, ${c.state}`}
                    checked={st.on > 0}
                    ref={(el) => {
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
                    className="h-5 w-5 shrink-0 accent-electric"
                  />
                  <button
                    type="button"
                    onClick={() => loadCounty(c)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-navy">{c.county}</span>
                      <span className="block text-xs text-slate">{c.state}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-slate">
                      <span className="block">{st.on > 0 ? `${st.on} of ${st.of} towns` : `${st.of} towns`}</span>
                      <span className="mt-0.5 block font-semibold text-electric">{isOpen ? "Hide towns" : "View towns"}</span>
                    </span>
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-cardline bg-warmwhite/60 px-4 py-3 sm:px-6">
                    {!zips && <p className="py-2 text-sm text-slate">Loading towns...</p>}
                    {zips && (
                      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {zips.map((z) => {
                          const usable = z.type === "STANDARD" && (z.population ?? 0) > 0;
                          return (
                            <label
                              key={z.zip}
                              className={`flex min-h-10 items-center gap-2 rounded-card px-2.5 py-2 text-xs transition ${
                                usable ? "text-navy hover:bg-white" : "text-slate"
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
                                className="h-4 w-4 shrink-0 accent-electric"
                              />
                              <span className="font-mono">{z.zip}</span>
                              <span className="min-w-0 flex-1 truncate">{z.city}</span>
                              {!usable && (
                                <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-slate">
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
      </section>
    </div>
  );
}
