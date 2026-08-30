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
  /** Example pictures of what this option means. Empty for most options. */
  illustrationUrls: string[];
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
  // Null = no approved customer price for this branch's components, so the
  // route goes to review. Zero is a valid approved no-charge value.
  approvedComponentPriceCents: number | null;
  /** Set when this answer answers a route-access question. */
  accessClassification: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null;
  /** Shown only when the established route is FINISHED. Superseded by
   *  conditionalDisclaimers; kept while older trees still use it. */
  accessFinishedDisclaimer: string | null;
  /**
   * Text attached to this answer that applies only under a condition. The
   * client evaluates each against the access class established so far — the
   * same answer can carry one line for an open route and another for a
   * finished one without either being written twice.
   */
  conditionalDisclaimers: {
    text: string;
    accessClass: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null;
  }[];
  components: {
    quantity: number;
    conditionAccessClass: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null;
    conditionAnswerKey: string | null;
    conditionAnswerValue: string | null;
    component: {
      key: string;
      customerFacingLabel: string | null;
      approvedPriceCents: number | null;
      /**
       * Crew-hours this component adds. Present ONLY for a
       * TIME_AND_MATERIALS contractor, where the hours are shown to the
       * homeowner anyway — under FLAT_RATE it stays a cost input and stays on
       * the server, exactly as before.
       *
       * Null means "this contractor has no row for this component", which is
       * unresolved rather than zero: the estimate refuses instead of quietly
       * pricing the extra work at nothing.
       */
      addCrewHours?: number | null;
    };
  }[];
};

export type QuestionDTO = {
  id: string;
  key: string;
  prompt: string;
  helpText: string | null;
  inputType: "SINGLE_SELECT" | "MULTI_SELECT" | "NUMBER" | "PHOTO_UPLOAD" | "TEXT";
  /**
   * Help text that only applies on some routes. Evaluated client-side against
   * the access class established so far; `replaces` swaps out the default
   * rather than adding to it, for cases where the default is actively wrong —
   * the distance question tells customers to estimate the path through the
   * basement or attic, which is nonsense once they've said there isn't one.
   */
  conditionalHelp: {
    text: string;
    accessClass: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null;
    replaces: boolean;
  }[];
  order: number;
  options: AnswerOptionDTO[];
};

/**
 * What the BROWSER needs to render a flow — and nothing more.
 *
 * Crew-hours, material costs, markup and component labor used to come down
 * here and sat readable in the page source. The browser no longer prices
 * anything, so it no longer needs Elite's cost structure to do it.
 */
export type ServiceFlowDTO = {
  id: string;
  slug: string;
  name: string;
  bookingType: "INSTANT" | "ADJUSTED" | "REMOTE_QUOTE" | "TROUBLESHOOT_ONLY";
  basePrice: number | null; // cents
  whileWeThereBasePrice: number | null;
  startingPriceLabel: string | null;
  /** Overrides the booking button's wording. See Service.ctaLabel. */
  ctaLabel: string | null;
  shortDescription: string | null;
  icon: string | null; // service icon, already resolved against category fallback
  // Cost inputs used to live here so the browser could price a route. It
  // doesn't any more — the server does — so crew-hours, material costs,
  // markup and component labor are no longer in this payload. They were
  // readable in the page source.
  //
  // What remains is display data.
  estimatedMinutes: number | null;
  disclaimer: string | null; // for flat-price services with no question tree
  questions: QuestionDTO[]; // full tree, first question = questions[0]

  /**
   * Present ONLY for a TIME_AND_MATERIALS contractor — ADR-018.
   *
   * Every value here is one the homeowner is shown: the rate, the approved
   * band, and the hours. Nothing hidden travels. A FLAT_RATE contractor's
   * payload is unchanged, which keeps the earlier decision to strip cost
   * inputs from this DTO exactly as it was.
   */
  timeAndMaterials?: {
    crewHourRateCents: number;
    estimateLowCrewHours: number | null;
    estimateHighCrewHours: number | null;
    estimateApproved: boolean;
  } | null;
};

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}
