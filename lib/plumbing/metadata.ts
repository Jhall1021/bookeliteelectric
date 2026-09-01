/**
 * Four pieces of metadata every plumbing service declares, and what each one
 * makes the platform DO.
 *
 * These are behaviors rather than labels. A service that declares
 * `preWork: "REQUIRED"` causes a PRE_WORK appointment to be scheduled at
 * booking and installation to be blocked until it completes; a service that
 * declares `permit: "EXCLUDED"` causes lib/permitPolicy.ts's exact sentence to
 * be attached. Nothing here is decorative, and nothing here is optional — a
 * service with a missing declaration is refused by the verifier rather than
 * defaulted, because every default available is a promise made on a
 * contractor's behalf.
 */

/**
 * Whether a permit fee is inside the price.
 *
 * Binds to lib/permitPolicy.ts, which owns the two sentences and forbids a
 * third. Plumbing does not get its own wording: a customer comparing an
 * electrical service to a plumbing one on the same storefront should meet the
 * same words, and six near-identical sentences are six things to keep in step.
 *
 * Note that PERMIT_INCLUDED_DISCLAIMER is currently worded for electrical
 * work. Attaching it to a plumbing service needs a trade-aware sentence in
 * that shared module — recorded in docs/design/plumbing-shared-integrations.md
 * rather than patched here, because permitPolicy.ts is deliberately the only
 * copy and a plumbing-local variant would defeat it.
 */
export type PermitPosture = "EXCLUDED" | "INCLUDED";

/**
 * What photographs are for on this service.
 *
 * Mirrors the platform PhotoState enum exactly. Plumbing sits at
 * REVIEW_REQUIRED more often than electrical, because the deciding facts —
 * vent type, pipe material, valve condition, cleanout presence — are visible,
 * and visible is precisely what Visual Assist reads.
 */
export type PhotoPosture = "NONE" | "PREPARATION" | "REVIEW_REQUIRED";

/**
 * Whether the sold scope is verified on site before the work is done.
 *
 * REQUIRED is not a hedge about the price. The price already given stands; the
 * visit establishes that the house matches the scope that price described,
 * and finding something outside it opens a change-approval conversation rather
 * than silently repricing. That distinction is already modeled by
 * PreWorkScopeState and is not re-litigated here.
 *
 * OPTIONAL means the contractor may opt the service in. NOT_APPLICABLE means
 * there is nothing to verify — a flapper is a flapper.
 */
export type PreWorkPosture = "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";

/**
 * Whether this service can be sold as the reason for a visit.
 *
 * Maps to TemplateService.isPrimaryEligible and to the While We're There
 * pricing path. Replacing a supply line is real work and a terrible reason to
 * send a van; offering it as a primary service sells a visit that cannot pay
 * for itself, and the service-call minimum then makes the customer's price
 * look absurd for what they get.
 */
export type VisitPosture = "PRIMARY_ELIGIBLE" | "WHILE_WE_ARE_THERE_ONLY";

export type PlumbingMetadata = {
  permit: PermitPosture;
  photo: PhotoPosture;
  preWork: PreWorkPosture;
  visit: VisitPosture;
};

export const PERMIT_POSTURES: readonly PermitPosture[] = ["EXCLUDED", "INCLUDED"];
export const PHOTO_POSTURES: readonly PhotoPosture[] = ["NONE", "PREPARATION", "REVIEW_REQUIRED"];
export const PRE_WORK_POSTURES: readonly PreWorkPosture[] = ["REQUIRED", "OPTIONAL", "NOT_APPLICABLE"];
export const VISIT_POSTURES: readonly VisitPosture[] = ["PRIMARY_ELIGIBLE", "WHILE_WE_ARE_THERE_ONLY"];

export const METADATA_BEHAVIORS = [
  {
    key: "permit",
    behavior: "Attaches the exact permit sentence from lib/permitPolicy.ts.",
    values: PERMIT_POSTURES,
  },
  {
    key: "photo",
    behavior: "Sets Service.photoState and decides whether photos gate booking.",
    values: PHOTO_POSTURES,
  },
  {
    key: "preWork",
    behavior: "Schedules a PRE_WORK appointment at booking and blocks installation until it completes.",
    values: PRE_WORK_POSTURES,
  },
  {
    key: "visit",
    behavior: "Sets isPrimaryEligible and selects the While We're There price path (no service-call minimum).",
    values: VISIT_POSTURES,
  },
] as const;

/**
 * Metadata that contradicts itself, caught before it can be provisioned.
 *
 * The two combinations below are not merely odd, they are unservable:
 *
 *   A While-We're-There-only service that requires a pre-work visit asks for a
 *   verification trip to confirm the scope of something that by definition
 *   only ever happens on a trip already being made for something else.
 *
 *   A service whose photos GATE the price and which also promises no photos is
 *   two settings claiming to own the same decision.
 */
export function metadataProblems(m: PlumbingMetadata): string[] {
  const problems: string[] = [];
  if (m.visit === "WHILE_WE_ARE_THERE_ONLY" && m.preWork === "REQUIRED")
    problems.push("a While We're There service cannot require its own pre-work visit");
  if (m.preWork === "REQUIRED" && m.photo === "NONE")
    problems.push("a service verified on site should at least prepare the technician with photos");
  return problems;
}
