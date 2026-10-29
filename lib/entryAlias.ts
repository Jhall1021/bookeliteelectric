type EntryAliasFlow = {
  questions: {
    options: {
      routeAction: string;
      rerouteServiceId?: string | null;
    }[];
  }[];
};

/**
 * A one-question, one-answer reroute is a catalog entry alias, not a customer
 * who chose the wrong service. Its only answer presets a fact for the shared
 * destination flow, so the handoff should be seamless.
 */
export function isSingleChoiceEntryAlias(flow: EntryAliasFlow): boolean {
  if (flow.questions.length !== 1) return false;
  const question = flow.questions[0];
  return question.options.length === 1
    && question.options[0].routeAction === "REROUTE_SERVICE"
    && Boolean(question.options[0].rerouteServiceId);
}
