"use client";

import { useState } from "react";
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
    return <p className="text-sm text-slate">No pricing policies to decide.</p>;
  }
  const open = policies.filter((p) => !p.resolved);
  return (
    <>
      {open.length > 0 && (
        <p className="mb-4 text-sm font-medium text-navy">
          {open.length} still to decide.
        </p>
      )}
      <div className="grid gap-4">
        {policies.map((p) => (
          <PolicyCard key={p.key} policy={p} />
        ))}
      </div>
    </>
  );
}

function PolicyCard({ policy }: { policy: PolicyView }) {
  const isChoice = policy.boundaryCount === 0;
  const [values, setValues] = useState<string[]>(
    Array.from({ length: policy.boundaryCount }, (_, i) => String(policy.boundaries[i] ?? ""))
  );
  const [choice, setChoice] = useState(policy.choice ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(policy.resolved);

  async function save() {
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
    setState("saved");
  }

  return (
    <section
      className={`rounded-card border bg-white p-5 shadow-card ${
        resolved ? "border-success/40" : "border-p2b-amber-ink/30"
      }`}
    >
      <p className="font-medium leading-relaxed text-navy">{policy.prompt}</p>

      {policy.dependentSlugs.length > 0 && (
        <p className="mt-1 text-sm text-slate">
          {policy.dependentSlugs.length} service
          {policy.dependentSlugs.length === 1 ? "" : "s"} use
          {policy.dependentSlugs.length === 1 ? "s" : ""} this
          {policy.offeredDependentSlugs.length > 0 && (
            <> — including <strong>{policy.offeredDependentSlugs[0]}</strong>, which you offer</>
          )}
          .
        </p>
      )}

      <div className="mt-3">
        {isChoice ? (
          <input
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            placeholder="Your answer"
            className="w-full rounded-md border border-cardline px-3 py-2 text-sm"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {values.map((v, i) => (
              <input
                key={i}
                value={v}
                inputMode="numeric"
                onChange={(e) => {
                  const next = [...values];
                  next[i] = e.target.value;
                  setValues(next);
                }}
                placeholder={`#${i + 1}`}
                className="w-24 rounded-md border border-cardline px-3 py-2 text-sm"
              />
            ))}
            {policy.unit && <span className="text-sm text-slate">{policy.unit}</span>}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : resolved ? "Update" : "Save"}
        </button>
        {state === "saved" && (
          <span className="text-sm text-success">
            Saved — your wording is updated everywhere this is asked.
          </span>
        )}
        {error && <span className="text-sm text-p2b-error-ink">{error}</span>}
      </div>
    </section>
  );
}
