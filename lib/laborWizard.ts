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
 *      was provisioned with — the same SET of canonical materials AND, for
 *      every one of them the template gives a fixed quantity (not a
 *      policy-driven one), the same quantity. Quantity matters on its own:
 *      a service that still lists exactly RECEPTACLE_STANDARD but now
 *      replaces three of them instead of one is a different job than "a
 *      standard outlet replacement" describes, even though its material
 *      SET never changed. Either kind of divergence — a different
 *      ingredient or a different fixed quantity of the same one — excludes
 *      the service from the eligible set and surfaces it separately for
 *      manual review, never silently offered or silently dropped.
 *
 * A service with no templateKey at all — every hand-authored catalog,
 * including Elite's, which predates templating entirely — has no canonical
 * mapping to check and is never eligible for anything this module does. No
 * backfill, no per-contractor special case: the review screen points that
 * contractor at the manual pricing editor for that task instead of
 * pretending an inference could stand in for a mapping that does not exist.
 *
 * ENFORCED SERVER-SIDE, NOT JUST IN THE REVIEW SCREEN, INSIDE THE WRITE
 * TRANSACTION. The accept route re-resolves eligibility itself and refuses
 * outright if a submitted service id is not in it — a checkbox never
 * existing for an ineligible service is a UI convenience, not the
 * guarantee. That re-resolution runs INSIDE the same transaction as the
 * write it gates, using the transaction's own client, so the check and the
 * write share one consistent snapshot — a recipe edit landing between
 * "the review screen loaded" and "the contractor clicked accept" is
 * caught, because eligibility is decided again, freshly, at write time,
 * not trusted from whenever the page was rendered.
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
   * The platform's own canonical TemplateService.key for this outcome — a
   * real, reviewed provenance fact stamped at provisioning time
   * (Service.templateKey), never inferred from a recipe. Only a service
   * whose templateKey equals this is even a candidate for the task.
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
 * Electrical — the first question set. The engine above (eligibility
 * resolution, proposals, the accept route) is trade-agnostic; a second
 * trade adds its own array here, not a change to how any of this works.
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
  /** Provisioned from this task's canonical outcome, recipe (materials AND fixed quantities) unchanged since. The only services a checkbox can ever apply to. */
  eligible: EligibleService[];
  /** Provisioned from the canonical outcome, but the recipe or a fixed quantity has since diverged — excluded, surfaced for manual review only. */
  customized: CustomizedService[];
};

type Db = PrismaClient | Prisma.TransactionClient;

/** What the template specifies for one material role: a fixed quantity to compare against, or none when it's policy-driven. */
type OriginalSpec = { quantity: number | null; quantityIsPolicy: boolean };

const pairKey = (templateVersionId: string, templateKey: string) => `${templateVersionId}::${templateKey}`;

/**
 * The entire eligibility rule, in one place, server-side.
 *
 * For each task: find this contractor's services whose templateKey names
 * that task's canonical outcome, then require each one's CURRENT recipe to
 * still match the ORIGINAL TemplateService's recipe it was provisioned
 * with — same set of canonical materials, and for every one the template
 * pins to a fixed (non-policy) quantity, the same quantity. A service that
 * matches goes in `eligible`; a service whose recipe or a fixed quantity
 * has since diverged goes in `customized` and is never offered. A service
 * with no templateKey at all — every hand-authored catalog, Elite's
 * included — never appears in either list; there is no canonical mapping
 * to check, so there is nothing to be eligible FOR.
 *
 * Callers that need this check to hold at write time (the accept route)
 * pass a transaction client here and perform the write inside the SAME
 * transaction, so the check and the write share one snapshot.
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
      materials: { select: { canonicalMaterialId: true, quantity: true } },
    },
  });

  // One TemplateService lookup per DISTINCT (version, key) actually present
  // among this contractor's own services — never assumed from "the latest
  // version", since Service.templateVersionId already records exactly which
  // version this row came from.
  const pairs = [...new Set(
    candidates
      .filter((c): c is typeof c & { templateVersionId: string } => c.templateVersionId !== null)
      .map((c) => pairKey(c.templateVersionId, c.templateKey as string))
  )];
  const originalByPair = new Map<string, Map<string, OriginalSpec>>();
  for (const pair of pairs) {
    const sep = pair.indexOf("::");
    const templateVersionId = pair.slice(0, sep);
    const key = pair.slice(sep + 2);
    const ts = await db.templateService.findUnique({
      where: { templateVersionId_key: { templateVersionId, key } },
      select: { materials: { select: { canonicalMaterialId: true, quantity: true, quantityIsPolicy: true } } },
    });
    if (ts) {
      originalByPair.set(
        pair,
        new Map(ts.materials.map((m) => [m.canonicalMaterialId, { quantity: m.quantity, quantityIsPolicy: m.quantityIsPolicy }]))
      );
    }
  }

  return tasks.map((task) => {
    const eligible: EligibleService[] = [];
    const customized: CustomizedService[] = [];
    for (const svc of candidates) {
      if (svc.templateKey !== task.templateServiceKey || svc.templateVersionId === null) continue;
      const pair = pairKey(svc.templateVersionId, svc.templateKey);
      const original = originalByPair.get(pair);
      const currentQuantityByMaterial = new Map(svc.materials.map((m) => [m.canonicalMaterialId, m.quantity]));

      const sameIngredients =
        original !== undefined &&
        original.size === currentQuantityByMaterial.size &&
        [...original.keys()].every((id) => currentQuantityByMaterial.has(id));

      // Only a fixed (non-policy) template quantity is comparable — a
      // policy-driven one (e.g. "one per device", quantity null in the
      // template) has no single number to check a current recipe against.
      const sameFixedQuantities =
        sameIngredients &&
        [...original!.entries()].every(([id, spec]) => {
          if (spec.quantityIsPolicy || spec.quantity === null) return true;
          return currentQuantityByMaterial.get(id) === spec.quantity;
        });

      if (sameIngredients && sameFixedQuantities) {
        eligible.push({ id: svc.id, slug: svc.slug, name: svc.name, fieldLaborHours: svc.fieldLaborHours });
      } else {
        customized.push({ id: svc.id, slug: svc.slug, name: svc.name });
      }
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
