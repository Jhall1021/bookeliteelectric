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

/**
 * Describe the consecutive questions that `advanceFrom` will auto-answer from
 * a stored answer map, and reconstruct the answer state that existed before
 * the first of those questions was answered.
 *
 * The second half is what makes Back navigation honest after resume. A replay
 * that jumps Q1 -> Q2 -> Q3 must create the same snapshots that three real
 * clicks would have created; otherwise Back only knows about the intro screen,
 * and starting again immediately replays Q1/Q2 back to Q3.
 *
 * `supplementalKeys` covers answer fields collected alongside a question (for
 * example the doorway checkbox beside a distance field). They must disappear
 * from that question's pre-answer snapshot for the reconstructed history to
 * match an ordinary first pass.
 */
export function storedGuidedFlowReplay(
  questions: QuestionDTO[],
  startQuestionId: string | null,
  answers: Record<string, string>,
  supplementalKeys: (question: QuestionDTO) => readonly string[] = () => [],
): { path: QuestionDTO[]; baseAnswers: Record<string, string> } {
  const path: QuestionDTO[] = [];
  let currentId = startQuestionId;
  const visited = new Set<string>();

  while (currentId) {
    const question = questions.find((candidate) => candidate.id === currentId);
    if (!question || visited.has(question.id)) break;
    visited.add(question.id);

    const option = optionForStoredGuidedFlowAnswer(question, answers[question.key]);
    if (!option) break;
    path.push(question);
    if (option.routeAction !== "CONTINUE" || !option.nextQuestionId) break;
    currentId = option.nextQuestionId;
  }

  const baseAnswers = { ...answers };
  for (const question of path) {
    delete baseAnswers[question.key];
    for (const key of supplementalKeys(question)) delete baseAnswers[key];
  }
  return { path, baseAnswers };
}

/**
 * True only when the stored answers already walk this tree all the way to a
 * terminal outcome.
 *
 * An ACTIVE GuidedFlowSession is deliberately kept until a priced job is
 * actually added to a visit. That preserves an unfinished customer's work,
 * but it also means somebody who reaches the price screen, browses away, and
 * later starts the service again can still have a complete answer set on the
 * row. Replaying that set makes "Check My Price" skip every question and look
 * like the service has no tree at all.
 *
 * The storefront uses this predicate only at initial load: partial walks are
 * resumed, while a previously terminal walk starts with an empty local answer
 * set. The next real answer replaces the server mirror through the ordinary
 * optimistic-concurrency PATCH path.
 */
export function storedGuidedFlowAnswersReachTerminal(
  questions: QuestionDTO[],
  answers: Record<string, string>,
): boolean {
  let current = questions[0];
  if (!current) return false;

  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) return false;
    visited.add(current.id);

    const option = optionForStoredGuidedFlowAnswer(current, answers[current.key]);
    if (!option) return false;
    if (option.routeAction !== "CONTINUE") return true;
    if (!option.nextQuestionId) return false;

    const next = questions.find((question) => question.id === option.nextQuestionId);
    if (!next) return false;
    current = next;
  }

  return false;
}
