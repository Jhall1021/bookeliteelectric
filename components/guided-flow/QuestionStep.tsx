"use client";

import type { AnswerOptionDTO, QuestionDTO } from "@/lib/flow-types";

type Props = {
  question: QuestionDTO;
  onAnswer: (option: AnswerOptionDTO) => void;
};

export default function QuestionStep({ question, onAnswer }: Props) {
  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">{question.prompt}</h2>
      {question.helpText && <p className="mt-1 text-sm text-slate">{question.helpText}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {question.options.map((option) => (
          <button
            key={option.id}
            onClick={() => onAnswer(option)}
            className="rounded-card border border-cardline bg-warmwhite p-4 text-left text-sm font-medium text-navy transition hover:border-electric hover:bg-white"
          >
            {option.label}
            {option.priceModifierCents > 0 && (
              <span className="ml-2 text-xs text-slate">
                +${(option.priceModifierCents / 100).toFixed(0)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
