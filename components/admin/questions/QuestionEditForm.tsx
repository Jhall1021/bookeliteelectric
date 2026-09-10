"use client";

import { useState } from "react";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import {
  type QuestionData, type AnswerOptionData, type ServiceOption,
  ROUTE_ACTION_LABELS, PRICED_ACTIONS, blankOption,
} from "./types";

export default function QuestionEditForm({
  question, questionIndex, isFirst, allQuestions, allServices,
  inboundQuestionRefs, inboundOptionRefs,
  onUpdateQuestion, onUpdateOption, onAddOption, onRemoveOption, onRemoveQuestion,
}: {
  question: QuestionData;
  questionIndex: number;
  isFirst: boolean;
  allQuestions: QuestionData[];
  allServices: ServiceOption[];
  /** Answers elsewhere in the tree that CONTINUE to this question — non-empty means "can't delete this question". */
  inboundQuestionRefs: string[];
  /**
   * Per option id: set when deleting THIS option would leave its own
   * `nextQuestionId` target with zero remaining paths reaching it — i.e.
   * this is the only CONTINUE answer anywhere in the tree pointing there.
   * Absent (no entry) means deleting it is safe.
   */
  inboundOptionRefs: Map<string, string>;
  onUpdateQuestion: (field: "prompt" | "helpText", value: string) => void;
  onUpdateOption: (optionId: string, patch: Partial<AnswerOptionData>) => void;
  onAddOption: () => void;
  onRemoveOption: (optionId: string) => void;
  onRemoveQuestion: () => void;
}) {
  return (
    <div className="rounded-card border border-cardline bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold text-electric">
          Question {questionIndex + 1}
          {isFirst && <span className="ml-2 font-normal text-slate">· starting question</span>}
        </div>
        <OverflowMenu
          label="Question actions"
          items={[
            {
              label: "Delete question",
              tone: "danger",
              onSelect: onRemoveQuestion,
            },
          ]}
        />
      </div>

      {inboundQuestionRefs.length > 0 && (
        <p className="mt-2 rounded-card bg-amber-50 p-2 text-xs text-amber-800">
          Kept in the tree: {inboundQuestionRefs.join(", ")} still continue{inboundQuestionRefs.length === 1 ? "s" : ""} here.
        </p>
      )}

      <input
        value={question.prompt}
        onChange={(e) => onUpdateQuestion("prompt", e.target.value)}
        placeholder="What do you want to ask the customer?"
        className="mt-3 w-full rounded-card border border-cardline px-3 py-2 text-sm font-medium text-navy focus:border-electric"
      />
      <input
        value={question.helpText ?? ""}
        onChange={(e) => onUpdateQuestion("helpText", e.target.value)}
        placeholder="Optional helper text shown under the question"
        className="mt-2 w-full rounded-card border border-cardline px-3 py-2 text-xs text-slate focus:border-electric"
      />

      <div className="mt-4 space-y-3">
        {question.options.map((o) => (
          <AnswerRow
            key={o.id}
            option={o}
            allQuestions={allQuestions}
            currentQuestionId={question.id}
            allServices={allServices}
            deleteWarning={inboundOptionRefs.get(o.id) ?? null}
            canDelete={question.options.length > 1}
            onUpdate={(patch) => onUpdateOption(o.id, patch)}
            onRemove={() => onRemoveOption(o.id)}
          />
        ))}
      </div>

      <button
        onClick={onAddOption}
        className="mt-3 w-full rounded-card border border-dashed border-cardline py-2 text-xs font-medium text-slate hover:border-electric hover:text-electric"
      >
        + Add an answer
      </button>
    </div>
  );
}

