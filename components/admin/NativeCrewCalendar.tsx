"use client";

import { useMemo, useState } from "react";

type Crew = { id: string; name: string; active: boolean };
type Block = {
  id: string;
  crewId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
};

function addDays(dateISO: string, amount: number) {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekDates(start: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function dayLabel(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function displayTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, hours, minutes)).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "UTC",
  });
}

export default function NativeCrewCalendar({
  initialCrews,
  initialBlocks,
  initialWeek,
  legacyCapacity,
}: {
  initialCrews: Crew[];
  initialBlocks: Block[];
  initialWeek: string;
  legacyCapacity: number | null;
}) {
  const [crews, setCrews] = useState(initialCrews);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [newCrew, setNewCrew] = useState("");
  const [crewId, setCrewId] = useState(initialCrews.find((crew) => crew.active)?.id ?? "");
  const [date, setDate] = useState(initialWeek);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const days = useMemo(() => weekDates(weekStart), [weekStart]);

  async function request(method: string, body?: unknown, rangeStart = weekStart) {
    const end = addDays(rangeStart, 6);
    const url = method === "GET"
      ? `/api/admin/native-schedule?from=${rangeStart}&to=${end}`
      : "/api/admin/native-schedule";
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "The schedule could not be updated.");
    return data;
  }

  async function loadWeek(next: string) {
    setBusy(true);
    setMessage(null);
    try {
      const data = await request("GET", undefined, next);
      setWeekStart(next);
      setDate(next);
      setCrews(data.crews);
      setBlocks(data.blocks);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The calendar could not be loaded.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function addCrew() {
    if (!newCrew.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await request("POST", { kind: "crew", name: newCrew });
      setCrews(data.crews);
      setCrewId((current) => current || data.crew.id);
      setNewCrew("");
      setMessage({ text: `${data.crew.name} is ready for online availability.`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The crew could not be added.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function saveCrew(crew: Crew) {
    if (!crew.name.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await request("PATCH", crew);
      setCrews((current) => current.map((item) => item.id === crew.id ? data.crew : item));
      if (!data.crew.active && crewId === crew.id) {
        setCrewId(crews.find((item) => item.id !== crew.id && item.active)?.id ?? "");
      }
      setMessage({ text: `${data.crew.name} was updated.`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The crew could not be updated.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function addBlock() {
    if (!crewId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await request("POST", { kind: "block", crewId, date, startTime, endTime, note });
      if (date >= weekStart && date <= addDays(weekStart, 6)) {
        setBlocks((current) => [...current, data.block].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)));
      }
      setNote("");
      setMessage({ text: "Unavailable time added. Customers will not be offered capacity that depends on this crew.", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unavailable time could not be added.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(id: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await request("DELETE", { id });
      setBlocks((current) => current.filter((block) => block.id !== id));
      setMessage({ text: "Unavailable time removed.", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unavailable time could not be removed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
      <div className="border-b border-cardline bg-warmwhite px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-electric">Native scheduling</p>
        <h2 className="mt-1 font-display text-lg font-bold text-navy">Crews and blocked time</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate">
          Name each crew that can take a job, then block time already committed outside Price2Book. This only controls availability—it is not a customer, job or dispatch system.
        </p>
      </div>

      <div className="space-y-7 p-5 sm:p-6">
        <div>
          <h3 className="text-sm font-bold text-navy">Your crews</h3>
          <p className="mt-1 text-xs leading-5 text-slate">Each active crew adds one job of capacity at a time.</p>
          <div className="mt-3 space-y-2">
            {crews.map((crew) => (
              <div key={crew.id} className="flex flex-col gap-2 rounded-card border border-cardline p-3 sm:flex-row sm:items-center">
                <input
                  aria-label={`Name for ${crew.name}`}
                  value={crew.name}
                  onChange={(event) => setCrews((current) => current.map((item) => item.id === crew.id ? { ...item, name: event.target.value } : item))}
                  className="min-w-0 flex-1 rounded-card border border-cardline px-3 py-2 text-sm text-navy outline-none focus:border-electric"
                />
                <label className="flex items-center gap-2 text-sm font-medium text-navy">
                  <input
                    type="checkbox"
                    checked={crew.active}
                    onChange={(event) => setCrews((current) => current.map((item) => item.id === crew.id ? { ...item, active: event.target.checked } : item))}
                    className="h-4 w-4 accent-electric"
                  />
                  Accepts online work
                </label>
                <button type="button" disabled={busy} onClick={() => saveCrew(crew)} className="rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy hover:border-electric disabled:opacity-50">
                  Save
                </button>
              </div>
            ))}
            {crews.length === 0 && (
              <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {legacyCapacity
                  ? `Price2Book currently uses ${legacyCapacity} unnamed crew${legacyCapacity === 1 ? "" : "s"}. Add the first name and the remaining crew slots will be preserved for you to rename.`
                  : "Add at least one crew before relying on native online scheduling."}
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input value={newCrew} onChange={(event) => setNewCrew(event.target.value)} placeholder="Example: Crew 1 or Mike’s Van" maxLength={60} className="min-w-0 flex-1 rounded-card border border-cardline px-3 py-2.5 text-sm text-navy outline-none focus:border-electric" />
            <button type="button" disabled={busy || !newCrew.trim()} onClick={addCrew} className="rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Add crew</button>
          </div>
        </div>

        <div className="border-t border-cardline pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-navy">Availability calendar</h3>
              <p className="mt-1 text-xs leading-5 text-slate">Showing commitments that did not come through Price2Book.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => loadWeek(addDays(weekStart, -7))} className="rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy">Previous</button>
              <button type="button" disabled={busy} onClick={() => loadWeek(addDays(weekStart, 7))} className="rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy">Next</button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-7">
            {days.map((day) => (
              <div key={day} className="min-h-32 rounded-card border border-cardline bg-warmwhite/40 p-3">
                <p className="text-xs font-bold text-navy">{dayLabel(day)}</p>
                <div className="mt-2 space-y-2">
                  {blocks.filter((block) => block.date === day).map((block) => {
                    const crew = crews.find((item) => item.id === block.crewId);
                    return (
                      <div key={block.id} className="rounded-card border border-electric/15 bg-white p-2 text-xs text-slate">
                        <p className="font-semibold text-navy">{crew?.name ?? "Crew"}</p>
                        <p>{displayTime(block.startTime)}–{displayTime(block.endTime)}</p>
                        {block.note && <p className="mt-1 break-words">{block.note}</p>}
                        <button type="button" disabled={busy} onClick={() => removeBlock(block.id)} className="mt-2 font-semibold text-red-700 hover:underline">Remove</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-cardline pt-6">
          <h3 className="text-sm font-bold text-navy">Block unavailable time</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-slate">Crew<select value={crewId} onChange={(event) => setCrewId(event.target.value)} className="mt-1 block w-full rounded-card border border-cardline bg-white px-3 py-2.5 text-sm text-navy"><option value="">Choose crew</option>{crews.filter((crew) => crew.active).map((crew) => <option key={crew.id} value={crew.id}>{crew.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block w-full rounded-card border border-cardline px-3 py-2 text-sm text-navy" /></label>
            <label className="text-xs font-semibold text-slate">Start<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 block w-full rounded-card border border-cardline px-3 py-2 text-sm text-navy" /></label>
            <label className="text-xs font-semibold text-slate">End<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1 block w-full rounded-card border border-cardline px-3 py-2 text-sm text-navy" /></label>
            <label className="text-xs font-semibold text-slate">Optional note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="Existing job" className="mt-1 block w-full rounded-card border border-cardline px-3 py-2.5 text-sm text-navy" /></label>
          </div>
          <button type="button" disabled={busy || !crewId || !date || startTime >= endTime} onClick={addBlock} className="mt-3 rounded-pill bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Block this time</button>
        </div>

        {message && <p role={message.error ? "alert" : "status"} className={`rounded-card border p-3 text-sm ${message.error ? "border-red-200 bg-red-50 text-red-800" : "border-electric/15 bg-electric/5 text-navy"}`}>{message.text}</p>}
      </div>
    </section>
  );
}
