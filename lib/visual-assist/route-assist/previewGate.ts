/**
 * Whether an environment-only Route Assist camera/vision endpoint may run.
 *
 * Route Assist's live semantic vision path (real camera photos, a real AI
 * provider call) is preview-only today — no environment gate exists yet on
 * ordinary customer traffic reaching a real vision model. This is the single
 * shared check both the throwaway dev-fixtures endpoint and the real
 * guided-flow-sessions endpoint must use, so "preview-only" is one fact in
 * one place rather than two independently-maintained copies that can drift.
 *
 * Going live for real customers is a deliberate later decision (removing or
 * changing this gate on the real endpoint), not something that should happen
 * by accident because a second copy of this check was never added.
 */
export function isRouteAssistPreviewAllowedV1(): boolean {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development";
}
