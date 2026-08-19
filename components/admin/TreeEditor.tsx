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
  rerouteServiceId: string | null;
  nextQuestionId: string | null;
  disclaimer: string | null;
  requiredPhotoLabels: string[];
  photosBlockBooking: boolean;
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

const PRICED_ACTIONS = ["RESOLVE_INSTANT", "RESOLVE_ADJUSTED", "CONTINUE"];

let tempCounter = 0;
const nextTempId = () => `new-${Date.now()}-${tempCounter++}`;

function blankOption(): AnswerOptionData {
  return {
    id: nextTempId(),
    label: "",
    routeAction: "RESOLVE_INSTANT",
    priceModifierCents: 0,
    referencedServiceId: null,
    referencedServiceName: null,
    rerouteServiceId: null,
    nextQuestionId: null,
    disclaimer: null,
    requiredPhotoLabels: [],
    photosBlockBooking: true,
  };
}

function blankQuestion(): QuestionData {
  return { id: nextTempId(), prompt: "", helpText: null, options: [blankOption()] };
}

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

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()]);
  }

  function addOption(qId: string) {
    setQuestions((qs) =>
      qs.map((q) => (q.id === qId ? { ...q, options: [...q.options, blankOption()] } : q))
    );
  }

  // Anything still pointing at this question would become a dangling
  // reference. The server refuses those too, but catching it here means the
  // admin finds out while looking at the tree rather than after a save.
  function inboundReferences(qId: string) {
    const refs: string[] = [];
    for (const q of questions) {
      for (const o of q.options) {
        if (o.routeAction === "CONTINUE" && o.nextQuestionId === qId) {
          refs.push(`"${o.label || "(unnamed answer)"}" under "${q.prompt || "(unnamed question)"}"`);
        }
      }
    }
    return refs;
  }

  function removeQuestion(qId: string) {
    const refs = inboundReferences(qId);
    if (refs.length > 0) {
      setError(
        `Can't remove this question — ${refs.join(", ")} still continues to it. Change where those answers go first.`
      );
      return;
    }
    setError(null);
    setQuestions((qs) => qs.filter((q) => q.id !== qId));
  }

  function removeOption(qId: string, oId: string) {
    const q = questions.find((qq) => qq.id === qId);
    if (q && q.options.length === 1) {
      setError("A question needs at least one answer. Delete the whole question instead.");
      return;
    }
    setError(null);
    setQuestions((qs) =>
      qs.map((qq) => (qq.id === qId ? { ...qq, options: qq.options.filter((o) => o.id !== oId) } : qq))
    );
  }

  // The first question is the tree's entry point, so ordering is functional
  // here, not cosmetic.
  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((qs) => {
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
            routeAction: o.routeAction,
            priceModifierCents: o.referencedServiceId ? 0 : o.priceModifierCents,
            referencedServiceId: o.referencedServiceId,
            rerouteServiceId: o.rerouteServiceId,
            nextQuestionId: o.nextQuestionId,
            disclaimer: o.disclaimer,
            requiredPhotoLabels: o.requiredPhotoLabels,
            photosBlockBooking: o.photosBlockBooking,
          })),
        })),
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      // New rows came back with real ids — refresh so the next save edits
      // them instead of trying to create duplicates.
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } else {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const data = await res.json();
        if (data?.error) detail = data.error;
      } catch {
        // Non-JSON response — usually a 404 HTML page. Keep the status line.
      }
      setError(detail);
    }
  }

  const isEmpty = questions.length === 0;

  return (
    <div className="mt-8 max-w-2xl">
      <h2 className="font-display text-lg font-bold text-navy">Decision Tree</h2>
      <p className="mt-1 text-sm text-slate">
        {isEmpty
          ? "This service has no questions — customers see its base price and book straight away. Add a question to start branching."
          : "Questions are asked in the order shown. The first one is where every customer starts."}
      </p>

      {isEmpty && (
        <div className="mt-4 rounded-card border border-dashed border-cardline bg-warmwhite p-8 text-center">
          <p className="text-sm text-slate">No decision tree yet.</p>
          <button
            onClick={addQuestion}
            className="mt-4 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
          >
            Create Decision Tree
          </button>
        </div>
      )}

      <div className="mt-4 space-y-6">
        {questions.map((q, qIdx) => (
          <div key={q.id} className="rounded-card border border-cardline bg-white p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-electric">
                Question {qIdx + 1}
                {qIdx === 0 && <span className="ml-2 text-slate">· starting question</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveQuestion(qIdx, -1)}
                  disabled={qIdx === 0}
                  aria-label="Move question up"
                  className="rounded px-2 py-1 text-xs text-slate hover:bg-warmwhite disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveQuestion(qIdx, 1)}
                  disabled={qIdx === questions.length - 1}
                  aria-label="Move question down"
                  className="rounded px-2 py-1 text-xs text-slate hover:bg-warmwhite disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeQuestion(q.id)}
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>

            <input
              value={q.prompt}
              onChange={(e) => updateQuestion(q.id, "prompt", e.target.value)}
              placeholder="What do you want to ask the customer?"
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
                  <div className="flex items-center gap-2">
                    <input
                      value={o.label}
                      onChange={(e) => updateOption(q.id, o.id, { label: e.target.value })}
                      placeholder="Answer the customer can pick"
                      className="flex-1 rounded-card border border-cardline px-3 py-1.5 text-sm focus:border-electric"
                    />
                    <button
                      onClick={() => removeOption(q.id, o.id)}
                      aria-label="Delete answer"
                      className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-2">
                    <label className="text-xs text-slate">What happens when they pick this</label>
                    <select
                      value={o.routeAction}
                      onChange={(e) => {
                        const routeAction = e.target.value;
                        updateOption(q.id, o.id, {
                          routeAction,
                          // Clear fields that no longer apply, so a stale
                          // target can't survive a change of route action.
                          nextQuestionId: routeAction === "CONTINUE" ? o.nextQuestionId : null,
                          rerouteServiceId:
                            routeAction === "REROUTE_SERVICE" ? o.rerouteServiceId : null,
                        });
                      }}
                      className="mt-1 w-full rounded-card border border-cardline px-2 py-1.5 text-xs focus:border-electric"
                    >
                      {Object.entries(ROUTE_ACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {o.routeAction === "CONTINUE" && (
                    <div className="mt-2">
                      <label className="text-xs text-slate">Next question</label>
                      <select
                        value={o.nextQuestionId ?? ""}
                        onChange={(e) =>
                          updateOption(q.id, o.id, { nextQuestionId: e.target.value || null })
                        }
                        className="mt-1 w-full rounded-card border border-cardline px-2 py-1.5 text-xs focus:border-electric"
                      >
                        <option value="">— choose a question —</option>
                        {questions
                          .filter((target) => target.id !== q.id)
                          .map((target) => (
                            <option key={target.id} value={target.id}>
                              {questions.indexOf(target) + 1}. {target.prompt || "(unnamed question)"}
                            </option>
                          ))}
                      </select>
                      {!o.nextQuestionId && (
                        <p className="mt-1 text-xs text-amber-700">
                          Pick one, or this answer dead-ends.
                        </p>
                      )}
                    </div>
                  )}

                  {o.routeAction === "REROUTE_SERVICE" && (
                    <div className="mt-2">
                      <label className="text-xs text-slate">Send them to</label>
                      <select
                        value={o.rerouteServiceId ?? ""}
                        onChange={(e) =>
                          updateOption(q.id, o.id, { rerouteServiceId: e.target.value || null })
                        }
                        className="mt-1 w-full rounded-card border border-cardline px-2 py-1.5 text-xs focus:border-electric"
                      >
                        <option value="">— choose a service —</option>
                        {allServices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {PRICED_ACTIONS.includes(o.routeAction) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate">Price adjustment:</span>
                      {o.referencedServiceId ? (
                        <span className="rounded-pill bg-electric/10 px-2 py-1 text-electric">
                          Linked to &ldquo;{o.referencedServiceName}&rdquo; — always uses that
                          service&rsquo;s current price
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
                            referencedServiceName:
                              allServices.find((s) => s.id === e.target.value)?.name ?? null,
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
                            requiredPhotoLabels: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={2}
                        className="mt-1 w-full rounded-card border border-cardline px-3 py-1.5 text-xs focus:border-electric"
                      />
                    </div>
                  )}

                  {/* Only offered on PHOTO_REVIEW. A REMOTE_QUOTE branch has
                      no price to lock in by definition, so the choice would
                      be meaningless there. */}
                  {o.routeAction === "PHOTO_REVIEW" && (
                    <div className="mt-3 rounded-card border border-cardline bg-white p-3">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={!o.photosBlockBooking}
                          onChange={(e) =>
                            updateOption(q.id, o.id, { photosBlockBooking: !e.target.checked })
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#1B6BFF]"
                        />
                        <span className="text-xs">
                          <span className="font-semibold text-navy">
                            Lock the price and let them book now
                          </span>
                          <span className="mt-0.5 block text-slate">
                            {o.photosBlockBooking
                              ? "Currently: the customer submits photos and waits for the office to price the job. They can't schedule."
                              : "Currently: the customer sees their price, uploads the photos as prep for the tech, and schedules immediately."}
                          </span>
                        </span>
                      </label>
                      {!o.photosBlockBooking && o.requiredPhotoLabels.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">
                          No photos are listed above, so this branch will book with no photos at
                          all. Add at least one, or switch this answer to &ldquo;Resolves to a
                          price&rdquo; instead.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => addOption(q.id)}
                className="w-full rounded-card border border-dashed border-cardline py-2 text-xs font-medium text-slate hover:border-electric hover:text-electric"
              >
                + Add an answer
              </button>
            </div>
          </div>
        ))}
      </div>

      {!isEmpty && (
        <button
          onClick={addQuestion}
          className="mt-4 w-full rounded-card border border-dashed border-cardline py-3 text-sm font-medium text-slate hover:border-electric hover:text-electric"
        >
          + Add a question
        </button>
      )}

      {error && <p className="mt-3 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!isEmpty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "✓ Tree Saved" : "Save Tree Changes"}
        </button>
      )}
    </div>
  );
}
