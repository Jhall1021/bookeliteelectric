"use client";

import { useState } from "react";
import { describeProposal, type TaskProposal } from "@/lib/laborWizard";

/**
 * The conversational labor calibration wizard — a few scoped answers that
 * generate reviewable elapsed-task-time proposals, shown with their
 * derivation before anything is saved.
 *
 * ONE QUESTION AT A TIME, DELIBERATELY. This is not a form; each step reads
 * what the previous answer implied. See lib/laborWizard.ts for what gets
 * written (fieldLaborHours only) and what never does (crew size, visit
 * overhead, WWT hours, any pricing rate).
 */
export type WizardTaskInfo = {
  key: string;
  label: string;
  displayName: string;
  includes: string;
  excludes: string;
  relativeTo?: string;
  services: { slug: string; name: string }[];
};

type Step =
  | { name: "anchor-time" }
  | { name: "anchor-crew" }
  | { name: "crew-match"; taskKey: string }
  | { name: "same-time"; taskKey: string }
  | { name: "entered-time"; taskKey: string }
  | { name: "delta-time"; taskKey: string }
  | { name: "review" }
  | { name: "done" };

const money = (n: number) => `${n} min`;

export default function LaborWizardPanel({ tasks }: { tasks: WizardTaskInfo[] }) {
  const anchor = tasks.find((t) => !t.relativeTo);
  const derived = tasks.filter((t) => t.relativeTo);

  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<Step>({ name: "anchor-time" });
  const [draft, setDraft] = useState("");
  const [crewDescription, setCrewDescription] = useState("");
  const [proposals, setProposals] = useState<Record<string, TaskProposal>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<string[]>(derived.map((t) => t.key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!anchor) return null;

  const anchorMinutes = () => {
    const p = proposals[anchor.key];
    return p && p.kind !== "crew_mismatch" ? p.minutes : 0;
  };

  function advanceToNextDerived(remaining: string[]) {
    if (remaining.length === 0) {
      setStep({ name: "review" });
      return;
    }
    setQueue(remaining.slice(1));
    setStep({ name: "crew-match", taskKey: remaining[0] });
  }

  function submitAnchorTime() {
    const minutes = Number(draft);
    if (!draft || !Number.isFinite(minutes) || minutes <= 0) {
      setError("Enter a time greater than zero.");
      return;
    }
    setError(null);
    setProposals((p) => ({ ...p, [anchor!.key]: { taskKey: anchor!.key, kind: "entered", minutes } }));
    setDraft("");
    setStep({ name: "anchor-crew" });
  }

  function submitAnchorCrew() {
    if (queue.length === 0) {
      setStep({ name: "review" });
      return;
    }
    setStep({ name: "crew-match", taskKey: queue[0] });
  }

  function answerCrewMatch(taskKey: string, sameCrew: boolean) {
    if (!sameCrew) {
      setProposals((p) => ({ ...p, [taskKey]: { taskKey, kind: "crew_mismatch" } }));
      advanceToNextDerived(queue.slice(1));
      return;
    }
    setStep(usesDeltaFraming(taskKey) ? { name: "delta-time", taskKey } : { name: "same-time", taskKey });
  }

  function answerSameTime(taskKey: string, sameTime: boolean) {
    if (sameTime) {
      setProposals((p) => ({
        ...p,
        [taskKey]: { taskKey, kind: "same_time", minutes: anchorMinutes(), anchorLabel: anchor!.label },
      }));
      advanceToNextDerived(queue.slice(1));
      return;
    }
    setStep({ name: "entered-time", taskKey });
  }

  function submitEnteredTime(taskKey: string) {
    const minutes = Number(draft);
    if (!draft || !Number.isFinite(minutes) || minutes <= 0) {
      setError("Enter a time greater than zero.");
      return;
    }
    setError(null);
    setProposals((p) => ({ ...p, [taskKey]: { taskKey, kind: "entered", minutes } }));
    setDraft("");
    advanceToNextDerived(queue.slice(1));
  }

  function submitDelta(taskKey: string) {
    const delta = Number(draft);
    if (draft === "" || !Number.isFinite(delta) || delta < 0) {
      setError("Enter zero or more.");
      return;
    }
    setError(null);
    const anchorMin = anchorMinutes();
    setProposals((p) => ({
      ...p,
      [taskKey]: {
        taskKey,
        kind: "delta",
        minutes: anchorMin + delta,
        anchorMinutes: anchorMin,
        deltaMinutes: delta,
        anchorLabel: anchor!.label,
      },
    }));
    setDraft("");
    advanceToNextDerived(queue.slice(1));
  }

  // "extra time" is asked for any derived task that isn't a plain
  // same-time/different-time choice — here, GFCI. A future trade's task set
  // decides this per task rather than the engine guessing from the label.
  const usesDeltaFraming = (taskKey: string) => taskKey === "gfci_replacement";

  async function acceptProposals() {
    const rows = tasks
      .map((t) => proposals[t.key])
      .filter((p): p is Exclude<TaskProposal, { kind: "crew_mismatch" }> => !!p && p.kind !== "crew_mismatch")
      .map((p) => {
        const overridden = edited[p.taskKey];
        const minutes = overridden !== undefined && overridden !== "" ? Number(overridden) : p.minutes;
        return { taskKey: p.taskKey, minutes };
      });
    if (rows.some((r) => !Number.isFinite(r.minutes) || r.minutes <= 0)) {
      setError("Every proposal needs a time greater than zero before accepting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/labor-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptances: rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save these proposals.");
      const totalServices = (data.results as { servicesUpdated: number }[]).reduce(
        (sum, r) => sum + r.servicesUpdated, 0
      );
      setNote(`Saved. ${totalServices} service${totalServices === 1 ? "" : "s"} updated.`);
      setStep({ name: "done" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const taskByKey = (key: string) => tasks.find((t) => t.key === key)!;

  if (!started) {
    return (
      <div className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Calibrate your labor times</h2>
        <p className="mt-1 text-sm text-slate">
          A few quick questions about how long common tasks take with your usual crew — nothing here
          is seeded from another contractor&apos;s numbers. Your answers generate proposed times you
          can edit and review before anything is saved.
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="mt-4 rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white"
        >
          Start
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <h2 className="font-display text-lg font-bold text-navy">Calibrate your labor times</h2>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {note && step.name === "done" && <p className="mt-3 text-sm text-success">{note}</p>}

      {step.name === "anchor-time" && (
        <div className="mt-4">
          <p className="text-sm text-slate">
            With your usual crew, how long does <strong>{anchor.label}</strong> take, start to finish?
          </p>
          <p className="mt-2 text-xs text-slate">
            <span className="font-semibold">Includes:</span> {anchor.includes}
          </p>
          <p className="mt-1 text-xs text-slate">
            <span className="font-semibold">Excludes:</span> {anchor.excludes}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number" min="1" step="1" placeholder="20"
              value={draft} onChange={(e) => setDraft(e.target.value)}
              aria-label={`Minutes for ${anchor.label}`}
              className="w-24 rounded border border-cardline px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate">minutes</span>
            <button type="button" onClick={submitAnchorTime}
                    className="rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white">
              Next
            </button>
          </div>
        </div>
      )}

      {step.name === "anchor-crew" && (
        <div className="mt-4">
          <p className="text-sm text-slate">What&apos;s your usual crew for this kind of work?</p>
          <p className="mt-1 text-xs text-slate">
            For context only — this never changes what you charge. Your existing crew-hour rate
            already covers your usual crew.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text" placeholder="e.g. just me, or me plus a helper"
              value={crewDescription} onChange={(e) => setCrewDescription(e.target.value)}
              aria-label="Your usual crew"
              className="w-72 rounded border border-cardline px-2 py-1 text-sm"
            />
            <button type="button" onClick={submitAnchorCrew}
                    className="rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white">
              Next
            </button>
          </div>
        </div>
      )}

      {step.name === "crew-match" && (
        <div className="mt-4">
          <p className="text-sm text-slate">
            Does that same crew{crewDescription ? ` (${crewDescription})` : ""} usually handle{" "}
            <strong>{taskByKey(step.taskKey).label}</strong> too, or would this task need a different crew?
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => answerCrewMatch(step.taskKey, true)}
                    className="rounded-pill border border-cardline px-3 py-1 text-sm font-semibold text-navy">
              Same crew
            </button>
            <button type="button" onClick={() => answerCrewMatch(step.taskKey, false)}
                    className="rounded-pill border border-cardline px-3 py-1 text-sm font-semibold text-navy">
              Different crew
            </button>
          </div>
        </div>
      )}

      {step.name === "same-time" && (
        <div className="mt-4">
          <p className="text-sm text-slate">
            Do standard <strong>{taskByKey(step.taskKey).label}</strong> jobs usually take about the same
            time as {anchor.label} ({money(anchorMinutes())})?
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => answerSameTime(step.taskKey, true)}
                    className="rounded-pill border border-cardline px-3 py-1 text-sm font-semibold text-navy">
              About the same
            </button>
            <button type="button" onClick={() => answerSameTime(step.taskKey, false)}
                    className="rounded-pill border border-cardline px-3 py-1 text-sm font-semibold text-navy">
              Different — let me enter it
            </button>
          </div>
        </div>
      )}

      {step.name === "entered-time" && (
        <div className="mt-4">
          <p className="text-sm text-slate">
            How long does <strong>{taskByKey(step.taskKey).label}</strong> usually take, start to finish?
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number" min="1" step="1" placeholder="20"
              value={draft} onChange={(e) => setDraft(e.target.value)}
              aria-label={`Minutes for ${taskByKey(step.taskKey).label}`}
              className="w-24 rounded border border-cardline px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate">minutes</span>
            <button type="button" onClick={() => submitEnteredTime(step.taskKey)}
                    className="rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white">
              Next
            </button>
          </div>
        </div>
      )}

      {step.name === "delta-time" && (
        <div className="mt-4">
          <p className="text-sm text-slate">
            How much extra time, if any, does <strong>{taskByKey(step.taskKey).label}</strong> take
            compared to {anchor.label} ({money(anchorMinutes())})?
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-slate">+</span>
            <input
              type="number" min="0" step="1" placeholder="10"
              value={draft} onChange={(e) => setDraft(e.target.value)}
              aria-label={`Extra minutes for ${taskByKey(step.taskKey).label}`}
              className="w-24 rounded border border-cardline px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate">minutes</span>
            <button type="button" onClick={() => submitDelta(step.taskKey)}
                    className="rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white">
              Next
            </button>
          </div>
        </div>
      )}

      {step.name === "review" && (
        <div className="mt-4">
          <p className="text-sm text-slate">
            Review each proposal below and adjust anything before accepting. Nothing is saved yet.
          </p>
          <div className="mt-4 space-y-3">
            {tasks.map((t) => {
              const p = proposals[t.key];
              if (!p) return null;
              return (
                <div key={t.key} className="rounded-card border border-cardline p-4">
                  <div className="font-medium text-navy">{t.displayName}</div>
                  <p className="mt-1 text-xs text-slate">
                    Needed by {t.services.length} service{t.services.length === 1 ? "" : "s"}
                    {t.services.length > 0 ? `: ${t.services.map((s) => s.slug).join(", ")}` : " — none yet"}
                  </p>
                  {p.kind === "crew_mismatch" ? (
                    <p className="mt-2 text-sm text-amber-700">{describeProposal(p)}</p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number" min="1" step="1"
                        defaultValue={p.minutes}
                        onChange={(e) => setEdited((d) => ({ ...d, [t.key]: e.target.value }))}
                        aria-label={`Proposed minutes for ${t.displayName}`}
                        className="w-24 rounded border border-cardline px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-slate">min — {describeProposal(p)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button" disabled={busy} onClick={acceptProposals}
            className="mt-4 rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Accept and save
          </button>
        </div>
      )}

      {step.name === "done" && <p className="mt-4 text-sm text-success">{note}</p>}
    </div>
  );
}
