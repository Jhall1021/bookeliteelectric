"use client";

import { useMemo, useState } from "react";
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
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Estimated hours</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          You price by fixed quote, so your services do not need estimated hour ranges. If you
          switch to time and materials, anything you enter here will be waiting — switching
          strategy never changes what you have configured for the other one.
        </p>
      </div>
    );
  }

  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-bold text-navy">Estimated hours</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate">
          You bill {crewHourRateCents ? <strong>{formatCents(crewHourRateCents)} per crew hour</strong> : "by the crew hour"}{" "}
          plus materials. For each service, tell us the range of crew-hours it usually takes.
          Homeowners see that range multiplied by your rate — so nothing is shown until you
          approve it.
        </p>
      </header>

      <dl className="mt-6 flex flex-wrap gap-3 text-sm">
        <Pill label="Ready" n={counts.ready} tone="good" />
        <Pill label="Entered, not approved" n={counts.entered} tone="info" />
        <Pill label="Needs estimate range" n={counts.needs} tone="warn" />
        {counts.invalid > 0 && <Pill label="Invalid" n={counts.invalid} tone="bad" />}
        {counts.other > 0 && <Pill label="Other unresolved requirement" n={counts.other} tone="warn" />}
        <Pill label="Quote only" n={quoteOnlyCount} tone="muted" />
      </dl>

      {selected.size > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-card border border-electric bg-white px-4 py-3">
          <span className="text-sm font-semibold text-navy">{selected.size} selected</span>
          <button type="button" disabled={busy}
                  onClick={() => setSelected(new Set(state.filter((r) => r.suggested && selected.has(r.id)).map((r) => {
                    setDraft((d) => ({ ...d, [r.id]: { low: String(r.suggested!.low), high: String(r.suggested!.high) } }));
                    return r.id;
                  })))}
                  className="rounded-pill border border-cardline px-4 py-1.5 text-sm font-semibold text-navy">
            Fill with suggestions
          </button>
          <button type="button" disabled={busy} onClick={() => send([...selected], "save")}
                  className="rounded-pill border border-cardline px-4 py-1.5 text-sm font-semibold text-navy">
            Save
          </button>
          {/* Bulk approval stays an explicit act. It is offered because setting
              fifty-six services one at a time is how onboarding dies — not
              because approval is a formality. */}
          <button type="button" disabled={busy} onClick={() => send([...selected], "approve")}
                  className="rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white">
            Approve for customer estimates
          </button>
        </div>
      )}

      {note && <p className="mt-4 text-sm text-success">{note}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-cardline text-left text-xs uppercase tracking-wide text-slate">
              <th className="py-2 pr-3"><span className="sr-only">Select</span></th>
              <th className="py-2 pr-3">Service</th>
              <th className="py-2 pr-3">Your baseline</th>
              <th className="py-2 pr-3">Suggested</th>
              <th className="py-2 pr-3">Low</th>
              <th className="py-2 pr-3">High</th>
              <th className="py-2 pr-3">Customers see</th>
              <th className="py-2">Status</th>
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
                <tr key={r.id} className="border-b border-cardline align-middle">
                  <td className="py-2 pr-3">
                    <input type="checkbox" checked={selected.has(r.id)} aria-label={`Select ${r.name}`}
                           onChange={(e) => setSelected((s) => {
                             const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} />
                  </td>
                  <td className="py-2 pr-3 font-medium text-navy">{r.name}</td>
                  {/* What the contractor already told us, shown as reference —
                      never silently promoted into the range. */}
                  <td className="py-2 pr-3 text-slate">
                    {r.baselineHours !== null ? `${r.baselineHours} hrs` : "—"}
                  </td>
                  <td className="py-2 pr-3 text-slate">
                    {r.suggested ? (
                      <button type="button"
                              onClick={() => setDraft((x) => ({ ...x, [r.id]: {
                                low: String(r.suggested!.low), high: String(r.suggested!.high) } }))}
                              className="text-electric underline-offset-2 hover:underline">
                        {r.suggested.low}–{r.suggested.high} hrs
                      </button>
                    ) : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" step="0.25" min="0" value={d.low} aria-label={`Low hours for ${r.name}`}
                           onChange={(e) => setDraft((x) => ({ ...x, [r.id]: { ...x[r.id], low: e.target.value } }))}
                           className="w-20 rounded border border-cardline px-2 py-1" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" step="0.25" min="0" value={d.high} aria-label={`High hours for ${r.name}`}
                           onChange={(e) => setDraft((x) => ({ ...x, [r.id]: { ...x[r.id], high: e.target.value } }))}
                           className="w-20 rounded border border-cardline px-2 py-1" />
                  </td>
                  <td className="py-2 pr-3 text-slate">{r.approved ? money : "—"}</td>
                  <td className="py-2">
                    <Status tone={st.tone} label={st.label} />
                    {r.blockers.length > 0 && (
                      <div className="mt-1 text-xs text-slate">{r.blockers.join(" ")}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

function Pill({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className={`rounded-pill px-3 py-1 ${TONE[tone]}`}>
      <span className="font-semibold">{n}</span> {label}
    </div>
  );
}

function Status({ tone, label }: { tone: string; label: string }) {
  return <span className={`inline-block rounded-pill px-2 py-0.5 text-xs ${TONE[tone]}`}>{label}</span>;
}
