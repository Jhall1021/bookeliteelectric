"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { PreviewOutcome, PreviewQuestion } from "@/lib/adminQuestionPreview";

/**
 * Tests how the SAVED tree routes and prices, answer by answer — walked
 * through the real, server-authoritative evaluator (POST /api/admin/
 * services/[id]/preview, built on lib/routeResolver.ts's resolveRoute, the
 * same function real checkout uses). Read-only: nothing clicked here
 * creates a booking or changes saved data.
 *
 * DELIBERATELY NOT CALLED "customer preview". It proves routing and
 * pricing are correct — which service a reroute opens, what an answer
 * resolves to — not what a homeowner's screen actually looks like. Calling
 * "Opens Replace Standard Outlet" a preview of "exactly what a customer
 * would see" overclaims; this pane is a routing/outcome tester, labeled as
 * one, always against the SAVED tree (never an unsaved draft below).
 */
export default function CustomerPreviewPane({ serviceId, dirty }: { serviceId: string; dirty: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ prompt: string; chosenLabel: string }[]>([]);
  const [outcome, setOutcome] = useState<PreviewOutcome | null>(null);
  const [loading, setLoading] = useState(true);
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

  function restart() {
    setAnswers({});
    setHistory([]);
    void step({});
  }

  // Useful the instant this pane appears — the first saved question, not an
  // empty card asking to be clicked first.
  useEffect(() => {
    void step({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  function choose(question: PreviewQuestion, value: string, label: string) {
    const nextAnswers = { ...answers, [question.key]: value };
    setAnswers(nextAnswers);
    setHistory((h) => [...h, { prompt: question.prompt, chosenLabel: label }]);
    void step(nextAnswers);
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Test question flow</h3>
        <Badge tone="neutral">Saved version</Badge>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-slate">Tests routing and pricing — not a preview of the homeowner's screen.</p>
        {history.length > 0 && (
          <button type="button" onClick={restart} className="shrink-0 text-xs font-medium text-electric hover:underline">
            Restart
          </button>
        )}
      </div>

      {dirty && (
        <p className="mt-2 rounded-card bg-amber-50 p-2 text-xs text-amber-800">
          Unsaved changes below aren&rsquo;t reflected here yet — this always tests the saved version. Save to test them.
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
            : `Opens "${outcome.targetServiceName}"`}
        </div>
      )}

      {outcome?.status === "INVALID" && (
        <p className="mt-3 rounded-card bg-red-50 p-2.5 text-sm text-red-700">{outcome.reason}</p>
      )}
    </div>
  );
}
