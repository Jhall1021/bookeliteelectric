/**
 * Canonical choices for the shared "what is below the work area" question.
 *
 * Keep the customer decision about ladder placement, not room names. A loft,
 * balcony or open entryway with a usable level floor is already covered by
 * the ordinary choice. Stairs, a stairwell and fixed obstructions all need the
 * same photo review, so they belong in one answer.
 */
export const WORK_AREA_BELOW_CHOICES = {
  level: {
    label: "A normal level floor",
    value: "level_floor",
  },
  obstructed: {
    label: "A stairway or stairwell, or furniture/built-ins that can't be moved",
    value: "obstructed",
  },
  unsure: {
    label: "I'm not sure",
    value: "unsure",
  },
} as const;

type ContinueOption =
  | { routeAction: "CONTINUE"; nextQuestionId: string }
  | { routeAction: "RESOLVE_INSTANT"; nextQuestionId: null };

export function workAreaBelowAnswerOptions(args: {
  questionId: string;
  continueOption: ContinueOption;
  reviewPhotoLabels: string[];
}) {
  return [
    {
      questionId: args.questionId,
      ...WORK_AREA_BELOW_CHOICES.level,
      ...args.continueOption,
      order: 1,
      requiredPhotoLabels: [],
    },
    {
      questionId: args.questionId,
      ...WORK_AREA_BELOW_CHOICES.obstructed,
      routeAction: "PHOTO_REVIEW" as const,
      photosBlockBooking: true,
      order: 2,
      requiredPhotoLabels: args.reviewPhotoLabels,
    },
    {
      questionId: args.questionId,
      ...WORK_AREA_BELOW_CHOICES.unsure,
      routeAction: "PHOTO_REVIEW" as const,
      photosBlockBooking: true,
      order: 3,
      requiredPhotoLabels: args.reviewPhotoLabels,
    },
  ];
}
