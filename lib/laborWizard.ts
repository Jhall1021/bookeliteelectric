/**
 * Conversational labor calibration — a few scoped answers that generate
 * reviewable elapsed-task-time proposals across a small, explicitly named
 * set of tasks.
 *
 * WHICH SERVICES A TASK APPLIES TO IS NEVER DERIVED FROM A RECIPE, AND
 * NEVER LEFT TO A CHECKBOX. Two earlier designs both failed this the same
 * way, from different directions:
 *
 *   1. Matching by "carries the task's canonical material role and
 *      everything else in the recipe is on a small incidental-hardware
 *      allowlist" is automatic recipe similarity wearing a narrower
 *      disguise. Concretely wrong: a REPLACEMENT task's recipe can
 *      legitimately include a box without the contractor's answer about
 *      "replace a standard outlet" covering box work at all.
 *   2. Offering the contractor's ENTIRE catalog as an unrestricted
 *      checklist moves the same undecided question onto the contractor
 *      instead of solving it — a checkbox can still make an unrelated
 *      service eligible, and nothing stops it.
 *
 * ELIGIBILITY IS THE CANONICAL MAPPING ITSELF, established once, server-
 * side, from real platform provenance:
 *
 *   1. Service.templateKey names which TemplateService this row was
 *      provisioned from — a fact stamped at provisioning time, never
 *      inferred. Only a service whose templateKey equals a task's own
 *      templateServiceKey is even a CANDIDATE.
 *   2. That candidate's CURRENT recipe (ServiceMaterial) must still match
 *      the ORIGINAL TemplateService's recipe (TemplateServiceMaterial) it
 *      was provisioned with, exactly. A contractor who customized a
 *      templated service's scope since — added a part, changed what it
 *      covers — has made it something the template no longer describes,
 *      and it is excluded from the eligible set and surfaced separately
 *      for manual review, never silently offered or silently dropped.
 *
 * A service with no templateKey at all — every hand-authored catalog,
 * including Elite's, which predates templating entirely — has no canonical
 * mapping to check and is never eligible for anything this module does. No
 * backfill, no per-contractor special case: the review screen points that
 * contractor at the manual pricing editor for that task instead of
 * pretending an inference could stand in for a mapping that does not exist.
 *
 * ENFORCED SERVER-SIDE, NOT JUST IN THE REVIEW SCREEN. The accept route
 * re-resolves eligibility itself and refuses outright if a submitted
 * service id is not in it — a checkbox never existing for an ineligible
 * service is a UI convenience, not the guarantee.
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

export type EligibleService = {
  id: string;
  slug: string;
  name: string;
  fieldLaborHours: number | null;
};

/** A templated service whose current recipe no longer matches its own template — flagged, never offered. */
export type CustomizedService = { id: string; slug: string; name: string };

export type TaskEligibility = {
  task: LaborTaskDefinition;
  /** Provisioned from this task's canonical outcome, recipe unchanged since. The only services a checkbox can ever apply to. */
  eligible: EligibleService[];
  /** Provisioned from the canonical outcome, but the recipe has since diverged from it — excluded, surfaced for manual review only. */
  customized: CustomizedService[];
};

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The entire eligibility rule, in one place, server-side.
 *
 * For each task: find this contractor's services whose templateKey names
 * that task's canonical outcome, then require each one's CURRENT recipe to
 * still be the exact set of canonical materials the ORIGINAL TemplateService
 * was provisioned with. A service that matches goes in `eligible`; a
 * service whose recipe has since diverged goes in `customized` and is never
 * offered. A service with no templateKey at all — every hand-authored
 * catalog, Elite's included — never appears in either list; there is no
 * canonical mapping to check, so there is nothing to be eligible FOR.
 */
export async function resolveTaskEligibility(
  db: Db,
  contractorId: string,
  tasks: LaborTaskDefinition[]
): Promise<TaskEligibility[]> {
  const candidates = await db.service.findMany({
    where: { contractorId, templateKey: { in: tasks.map((t) => t.templateServiceKey) } },
    select: {
      id: true, slug: true, name: true, fieldLaborHours: true,
      templateKey: true, templateVersionId: true,
      materials: { select: { canonicalMaterialId: true } },
    },
  });

  // One TemplateService lookup per DISTINCT (version, key) actually present
  // among this contractor's own services — never assumed from "the latest
  // version", since Service.templateVersionId already records exactly which
  // version this row came from.
  const pairs = [...new Set(
    candidates
      .filter((c): c is typeof c & { templateVersionId: string } => c.templateVersionId !== null)
      .map((c) => `${c.templateVersionId} ${c.templateKey}`)
  )];
  const originalRecipeByPair = new Map<string, Set<string>>();
  for (const pair of pairs) {
    const [templateVersionId, key] = pair.split(" ");
    const ts = await db.templateService.findUnique({
      where: { templateVersionId_key: { templateVersionId, key } },
      select: { materials: { select: { canonicalMaterialId: true } } },
    });
    if (ts) originalRecipeByPair.set(pair, new Set(ts.materials.map((m) => m.canonicalMaterialId)));
  }

  return tasks.map((task) => {
    const eligible: EligibleService[] = [];
    const customized: CustomizedService[] = [];
    for (const svc of candidates) {
      if (svc.templateKey !== task.templateServiceKey) continue;
      const pair = `${svc.templateVersionId} ${svc.templateKey}`;
      const original = originalRecipeByPair.get(pair);
      const current = new Set(svc.materials.map((m) => m.canonicalMaterialId));
      const unchanged =
        original !== undefined && original.size === current.size && [...original].every((id) => current.has(id));
      if (unchanged) eligible.push({ id: svc.id, slug: svc.slug, name: svc.name, fieldLaborHours: svc.fieldLaborHours });
      else customized.push({ id: svc.id, slug: svc.slug, name: svc.name });
    }
    return { task, eligible, customized };
  });
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
