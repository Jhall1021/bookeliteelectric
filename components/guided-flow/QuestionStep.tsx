"use client";

import type { AnswerOptionDTO, QuestionDTO } from "@/lib/flow-types";
import { formatCents } from "@/lib/flow-types";
import { answerPriceDelta } from "@/lib/pricing";

type Props = {
  question: QuestionDTO;
  /**
   * Answers collected so far. Needed because a conditional component's price
   * depends on an earlier answer — the same option costs $220 with attic
   * access and $360 through finished space.
   */
  answers: Record<string, string>;
  onAnswer: (option: AnswerOptionDTO) => void;
};

export default function QuestionStep({ question, answers, onAnswer }: Props) {
  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">{question.prompt}</h2>
      {question.helpText && <p className="mt-1 text-sm text-slate">{question.helpText}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {question.options.map((option) => {
          const delta = answerPriceDelta(option, answers);
          // Only an answer that SETTLES something can promise a price. A
          // CONTINUE answer carrying no charge of its own says nothing —
          // what the customer pays still depends on later questions, so
          // "No extra charge" there is a promise it can't keep.
          const settles =
            option.routeAction === "RESOLVE_INSTANT" ||
            option.routeAction === "RESOLVE_ADJUSTED" ||
            (option.routeAction === "PHOTO_REVIEW" && !option.photosBlockBooking);
          const showsFree = settles && delta.cents === 0;
          return (
            <button
              key={option.id}
              onClick={() => onAnswer(option)}
              className="rounded-card border border-cardline bg-warmwhite p-4 text-left text-sm font-medium text-navy transition hover:border-electric hover:bg-white"
            >
              <span className="block">{option.label}</span>

              {/* Price the answer before it's chosen. Anything that costs
                  extra says so up front; anything we can't price up front
                  says that instead of showing a number that might move. */}
              {delta.needsReview ? (
                <span className="mt-1 block text-xs font-normal text-slate">
                  We&rsquo;ll confirm your price after a quick look
                </span>
              ) : delta.cents && delta.cents > 0 ? (
                <span className="mt-1 block text-xs font-semibold text-success">
                  + {formatCents(delta.cents)}
                </span>
              ) : delta.cents && delta.cents < 0 ? (
                <span className="mt-1 block text-xs font-semibold text-success">
                  − {formatCents(Math.abs(delta.cents))}
                </span>
              ) : showsFree ? (
                <span className="mt-1 block text-xs font-normal text-slate">
                  No extra charge
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
