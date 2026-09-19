"use client";

import { useMemo, useState } from "react";
import {
  analyzeContractorSpeed,
  ELECTRICAL_CORE_CALIBRATION_SCENARIOS,
} from "@/lib/electrical/laborCalibrationWizard";

type InitialAnswer = { scenarioKey: string; scenarioHours: number };

const minutes = (hours: number) => Math.round(hours * 60);

export default function AtomicLaborWizardPanel({
  initialAnswers,
  hasCrewRate,
}: {
  initialAnswers: InitialAnswer[];
  hasCrewRate: boolean;
}) {
  const initial = Object.fromEntries(initialAnswers.map((answer) => [answer.scenarioKey, answer.scenarioHours]));
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(initial);
  const [draftMinutes, setDraftMinutes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenario = ELECTRICAL_CORE_CALIBRATION_SCENARIOS[index];
  const answeredCount = Object.keys(answers).filter((key) =>
    ELECTRICAL_CORE_CALIBRATION_SCENARIOS.some((candidate) => candidate.key === key),
  ).length;
  const speed = useMemo(() => analyzeContractorSpeed(
    Object.entries(answers).map(([scenarioKey, contractorHours]) => ({ scenarioKey, contractorHours })),
  ), [answers]);

  function begin() {
    const firstMissing = ELECTRICAL_CORE_CALIBRATION_SCENARIOS.findIndex((candidate) => answers[candidate.key] === undefined);
    if (firstMissing === -1) setReviewing(true);
    else setIndex(firstMissing);
    setStarted(true);
  }

  function submitCurrent() {
    const value = Number(draftMinutes);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a time greater than zero minutes.");
      return;
    }
    const next = { ...answers, [scenario.key]: value / 60 };
    setAnswers(next);
    setDraftMinutes("");
    setError(null);
    if (index === ELECTRICAL_CORE_CALIBRATION_SCENARIOS.length - 1) setReviewing(true);
    else setIndex(index + 1);
  }

  async function save() {
    const rows = ELECTRICAL_CORE_CALIBRATION_SCENARIOS.map((candidate) => ({
      scenarioKey: candidate.key,
      scenarioHours: answers[candidate.key],
      scopeVersion: 1,
    }));
    if (rows.some((row) => !Number.isFinite(row.scenarioHours) || row.scenarioHours <= 0)) {
      setError("All eight scenarios need a time before review can be saved.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/labor-calibration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "scenario-answers", answers: rows }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save labor calibration.");
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save labor calibration.");
    } finally {
      setBusy(false);
    }
  }

  if (!started) return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-electric">Labor calibration</p>
          <h2 className="mt-1 font-display text-lg font-bold text-navy">Eight familiar jobs—not 76 separate guesses</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate">
            We use these bounded examples to understand how your crew works, then show you operation-level proposals for review. Nothing is copied into a service or customer price automatically.
          </p>
          <p className="mt-2 text-xs text-slate">{answeredCount} of 8 scenarios saved.</p>
        </div>
        <button type="button" onClick={begin} className="shrink-0 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white">
          {answeredCount ? "Continue" : "Start"}
        </button>
      </div>
      {!hasCrewRate && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">You can answer labor questions now, but service pricing will also need your crew-hour rate.</p>}
    </section>
  );

  if (done) return (
    <section className="mt-6 rounded-card border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="font-display text-lg font-bold text-navy">Labor examples saved</h2>
      <p className="mt-2 text-sm text-slate">These remain calibration evidence. No service duration or price was published. The next step is reviewing the individual operation proposals they support.</p>
    </section>
  );

  if (reviewing) return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-electric">Review your answers</p>
      <h2 className="mt-1 font-display text-lg font-bold text-navy">Eight bounded labor examples</h2>
      <div className="mt-4 divide-y divide-cardline rounded-xl border border-cardline">
        {ELECTRICAL_CORE_CALIBRATION_SCENARIOS.map((candidate, candidateIndex) => (
          <div key={candidate.key} className="flex items-start justify-between gap-4 p-3">
            <div><p className="text-sm font-medium text-navy">{candidate.prompt}</p><p className="mt-1 text-xs text-slate">{candidate.scope}</p></div>
            <button type="button" onClick={() => { setIndex(candidateIndex); setDraftMinutes(String(minutes(answers[candidate.key]))); setReviewing(false); }} className="shrink-0 text-sm font-semibold text-electric">
              {minutes(answers[candidate.key])} min · Edit
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-warm p-3 text-sm text-slate">
        {speed.kind === "CONSISTENT" && <>Your comparable answers show a consistent working pattern at about {Math.round((speed.factor ?? 1) * 100)}% of the published midpoint. This is supporting evidence only—not an automatic multiplier.</>}
        {speed.kind === "MIXED" && <>Your answers vary by type of work, so Price2Book will keep the families separate rather than applying one speed multiplier.</>}
        {speed.kind === "INSUFFICIENT" && <>The answers are still useful individually. There are not enough compatible published comparisons to claim one overall speed pattern.</>}
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={save} disabled={busy} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save calibration"}</button>
        <button type="button" onClick={() => { setIndex(0); setReviewing(false); }} className="rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy">Review again</button>
      </div>
    </section>
  );

  return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <div className="flex items-center justify-between text-xs font-semibold text-slate"><span>Question {index + 1} of 8</span><span>{Math.round(((index + 1) / 8) * 100)}%</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-electric" style={{ width: `${((index + 1) / 8) * 100}%` }} /></div>
      <h2 className="mt-5 font-display text-xl font-bold text-navy">{scenario.prompt}</h2>
      <p className="mt-2 text-sm text-slate">Included scope: {scenario.scope}</p>
      {scenario.bookComparison && <p className="mt-2 text-xs text-slate">Published comparison: {minutes(scenario.bookComparison.lowHours)}–{minutes(scenario.bookComparison.highHours)} minutes. {scenario.bookComparison.caution}</p>}
      <label className="mt-5 block text-sm font-semibold text-navy" htmlFor="labor-minutes">Minutes on site with your usual crew</label>
      <div className="mt-2 flex max-w-sm items-center gap-3">
        <input id="labor-minutes" inputMode="decimal" value={draftMinutes} onChange={(event) => setDraftMinutes(event.target.value)} className="w-32 rounded-lg border border-cardline px-3 py-2 text-navy" placeholder="Minutes" />
        <button type="button" onClick={submitCurrent} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white">Continue</button>
      </div>
      <p className="mt-2 text-xs text-slate">Use the crew you normally send. Do not include travel, permits, diagnosis, or work excluded above.</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

