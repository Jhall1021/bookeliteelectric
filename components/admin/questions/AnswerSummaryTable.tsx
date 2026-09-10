"use client";

import { Badge } from "@/components/ui/Badge";
import { type QuestionData, whatHappensNext } from "./types";

/**
 * The default, READABLE view of a question tree — a table of "Customer's
 * answer" -> "What happens next" per question, before anything is opened
 * for editing. Every line is read straight from the saved routing (see
 * whatHappensNext), never from display order.
 */
export default function AnswerSummaryTable({
  questions, troubleshootingServiceName, onEditQuestion, onAddQuestion,
}: {
  questions: QuestionData[];
  troubleshootingServiceName: string | null;
  onEditQuestion: (questionId: string) => void;
  onAddQuestion: () => void;
}) {
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  if (questions.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-cardline bg-warmwhite p-8 text-center">
        <p className="text-sm text-slate">
          No questions yet — customers see this service&rsquo;s base price and book straight away.
        </p>
        <button
          type="button"
          onClick={onAddQuestion}
          className="mt-4 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
        >
          Add a question
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {questions.map((q, qIdx) => (
        <div key={q.id} className="rounded-card border border-cardline bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-cardline p-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-electric">
                Question {qIdx + 1}
                {qIdx === 0 && <span className="ml-2 font-normal text-slate">· starting question</span>}
              </div>
              <div className="mt-0.5 truncate text-sm font-medium text-navy">
                {q.prompt || "(unnamed question)"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEditQuestion(q.id)}
              className="shrink-0 rounded-pill border border-cardline px-3 py-1.5 text-xs font-semibold text-navy hover:border-electric"
            >
              Edit
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate">
                  <th className="px-4 py-2 font-medium">Customer&rsquo;s answer</th>
                  <th className="px-4 py-2 font-medium">What happens next</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cardline">
                {q.options.map((o) => {
                  const next = whatHappensNext(o, questionsById, troubleshootingServiceName);
                  const isDeadEnd = next.includes("Dead-ends") || next.includes("no service chosen") || next.includes("not resolvable");
                  return (
                    <tr key={o.id}>
                      <td className="px-4 py-2.5 align-top text-navy">{o.label || "(unnamed answer)"}</td>
                      <td className="px-4 py-2.5 align-top">
                        <span className={isDeadEnd ? "text-red-700" : "text-slate"}>{next}</span>
                        {o.disclaimer && (
                          <div className="mt-1 text-xs text-slate">Note: {o.disclaimer}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-top text-right">
                        {isDeadEnd && <Badge tone="blocker">Fix this</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAddQuestion}
        className="w-full rounded-card border border-dashed border-cardline py-3 text-sm font-medium text-slate hover:border-electric hover:text-electric"
      >
        + Add a question
      </button>
    </div>
  );
}
