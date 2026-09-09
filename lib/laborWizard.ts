/**
 * Conversational labor calibration — a few scoped answers that generate
 * reviewable elapsed-task-time proposals across a small, explicitly named
 * set of tasks. NOT an automatic recipe-similarity engine: which tasks exist
 * and which canonical role identifies each one are hardcoded here, reviewed
 * in code, not inferred from how similar two services' material lists look.
 *
 * WHAT THIS WRITES, AND ONLY THIS. Every accepted proposal becomes
 * `Service.fieldLaborHours` on the matched services — nothing else.
 *
 *   - Never `requiresTechCount`. Crew size is asked in the conversation for
 *     CONTEXT and wording only ("with your usual crew, how long does...").
 *     lib/pricing.ts's crew-hour rate already covers the contractor's normal
 *     crew; multiplying elapsed time by a headcount would double-count labor
 *     the rate already includes — exactly the bug `compute()`'s own history
 *     warns against. A task the contractor says needs a DIFFERENT crew than
 *     usual is excluded from the proposal entirely (see `crewMismatch`
 *     below) rather than guessed at.
 *   - Never `wwtLaborHours`. The conversation asks about a task as its own
 *     dispatched visit; a While-We're-There add-on's elapsed time is a
 *     different question this slice does not ask, so the field is left
 *     exactly as it already was.
 *   - Never any PricingSettings field, never a new rate dimension. Visit
 *     overhead is explicitly out of scope for this slice — see the design
 *     discussion this module's tests reference.
 *
 * MATCHING RULE, EXPLICIT AND BOUNDED. A service matches a task when its
 * recipe contains the task's designated canonical role AND every other
 * ingredient is drawn from INCIDENTAL_MATERIAL_KEYS below — generic hardware
 * (a wall plate, a box, small consumables) with no labor scope of its own.
 * A service whose recipe carries a SECOND meaningful device or fixture never
 * matches; that is a different, larger job, and calibrating this task's time
 * would misprice it (the same principle that keeps a whole panel-upgrade
 * service out of a single-breaker labor mapping). The role list and the
 * incidental list are both literal constants — extending either is a
 * reviewed code change, never a runtime inference.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export type LaborTaskDefinition = {
  key: string;
  canonicalMaterialKey: string;
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
 * Electrical — the first question set. The engine above (matching,
 * proposals, the accept route) is trade-agnostic; a second trade adds its
 * own array here, not a change to how any of this works.
 */
export const ELECTRICAL_LABOR_TASKS: LaborTaskDefinition[] = [
  {
    key: "outlet_replacement",
    canonicalMaterialKey: "RECEPTACLE_STANDARD",
    label: "a standard outlet replacement",
    displayName: "Replace a standard duplex receptacle",
    includes:
      "Removing the old device, connecting and setting the new device, verifying power, closing the cover plate.",
    excludes:
      "Repairing or replacing wiring or the box, any troubleshooting beyond the swap, travel to/from the truck, permit or inspection time.",
  },
  {
    key: "switch_replacement",
    canonicalMaterialKey: "SWITCH_STANDARD",
    label: "a standard switch replacement",
    displayName: "Replace a standard single-pole switch",
    includes: "The same scope as the outlet replacement above, for a switch instead of a receptacle.",
    excludes: "Repairing or replacing wiring or the box, any troubleshooting beyond the swap.",
    relativeTo: "outlet_replacement",
  },
  {
    key: "gfci_replacement",
    canonicalMaterialKey: "GFCI_INTERIOR",
    label: "replacing an existing GFCI receptacle",
    displayName: "Replace an existing GFCI receptacle",
    includes:
      "Removing the old GFCI device, connecting and setting the new one, testing the test/reset buttons, closing the cover plate.",
    excludes:
      "Installing NEW GFCI protection where none existed, troubleshooting existing wiring, repairing or replacing the box.",
    relativeTo: "outlet_replacement",
  },
];

/**
 * Generic hardware with no labor scope of its own. A literal, reviewed list
 * — never derived from a similarity score. Extending this list is how a
 * future task's "incidental parts" get recognized; nothing here guesses.
 */
const INCIDENTAL_MATERIAL_KEYS = new Set([
  "WALL_PLATE",
  "CONSUMABLES_SMALL",
  "CONSUMABLES_MEDIUM",
  "BOX_OLD_WORK",
]);

export type MatchedService = { id: string; slug: string; name: string; fieldLaborHours: number | null };

export type MatchedTask = {
  task: LaborTaskDefinition;
  /** Null when the platform has no canonical role for this key — a data problem, not a normal empty match. */
  canonicalMaterialId: string | null;
  services: MatchedService[];
};

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Resolve every task's matching services for one contractor, server-side.
 * The only inputs trusted are the task definitions above and this
 * contractor's own real recipes — never anything a client supplies.
 */
export async function matchLaborTasks(
  db: Db,
  contractorId: string,
  tasks: LaborTaskDefinition[]
): Promise<MatchedTask[]> {
  const roles = await db.canonicalMaterial.findMany({
    where: { key: { in: tasks.map((t) => t.canonicalMaterialKey) } },
    select: { id: true, key: true },
  });
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));

  const services = await db.service.findMany({
    where: { contractorId },
    select: {
      id: true,
      slug: true,
      name: true,
      fieldLaborHours: true,
      materials: { select: { canonicalMaterialId: true, canonicalMaterial: { select: { key: true } } } },
    },
  });

  return tasks.map((task) => {
    const roleId = roleIdByKey.get(task.canonicalMaterialKey) ?? null;
    if (!roleId) return { task, canonicalMaterialId: null, services: [] };

    const matched = services.filter((svc) => {
      const hasRole = svc.materials.some((m) => m.canonicalMaterialId === roleId);
      // A ServiceMaterial row with no resolved canonical role (a legacy,
      // not-yet-migrated recipe line — see the model's own doc comment)
      // is unknown, not incidental. Treat it as disqualifying rather than
      // guessing it belongs on the incidental list.
      const onlyIncidentalElse = svc.materials.every((m) => {
        const key = m.canonicalMaterial?.key;
        return key === task.canonicalMaterialKey || (!!key && INCIDENTAL_MATERIAL_KEYS.has(key));
      });
      return hasRole && onlyIncidentalElse;
    });

    return {
      task,
      canonicalMaterialId: roleId,
      services: matched.map((s) => ({ id: s.id, slug: s.slug, name: s.name, fieldLaborHours: s.fieldLaborHours })),
    };
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
