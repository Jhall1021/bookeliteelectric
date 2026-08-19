"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AnswerOptionData = {
  id: string;
  label: string;
  routeAction: string;
  priceModifierCents: number;
  referencedServiceId: string | null;
  referencedServiceName: string | null;
  disclaimer: string | null;
  requiredPhotoLabels: string[];
};

type QuestionData = {
  id: string;
  prompt: string;
  helpText: string | null;
  options: AnswerOptionData[];
};

type ServiceOption = { id: string; name: string };

const ROUTE_ACTION_LABELS: Record<string, string> = {
  CONTINUE: "Continue to next question",
  RESOLVE_INSTANT: "Resolves to a price",
  RESOLVE_ADJUSTED: "Resolves to a price (adjusted)",
  REMOTE_QUOTE: "Sends to remote quote",
  REROUTE_SERVICE: "Reroutes to a different service",
  REROUTE_TROUBLESHOOTING: "Reroutes to Troubleshooting",
  PHOTO_REVIEW: "Requires photo review",
};

export default function TreeEditor({
  serviceId,
  questions: initialQuestions,
  allServices,
}: {
  serviceId: string;
  questions: QuestionData[];
  allServices: ServiceOption[];
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initialQuestions);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(qId: string, field: "prompt" | "helpText", value: string) {
    setQuestions((qs) => qs.map((q) => (q.id === qId ? { ...q, [field]: value } : q)));
  }

  function updateOption(qId: string, oId: string, patch: Partial<AnswerOptionData>) {
    setQuestions((qs) =>
      qs.map((q) =>
        q.id !== qId
          ? q
          : { ...q, options: q.options.map((o) => (o.id === oId ? { ...o, ...patch } : o)) }
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch(`/api/admin/services/${serviceId}/tree`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions: questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          helpText: q.helpText,
          options: q.options.map((o) => ({
            id: o.id,
            label: o.label,
            priceModifierCents: o.referencedServiceId ? 0 : o.priceModifierCents,
            referencedServiceId: o.referencedServiceId,
            disclaimer: o.disclaimer,
            requiredPhotoLabels: o.requiredPhotoLabels,
          })),
        })),
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } else {
      // Show what the server actually said. The generic message here used to
      // hide a 404 (the save route was missing entirely), which made a
      // routing problem look like a database problem.
      let detail = `${res.status} ${res.statusText}`;
      try {
        const data = await res.json();
        if (data?.error) detail = data.error;
      } catch {
        // Non-JSON response — usually a 404 HTML page. Keep the status line.
      }
      setError(`Couldn't save: ${detail}`);
    }
  }

  return (
    <div className="mt-8 max-w-2xl">
      <h2 className="font-display text-lg font-bold text-navy">Decision Tree</h2>
      <p className="mt-1 text-sm text-slate">
        Edit the questions and answer options below. Adding or removing questions, or changing
        how answers route through the tree, isn't supported here yet — that still needs a code
        change.
      </p>

      <div className="mt-4 space-y-6">
        {questions.map((q, qIdx) => (
          <div key={q.id} className="rounded-card border border-cardline bg-white p-5 shadow-card">
            <div className="text-xs font-semibold text-electric">Question {qIdx + 1}</div>
            <input
              value={q.prompt}
              onChange={(e) => updateQuestion(q.id, "prompt", e.target.value)}
              className="mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm font-medium text-navy focus:border-electric"
            />
            <input
              value={q.helpText ?? ""}
              onChange={(e) => updateQuestion(q.id, "helpText", e.target.value)}
              placeholder="Optional helper text shown under the question"
              className="mt-2 w-full rounded-card border border-cardline px-3 py-2 text-xs text-slate focus:border-electric"
            />

            <div className="mt-4 space-y-4">
              {q.options.map((o) => (
                <div key={o.id} className="rounded-card bg-warmwhite p-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      value={o.label}
                      onChange={(e) => updateOption(q.id, o.id, { label: e.target.value })}
                      className="flex-1 rounded-card border border-cardline px-3 py-1.5 text-sm focus:border-electric"
                    />
                    <span className="shrink-0 rounded-pill bg-cardline px-2 py-1 text-[10px] font-medium text-slate">
                      {ROUTE_ACTION_LABELS[o.routeAction] ?? o.routeAction}
                    </span>
                  </div>

                  {(o.routeAction === "RESOLVE_INSTANT" || o.routeAction === "RESOLVE_ADJUSTED" || o.routeAction === "CONTINUE") && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate">Price adjustment:</span>
                      {o.referencedServiceId ? (
                        <span className="rounded-pill bg-electric/10 px-2 py-1 text-electric">
                          Linked to "{o.referencedServiceName}" — always uses that service's current price
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={(o.priceModifierCents / 100).toFixed(2)}
                          onChange={(e) =>
                            updateOption(q.id, o.id, {
                              priceModifierCents: Math.round((parseFloat(e.target.value) || 0) * 100),
                            })
                          }
                          className="w-24 rounded-card border border-cardline px-2 py-1 text-xs focus:border-electric"
                        />
                      )}
                      <select
                        value={o.referencedServiceId ?? ""}
                        onChange={(e) =>
                          updateOption(q.id, o.id, {
                            referencedServiceId: e.target.value || null,
                            referencedServiceName: allServices.find((s) => s.id === e.target.value)?.name ?? null,
                          })
                        }
                        className="rounded-card border border-cardline px-2 py-1 text-xs focus:border-electric"
                      >
                        <option value="">— flat dollar amount —</option>
                        {allServices.map((s) => (
                          <option key={s.id} value={s.id}>
                            Link to: {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="mt-2">
                    <input
                      value={o.disclaimer ?? ""}
                      onChange={(e) => updateOption(q.id, o.id, { disclaimer: e.target.value || null })}
                      placeholder="Disclaimer shown with this price (optional)"
                      className="w-full rounded-card border border-cardline px-3 py-1.5 text-xs focus:border-electric"
                    />
                  </div>

                  {(o.routeAction === "PHOTO_REVIEW" || o.routeAction === "REMOTE_QUOTE") && (
                    <div className="mt-2">
                      <label className="text-xs text-slate">Required photos (one per line)</label>
                      <textarea
                        value={o.requiredPhotoLabels.join("\n")}
                        onChange={(e) =>
                          updateOption(q.id, o.id, {
                            requiredPhotoLabels: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        rows={2}
                        className="mt-1 w-full rounded-card border border-cardline px-3 py-1.5 text-xs focus:border-electric"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-6 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
      >
        {saving ? "Saving..." : saved ? "✓ Tree Saved" : "Save Tree Changes"}
      </button>
    </div>
  );
}
