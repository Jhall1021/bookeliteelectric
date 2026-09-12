"use client";

import { useMemo, useState } from "react";
import type { PolicyView } from "@/lib/policyResolution";

/**
 * One card per decision, not one per affected service.
 *
 * fixture_work_height alone is nine of BrightPath's services. Listed per
 * service it looks like nine problems; it is one question with three numbers
 * in the answer.
 */
export default function PolicyList({ policies }: { policies: PolicyView[] }) {
  if (policies.length === 0) {
    return (
      <div className="rounded-card border border-cardline bg-warmwhite/60 p-5 text-sm text-slate">
        <p className="font-semibold text-navy">No pricing policies to decide.</p>
        <p className="mt-1">Your current catalog does not need any contractor-specific thresholds or supply choices.</p>
      </div>
    );
  }

  const open = policies.filter((p) => !p.resolved);
  const resolved = policies.length - open.length;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 rounded-card border border-cardline bg-warmwhite/55 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-navy">
            {open.length === 0 ? "All policy decisions are answered." : `${open.length} ${open.length === 1 ? "decision still needs" : "decisions still need"} your answer.`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate">
            {resolved} of {policies.length} complete. Each answer is reused everywhere that same company rule applies.
          </p>
        </div>
        <span className={`w-fit rounded-pill px-3 py-1 text-xs font-semibold ${open.length === 0 ? "bg-success/10 text-success" : "bg-p2b-amber-tint text-p2b-amber-ink"}`}>
          {open.length === 0 ? "Complete" : `${open.length} open`}
        </span>
      </div>

      <div className="grid gap-4">
        {policies.map((p, index) => (
          <PolicyCard key={p.key} policy={p} index={index + 1} total={policies.length} />
        ))}
      </div>
    </>
  );
}

function PolicyCard({ policy, index, total }: { policy: PolicyView; index: number; total: number }) {
  const isChoice = policy.boundaryCount === 0;
  const initialValues = useMemo(
    () => Array.from({ length: policy.boundaryCount }, (_, i) => String(policy.boundaries[i] ?? "")),
    [policy.boundaryCount, policy.boundaries],
  );
  const initialChoice = policy.choice ?? "";
  const [values, setValues] = useState<string[]>(initialValues);
  const [choice, setChoice] = useState(initialChoice);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(policy.resolved);
  const [savedValues, setSavedValues] = useState<string[]>(initialValues);
  const [savedChoice, setSavedChoice] = useState(initialChoice);

  const dirty = isChoice
    ? choice !== savedChoice
    : values.some((value, i) => value !== savedValues[i]);

  async function save() {
    if (!dirty && resolved) return;
    setState("saving");
    setError(null);
    const res = await fetch("/api/admin/policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isChoice ? { key: policy.key, choice } : { key: policy.key, boundaries: values }
      ),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not save that.");
      setState("idle");
      return;
    }
    setResolved(true);
    setSavedChoice(choice);
    setSavedValues(values);
    setState("saved");
  }

  function markChanged() {
    setState("idle");
    setError(null);
  }

  return (
    <section
      className={`overflow-hidden rounded-card border bg-white shadow-sm transition ${
        resolved ? "border-cardline" : "border-p2b-amber-ink/30"
      }`}
    >
      <div className={`border-b px-5 py-4 sm:px-6 ${resolved ? "border-cardline bg-white" : "border-p2b-amber-ink/15 bg-p2b-amber-tint/60"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate">Decision {index} of {total}</span>
              <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${resolved ? "bg-success/10 text-success" : "bg-p2b-amber-tint text-p2b-amber-ink ring-1 ring-p2b-amber-ink/20"}`}>
                {resolved ? "Answered" : "Needs your answer"}
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-bold leading-snug text-navy">{policy.prompt}</h3>
          </div>

          {policy.dependentSlugs.length > 0 && (
            <div className="shrink-0 rounded-card border border-cardline bg-warmwhite/60 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate">Used by</p>
              <p className="mt-0.5 text-sm font-semibold text-navy">{policy.dependentSlugs.length} service{policy.dependentSlugs.length === 1 ? "" : "s"}</p>
            </div>
          )}
        </div>

        {policy.dependentSlugs.length > 0 && (
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate">
            This is one company rule reused across every affected service
            {policy.offeredDependentSlugs.length > 0 && (
              <> — including <strong className="font-semibold text-navy">{policy.offeredDependentSlugs[0]}</strong>, which you currently offer</>
            )}
            .
          </p>
        )}
      </div>

      <div className="p-5 sm:p-6">
        {isChoice ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">Your company rule</span>
            <input
              value={choice}
              onChange={(e) => { setChoice(e.target.value); markChanged(); }}
              placeholder="Enter your answer"
              className="mt-2 w-full rounded-card border border-cardline bg-white px-3.5 py-3 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
            />
          </label>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">Your thresholds</p>
            <p className="mt-1 text-xs leading-relaxed text-slate">Enter the breakpoints from lowest to highest. These become the pricing bands homeowners see.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {values.map((v, i) => (
                <label key={i} className="block rounded-card border border-cardline bg-warmwhite/35 p-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate">Breakpoint {i + 1}</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      value={v}
                      inputMode="numeric"
                      onChange={(e) => {
                        const next = [...values];
                        next[i] = e.target.value;
                        setValues(next);
                        markChanged();
                      }}
                      placeholder={`#${i + 1}`}
                      className="min-w-0 flex-1 rounded-card border border-cardline bg-white px-3 py-2.5 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
                    />
                    {policy.unit && <span className="shrink-0 text-sm font-medium text-slate">{policy.unit}</span>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-cardline pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {state === "saved" && !dirty && (
              <span className="font-medium text-success">Saved — this rule is now updated everywhere it applies.</span>
            )}
            {dirty && <span className="text-slate">Unsaved changes</span>}
            {error && <span className="text-p2b-error-ink">{error}</span>}
          </div>
          <button
            onClick={save}
            disabled={state === "saving" || (!dirty && resolved)}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            {state === "saving" ? "Saving…" : resolved ? "Update policy" : "Save policy"}
          </button>
        </div>
      </div>
    </section>
  );
}
