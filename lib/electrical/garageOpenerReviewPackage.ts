export function isReviewedGarageOpenerRequest(answers: Record<string, string>): boolean {
  return answers.garage_opener_scope_review === "continue";
}
