import type { AnswerOptionDTO, QuestionDTO } from "./flow-types";
import { selectNumericOption } from "./numericRouteRanges";

/**
 * Resolve a previously stored Guided Flow answer back to the option whose
 * routing/effects it represents.
 *
 * Fresh NUMBER input already uses selectNumericOption in QuestionStep and the
 * server resolver uses the same primitive. Resume/reroute replay must do the
 * same: the stored value is the homeowner's number ("14.625", "31"), not the
 * authored option value (`__number__`, `within`, ...).
 *
 * Returning null is fail-closed. A stale answer that no longer belongs to the
 * current tree is shown again rather than silently routed through a different
 * option.
 */
export function optionForStoredGuidedFlowAnswer(
  question: QuestionDTO,
  raw: string | undefined,
): AnswerOptionDTO | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;

  if (question.inputType === "NUMBER") {
    const choice = selectNumericOption(question, String(raw).trim());
    return choice.kind === "option" ? { ...choice.option, value: String(raw).trim() } : null;
  }

  return question.options.find((option) => option.value === raw) ?? null;
}
