"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  analyzeContractorSpeed,
  ELECTRICAL_CORE_CALIBRATION_SCENARIOS,
  publishedBookStartingPoint,
} from "@/lib/electrical/laborCalibrationWizard";
import { buildElectricalOperationProposals } from "@/lib/electrical/laborOperationProposals";
import { buildElectricalLaborCalibrationProgress, buildElectricalLaborDirectEntryQueue } from "@/lib/electrical/laborDirectEntryQueue";
import { summarizeRoutingV2LaborBridge } from "@/lib/electrical/routingV2LaborAuthority";

type InitialAnswer = { scenarioKey: string; scenarioHours: number };

const minutes = (hours: number) => Math.round(hours * 60);
const routeBridge = summarizeRoutingV2LaborBridge();

export default function AtomicLaborWizardPanel({
  initialAnswers,
  initialDecisionKeys,
  initialPlatformBaselineKeys,
  offeredServiceSlugs,
  hasCrewRate,
}: {
  initialAnswers: InitialAnswer[];
  initialDecisionKeys: string[];
  initialPlatformBaselineKeys: string[];
  offeredServiceSlugs: string[];
  hasCrewRate: boolean;
}) {
  const router = useRouter();
  const initial = Object.fromEntries(initialAnswers.map((answer) => [answer.scenarioKey, answer.scenarioHours]));
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(initial);
  const [draftMinutes, setDraftMinutes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [returnToReviewAfterEdit, setReturnToReviewAfterEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evidenceSaved, setEvidenceSaved] = useState(false);
  const [savedDecisionKeys, setSavedDecisionKeys] = useState(() => new Set(initialDecisionKeys));
  const [contractorDecisionKeys, setContractorDecisionKeys] = useState(() => {
    const platform = new Set(initialPlatformBaselineKeys);
    return new Set(initialDecisionKeys.filter((key) => !platform.has(key)));
  });
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [selectedOperations, setSelectedOperations] = useState<Set<string>>(() => new Set());
  const [editedOperationMinutes, setEditedOperationMinutes] = useState<Record<string, string>>({});
  const [directEntryMinutes, setDirectEntryMinutes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const scenarios = ELECTRICAL_CORE_CALIBRATION_SCENARIOS;
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
    contractorDecisionKeys,
  ), [answers, contractorDecisionKeys]);
  const offeredOperationKeys = useMemo(() => new Set(buildElectricalLaborDirectEntryQueue(
    offeredServiceSlugs,
    [],
  ).map((entry) => entry.operationKey)), [offeredServiceSlugs]);
  const visibleProposals = useMemo(() => operationProposals.proposals.filter((proposal) =>
    offeredOperationKeys.has(proposal.operationKey)), [operationProposals.proposals, offeredOperationKeys]);
  const directEntryQueue = useMemo(() => buildElectricalLaborDirectEntryQueue(
    offeredServiceSlugs,
    [...savedDecisionKeys, ...visibleProposals.map((proposal) => proposal.operationKey)],
  ).slice(0, 12), [offeredServiceSlugs, savedDecisionKeys, visibleProposals]);
  const progress = useMemo(() => buildElectricalLaborCalibrationProgress(
    offeredServiceSlugs,
    savedDecisionKeys,
  ), [offeredServiceSlugs, savedDecisionKeys]);
  const allVisibleProposalsSelected = visibleProposals.length > 0
    && visibleProposals.every((proposal) => selectedOperations.has(proposal.operationKey));

  function begin() {
    const firstMissing = scenarios.findIndex((candidate) => answers[candidate.key] === undefined);
    if (firstMissing === -1) setEvidenceSaved(true);
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
    if (returnToReviewAfterEdit) {
      setReturnToReviewAfterEdit(false);
      setReviewing(true);
    } else if (index === scenarios.length - 1) setReviewing(true);
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
    setSaveNotice(null);
    try {
      const response = await fetch("/api/portal/labor-calibration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "scenario-answers", answers: rows }),
      });
      const body = await response.json().catch(() => null) as { error?: string; invalidatedOperationKeys?: string[] } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save labor calibration.");
      const invalidated = new Set(body?.invalidatedOperationKeys ?? []);
      if (invalidated.size > 0) {
        setSavedDecisionKeys((current) => new Set([...current].filter((key) => !invalidated.has(key))));
        setContractorDecisionKeys((current) => new Set([...current].filter((key) => !invalidated.has(key))));
        setSaveNotice(`${invalidated.size} proposal-based labor ${invalidated.size === 1 ? "unit was" : "units were"} reopened because its supporting answer changed.`);
      }
      setEvidenceSaved(true);
      router.refresh();
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
    const chosen = visibleProposals.filter((proposal) => selectedOperations.has(proposal.operationKey));
    const direct = directEntryQueue.flatMap((entry) => {
      const entered = directEntryMinutes[entry.operationKey];
      if (entered === undefined || entered.trim() === "") return [];
      return [{
        operationKey: entry.operationKey,
        hoursPerUnit: Number(entered) / 60,
        source: "DIRECT" as const,
        basis: {
          method: "DIRECT_ENTRY" as const,
          scenarioKeys: [],
          note: "Contractor entered this atomic labor unit directly during setup.",
        },
      }];
    });
    if (chosen.length === 0 && direct.length === 0) {
      setError("Select a proposal or enter at least one direct labor unit to save.");
      return;
    }
    const decisions = [...chosen.map((proposal) => {
      const entered = editedOperationMinutes[proposal.operationKey];
      const hoursPerUnit = entered === undefined || entered === ""
        ? proposal.hoursPerUnit
        : Number(entered) / 60;
      return {
        operationKey: proposal.operationKey,
        hoursPerUnit,
        source: proposal.source,
        basis: proposal.basis,
      };
    }), ...direct];
    if (decisions.some((decision) => !Number.isFinite(decision.hoursPerUnit) || decision.hoursPerUnit < 0)) {
      setError("Every selected operation needs a nonnegative number of hours.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaveNotice(null);
    try {
      const response = await fetch("/api/portal/labor-calibration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "operation-decisions", decisions }),
      });
      const body = await response.json().catch(() => null) as { error?: string; decisions?: { operationKey: string }[] } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save operation approvals.");
      const savedKeys = body?.decisions?.map((decision) => decision.operationKey) ?? decisions.map((decision) => decision.operationKey);
      setSavedDecisionKeys((current) => new Set([...current, ...savedKeys]));
      setContractorDecisionKeys((current) => new Set([...current, ...savedKeys]));
      setSelectedOperations(new Set());
      setEditedOperationMinutes({});
      setDirectEntryMinutes({});
      setSaveNotice(`${savedKeys.length} labor ${savedKeys.length === 1 ? "unit" : "units"} saved. Coverage and any remaining highest-impact work are updated below.`);
      router.refresh();
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
          <h2 className="mt-1 font-display text-lg font-bold text-navy">Four familiar jobs—not dozens of abstract labor questions</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate">
            The rest of the catalog starts from the checked estimator/workbook labor baseline. These four familiar jobs let you calibrate similar work to your company before you review any customer price.
          </p>
          <p className="mt-2 text-xs text-slate">
            {answeredCount} of {scenarios.length} job examples saved. No specialty-service questionnaire is added.
          </p>
        </div>
        <button type="button" onClick={begin} className="shrink-0 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white">
          {answeredCount ? "Continue" : "Start"}
        </button>
      </div>
      {!hasCrewRate && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">You can answer labor questions now, but service pricing will also need your crew-hour rate.</p>}
    </section>
  );

  if (evidenceSaved) return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-electric">Operation review</p>
      <h2 className="mt-1 font-display text-lg font-bold text-navy">Approve only the labor units that look right</h2>
      <p className="mt-2 text-sm text-slate">Nothing is preselected. Direct rows come from a one-operation answer. Suggested rows use published atomic evidence adjusted by your consistent answer pattern. Edit or skip any row.</p>
      <div className="mt-4 rounded-xl bg-warm p-3">
        <p className="text-sm font-semibold text-navy">{progress.establishedOperationCount} of {progress.requiredOperationCount} required labor units saved</p>
        <p className="mt-1 text-xs text-slate">{progress.operationCompleteServiceCount} of {progress.modeledServiceCount} modeled offered services have all of their atomic labor units. Route measurements, route-component reconciliation, and service approval are still separate.</p>
      </div>
      {saveNotice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{saveNotice}</p>}
      {visibleProposals.length === 0 ? (
        <p className="mt-4 rounded-xl bg-warm p-3 text-sm text-slate">No new operation proposals are available. Mixed answers and multi-operation totals remain evidence rather than being forced into units.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warm px-3 py-2">
            <p className="text-xs text-slate">{visibleProposals.length} editable suggestions are available from your answers and the published relationships shown below.</p>
            <button
              type="button"
              onClick={() => setSelectedOperations(allVisibleProposalsSelected
                ? new Set()
                : new Set(visibleProposals.map((proposal) => proposal.operationKey)))}
              className="text-xs font-semibold text-electric"
            >
              {allVisibleProposalsSelected ? "Clear suggested selections" : "Select all suggestions"}
            </button>
          </div>
          {visibleProposals.map((proposal) => (
            <label key={proposal.operationKey} className="flex items-start gap-3 rounded-xl border border-cardline p-3">
              <input type="checkbox" checked={selectedOperations.has(proposal.operationKey)} onChange={() => toggleOperation(proposal.operationKey)} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-navy">{proposal.operationName}</span>
                <span className="mt-1 block text-xs text-slate">{proposal.source === "DIRECT" ? "Direct bounded answer" : "Published relationship suggestion—approval required"} · {proposal.basis.note}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <input aria-label={`Minutes per ${proposal.unit} for ${proposal.operationName}`} inputMode="decimal" value={editedOperationMinutes[proposal.operationKey] ?? (proposal.hoursPerUnit * 60).toFixed(1).replace(/\.0$/, "")} onChange={(event) => setEditedOperationMinutes((current) => ({ ...current, [proposal.operationKey]: event.target.value }))} className="w-24 rounded-lg border border-cardline px-2 py-1.5 text-right text-sm text-navy" />
                <span className="w-14 text-xs text-slate">min/{proposal.unit}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {directEntryQueue.length > 0 && <div className="mt-6 border-t border-cardline pt-5">
        <h3 className="font-display text-base font-bold text-navy">Next labor units needed by your services</h3>
        <p className="mt-1 text-sm text-slate">Enter only the units you know. These are prioritized by how many services they help unlock; you can save a partial batch and return later.</p>
        <div className="mt-4 space-y-3">
          {directEntryQueue.map((entry) => (
            <label key={entry.operationKey} className="block rounded-xl border border-cardline p-3">
              <span className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-navy">{entry.operationName}</span>
                  <span className="mt-1 block text-xs text-slate">Includes: {entry.includes}</span>
                  <span className="mt-1 block text-xs text-slate">Excludes: {entry.excludes}</span>
                  <span className="mt-2 block text-xs font-medium text-electric">Used by {entry.affectedServiceSlugs.length} offered {entry.affectedServiceSlugs.length === 1 ? "service" : "services"}</span>
                  {entry.publishedStartingMinutes !== null && <span className="mt-1 block text-xs text-slate">Published-book starting point: {entry.publishedStartingMinutes.toFixed(1).replace(/\.0$/, "")} min/{entry.unit}. Your field time may differ.</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <input aria-label={`Minutes per ${entry.unit} for ${entry.operationName}`} inputMode="decimal" value={directEntryMinutes[entry.operationKey] ?? ""} onChange={(event) => setDirectEntryMinutes((current) => ({ ...current, [entry.operationKey]: event.target.value }))} className="w-24 rounded-lg border border-cardline px-2 py-1.5 text-right text-sm text-navy" placeholder="Minutes" />
                  <span className="w-14 text-xs text-slate">min/{entry.unit}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>}
      {visibleProposals.length === 0 && directEntryQueue.length === 0 && progress.remainingOperationCount === 0 && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="font-display text-base font-bold text-navy">Atomic labor coverage complete</h3>
        <p className="mt-1 text-sm text-slate">Every modeled service you currently offer has its required atomic labor units. This did not publish service times or customer prices. Bounded services can move to service-labor review; route-priced services still need their route components reconciled to these atomic operations.</p>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Route-pricing bridge: {routeBridge.runtimeConnectedCount} of {routeBridge.componentCount} Routing V2 component types currently consume these decisions. {routeBridge.exactButUnwiredCount} exact mappings and {routeBridge.compositeUnwiredCount} composite mappings remain unconnected. Those routes continue to fail closed rather than borrowing labor from a different scope.</p>
      </div>}
      {progress.notModeledServiceSlugs.length > 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{progress.notModeledServiceSlugs.length} offered {progress.notModeledServiceSlugs.length === 1 ? "service is" : "services are"} not yet represented in the atomic labor ledger and are not counted as complete.</p>}
      <p className="mt-4 text-xs text-slate">{operationProposals.unresolvedScenarioKeys.length} multi-operation answers remain intact rather than being divided. Only operations used by your offered services appear here.</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={saveOperations} disabled={busy || (visibleProposals.length === 0 && directEntryQueue.length === 0)} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save labor units"}</button>
        <button type="button" onClick={() => { setEvidenceSaved(false); setReviewing(true); }} className="rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy">Review scenario answers</button>
      </div>
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
            <button type="button" onClick={() => { setIndex(candidateIndex); setDraftMinutes(String(minutes(answers[candidate.key]))); setReturnToReviewAfterEdit(true); setReviewing(false); }} className="shrink-0 text-sm font-semibold text-electric">
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
      </div>
    </section>
  );

  return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <div className="flex items-center justify-between text-xs font-semibold text-slate"><span>Question {index + 1} of {scenarios.length}</span><span>{Math.round(((index + 1) / scenarios.length) * 100)}%</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-electric" style={{ width: `${((index + 1) / scenarios.length) * 100}%` }} /></div>
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
