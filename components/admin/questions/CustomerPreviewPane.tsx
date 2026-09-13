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
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
      <div className="bg-navy px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Saved flow test</p>
            <h3 className="mt-0.5 text-sm font-semibold">Walk through the customer choices</h3>
          </div>
          <Badge tone="neutral">Saved</Badge>
        </div>
        <p className="mt-2 text-xs leading-5 text-white/65">
          Uses the live routing and pricing rules. It tests outcomes, not the homeowner page design.
        </p>
      </div>

      <div className="p-4">
        {dirty && (
          <div className="mb-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <strong className="font-semibold">You have unsaved edits.</strong> Save them before testing the updated flow.
          </div>
        )}

        {history.length > 0 && (
          <div className="mb-4 rounded-card bg-warmwhite p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate">Path so far</span>
              <button type="button" onClick={restart} className="text-xs font-semibold text-electric hover:underline">
                Start over
              </button>
            </div>
            <ol className="mt-2 space-y-2 text-xs text-slate">
              {history.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate ring-1 ring-cardline">
                    {i + 1}
                  </span>
                  <span className="min-w-0 leading-5">
                    <span className="block font-medium text-navy">{h.prompt}</span>
                    <span>{h.chosenLabel}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {loading && (
          <div className="rounded-card border border-dashed border-cardline p-4 text-center text-sm text-slate">
            Checking saved flow…
          </div>
        )}
        {error && <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {!loading && outcome?.status === "ASK" && (
          <div>
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-electric">Next question</p>
              <p className="mt-1 text-base font-semibold leading-6 text-navy">{outcome.question.prompt}</p>
              {outcome.question.helpText && (
                <p className="mt-1 text-xs leading-5 text-slate">{outcome.question.helpText}</p>
              )}
            </div>
            <div className="space-y-2">
              {outcome.question.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => choose(outcome.question, opt.value, opt.label)}
                  className="group flex w-full items-center justify-between gap-3 rounded-card border border-cardline bg-white px-3.5 py-3 text-left text-sm font-medium text-navy transition hover:border-electric hover:bg-electric/5"
                >
                  <span>{opt.label}</span>
                  <span aria-hidden="true" className="text-base text-slate transition group-hover:translate-x-0.5 group-hover:text-electric">›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && outcome?.status === "PRICED" && (
          <div className="rounded-card border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Priced outcome</p>
            <div className="mt-1 font-display text-3xl font-bold text-success">
              ${(outcome.priceCents / 100).toFixed(2)}
            </div>
            {outcome.disclaimers.map((d, i) => (
              <p key={i} className="mt-2 text-xs leading-5 text-slate">{d}</p>
            ))}
            {outcome.photoLabels.length > 0 && (
              <p className="mt-2 text-xs leading-5 text-slate">Photos requested: {outcome.photoLabels.join(", ")}</p>
            )}
            <button type="button" onClick={restart} className="mt-3 text-xs font-semibold text-electric hover:underline">
              Test another path
            </button>
          </div>
        )}

        {!loading && outcome?.status === "REVIEW" && (
          <div className="rounded-card border border-cardline bg-warmwhite p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate">Review outcome</p>
            <p className="mt-1 text-sm font-semibold text-navy">Sent to contractor review</p>
            <p className="mt-1 text-xs leading-5 text-slate">{outcome.reason}</p>
            {outcome.floorPriceCents !== null && (
              <p className="mt-2 text-xs font-medium text-navy">Starting from ${(outcome.floorPriceCents / 100).toFixed(2)}</p>
            )}
            <button type="button" onClick={restart} className="mt-3 text-xs font-semibold text-electric hover:underline">
              Test another path
            </button>
          </div>
        )}

        {!loading && outcome?.status === "REROUTE" && (
          <div className={`rounded-card border p-4 ${outcome.unresolved ? "border-red-200 bg-red-50 text-red-700" : "border-electric/20 bg-electric/5 text-navy"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
              {outcome.unresolved ? "Unresolved route" : "Reroute outcome"}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {outcome.unresolved
                ? `Dead end: ${outcome.targetServiceName}`
                : `Opens “${outcome.targetServiceName}”`}
            </p>
            <button type="button" onClick={restart} className="mt-3 text-xs font-semibold text-electric hover:underline">
              Test another path
            </button>
          </div>
        )}

        {!loading && outcome?.status === "INVALID" && (
          <div>
            <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">{outcome.reason}</p>
            <button type="button" onClick={restart} className="mt-3 text-xs font-semibold text-electric hover:underline">
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
