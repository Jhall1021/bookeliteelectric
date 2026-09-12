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
 * written (fieldLaborHours only, through the shared pricing-input authority)
 * and what never does (crew size, visit overhead, WWT hours, any pricing
 * rate).
 *
 * ELIGIBILITY ARRIVES ALREADY DECIDED. `eligible`/`customized` below are
 * resolved server-side, from the canonical mapping itself (templateKey plus
 * an unchanged recipe) — this component never sees the rest of the
 * contractor's catalog, and a checkbox exists ONLY for a service already in
 * `eligible`. There is nothing here for a contractor to make eligible; the
 * only choice offered is whether an already-eligible service should be
 * included in THIS proposal.
 */
export type EligibleServiceInfo = { id: string; slug: string; name: string; fieldLaborHours: number | null };
export type CustomizedServiceInfo = { id: string; slug: string; name: string };

export type WizardTaskInfo = {
  key: string;
  label: string;
  displayName: string;
  includes: string;
  excludes: string;
  relativeTo?: string;
  eligible: EligibleServiceInfo[];
  customized: CustomizedServiceInfo[];
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
const currentLabel = (h: number | null) => (h === null ? "not yet established" : `currently ${Math.round(h * 60)} min`);

export default function LaborWizardPanel({ tasks, hasCrewRate }: { tasks: WizardTaskInfo[]; hasCrewRate: boolean }) {
  const anchor = tasks.find((t) => !t.relativeTo);
  const derived = tasks.filter((t) => t.relativeTo);

  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<Step>({ name: "anchor-time" });
  const [draft, setDraft] = useState("");
  const [crewDescription, setCrewDescription] = useState("");
  const [proposals, setProposals] = useState<Record<string, TaskProposal>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<string[]>(derived.map((t) => t.key));
  // Populated once, when review is first reached — see enterReview().
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState(false);
  const [saveUncertain, setSaveUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!anchor) return null;

  const anchorMinutes = () => {
    const p = proposals[anchor.key];
    return p && p.kind !== "crew_mismatch" ? p.minutes : 0;
  };

  /**
   * Every ELIGIBLE service starts checked — eligibility is already the
   * server-verified canonical mapping, not a guess this screen is asking
   * the contractor to make. Unchecking one just means "not this specific
   * service, even though it qualifies" — a real choice, but never the
   * choice of whether an unrelated service applies, because nothing
   * outside `eligible` is ever offered as an option here.
   */
  function enterReview(finalProposals: Record<string, TaskProposal>) {
    const initial: Record<string, Set<string>> = {};
    for (const t of tasks) {
      const p = finalProposals[t.key];
      if (!p || p.kind === "crew_mismatch") continue;
      initial[t.key] = new Set(t.eligible.map((s) => s.id));
    }
    setSelected(initial);
    setStep({ name: "review" });
  }

  function advanceToNextDerived(remaining: string[], finalProposals: Record<string, TaskProposal>) {
    if (remaining.length === 0) {
      enterReview(finalProposals);
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
      enterReview(proposals);
      return;
    }
    setStep({ name: "crew-match", taskKey: queue[0] });
  }

  function answerCrewMatch(taskKey: string, sameCrew: boolean) {
    if (!sameCrew) {
      const next = { ...proposals, [taskKey]: { taskKey, kind: "crew_mismatch" as const } };
      setProposals(next);
      advanceToNextDerived(queue.slice(1), next);
      return;
    }
    setStep(usesDeltaFraming(taskKey) ? { name: "delta-time", taskKey } : { name: "same-time", taskKey });
  }

  function answerSameTime(taskKey: string, sameTime: boolean) {
    if (sameTime) {
      const next = {
        ...proposals,
        [taskKey]: { taskKey, kind: "same_time" as const, minutes: anchorMinutes(), anchorLabel: anchor!.label },
      };
      setProposals(next);
      advanceToNextDerived(queue.slice(1), next);
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
    const next = { ...proposals, [taskKey]: { taskKey, kind: "entered" as const, minutes } };
    setProposals(next);
    setDraft("");
    advanceToNextDerived(queue.slice(1), next);
  }

  function submitDelta(taskKey: string) {
    const delta = Number(draft);
    if (draft === "" || !Number.isFinite(delta) || delta < 0) {
      setError("Enter zero or more.");
      return;
    }
    setError(null);
    const anchorMin = anchorMinutes();
    const next = {
      ...proposals,
      [taskKey]: {
        taskKey, kind: "delta" as const, minutes: anchorMin + delta,
        anchorMinutes: anchorMin, deltaMinutes: delta, anchorLabel: anchor!.label,
      },
    };
    setProposals(next);
    setDraft("");
    advanceToNextDerived(queue.slice(1), next);
  }

  // "extra time" is asked for any derived task that isn't a plain
  // same-time/different-time choice — here, GFCI. A future trade's task set
  // decides this per task rather than the engine guessing from the label.
  const usesDeltaFraming = (taskKey: string) => taskKey === "gfci_replacement";

  function toggleSelected(taskKey: string, serviceId: string) {
    setSelected((s) => {
      const n = new Set(s[taskKey] ?? []);
      n.has(serviceId) ? n.delete(serviceId) : n.add(serviceId);
      return { ...s, [taskKey]: n };
    });
  }

  async function acceptProposals() {
    if (busy || saveUncertain) return;

    const rows = tasks
      .map((t) => proposals[t.key])
      .filter((p): p is Exclude<TaskProposal, { kind: "crew_mismatch" }> => !!p && p.kind !== "crew_mismatch")
      .map((p) => {
        const overridden = edited[p.taskKey];
        const minutes = overridden !== undefined && overridden !== "" ? Number(overridden) : p.minutes;
        const serviceIds = [...(selected[p.taskKey] ?? [])];
        return { taskKey: p.taskKey, minutes, serviceIds };
      })
      .filter((r) => r.serviceIds.length > 0);
    if (rows.some((r) => !Number.isFinite(r.minutes) || r.minutes <= 0)) {
      setError("Every proposal needs a time greater than zero before accepting.");
      return;
    }
    if (rows.length === 0) {
      setError("Select at least one service for at least one proposal before accepting.");
      return;
    }
    setBusy(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/portal/labor-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptances: rows }),
      });
    } catch {
      // Once PATCH has left the browser, a lost response is ambiguous: the
      // serializable transaction may have committed. Disable blind retries
      // until fresh server state is loaded.
      setSaveUncertain(true);
      setError("Price2Book lost the response while saving. Reload the current values before trying again so these labor times are not submitted twice.");
      setBusy(false);
      return;
    }

    const data = await res.json().catch(() => null) as
      | { error?: string; results?: { servicesUpdated: number }[] }
      | null;

    if (!res.ok) {
      setError(data?.error ?? "Could not save these proposals. Nothing was changed.");
      setBusy(false);
      return;
    }

    if (!data || !Array.isArray(data.results)) {
      // A successful HTTP response without the expected receipt still means
      // the write may have committed. Make reconciliation explicit rather
      // than inventing a success count or allowing another submission.
      setSaveUncertain(true);
      setError("The labor update may have saved, but Price2Book could not confirm the result. Reload the current values before trying again.");
      setBusy(false);
      return;
    }

    const totalServices = data.results.reduce((sum, r) => sum + r.servicesUpdated, 0);
    setNote(`Saved. ${totalServices} service${totalServices === 1 ? "" : "s"} updated.`);
    setStep({ name: "done" });
    setBusy(false);
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
      {saveUncertain && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-pill border border-cardline px-3 py-1.5 text-sm font-semibold text-navy"
        >
          Reload current values
        </button>
      )}
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
            {hasCrewRate
              ? "For context only — this never changes what you charge. Your crew-hour rate already covers your usual crew."
              : "For context only — this never changes what you charge. You'll set your crew-hour rate separately; it's built to cover your usual crew, whatever you tell us here."}
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
            Does <strong>{taskByKey(step.taskKey).label}</strong> usually take about the same
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

      {step.name === "review" && (() => {
        // Nothing to save when every checkbox is unchecked — whether
        // because the contractor unchecked them all or, as with a task
        // whose services are ALL flagged customized, there was never a
        // checkbox to check. Computed the same way acceptProposals()
        // itself decides "nothing selected", so the button's disabled
        // state and the save it guards never disagree.
        const hasSelection = Object.values(selected).some((s) => s.size > 0);
        return (
        <div className="mt-4">
          <p className="text-sm text-slate">
            Review each proposal below. Nothing is saved until you accept.
          </p>
          <div className="mt-4 space-y-4">
            {tasks.map((t) => {
              const p = proposals[t.key];
              if (!p) return null;
              const chosen = selected[t.key] ?? new Set<string>();
              return (
                <div key={t.key} className="rounded-card border border-cardline p-4">
                  <div className="font-medium text-navy">{t.displayName}</div>
                  {p.kind === "crew_mismatch" ? (
                    <p className="mt-2 text-sm text-amber-700">{describeProposal(p)}</p>
                  ) : (
                    <>
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

                      {t.eligible.length > 0 && (
                        <>
                          <p className="mt-3 text-xs font-semibold text-navy">
                            Applies to {chosen.size} of {t.eligible.length} matching service{t.eligible.length === 1 ? "" : "s"}:
                          </p>
                          <div className="mt-2 rounded border border-cardline">
                            {t.eligible.map((s) => (
                              <label key={s.id} className="flex items-center gap-2 border-b border-cardline px-2 py-1 text-sm last:border-b-0">
                                <input
                                  type="checkbox"
                                  checked={chosen.has(s.id)}
                                  onChange={() => toggleSelected(t.key, s.id)}
                                  aria-label={`Apply ${t.displayName} to ${s.name}`}
                                />
                                <span className="text-navy" title={s.slug}>{s.name}</span>
                                <span className="text-xs text-slate">{currentLabel(s.fieldLaborHours)}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}

                      {t.customized.length > 0 && (
                        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2">
                          <p className="text-xs font-semibold text-amber-800">
                            Matched by name, but customized since — set these manually instead:
                          </p>
                          {t.customized.map((s) => (
                            <p key={s.id} className="mt-1 text-xs text-amber-800" title={s.slug}>
                              {s.name}
                            </p>
                          ))}
                        </div>
                      )}

                      {t.eligible.length === 0 && t.customized.length === 0 && (
                        <p className="mt-3 text-sm text-slate">
                          No matching service yet.{" "}
                          <a href="/dashboard/services" className="text-electric underline-offset-2 hover:underline">
                            Use the manual pricing editor
                          </a>{" "}
                          to set this one.
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button" disabled={busy || !hasSelection || saveUncertain} onClick={acceptProposals}
            className="mt-4 rounded-pill bg-electric px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Accept and save"}
          </button>
          {!hasSelection && (
            <p className="mt-2 text-xs text-slate">
              Select at least one service above before saving.
            </p>
          )}
        </div>
        );
      })()}

      {step.name === "done" && <p className="mt-4 text-sm text-success">{note}</p>}
    </div>
  );
}
