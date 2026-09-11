/**
 * §22 of the brief: the explicit incomplete/uncertain state, and the
 * homeowner-facing recovery copy for each reason. "Never fabricate
 * geometry" means every one of these ends the build attempt outright —
 * there is no partial `RouteAssistResult` alongside a reason code.
 */

import type { RouteAssistIncompleteReason } from "./taxonomy";
import type { RouteAssistIncomplete } from "./types";

const RECOVERY: Record<
  RouteAssistIncompleteReason,
  { prompt: string; recovery: RouteAssistIncomplete["recovery"] }
> = {
  ROUTE_NOT_FULLY_VISIBLE: {
    prompt: "We can't see the entire route. Take one more photo showing the doorway and the new location.",
    recovery: "RETAKE_PHOTO",
  },
  SOURCE_NOT_CLEAR: {
    prompt: "We couldn't clearly see the starting point. Take another photo with the existing receptacle or switch in view.",
    recovery: "RETAKE_PHOTO",
  },
  DESTINATION_NOT_CLEAR: {
    prompt: "We couldn't clearly see where the new device should go. Take another photo showing that spot.",
    recovery: "RETAKE_PHOTO",
  },
  INSUFFICIENT_ROOM_CONTEXT: {
    prompt: "We need to see more of the room to understand the route. Take a wider photo if you can.",
    recovery: "RETAKE_PHOTO",
  },
  MULTIPLE_POSSIBLE_ROUTES: {
    prompt: "There's more than one way to connect these points from what we can see. We'll send this to your contractor to confirm the best route.",
    recovery: "CONTRACTOR_REVIEW",
  },
  GEOMETRY_LOW_CONFIDENCE: {
    prompt: "We're not confident about this route yet. Your contractor will confirm it before starting work.",
    recovery: "CONTRACTOR_REVIEW",
  },
};

export function incompleteResult(reason: RouteAssistIncompleteReason): RouteAssistIncomplete {
  const copy = RECOVERY[reason];
  return { reason, recoveryPrompt: copy.prompt, recovery: copy.recovery };
}
