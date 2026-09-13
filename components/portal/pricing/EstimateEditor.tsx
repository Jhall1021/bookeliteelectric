"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/flow-types";
import { validateEstimateBounds } from "@/lib/pricingReadiness";
import type { PricingStrategy } from "@prisma/client";

/**
 * Entering and approving estimated hours — ADR-018.
 *
 * THE TWO WORDS ARE NOT THE SAME. "Save" records what the contractor typed.
 * "Approve for customer estimates" releases it. A contractor who types two
 * numbers and closes the tab has changed nothing a homeowner can see, and the
 * screen says so rather than leaving them to guess.
 *
 * A SUGGESTION IS NOT DATA. The suggested band is rendered as text next to an
 * empty field, and only becomes a value when the contractor takes it. Nothing
 * here writes on load, on strategy change, or on any action but an explicit one.
 */
export type Row = {
  id: string;
  name: string;
  baselineHours: number | null;
  suggested: { low: number; high: number } | null;
  low: number | null;
  high: number | null;
  approved: boolean;
  blockers: string[];
};

type Draft = { low: string; high: string };

export default function EstimateEditor(
  { strategy, crewHourRateCents, rows, quoteOnlyCount }:
  { strategy: PricingStrategy; crewHourRateCents: number | null; rows: Row[]; quoteOnlyCount: number },
) {
  const [state, setState] = useState<Row[]>(rows);
  const [draft, setDraft] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, { low: r.low?.toString() ?? "", high: r.high?.toString() ?? "" }])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const parse = (v: string) => (v.trim() === "" ? null : Number(v));

  /** Six distinct states, never collapsed into one vague count. */
  const status = (r: Row) => {
    if (r.blockers.length) return { key: "other", label: "Other unresolved requirement", tone: "warn" as const };
    const d = draft[r.id];
    const bad = validateEstimateBounds(parse(d?.low ?? ""), parse(d?.high ?? ""));
    if (bad.some((b) => b.code === "unset")) return { key: "needs", label: "Needs estimate range", tone: "warn" as const };
    if (bad.length) return { key: "invalid", label: bad[0].message, tone: "bad" as const };
    if (!r.approved || d.low !== (r.low?.toString() ?? "") || d.high !== (r.high?.toString() ?? ""))
      return { key: "entered", label: "Entered, not approved", tone: "info" as const };
    return { key: "ready", label: "Ready", tone: "good" as const };
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { ready: 0, entered: 0, needs: 0, invalid: 0, other: 0 };
    for (const r of state) c[status(r).key]++;
    return c;
  }, [state, draft]);

  const allSelected = state.length > 0 && selected.size === state.length;

  async function send(ids: string[], action: "save" | "approve") {
    setBusy(true); setError(null); setNote(null);
    try {
      const items = ids.map((id) => ({ serviceId: id, low: parse(draft[id].low), high: parse(draft[id].high) }));
      const res = await fetch("/api/portal/estimates", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setState((prev) => prev.map((r) => ids.includes(r.id)
        ? { ...r, low: parse(draft[r.id].low), high: parse(draft[r.id].high), approved: action === "approve" }
        : r));
      setSelected(new Set());
      setNote(action === "approve"
        ? `Approved ${data.written} service${data.written === 1 ? "" : "s"} for customer estimates.`
        : `Saved ${data.written}. Not yet shown to customers.`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  if (strategy !== "TIME_AND_MATERIALS") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/dashboard/settings" className="text-sm font-semibold text-electric hover:underline">← Settings</Link>
        <div className="mt-4 rounded-card border border-cardline bg-white p-6 shadow-card sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Pricing setup</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy">Estimated hours</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
            You price by fixed quote, so your services do not need estimated hour ranges. If you
            switch to time and materials, anything you enter here will be waiting — switching
            strategy never changes what you have configured for the other one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl pb-24">
      <Link href="/dashboard/settings" className="text-sm font-semibold text-electric hover:underline">← Settings</Link>
      <header className="mt-4 border-b border-cardline pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Time &amp; materials</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-navy">Estimated hours</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
          You bill {crewHourRateCents ? <strong className="text-navy">{formatCents(crewHourRateCents)} per crew hour</strong> : "by the crew hour"}{" "}
          plus materials. Set the normal crew-hour range for each service, then explicitly approve
          the ranges you are ready to show customers.
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Ready" value={counts.ready} detail="Approved for customer estimates." tone="good" />
        <Summary label="Entered" value={counts.entered} detail="Saved or changed, but not approved." tone="info" />
        <Summary label="Needs attention" value={counts.needs + counts.invalid + counts.other} detail="Missing, invalid, or blocked ranges." tone="warn" />
        <Summary label="Quote only" value={quoteOnlyCount} detail="No automatic estimate range needed." tone="muted" />
      </div>

      <div className="mt-6 rounded-card border border-electric/20 bg-electric/5 px-4 py-3 text-sm leading-6 text-slate">
        <span className="font-semibold text-navy">Saving is not publishing.</span>{" "}
        Save records your range. Only <strong className="text-navy">Approve for customer estimates</strong> makes that range available to homeowners.
      </div>

      {note && <div className="mt-4 rounded-card border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">{note}</div>}
      {error && <div role="alert" className="mt-4 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-cardline bg-warmwhite px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-display text-lg font-bold text-navy">Service estimate ranges</h2>
            <p className="mt-1 text-sm text-slate">Your existing labor baseline stays reference-only until you choose a range.</p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(allSelected ? new Set() : new Set(state.map((r) => r.id)))}
            className="min-h-11 rounded-pill border border-cardline bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-electric/40 hover:bg-electric/5"
          >
            {allSelected ? "Clear selection" : "Select all"}
          </button>
        </div>

        {state.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-semibold text-navy">No services need estimated hours.</p>
            <p className="mt-1 text-sm text-slate">Quote-only services are intentionally excluded from this workspace.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-sm">
              <thead className="bg-white">
                <tr className="border-b border-cardline text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="px-5 py-3"><span className="sr-only">Select</span></th>
                  <th className="py-3 pr-4">Service</th>
                  <th className="py-3 pr-4">Baseline</th>
                  <th className="py-3 pr-4">Suggested</th>
                  <th className="py-3 pr-4">Low</th>
                  <th className="py-3 pr-4">High</th>
                  <th className="py-3 pr-4">Customers see</th>
                  <th className="py-3 pr-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {state.map((r) => {
                  const st = status(r);
                  const d = draft[r.id];
                  const lo = parse(d.low), hi = parse(d.high);
                  const money = crewHourRateCents && lo !== null && hi !== null && validateEstimateBounds(lo, hi).length === 0
                    ? `${formatCents(Math.round(lo * crewHourRateCents))}–${formatCents(Math.round(hi * crewHourRateCents))}`
                    : "—";
                  return (
                    <tr key={r.id} className={`border-b border-cardline align-middle last:border-0 ${selected.has(r.id) ? "bg-electric/[0.035]" : ""}`}>
                      <td className="px-5 py-4">
                        <input type="checkbox" checked={selected.has(r.id)} aria-label={`Select ${r.name}`}
                               className="h-4 w-4 accent-electric"
                               onChange={(e) => setSelected((s) => {
                                 const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} />
                      </td>
                      <td className="py-4 pr-4 font-semibold text-navy">{r.name}</td>
                      <td className="py-4 pr-4 text-slate">{r.baselineHours !== null ? `${r.baselineHours} hrs` : "—"}</td>
                      <td className="py-4 pr-4 text-slate">
                        {r.suggested ? (
                          <button type="button"
                                  onClick={() => setDraft((x) => ({ ...x, [r.id]: { low: String(r.suggested!.low), high: String(r.suggested!.high) } }))}
                                  className="min-h-9 rounded-pill bg-electric/10 px-3 py-1.5 font-semibold text-electric transition hover:bg-electric/15">
                            Use {r.suggested.low}–{r.suggested.high} hrs
                          </button>
                        ) : "—"}
                      </td>
                      <td className="py-4 pr-4">
                        <input type="number" step="0.25" min="0" value={d.low} aria-label={`Low hours for ${r.name}`}
                               onChange={(e) => setDraft((x) => ({ ...x, [r.id]: { ...x[r.id], low: e.target.value } }))}
                               className="min-h-10 w-24 rounded-md border border-cardline bg-white px-3 py-2 text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10" />
                      </td>
                      <td className="py-4 pr-4">
                        <input type="number" step="0.25" min="0" value={d.high} aria-label={`High hours for ${r.name}`}
                               onChange={(e) => setDraft((x) => ({ ...x, [r.id]: { ...x[r.id], high: e.target.value } }))}
                               className="min-h-10 w-24 rounded-md border border-cardline bg-white px-3 py-2 text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10" />
                      </td>
                      <td className="py-4 pr-4 font-medium text-navy">{r.approved ? money : "—"}</td>
                      <td className="py-4 pr-5">
                        <Status tone={st.tone} label={st.label} />
                        {r.blockers.length > 0 && <div className="mt-1 max-w-xs text-xs leading-5 text-slate">{r.blockers.join(" ")}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cardline bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,30,60,0.08)] backdrop-blur sm:left-auto sm:right-6 sm:bottom-6 sm:w-auto sm:rounded-card sm:border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 sm:justify-end">
            <span className="mr-1 text-sm font-semibold text-navy">{selected.size} selected</span>
            <button type="button" disabled={busy}
                    onClick={() => {
                      state.filter((r) => r.suggested && selected.has(r.id)).forEach((r) =>
                        setDraft((d) => ({ ...d, [r.id]: { low: String(r.suggested!.low), high: String(r.suggested!.high) } })));
                    }}
                    className="min-h-10 rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">
              Fill suggestions
            </button>
            <button type="button" disabled={busy} onClick={() => send([...selected], "save")}
                    className="min-h-10 rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">
              {busy ? "Working…" : "Save"}
            </button>
            <button type="button" disabled={busy} onClick={() => send([...selected], "approve")}
                    className="min-h-10 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">
              {busy ? "Working…" : "Approve for customer estimates"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  good: "bg-success/10 text-success",
  info: "bg-electric/10 text-electric",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
  muted: "bg-cardline text-slate",
};

function Summary({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) {
  return (
    <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate">{label}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${tone === "good" ? "bg-success" : tone === "info" ? "bg-electric" : tone === "warn" ? "bg-amber-500" : "bg-slate/40"}`} />
      </div>
      <p className="mt-1 font-display text-2xl font-bold text-navy">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate">{detail}</p>
    </div>
  );
}

function Status({ tone, label }: { tone: string; label: string }) {
  return <span className={`inline-block rounded-pill px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}>{label}</span>;
}
