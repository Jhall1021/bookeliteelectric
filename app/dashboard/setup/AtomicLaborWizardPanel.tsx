"use client";

import { useMemo, useState } from "react";
import {
  analyzeContractorSpeed,
  ELECTRICAL_CORE_CALIBRATION_SCENARIOS,
  publishedBookStartingPoint,
  selectElectricalTargetedCalibrationScenarios,
} from "@/lib/electrical/laborCalibrationWizard";
import { buildElectricalOperationProposals } from "@/lib/electrical/laborOperationProposals";

type InitialAnswer = { scenarioKey: string; scenarioHours: number };

const minutes = (hours: number) => Math.round(hours * 60);

export default function AtomicLaborWizardPanel({
  initialAnswers,
  initialDecisionKeys,
  offeredServiceSlugs,
  hasCrewRate,
}: {
  initialAnswers: InitialAnswer[];
  initialDecisionKeys: string[];
  offeredServiceSlugs: string[];
  hasCrewRate: boolean;
}) {
  const initial = Object.fromEntries(initialAnswers.map((answer) => [answer.scenarioKey, answer.scenarioHours]));
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(initial);
  const [draftMinutes, setDraftMinutes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evidenceSaved, setEvidenceSaved] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedOperations, setSelectedOperations] = useState<Set<string>>(() => new Set());
  const [editedOperationHours, setEditedOperationHours] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const targetedScenarios = useMemo(() => selectElectricalTargetedCalibrationScenarios(
    offeredServiceSlugs,
    initialDecisionKeys,
  ), [offeredServiceSlugs, initialDecisionKeys]);
  const scenarios = useMemo(() => [
    ...ELECTRICAL_CORE_CALIBRATION_SCENARIOS,
    ...targetedScenarios,
  ], [targetedScenarios]);
  const scenario = scenarios[index];
  const bookStartingPoint = publishedBookStartingPoint(scenario);
  const answeredCount = Object.keys(answers).filter((key) =>
    scenarios.some((candidate) => candidate.key === key),
  ).length;
  const speed = useMemo(() => analyzeContractorSpeed(
    Object.entries(answers).map(([scenarioKey, contractorHours]) => ({ scenarioKey, contractorHours })),
  ), [answers]);
  const operationProposals = useMemo(() => buildElectricalOperationProposals(
    Object.entries(answers).map(([scenarioKey, contractorHours]) => ({ scenarioKey, contractorHours })),
    new Set(initialDecisionKeys),
  ), [answers, initialDecisionKeys]);

  function begin() {
    const firstMissing = scenarios.findIndex((candidate) => answers[candidate.key] === undefined);
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
    if (index === scenarios.length - 1) setReviewing(true);
    else setIndex(index + 1);
  }

  async function save() {
    const rows = scenarios.map((candidate) => ({
      scenarioKey: candidate.key,
      scenarioHours: answers[candidate.key],
      scopeVersion: 1,
    }));
    if (rows.some((row) => !Number.isFinite(row.scenarioHours) || row.scenarioHours <= 0)) {
      setError("Every shown scenario needs a time before review can be saved.");
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
      setEvidenceSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save labor calibration.");
    } finally {
      setBusy(false);
    }
  }

  function toggleOperation(operationKey: string) {
    setSelectedOperations((current) => {
      const next = new Set(current);
      if (next.has(operationKey)) next.delete(operationKey); else next.add(operationKey);
      return next;
    });
  }

  async function saveOperations() {
    const chosen = operationProposals.proposals.filter((proposal) => selectedOperations.has(proposal.operationKey));
    if (chosen.length === 0) {
      setError("Select at least one operation to approve, or leave this review for later.");
      return;
    }
    const decisions = chosen.map((proposal) => {
      const entered = editedOperationHours[proposal.operationKey];
      const hoursPerUnit = entered === undefined || entered === "" ? proposal.hoursPerUnit : Number(entered);
      return {
        operationKey: proposal.operationKey,
        hoursPerUnit,
        source: proposal.source,
        basis: proposal.basis,
      };
    });
    if (decisions.some((decision) => !Number.isFinite(decision.hoursPerUnit) || decision.hoursPerUnit < 0)) {
      setError("Every selected operation needs a nonnegative number of hours.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/labor-calibration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "operation-decisions", decisions }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save operation approvals.");
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save operation approvals.");
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
          <p className="mt-2 text-xs text-slate">
            {answeredCount} of {scenarios.length} scenarios saved. The first eight are shared anchors
            {targetedScenarios.length > 0 ? `; ${targetedScenarios.length} additional ${targetedScenarios.length === 1 ? "question is" : "questions are"} selected from the services you offer.` : "."}
          </p>
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
      <h2 className="font-display text-lg font-bold text-navy">Labor calibration saved</h2>
      <p className="mt-2 text-sm text-slate">Your selected operation units and their evidence are saved. No service duration or customer price was published.</p>
    </section>
  );

  if (evidenceSaved) return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-electric">Operation review</p>
      <h2 className="mt-1 font-display text-lg font-bold text-navy">Approve only the labor units that look right</h2>
      <p className="mt-2 text-sm text-slate">Nothing is preselected. Direct rows come from a one-operation answer. Suggested rows use published atomic evidence adjusted by your consistent answer pattern. Edit or skip any row.</p>
      {operationProposals.proposals.length === 0 ? (
        <p className="mt-4 rounded-xl bg-warm p-3 text-sm text-slate">No new operation proposals are available. Mixed answers and multi-operation totals remain evidence rather than being forced into units.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {operationProposals.proposals.map((proposal) => (
            <label key={proposal.operationKey} className="flex items-start gap-3 rounded-xl border border-cardline p-3">
              <input type="checkbox" checked={selectedOperations.has(proposal.operationKey)} onChange={() => toggleOperation(proposal.operationKey)} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-navy">{proposal.operationName}</span>
                <span className="mt-1 block text-xs text-slate">{proposal.source === "DIRECT" ? "Direct bounded answer" : "Relationship proposal—approval required"} · {proposal.basis.note}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <input aria-label={`Hours per ${proposal.unit} for ${proposal.operationName}`} inputMode="decimal" value={editedOperationHours[proposal.operationKey] ?? proposal.hoursPerUnit.toFixed(3)} onChange={(event) => setEditedOperationHours((current) => ({ ...current, [proposal.operationKey]: event.target.value }))} className="w-24 rounded-lg border border-cardline px-2 py-1.5 text-right text-sm text-navy" />
                <span className="w-12 text-xs text-slate">hr/{proposal.unit}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-slate">{operationProposals.unresolvedScenarioKeys.length} multi-operation answers remain intact for later decomposition; {operationProposals.operationsStillUncalibrated.length} operations still need direct input or defensible evidence.</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={saveOperations} disabled={busy || operationProposals.proposals.length === 0} className="mt-4 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save selected operations"}</button>
    </section>
  );

  if (reviewing) return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-electric">Review your answers</p>
      <h2 className="mt-1 font-display text-lg font-bold text-navy">Your bounded labor examples</h2>
      <div className="mt-4 divide-y divide-cardline rounded-xl border border-cardline">
        {scenarios.map((candidate, candidateIndex) => (
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
      <div className="flex items-center justify-between text-xs font-semibold text-slate"><span>Question {index + 1} of {scenarios.length}</span><span>{Math.round(((index + 1) / scenarios.length) * 100)}%</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-electric" style={{ width: `${((index + 1) / scenarios.length) * 100}%` }} /></div>
      {index >= ELECTRICAL_CORE_CALIBRATION_SCENARIOS.length && <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-electric">Based on a specialty service you offer</p>}
      <h2 className="mt-5 font-display text-xl font-bold text-navy">{scenario.prompt}</h2>
      <p className="mt-2 text-sm text-slate">Included scope: {scenario.scope}</p>
      {bookStartingPoint && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-electric">Published-book starting point</p>
        <p className="mt-1 text-2xl font-bold text-navy">{bookStartingPoint.suggestedMinutes} minutes</p>
        <p className="mt-1 text-xs text-slate">
          Suggested midpoint of the published {bookStartingPoint.rangeMinutes.low === bookStartingPoint.rangeMinutes.high
            ? `${bookStartingPoint.rangeMinutes.low}-minute time`
            : `${bookStartingPoint.rangeMinutes.low}–${bookStartingPoint.rangeMinutes.high} minute range`}.
        </p>
        <p className="mt-2 text-xs font-medium text-navy">
          This is a suggested published time, but your actual in-field time may be different based on your crew, tools, methods, and job conditions. Enter the time that is typical for you below.
        </p>
        <p className="mt-2 text-xs text-slate">{bookStartingPoint.caution}</p>
      </div>}
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
