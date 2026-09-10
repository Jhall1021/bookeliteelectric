"use client";

import { useState } from "react";
import type { PreviewOutcome, PreviewQuestion } from "@/lib/adminQuestionPreview";

/**
 * What a customer would actually see — walked through the real,
 * server-authoritative evaluator (POST /api/admin/services/[id]/preview,
 * built on lib/routeResolver.ts's resolveRoute, the same function real
 * checkout uses). Read-only: nothing clicked here creates a booking or
 * changes saved data.
 *
 * Always previews the SAVED tree. `dirty` tells the admin, in plain terms,
 * that unsaved edits below aren't reflected yet — never lets a preview of
 * stale saved data pass as a preview of what they just typed.
 */
export default function CustomerPreviewPane({ serviceId, dirty }: { serviceId: string; dirty: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ prompt: string; chosenLabel: string }[]>([]);
  const [outcome, setOutcome] = useState<PreviewOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function step(nextAnswers: Record<string, string>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: nextAnswers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load the preview.");
      setOutcome(data as PreviewOutcome);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function start() {
    setAnswers({});
    setHistory([]);
    void step({});
  }

  function choose(question: PreviewQuestion, value: string, label: string) {
    const nextAnswers = { ...answers, [question.key]: value };
    setAnswers(nextAnswers);
    setHistory((h) => [...h, { prompt: question.prompt, chosenLabel: label }]);
    void step(nextAnswers);
  }

  if (!outcome && !loading && !error) {
    return (
      <div className="rounded-card border border-cardline bg-white p-5 text-center">
        <p className="text-sm text-slate">See exactly what a customer would see, answer by answer.</p>
        <button
          type="button"
          onClick={start}
          className="mt-3 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white hover:bg-electric-hover"
        >
          Start preview
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Customer preview</h3>
        <button type="button" onClick={start} className="text-xs font-medium text-electric hover:underline">
          Restart
        </button>
      </div>

      {dirty && (
        <p className="mt-2 rounded-card bg-amber-50 p-2 text-xs text-amber-800">
          You have unsaved changes — this preview reflects the last saved version. Save to preview them.
        </p>
      )}

      {history.length > 0 && (
        <ul className="mt-3 space-y-1 border-b border-cardline pb-3 text-xs text-slate">
          {history.map((h, i) => (
            <li key={i}>
              <span className="text-navy">{h.prompt}</span> → {h.chosenLabel}
            </li>
          ))}
        </ul>
      )}

      {loading && <p className="mt-3 text-sm text-slate">Loading…</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {outcome?.status === "ASK" && (
        <div className="mt-3">
          <p className="text-sm font-medium text-navy">{outcome.question.prompt}</p>
          {outcome.question.helpText && <p className="mt-0.5 text-xs text-slate">{outcome.question.helpText}</p>}
          <div className="mt-2 space-y-1.5">
            {outcome.question.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => choose(outcome.question, opt.value, opt.label)}
                className="block w-full rounded-card border border-cardline px-3 py-2 text-left text-sm text-navy hover:border-electric"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {outcome?.status === "PRICED" && (
        <div className="mt-3">
          <div className="font-display text-2xl font-bold text-success">
            ${(outcome.priceCents / 100).toFixed(2)}
          </div>
          {outcome.disclaimers.map((d, i) => (
            <p key={i} className="mt-1 text-xs text-slate">{d}</p>
          ))}
          {outcome.photoLabels.length > 0 && (
            <p className="mt-1 text-xs text-slate">Photos requested: {outcome.photoLabels.join(", ")}</p>
          )}
        </div>
      )}

      {outcome?.status === "REVIEW" && (
        <div className="mt-3">
          <p className="text-sm font-medium text-navy">Sent to review</p>
          <p className="mt-1 text-xs text-slate">{outcome.reason}</p>
          {outcome.floorPriceCents !== null && (
            <p className="mt-1 text-xs text-slate">Starting from ${(outcome.floorPriceCents / 100).toFixed(2)}</p>
          )}
        </div>
      )}

      {outcome?.status === "REROUTE" && (
        <div className={`mt-3 rounded-card p-2.5 text-sm ${outcome.unresolved ? "bg-red-50 text-red-700" : "bg-electric/5 text-navy"}`}>
          {outcome.unresolved
            ? `Dead end: ${outcome.targetServiceName}`
            : `Opens ${outcome.targetServiceName}`}
        </div>
      )}

      {outcome?.status === "INVALID" && (
        <p className="mt-3 rounded-card bg-red-50 p-2.5 text-sm text-red-700">{outcome.reason}</p>
      )}
    </div>
  );
}
