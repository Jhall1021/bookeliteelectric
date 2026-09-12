"use client";

import { useEffect, useRef, useState } from "react";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import {
  type QuestionData, type AnswerOptionData, type ServiceOption,
  ROUTE_ACTION_LABELS, PRICED_ACTIONS, whatHappensNext,
} from "./types";

/** A textarea that grows with its content instead of scrolling internally — for an answer label or a note that can run long. */
function AutoGrowTextarea({
  value, onChange, placeholder, className,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`scroll-mb-28 resize-none overflow-hidden ${className ?? ""}`}
    />
  );
}

export default function QuestionEditForm({
  question, questionIndex, isFirst, allQuestions, allServices, troubleshootingServiceName,
  inboundQuestionRefs, inboundOptionRefs,
  onUpdateQuestion, onUpdateOption, onAddOption, onRemoveOption, onRemoveQuestion,
}: {
  question: QuestionData;
  questionIndex: number;
  isFirst: boolean;
  allQuestions: QuestionData[];
  allServices: ServiceOption[];
  troubleshootingServiceName: string | null;
  inboundQuestionRefs: string[];
  inboundOptionRefs: Map<string, string>;
  onUpdateQuestion: (field: "prompt" | "helpText", value: string) => void;
  onUpdateOption: (optionId: string, patch: Partial<AnswerOptionData>) => void;
  onAddOption: () => void;
  onRemoveOption: (optionId: string) => void;
  onRemoveQuestion: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(question.options[0]?.id ?? null);
  useEffect(() => { setExpandedId(null); }, [question.id]);

  const prevOptionCount = useRef(question.options.length);
  useEffect(() => {
    if (question.options.length > prevOptionCount.current) {
      setExpandedId(question.options[question.options.length - 1]?.id ?? null);
    }
    prevOptionCount.current = question.options.length;
  }, [question.options.length, question.options]);

  const questionsById = new Map(allQuestions.map((q) => [q.id, q]));

  return (
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
      <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-electric px-2 text-xs font-bold text-white">
                {questionIndex + 1}
              </span>
              <span className="text-sm font-semibold text-navy">Customer question</span>
              {isFirst && (
                <span className="rounded-pill border border-electric/20 bg-electric/5 px-2.5 py-1 text-[11px] font-semibold text-electric">
                  Starts the flow
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate">Write this the way you would ask it on the phone. Keep it simple and homeowner-friendly.</p>
          </div>
          <OverflowMenu
            label="Question actions"
            items={[{ label: "Delete question", tone: "danger", onSelect: onRemoveQuestion }]}
          />
        </div>

        {inboundQuestionRefs.length > 0 && (
          <p className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            This question is still used by {inboundQuestionRefs.join(", ")}. Change those paths before removing it.
          </p>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate">Question shown to the customer</label>
        <input
          value={question.prompt}
          onChange={(e) => onUpdateQuestion("prompt", e.target.value)}
          placeholder="What do you want to ask the customer?"
          className="mt-2 w-full scroll-mb-28 rounded-card border border-cardline bg-white px-4 py-3 text-lg font-semibold text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
        />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate">Helper text <span className="font-normal normal-case tracking-normal">(optional)</span></label>
        <input
          value={question.helpText ?? ""}
          onChange={(e) => onUpdateQuestion("helpText", e.target.value)}
          placeholder="Add a short explanation if the customer may need context"
          className="mt-2 w-full scroll-mb-28 rounded-card border border-cardline bg-white px-4 py-2.5 text-sm text-navy outline-none transition placeholder:text-slate/70 focus:border-electric focus:ring-2 focus:ring-electric/10"
        />

        <div className="mt-6 flex items-end justify-between gap-3 border-t border-cardline pt-5">
          <div>
            <h4 className="text-sm font-semibold text-navy">Answers</h4>
            <p className="mt-0.5 text-xs text-slate">Customers pick one. Open an answer only when you need to change what happens next.</p>
          </div>
          <span className="shrink-0 text-xs font-medium text-slate">{question.options.length} {question.options.length === 1 ? "answer" : "answers"}</span>
        </div>

        <div className="mt-3 space-y-2">
          {question.options.map((o) =>
            expandedId === o.id ? (
              <ExpandedAnswer
                key={o.id}
                option={o}
                allQuestions={allQuestions}
                currentQuestionId={question.id}
                allServices={allServices}
                deleteWarning={inboundOptionRefs.get(o.id) ?? null}
                canDelete={question.options.length > 1}
                onUpdate={(patch) => onUpdateOption(o.id, patch)}
                onRemove={() => onRemoveOption(o.id)}
                onCollapse={() => setExpandedId(null)}
              />
            ) : (
              <CollapsedAnswer
                key={o.id}
                option={o}
                summary={whatHappensNext(o, questionsById, troubleshootingServiceName)}
                onEdit={() => setExpandedId(o.id)}
              />
            )
          )}
        </div>

        <button
          type="button"
          onClick={onAddOption}
          className="mt-3 w-full rounded-card border border-dashed border-cardline bg-warmwhite/40 py-2.5 text-xs font-semibold text-electric transition hover:border-electric hover:bg-electric/5"
        >
          + Add another answer
        </button>
      </div>
    </div>
  );
}

function CollapsedAnswer({ option: o, summary, onEdit }: { option: AnswerOptionData; summary: string; onEdit: () => void }) {
  const isDeadEnd = /dead-end|no next question|no service chosen|not resolvable/.test(summary);
  return (
    <button type="button" onClick={onEdit} className="group flex w-full items-start justify-between gap-3 rounded-card border border-cardline bg-white p-3.5 text-left transition hover:border-electric hover:shadow-sm">
      <div className="flex min-w-0 gap-3">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-electric/50" aria-hidden="true" />
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-navy">{o.label || "Unnamed answer"}</div>
          <div className={`mt-1 text-xs leading-relaxed ${isDeadEnd ? "font-medium text-red-700" : "text-slate"}`}>{summary}</div>
          {o.disclaimer && <div className="mt-1 text-xs text-slate">Customer note: {o.disclaimer}</div>}
        </div>
      </div>
      <span className="shrink-0 rounded-pill border border-cardline px-3 py-1 text-xs font-semibold text-navy transition group-hover:border-electric group-hover:text-electric">Edit</span>
    </button>
  );
}

function ExpandedAnswer({ option: o, allQuestions, currentQuestionId, allServices, deleteWarning, canDelete, onUpdate, onRemove, onCollapse }: {
  option: AnswerOptionData; allQuestions: QuestionData[]; currentQuestionId: string; allServices: ServiceOption[];
  deleteWarning: string | null; canDelete: boolean; onUpdate: (patch: Partial<AnswerOptionData>) => void; onRemove: () => void; onCollapse: () => void;
}) {
  const hasPrice = o.priceModifierCents !== 0 || o.referencedServiceId !== null;
  const hasNote = !!o.disclaimer;
  const [priceOpen, setPriceOpen] = useState(hasPrice);
  const [noteOpen, setNoteOpen] = useState(hasNote);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="rounded-card border border-electric/40 bg-electric/[0.025] p-4 ring-1 ring-electric/10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-electric">Editing answer</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCollapse} className="rounded-pill bg-electric px-3 py-1.5 text-xs font-semibold text-white hover:bg-electric-hover">Done</button>
          <OverflowMenu label={`Actions for "${o.label || "this answer"}"`} items={[{
            label: canDelete ? "Delete answer" : "A question needs at least one answer", tone: "danger", onSelect: () => {
              if (!canDelete) return; if (deleteWarning) setConfirmingDelete(true); else onRemove();
            },
          }]} />
        </div>
      </div>
      <label className="text-xs font-medium text-slate">Answer the customer can pick</label>
      <AutoGrowTextarea value={o.label} onChange={(v) => onUpdate({ label: v })} placeholder="Answer the customer can pick" className="mt-1.5 w-full rounded-card border border-cardline bg-white px-3 py-2 text-sm font-medium text-navy outline-none focus:border-electric focus:ring-2 focus:ring-electric/10" />

      {confirmingDelete && deleteWarning && (
        <div className="mt-3 rounded-card border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p>{deleteWarning}</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => { setConfirmingDelete(false); onRemove(); }} className="rounded-pill bg-red-600 px-3 py-1 font-semibold text-white">Delete anyway</button><button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-pill border border-amber-300 px-3 py-1 font-semibold">Cancel</button></div>
        </div>
      )}

      <div className="mt-4 rounded-card border border-cardline bg-white p-3">
        <label className="text-xs font-semibold text-navy">What happens next?</label>
        <select value={o.routeAction} onChange={(e) => { const routeAction = e.target.value; onUpdate({ routeAction, nextQuestionId: routeAction === "CONTINUE" ? o.nextQuestionId : null, rerouteServiceId: routeAction === "REROUTE_SERVICE" ? o.rerouteServiceId : null, rerouteServiceName: routeAction === "REROUTE_SERVICE" ? o.rerouteServiceName : null }); }} className="mt-2 w-full rounded-card border border-cardline px-3 py-2 text-sm text-navy outline-none focus:border-electric">
          {Object.entries(ROUTE_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        {o.routeAction === "CONTINUE" && <div className="mt-3"><label className="text-xs text-slate">Continue to</label><select value={o.nextQuestionId ?? ""} onChange={(e) => onUpdate({ nextQuestionId: e.target.value || null })} className="mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm"><option value="">— choose the next question —</option>{allQuestions.filter((target) => target.id !== currentQuestionId).map((target) => <option key={target.id} value={target.id}>{allQuestions.indexOf(target) + 1}. {target.prompt || "Unnamed question"}</option>)}</select>{!o.nextQuestionId && <p className="mt-1 text-xs text-amber-700">Choose a question so this answer has somewhere to go.</p>}</div>}
        {o.routeAction === "REROUTE_SERVICE" && <div className="mt-3"><label className="text-xs text-slate">Send the customer to</label><select value={o.rerouteServiceId ?? ""} onChange={(e) => { const id = e.target.value || null; onUpdate({ rerouteServiceId: id, rerouteServiceName: allServices.find((s) => s.id === id)?.name ?? null }); }} className="mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm"><option value="">— choose a service —</option>{allServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
      </div>

      {PRICED_ACTIONS.includes(o.routeAction) && (priceOpen ? <div className="mt-3 rounded-card border border-cardline bg-white p-3 text-xs"><div className="mb-2 font-semibold text-navy">Price adjustment</div><div className="flex flex-wrap items-center gap-2">{o.referencedServiceId ? <span className="rounded-pill bg-electric/10 px-2 py-1 text-electric">Linked to “{o.referencedServiceName}”</span> : <><span className="text-slate">$</span><input type="number" step="0.01" value={(o.priceModifierCents / 100).toFixed(2)} onChange={(e) => onUpdate({ priceModifierCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="w-24 rounded-card border border-cardline px-2 py-1" /></>}<select value={o.referencedServiceId ?? ""} onChange={(e) => onUpdate({ referencedServiceId: e.target.value || null, referencedServiceName: allServices.find((s) => s.id === e.target.value)?.name ?? null })} className="rounded-card border border-cardline px-2 py-1"><option value="">Flat dollar amount</option>{allServices.map((s) => <option key={s.id} value={s.id}>Link to: {s.name}</option>)}</select>{!hasPrice && <button type="button" onClick={() => setPriceOpen(false)} className="text-slate hover:underline">Remove</button>}</div></div> : <button type="button" onClick={() => setPriceOpen(true)} className="mt-3 mr-3 text-xs font-semibold text-electric hover:underline">+ Add price adjustment</button>)}

      {noteOpen ? <div className="mt-3 rounded-card border border-cardline bg-white p-3"><label className="text-xs font-semibold text-navy">Customer note</label><div className="mt-2 flex items-start gap-2"><AutoGrowTextarea value={o.disclaimer ?? ""} onChange={(v) => onUpdate({ disclaimer: v || null })} placeholder="Optional note shown with this answer" className="w-full rounded-card border border-cardline px-3 py-2 text-xs" />{!hasNote && <button type="button" onClick={() => setNoteOpen(false)} className="shrink-0 text-xs text-slate hover:underline">Remove</button>}</div></div> : <button type="button" onClick={() => setNoteOpen(true)} className="mt-3 text-xs font-semibold text-electric hover:underline">+ Add customer note</button>}

      {(o.routeAction === "PHOTO_REVIEW" || o.routeAction === "REMOTE_QUOTE") && <div className="mt-3 rounded-card border border-cardline bg-white p-3"><label className="text-xs font-semibold text-navy">Photos to request</label><p className="mt-0.5 text-xs text-slate">One request per line.</p><textarea value={o.requiredPhotoLabels.join("\n")} onChange={(e) => onUpdate({ requiredPhotoLabels: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} rows={2} className="mt-2 w-full scroll-mb-28 rounded-card border border-cardline px-3 py-2 text-xs" /></div>}

      {o.routeAction === "PHOTO_REVIEW" && <div className="mt-3 rounded-card border border-cardline bg-white p-3"><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" checked={!o.photosBlockBooking} onChange={(e) => onUpdate({ photosBlockBooking: !e.target.checked })} className="mt-0.5" /><span><span className="block text-xs font-semibold text-navy">Allow booking before photo review</span><span className="mt-0.5 block text-xs text-slate">The customer can reserve a time while the contractor reviews the requested photos.</span></span></label></div>}
    </div>
  );
}
