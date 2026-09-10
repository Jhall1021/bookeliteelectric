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
    <div className="rounded-card border border-cardline bg-white">
      <div className="border-b border-cardline p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Questions</h3>
      </div>
      <div className="divide-y divide-cardline">
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onSelect(q.id)}
            aria-current={q.id === activeQuestionId ? "true" : undefined}
            className={`block w-full px-3 py-2.5 text-left text-sm transition ${
              q.id === activeQuestionId ? "bg-electric/10 text-electric" : "text-navy hover:bg-warmwhite"
            }`}
          >
            <div className="break-words font-medium">{q.prompt || `Question ${i + 1}`}</div>
            {i === 0 && <div className="text-xs text-slate">Starting question</div>}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onAddQuestion}
        className="block w-full border-t border-cardline px-3 py-2.5 text-left text-xs font-medium text-electric hover:bg-warmwhite"
      >
        + Add a question
      </button>
    </div>
  );
}
