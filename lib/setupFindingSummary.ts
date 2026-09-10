import type { Finding } from "./onboardingReadiness";

/**
 * A short, plain-language sentence for one finding — never the raw engine
 * message, which is written for the Guided Setup review screens (and names
 * the service by its machine slug, e.g. "replace-standard-outlet"). The
 * engine message stays the technical record of record; this is the gloss a
 * contractor reads on the dashboard, with the ACTION living on the button
 * next to it (see setupActionLabels.ts), not repeated here.
 */
const SERVICE_FINDING_SUMMARY: Record<string, (name: string) => string> = {
  TREE_HAS_DEAD_ROUTE: (name) => `Some answers for ${name} lead to a dead end instead of a price or a booking.`,
  HANDOFF_NOT_LIVE_YET: (name) => `${name} hands a customer off to a diagnostic that isn't live yet — launching it resolves this on its own.`,
  PRICE_NOT_APPROVED: (name) => `${name}'s price hasn't been approved for customers yet.`,
  LABOR_INPUTS_MISSING: (name) => `${name} is missing an input its price depends on.`,
  PRICE_DRIFTED: (name) => `${name}'s approved price no longer matches what it would charge today.`,
  SUGGESTED_NOT_APPROVED: (name) => `${name} has a suggested price waiting for your approval.`,
  ESTIMATE_BOUNDS_MISSING: (name) => `${name}'s estimate range hasn't been set.`,
  ESTIMATE_BOUNDS_INVALID: (name) => `${name}'s estimate range needs a second look.`,
  ESTIMATE_NOT_APPROVED: (name) => `${name} has an estimate range that hasn't been approved for customers yet.`,
  TREE_UNBOUNDED: (name) => `${name} prices every answer automatically, with nothing routed to your review.`,
  MATERIAL_COST_ON_HOLD: (name) => `${name} depends on material costs still on hold.`,
  PRE_WORK_WITHOUT_DEPOSIT: (name) => `${name} needs a site visit before installation, but takes no deposit to book.`,
};

/**
 * The dashboard-facing gloss of one finding: a plain sentence with the
 * service's real name (never its slug). Falls back to substituting the
 * name over the slug in the engine's own message for any code not listed
 * above — a safety net, not the primary path, so this never regresses to
 * showing raw machine language for a code nobody has written a sentence for.
 */
export function findingSummary(f: Finding): string {
  if (f.serviceName && f.code in SERVICE_FINDING_SUMMARY) {
    return SERVICE_FINDING_SUMMARY[f.code](f.serviceName);
  }
  if (f.serviceSlug && f.serviceName) {
    return f.message.split(f.serviceSlug).join(f.serviceName);
  }
  return f.message;
}

/**
 * The headline for a GROUP of 2+ findings on the same service.
 *
 * "Before it can go live" is only true of a service that has never
 * activated. `activationRefusal` (lib/serviceActivation.ts) only ever gates
 * the transition INTO active — it does not re-check an already-live service,
 * so a live service can genuinely pick up a blocker afterward (a labor input
 * cleared, a catalog edit breaks a route). Telling a contractor their live
 * service "can't go live" is the exact contradiction `serviceActive` exists
 * to prevent: an active service gets "needs attention" language instead.
 */
export function groupHeadline(findings: Finding[]): string {
  const primary = findings[0];
  const name = primary.serviceName ?? "This service";
  const n = findings.length;
  if (primary.serviceActive) {
    return `${name} is live, but ${n} issue${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention.`;
  }
  return `${name} has ${n} issue${n === 1 ? "" : "s"} to resolve before it can go live.`;
}
