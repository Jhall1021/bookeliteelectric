export type AnswerOptionData = {
  id: string;
  label: string;
  routeAction: string;
  priceModifierCents: number;
  referencedServiceId: string | null;
  referencedServiceName: string | null;
  rerouteServiceId: string | null;
  rerouteServiceName: string | null;
  nextQuestionId: string | null;
  disclaimer: string | null;
  requiredPhotoLabels: string[];
  photosBlockBooking: boolean;
};

export type QuestionData = {
  id: string;
  prompt: string;
  helpText: string | null;
  options: AnswerOptionData[];
};

export type ServiceOption = { id: string; name: string };

export const ROUTE_ACTION_LABELS: Record<string, string> = {
  CONTINUE: "Continue to next question",
  RESOLVE_INSTANT: "Resolves to a price",
  RESOLVE_ADJUSTED: "Resolves to a price (adjusted)",
  REMOTE_QUOTE: "Sends to remote quote",
  REROUTE_SERVICE: "Reroutes to a different service",
  REROUTE_TROUBLESHOOTING: "Reroutes to Troubleshooting",
  PHOTO_REVIEW: "Requires photo review",
};

export const PRICED_ACTIONS = ["RESOLVE_INSTANT", "RESOLVE_ADJUSTED", "CONTINUE"];

let tempCounter = 0;
export const nextTempId = () => `new-${Date.now()}-${tempCounter++}`;

export function blankOption(): AnswerOptionData {
  return {
    id: nextTempId(),
    label: "",
    routeAction: "RESOLVE_INSTANT",
    priceModifierCents: 0,
    referencedServiceId: null,
    referencedServiceName: null,
    rerouteServiceId: null,
    rerouteServiceName: null,
    nextQuestionId: null,
    disclaimer: null,
    requiredPhotoLabels: [],
    photosBlockBooking: true,
  };
}

export function blankQuestion(): QuestionData {
  return { id: nextTempId(), prompt: "", helpText: null, options: [blankOption()] };
}

/**
 * Per option id: a warning when this is the ONLY path anywhere in the tree
 * that continues to its own `nextQuestionId` target — deleting it would
 * leave that question unreachable with nothing telling anyone. This is the
 * gap the tree editor never checked for: question deletion was already
 * guarded against a dangling reference, but deleting the one answer that
 * happened to be the last path TO a question was not.
 *
 * Not "does something point at this option" (nothing ever does — nothing
 * in this model references an option by id); it's "does this option's own
 * outbound CONTINUE link become the tree's last one to that question".
 *
 * A pure function of the tree so it can be tested and reasoned about apart
 * from the editor's own state management.
 */
export function computeOptionDeleteImpacts(questions: QuestionData[]): Map<string, string> {
  const continueCountByTarget = new Map<string, number>();
  for (const q of questions) {
    for (const o of q.options) {
      if (o.routeAction === "CONTINUE" && o.nextQuestionId) {
        continueCountByTarget.set(o.nextQuestionId, (continueCountByTarget.get(o.nextQuestionId) ?? 0) + 1);
      }
    }
  }
  const impacts = new Map<string, string>();
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const q of questions) {
    for (const o of q.options) {
      if (o.routeAction === "CONTINUE" && o.nextQuestionId && continueCountByTarget.get(o.nextQuestionId) === 1) {
        const target = byId.get(o.nextQuestionId);
        impacts.set(
          o.id,
          `This is the only path to "${target?.prompt || "(unnamed question)"}" — deleting it leaves that question unreachable.`
        );
      }
    }
  }
  return impacts;
}

/**
 * The plain-language "what happens next" for one answer — read entirely
 * from the answer's own saved routing fields, never from its position in
 * the list. `questionsById`/`troubleshootingServiceName` are lookups, not
 * inference: a CONTINUE answer's destination is whatever `nextQuestionId`
 * actually names right now, even if that question was just moved.
 */
export function whatHappensNext(
  o: AnswerOptionData,
  questionsById: Map<string, QuestionData>,
  troubleshootingServiceName: string | null
): string {
  switch (o.routeAction) {
    case "CONTINUE": {
      const next = o.nextQuestionId ? questionsById.get(o.nextQuestionId) : undefined;
      return next ? `Ask "${next.prompt || "(unnamed question)"}"` : "Dead-ends — no next question chosen";
    }
    case "RESOLVE_INSTANT":
    case "RESOLVE_ADJUSTED":
      if (o.referencedServiceId) return `Prices at "${o.referencedServiceName}"'s current price`;
      if (o.priceModifierCents === 0) return "Prices at the base price, no adjustment";
      return `${o.priceModifierCents > 0 ? "Adds" : "Subtracts"} ${Math.abs(o.priceModifierCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`;
    case "REMOTE_QUOTE":
      return "Sends to a remote quote" + (o.requiredPhotoLabels.length > 0 ? " with photos" : "");
    case "REROUTE_SERVICE":
      return o.rerouteServiceName ? `Open "${o.rerouteServiceName}"` : "Reroutes — no service chosen";
    case "REROUTE_TROUBLESHOOTING":
      return troubleshootingServiceName ? `Open ${troubleshootingServiceName}` : "Reroutes to Troubleshooting — not resolvable for this trade";
    case "PHOTO_REVIEW":
      return o.photosBlockBooking
        ? "Requires photo review before booking"
        : "Books now; photos prep the technician";
    default:
      return o.routeAction;
  }
}
