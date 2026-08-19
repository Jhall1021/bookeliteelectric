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
  requiredPhotoLabels: string[];
  disclaimer: string | null;
  // PHOTO_REVIEW only. false = the price is already locked and these photos
  // are prep for the technician, so the customer can book right away. true
  // (default) = photos gate the booking; the office prices it and replies.
  photosBlockBooking: boolean;
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
  disclaimer: string | null; // for flat-price services with no question tree
  questions: QuestionDTO[]; // full tree, first question = questions[0]
};

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}
