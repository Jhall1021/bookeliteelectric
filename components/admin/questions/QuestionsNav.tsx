"use client";

import { type QuestionData } from "./types";

export default function QuestionsNav({
  questions, activeQuestionId, onSelect, onAddQuestion,
}: {
  questions: QuestionData[];
  activeQuestionId: string;
  onSelect: (questionId: string) => void;
  onAddQuestion: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
      <div className="border-b border-cardline bg-warmwhite px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate">Questions</h3>
          <span className="rounded-pill bg-white px-2 py-0.5 text-[11px] font-semibold text-slate ring-1 ring-cardline">
            {questions.length}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate">Choose a question to review its answers and routing.</p>
      </div>

      <div className="space-y-1.5 p-2">
        {questions.map((q, i) => {
          const active = q.id === activeQuestionId;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onSelect(q.id)}
              aria-current={active ? "true" : undefined}
              className={`group flex w-full items-start gap-2.5 rounded-card px-2.5 py-2.5 text-left transition ${
                active
                  ? "bg-electric/10 text-navy ring-1 ring-electric/20"
                  : "text-navy hover:bg-warmwhite"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                  active
                    ? "bg-electric text-white"
                    : "bg-warmwhite text-slate ring-1 ring-cardline group-hover:text-navy"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold leading-5">
                  {q.prompt || `Question ${i + 1}`}
                </span>
                {i === 0 && (
                  <span className="mt-0.5 block text-[11px] font-medium text-slate">Starting question</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-cardline bg-warmwhite p-2">
        <button
          type="button"
          onClick={onAddQuestion}
          className="flex w-full items-center justify-center gap-1 rounded-card border border-dashed border-cardline bg-white px-3 py-2.5 text-xs font-semibold text-electric transition hover:border-electric hover:bg-electric/5"
        >
          <span aria-hidden="true" className="text-base leading-none">+</span>
          Add a question
        </button>
      </div>
    </div>
  );
}
