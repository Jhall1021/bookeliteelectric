// Shared shape between the API and the GuidedFlowEngine component.
// Mirrors the Prisma models but only exposes what the client needs.

export type RouteAction =
  | "CONTINUE"
  | "RESOLVE_INSTANT"
  | "RESOLVE_ADJUSTED"
  | "REMOTE_QUOTE"
  | "REROUTE_SERVICE"
  | "REROUTE_TROUBLESHOOTING"
  | "PHOTO_REVIEW";

export type AnswerOptionDTO = {
  id: string;
  label: string;
  value: string;
  priceModifierCents: number;
  nextQuestionId: string | null;
  routeAction: RouteAction;
  rerouteServiceId: string | null;
  /**
   * Fully resolved photo labels for this answer: any referenced photo groups
   * expanded in order, followed by loose per-answer labels. The flow renders
   * this and doesn't need to know which came from where.
   */
  requiredPhotoLabels: string[];
  /**
   * Safety instructions from the groups used, de-duplicated. Shown once
   * alongside the uploads rather than repeated on every label.
   */
  photoSafetyNotes: string[];
  disclaimer: string | null;
  // PHOTO_REVIEW only. false = the price is already locked and these photos
  // are prep for the technician, so the customer can book right away. true
  // (default) = photos gate the booking; the office prices it and replies.
  photosBlockBooking: boolean;

  // --- Component-based configuration (handoff §13-§15) ------------------
  // Absolute overrides replace the service's value; deltas stack onto it.
  overrideEstimatedMinutes: number | null;
  overrideTechCount: number | null;
  overrideFieldLaborHours: number | null;
  addFieldLaborHours: number | null;
  addMaterialCostCents: number | null;
  addScheduleMinutes: number | null;
  // Null = no approved customer price for this branch's components, so the
  // route goes to review. Zero is a valid approved no-charge value.
  approvedComponentPriceCents: number | null;
  /** Set when this answer answers a route-access question. */
  accessClassification: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null;
  components: {
    quantity: number;
    conditionAccessClass: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null;
    conditionAnswerKey: string | null;
    conditionAnswerValue: string | null;
    component: {
      key: string;
      customerFacingLabel: string | null;
      approvedPriceCents: number | null;
      addFieldLaborHours: number;
      addMaterialCostCents: number;
      addScheduleMinutes: number;
      addTechCount: number;
    };
  }[];
};

export type QuestionDTO = {
  id: string;
  key: string;
  prompt: string;
  helpText: string | null;
  inputType: "SINGLE_SELECT" | "MULTI_SELECT" | "NUMBER" | "PHOTO_UPLOAD" | "TEXT";
  order: number;
  options: AnswerOptionDTO[];
};

export type ServiceFlowDTO = {
  id: string;
  slug: string;
  name: string;
  bookingType: "INSTANT" | "ADJUSTED" | "REMOTE_QUOTE" | "TROUBLESHOOT_ONLY";
  basePrice: number | null; // cents
  whileWeThereBasePrice: number | null;
  startingPriceLabel: string | null;
  shortDescription: string | null;
  icon: string | null; // service icon, already resolved against category fallback
  // Inputs for the configuration the engine accumulates. fieldLaborHours may
  // be null — that suppresses the INTERNAL suggested price but never stops a
  // customer booking at the published price.
  fieldLaborHours: number | null;
  materialCostCents: number | null;
  estimatedMinutes: number | null;
  requiresTechCount: number;
  disclaimer: string | null; // for flat-price services with no question tree
  questions: QuestionDTO[]; // full tree, first question = questions[0]
};

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}
