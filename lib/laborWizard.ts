/**
 * Conversational labor calibration — a few scoped answers that generate
 * reviewable elapsed-task-time proposals across a small, explicitly named
 * set of tasks.
 *
 * WHICH SERVICES A TASK APPLIES TO IS NEVER DERIVED FROM A RECIPE. An
 * earlier version of this module matched services by "carries the task's
 * canonical material role and everything else in the recipe is on a small
 * incidental-hardware allowlist" — which is still automatic recipe
 * similarity wearing a narrower disguise. It was wrong in a concrete way: a
 * REPLACEMENT task's recipe can legitimately include a box (an existing
 * outlet whose box also needs swapping) without the contractor's answer
 * about "replace a standard outlet" covering box work at all — the two are
 * different facts, and no fixed "this material is always incidental" list
 * can tell them apart from the recipe alone. Proving one distractor (a
 * receptacle-plus-breaker service) gets excluded does not prove every
 * OTHER match the rule accepts is actually right.
 *
 * So this module names no material role for any task, and matches nothing
 * itself. `listServiceCandidates` returns a contractor's own services,
 * unfiltered, with each one's current pricing inputs and (when known) which
 * canonical platform outcome it was provisioned from — a real, already-
 * reviewed provenance fact (Service.templateKey), never a guess from
 * ingredients. The task's own `templateServiceKey` is offered only as a
 * PRE-SELECTED default in that list; the contractor's own confirmation in
 * the review screen is what actually decides which of their services this
 * task's time applies to. That confirmation IS the explicit mapping this
 * module used to try to compute — moved to the one place it can actually be
 * gotten right: the person who knows what each of their services does.
 *
 * WHAT THIS WRITES, AND ONLY THIS. Every accepted proposal becomes
 * `Service.fieldLaborHours`, through lib/servicePricingInputs.ts's shared
 * partial-write authority — nothing else.
 *
 *   - Never `requiresTechCount`. Crew size is asked in the conversation for
 *     CONTEXT and wording only ("with your usual crew, how long does...").
 *     lib/pricing.ts's crew-hour rate already covers the contractor's normal
 *     crew; multiplying elapsed time by a headcount would double-count labor
 *     the rate already includes — exactly the bug `compute()`'s own history
 *     warns against. A task the contractor says needs a DIFFERENT crew than
 *     usual is excluded from the proposal entirely (see `crew_mismatch`
 *     below) rather than guessed at.
 *   - Never `wwtLaborHours`. The conversation asks about a task as its own
 *     dispatched visit; a While-We're-There add-on's elapsed time is a
 *     different question this slice does not ask, so the field is left
 *     exactly as it already was.
 *   - Never any PricingSettings field, never a new rate dimension. Visit
 *     overhead is explicitly out of scope for this slice.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export type LaborTaskDefinition = {
  key: string;
  /**
   * The platform's own canonical TemplateService.key for this outcome, when
   * one exists — a real, reviewed provenance fact stamped at provisioning
   * time (Service.templateKey), never inferred from a recipe. Used only to
   * PRE-CHECK a likely match in the candidate list; a service whose
   * templateKey is null (every hand-authored catalog that predates
   * templating, including Elite's) still appears in the list, unchecked,
   * for the contractor to confirm explicitly.
   */
  templateServiceKey: string;
  /** How this task reads inside a sentence: "how long does {label} take?" */
  label: string;
  /** How this task reads as a review-row heading. */
  displayName: string;
  includes: string;
  excludes: string;
  /** Undefined for the anchor task. Set for every task asked relative to it. */
  relativeTo?: string;
};

/**
 * Electrical — the first question set. The engine above (candidate listing,
 * proposals, the accept route) is trade-agnostic; a second trade adds its
 * own array here, not a change to how any of this works.
 *
 * INSPECTED, NOT ASSUMED. Each templateServiceKey below was checked against
 * the platform's own TemplateService definition of the same key before
 * being used here — confirming its actual scope matches this task's
 * includes/excludes, not just that the name sounds right.
 */
export const ELECTRICAL_LABOR_TASKS: LaborTaskDefinition[] = [
  {
    key: "outlet_replacement",
    templateServiceKey: "replace-standard-outlet",
    label: "a standard outlet replacement",
    displayName: "Replace a standard duplex receptacle",
    includes:
      "Removing the old device, connecting and setting the new device, verifying power, closing the cover plate.",
    excludes:
      "Repairing or replacing wiring or the box, any troubleshooting beyond the swap, travel to/from the truck, permit or inspection time.",
  },
  {
    key: "switch_replacement",
    templateServiceKey: "replace-standard-switch",
    label: "a standard switch replacement",
    displayName: "Replace a standard single-pole switch",
    includes: "The same scope as the outlet replacement above, for a switch instead of a receptacle.",
    excludes: "Repairing or replacing wiring or the box, any troubleshooting beyond the swap.",
    relativeTo: "outlet_replacement",
  },
  {
    key: "gfci_replacement",
    templateServiceKey: "replace-gfci-outlet",
    label: "replacing an existing GFCI receptacle",
    displayName: "Replace an existing GFCI receptacle",
    includes:
      "Removing the old GFCI device, connecting and setting the new one, testing the test/reset buttons, closing the cover plate.",
    excludes:
      "Installing NEW GFCI protection where none existed, troubleshooting existing wiring, repairing or replacing the box.",
    relativeTo: "outlet_replacement",
  },
];

export type ServiceCandidate = {
  id: string;
  slug: string;
  name: string;
  /** The canonical outcome this row was provisioned from, if any — null for every hand-authored service. */
  templateKey: string | null;
  fieldLaborHours: number | null;
  wwtLaborHours: number | null;
  requiresTechCount: number;
};

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Every one of this contractor's own services, unfiltered — the shared
 * mechanism's entire contribution to "which services does this task apply
 * to". No task, no material role, no recipe is consulted here; the caller
 * (the review screen) pre-checks candidates by templateKey and lets the
 * contractor confirm, add, or remove from the full list.
 */
export async function listServiceCandidates(db: Db, contractorId: string): Promise<ServiceCandidate[]> {
  const services = await db.service.findMany({
    where: { contractorId },
    select: {
      id: true, slug: true, name: true, templateKey: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
    },
    orderBy: { name: "asc" },
  });
  return services;
}

/**
 * One task's proposed elapsed minutes and how it was derived — every case
 * traceable to something the contractor typed, never to recipe similarity.
 */
export type TaskProposal =
  /** Answered directly — the anchor task, or a derived task the contractor said does NOT share the anchor's time. */
  | { taskKey: string; kind: "entered"; minutes: number }
  /** "Do these usually take about the same time?" answered yes. */
  | { taskKey: string; kind: "same_time"; minutes: number; anchorLabel: string }
  /** An extra-time delta relative to the anchor, answered directly. */
  | { taskKey: string; kind: "delta"; minutes: number; anchorMinutes: number; deltaMinutes: number; anchorLabel: string }
  /** The contractor said this task needs a different crew than the one the anchor answer covers. Never a number — flagged for manual pricing review instead of an invented adjustment. */
  | { taskKey: string; kind: "crew_mismatch" };

export function describeProposal(p: TaskProposal): string {
  switch (p.kind) {
    case "entered":
      return "entered directly";
    case "same_time":
      return `same as ${p.anchorLabel}, per your answer`;
    case "delta":
      return `${p.anchorLabel} (${p.anchorMinutes} min) + your stated allowance (${p.deltaMinutes} min)`;
    case "crew_mismatch":
      return "needs a different crew than the one covered above — set this one manually";
  }
}