function AnswerRow({
  option: o, allQuestions, currentQuestionId, allServices, deleteWarning, canDelete, onUpdate, onRemove,
}: {
  option: AnswerOptionData;
  allQuestions: QuestionData[];
  currentQuestionId: string;
  allServices: ServiceOption[];
  deleteWarning: string | null;
  canDelete: boolean;
  onUpdate: (patch: Partial<AnswerOptionData>) => void;
  onRemove: () => void;
}) {
  const hasPrice = o.priceModifierCents !== 0 || o.referencedServiceId !== null;
  const hasNote = !!o.disclaimer;
  const [priceOpen, setPriceOpen] = useState(hasPrice);
  const [noteOpen, setNoteOpen] = useState(hasNote);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="rounded-card bg-warmwhite p-3">
      <div className="flex items-center gap-2">
        <input
          value={o.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Answer the customer can pick"
          className="flex-1 rounded-card border border-cardline px-3 py-1.5 text-sm focus:border-electric"
        />
        <OverflowMenu
          label={`Actions for "${o.label || "this answer"}"`}
          items={[
            {
              label: canDelete ? "Delete answer" : "A question needs at least one answer",
              tone: "danger",
              onSelect: () => {
                if (!canDelete) return;
                // A structural deletion that would orphan another question
                // gets explained before it happens, never a silent removal —
                // deleting a question already works this way; deleting the
                // one answer that continues to it did not, until now.
                if (deleteWarning) setConfirmingDelete(true);
                else onRemove();
              },
            },
          ]}
        />
      </div>

      {confirmingDelete && deleteWarning && (
        <div className="mt-2 rounded-card border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p>{deleteWarning}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => { setConfirmingDelete(false); onRemove(); }}
              className="rounded-pill bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700"
            >
              Delete anyway
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-pill border border-amber-300 px-3 py-1 font-semibold text-amber-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <label className="text-xs text-slate">What happens when they pick this</label>
        <select
          value={o.routeAction}
          onChange={(e) => {
            const routeAction = e.target.value;
            onUpdate({
              routeAction,
              // Clear fields that no longer apply, so a stale target can't
              // survive a change of route action.
              nextQuestionId: routeAction === "CONTINUE" ? o.nextQuestionId : null,
              rerouteServiceId: routeAction === "REROUTE_SERVICE" ? o.rerouteServiceId : null,
              rerouteServiceName: routeAction === "REROUTE_SERVICE" ? o.rerouteServiceName : null,
            });
          }}
          className="mt-1 w-full rounded-card border border-cardline px-2 py-1.5 text-xs focus:border-electric"
        >
          {Object.entries(ROUTE_ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {o.routeAction === "CONTINUE" && (
        <div className="mt-2">
          <label className="text-xs text-slate">Next question</label>
          <select
            value={o.nextQuestionId ?? ""}
            onChange={(e) => onUpdate({ nextQuestionId: e.target.value || null })}
            className="mt-1 w-full rounded-card border border-cardline px-2 py-1.5 text-xs focus:border-electric"
          >
            <option value="">— choose a question —</option>
            {allQuestions
              .filter((target) => target.id !== currentQuestionId)
              .map((target, i) => (
                <option key={target.id} value={target.id}>
                  {allQuestions.indexOf(target) + 1}. {target.prompt || "(unnamed question)"}
                </option>
              ))}
          </select>
          {!o.nextQuestionId && (
            <p className="mt-1 text-xs text-amber-700">Pick one, or this answer dead-ends.</p>
          )}
        </div>
      )}

      {o.routeAction === "REROUTE_SERVICE" && (
        <div className="mt-2">
          <label className="text-xs text-slate">Send them to</label>
          <select
            value={o.rerouteServiceId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              onUpdate({ rerouteServiceId: id, rerouteServiceName: allServices.find((s) => s.id === id)?.name ?? null });
            }}
            className="mt-1 w-full rounded-card border border-cardline px-2 py-1.5 text-xs focus:border-electric"
          >
            <option value="">— choose a service —</option>
            {allServices.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {PRICED_ACTIONS.includes(o.routeAction) && (
        priceOpen ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate">Price adjustment:</span>
            {o.referencedServiceId ? (
              <span className="rounded-pill bg-electric/10 px-2 py-1 text-electric">
                Linked to &ldquo;{o.referencedServiceName}&rdquo;
              </span>
            ) : (
              <input
                type="number" step="0.01"
                value={(o.priceModifierCents / 100).toFixed(2)}
                onChange={(e) => onUpdate({ priceModifierCents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                className="w-24 rounded-card border border-cardline px-2 py-1 text-xs focus:border-electric"
              />
            )}
            <select
              value={o.referencedServiceId ?? ""}
              onChange={(e) =>
                onUpdate({
                  referencedServiceId: e.target.value || null,
                  referencedServiceName: allServices.find((s) => s.id === e.target.value)?.name ?? null,
                })
              }
              className="rounded-card border border-cardline px-2 py-1 text-xs focus:border-electric"
            >
              <option value="">— flat dollar amount —</option>
              {allServices.map((s) => (
                <option key={s.id} value={s.id}>Link to: {s.name}</option>
              ))}
            </select>
            {!hasPrice && (
              <button
                type="button"
                onClick={() => setPriceOpen(false)}
                className="text-slate underline-offset-2 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPriceOpen(true)}
            className="mt-2 mr-3 inline-block text-xs font-medium text-electric hover:underline"
          >
            + Add a price adjustment
          </button>
        )
      )}

      {noteOpen ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={o.disclaimer ?? ""}
            onChange={(e) => onUpdate({ disclaimer: e.target.value || null })}
            placeholder="Note shown with this price (optional)"
            className="w-full rounded-card border border-cardline px-3 py-1.5 text-xs focus:border-electric"
          />
          {!hasNote && (
            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              className="shrink-0 text-xs text-slate underline-offset-2 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="mt-2 text-xs font-medium text-electric hover:underline"
        >
          + Add a customer note
        </button>
      )}

      {(o.routeAction === "PHOTO_REVIEW" || o.routeAction === "REMOTE_QUOTE") && (
        <div className="mt-2">
          <label className="text-xs text-slate">Required photos (one per line)</label>
          <textarea
            value={o.requiredPhotoLabels.join("\n")}
            onChange={(e) => onUpdate({ requiredPhotoLabels: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
            rows={2}
            className="mt-1 w-full rounded-card border border-cardline px-3 py-1.5 text-xs focus:border-electric"
          />
        </div>
      )}

      {o.routeAction === "PHOTO_REVIEW" && (
        <div className="mt-3 rounded-card border border-cardline bg-white p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={!o.photosBlockBooking}
              onChange={(e) => onUpdate({ photosBlockBooking: !e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#1B6BFF]"
            />
            <span className="text-xs">
              <span className="font-semibold text-navy">Lock the price and let them book now</span>
              <span className="mt-0.5 block text-slate">
                {o.photosBlockBooking
                  ? "Currently: the customer submits photos and waits for the office to price the job. They can't schedule."
                  : "Currently: the customer sees their price, uploads the photos as prep for the tech, and schedules immediately."}
              </span>
            </span>
          </label>
          {!o.photosBlockBooking && o.requiredPhotoLabels.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              No photos are listed above, so this branch will book with no photos at all.
            </p>
          )}
        </div>
      )}

    </div>
  );
}
