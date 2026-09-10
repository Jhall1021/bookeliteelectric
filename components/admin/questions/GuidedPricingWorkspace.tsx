"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AnswerSummaryTable from "./AnswerSummaryTable";
import QuestionsNav from "./QuestionsNav";
import QuestionEditForm from "./QuestionEditForm";
import CustomerPreviewPane from "./CustomerPreviewPane";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import {
  type QuestionData, type AnswerOptionData, type ServiceOption,
  blankQuestion, blankOption, computeOptionDeleteImpacts,
} from "./types";

type Mode = "summary" | "edit";
type MobilePane = "edit" | "preview";

export default function GuidedPricingWorkspace({
  serviceId, questions: initialQuestions, allServices, troubleshootingServiceName,
}: {
  serviceId: string;
  questions: QuestionData[];
  allServices: ServiceOption[];
  troubleshootingServiceName: string | null;
}) {
  const router = useRouter();
  const [savedQuestions, setSavedQuestions] = useState(initialQuestions);
  const [questions, setQuestions] = useState(initialQuestions);
  const [mode, setMode] = useState<Mode>("summary");
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(initialQuestions[0]?.id ?? null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("edit");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(questions) !== JSON.stringify(savedQuestions);

  // Protection against accidentally discarding edits — a full unload,
  // an internal link click (sidebar nav, breadcrumb, another catalog
  // row), and the browser's own back/forward button are three genuinely
  // different mechanisms; see the hook's own header for why each needs
  // its own handling. Workspace TAB switches never reach any of this,
  // since ServiceWorkspace keeps every panel mounted (hidden, not
  // unmounted) — there is nothing for a tab switch to discard.
  const { pending, stay, discard } = useUnsavedChangesGuard(dirty);

  function updateQuestion(qId: string, field: "prompt" | "helpText", value: string) {
    setQuestions((qs) => qs.map((q) => (q.id === qId ? { ...q, [field]: value } : q)));
  }

  function updateOption(qId: string, oId: string, patch: Partial<AnswerOptionData>) {
    setQuestions((qs) =>
      qs.map((q) => (q.id !== qId ? q : { ...q, options: q.options.map((o) => (o.id === oId ? { ...o, ...patch } : o)) }))
    );
  }

  function addQuestion() {
    const q = blankQuestion();
    setQuestions((qs) => [...qs, q]);
    setActiveQuestionId(q.id);
    setMode("edit");
  }

  function addOption(qId: string) {
    setQuestions((qs) => qs.map((q) => (q.id === qId ? { ...q, options: [...q.options, blankOption()] } : q)));
  }

  // Anything still pointing at this question would become a dangling
  // reference. The server refuses those too, but catching it here means the
  // admin finds out while looking at the tree rather than after a save.
  function inboundQuestionReferences(qId: string): string[] {
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
    const refs = inboundQuestionReferences(qId);
    if (refs.length > 0) {
      setError(`Can't remove this question — ${refs.join(", ")} still continues to it. Change where those answers go first.`);
      return;
    }
    setError(null);
    setQuestions((qs) => qs.filter((q) => q.id !== qId));
    setActiveQuestionId((cur) => (cur === qId ? questions.find((q) => q.id !== qId)?.id ?? null : cur));
    if (questions.length <= 1) setMode("summary");
  }

  function removeOption(qId: string, oId: string) {
    const q = questions.find((qq) => qq.id === qId);
    if (q && q.options.length === 1) {
      setError("A question needs at least one answer. Delete the whole question instead.");
      return;
    }
    setError(null);
    setQuestions((qs) => qs.map((qq) => (qq.id === qId ? { ...qq, options: qq.options.filter((o) => o.id !== oId) } : qq)));
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
      setSavedQuestions(questions);
      setMode("summary");
      // New rows came back with real ids — refresh so the next save edits
      // them instead of trying to create duplicates, same as before.
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

  function handleCancel() {
    setQuestions(savedQuestions);
    setMode("summary");
    setError(null);
  }

  const activeQuestion = questions.find((q) => q.id === activeQuestionId) ?? questions[0] ?? null;
  const impacts = computeOptionDeleteImpacts(questions);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-navy">Customer questions</h2>
          <p className="mt-1 text-sm text-slate">
            {questions.length === 0
              ? "No questions yet — customers see this service's base price and book straight away."
              : mode === "summary"
                ? "Each answer, and what it does. Open a question to change it."
                : "Editing — nothing is saved until you press Save."}
          </p>
        </div>
        {mode === "summary" && questions.length > 0 && (
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="shrink-0 rounded-pill border border-cardline px-4 py-2 text-sm font-medium text-navy hover:border-electric"
          >
            Edit questions
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {saved && <p className="mt-3 text-sm text-success">✓ Saved.</p>}

      <div className="mt-4">
        {mode === "summary" ? (
          <AnswerSummaryTable
            questions={questions}
            troubleshootingServiceName={troubleshootingServiceName}
            onEditQuestion={(qId) => { setActiveQuestionId(qId); setMode("edit"); }}
            onAddQuestion={addQuestion}
          />
        ) : activeQuestion ? (
          <div>
            {/* Small-screen switch — the nav/editor/preview three-up layout
                below only fits from md up. */}
            <div className="mb-3 flex gap-1 rounded-pill border border-cardline bg-white p-1 md:hidden">
              <button
                type="button"
                onClick={() => setMobilePane("edit")}
                className={`flex-1 rounded-pill py-1.5 text-xs font-semibold ${mobilePane === "edit" ? "bg-electric text-white" : "text-slate"}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setMobilePane("preview")}
                className={`flex-1 rounded-pill py-1.5 text-xs font-semibold ${mobilePane === "preview" ? "bg-electric text-white" : "text-slate"}`}
              >
                Preview
              </button>
            </div>

            {/* pb-28 reserves room below the LAST answer/button so a sticky
                footer the same rough height never ends up painted over
                content that hasn't fully scrolled clear of it — a sticky
                element doesn't claim that space on its own. */}
            <div className="grid grid-cols-1 gap-4 pb-28 md:grid-cols-[200px_1fr_280px] md:pb-4">
              <div className={mobilePane === "preview" ? "hidden md:block" : ""}>
                <QuestionsNav
                  questions={questions}
                  activeQuestionId={activeQuestion.id}
                  onSelect={setActiveQuestionId}
                  onAddQuestion={addQuestion}
                />
              </div>
              <div className={mobilePane === "preview" ? "hidden md:block" : ""}>
                <QuestionEditForm
                  question={activeQuestion}
                  questionIndex={questions.indexOf(activeQuestion)}
                  isFirst={questions[0]?.id === activeQuestion.id}
                  allQuestions={questions}
                  allServices={allServices}
                  troubleshootingServiceName={troubleshootingServiceName}
                  inboundQuestionRefs={inboundQuestionReferences(activeQuestion.id)}
                  inboundOptionRefs={impacts}
                  onUpdateQuestion={(field, value) => updateQuestion(activeQuestion.id, field, value)}
                  onUpdateOption={(oId, patch) => updateOption(activeQuestion.id, oId, patch)}
                  onAddOption={() => addOption(activeQuestion.id)}
                  onRemoveOption={(oId) => removeOption(activeQuestion.id, oId)}
                  onRemoveQuestion={() => removeQuestion(activeQuestion.id)}
                />
              </div>
              <div className={mobilePane === "edit" ? "hidden md:block" : ""}>
                <CustomerPreviewPane serviceId={serviceId} dirty={dirty} />
              </div>
            </div>

            {/* Sticky so Save/Cancel stay reachable without scrolling back up
                past every answer — the point that mattered most on mobile,
                where the editor can run long. */}
            <div className="sticky bottom-0 -mx-1 mt-4 flex items-center gap-3 border-t border-cardline bg-warmwhite px-1 py-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="rounded-pill border border-cardline px-5 py-2.5 text-sm font-medium text-navy hover:border-electric disabled:opacity-50"
              >
                Cancel
              </button>
              {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
            </div>
          </div>
        ) : null}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-guard-title" className="w-full max-w-sm rounded-card bg-white p-5 shadow-raised">
            <h3 id="unsaved-guard-title" className="font-display text-base font-bold text-navy">
              Leave without saving?
            </h3>
            <p className="mt-2 text-sm text-slate">
              Your changes to these questions haven&rsquo;t been saved. Leaving now discards them.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={stay}
                className="rounded-pill border border-cardline px-4 py-2 text-sm font-medium text-navy hover:border-electric"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={discard}
                className="rounded-pill bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Discard changes and leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
