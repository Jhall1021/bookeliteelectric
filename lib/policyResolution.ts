/**
 * A contractor deciding a policy, and the labels that decision writes.
 *
 * THE MISSING HALF. Provisioning creates a ContractorPolicyValue per policy
 * the installed catalog depends on, unresolved, and copies each band option's
 * `labelPattern` into `label` verbatim — holes and all. lib/policyBands.ts has
 * always known how to turn "{b1} feet or less" into "8 feet or less". Nothing
 * ever called it: renderBandLabel's only callers were its own unit tests.
 *
 * So the decision had no surface, and resolving it would have changed nothing
 * a homeowner could see. BrightPath installed 65 band options and every one of
 * them still read as a template. This is the step that connects the two ends
 * that already existed.
 *
 * ONE authority, for the same reason activation and publication have one: the
 * write and the re-render must not be separable. A caller that could set
 * boundaries without re-rendering is a caller that can leave a resolved policy
 * showing holes, which is indistinguishable from the bug this fixes.
 */

import type { PrismaClient } from "@prisma/client";
import { renderBandLabel, validateBoundaries, type BoundaryProblem } from "./policyBands";

export type PolicyRefusal = { code: string; message: string; problems?: BoundaryProblem[] };

export type ResolveResult =
  | { ok: true; key: string; optionsRelabeled: number; servicesCleared: number }
  | { ok: false; refusal: PolicyRefusal };

/** One policy as a contractor sees it: what is being asked, and their answer. */
export type PolicyView = {
  key: string;
  type: string;
  unit: string | null;
  boundaryCount: number;
  prompt: string;
  boundaries: number[];
  choice: string | null;
  resolved: boolean;
  /** Services that cannot publish until this is decided. */
  dependentSlugs: string[];
  offeredDependentSlugs: string[];
};

/**
 * Every policy this contractor owes an answer to, decided or not.
 *
 * Grouped by policy rather than by service on purpose: nine decisions across
 * twenty-one services is nine questions, and listing them per service makes a
 * short afternoon look like a wall.
 */
export async function policiesFor(
  db: PrismaClient,
  contractorId: string
): Promise<PolicyView[]> {
  const values = await db.contractorPolicyValue.findMany({
    where: { contractorId },
    orderBy: { key: "asc" },
  });
  const services = await db.service.findMany({
    where: { contractorId },
    select: { slug: true, offered: true, unresolvedPolicyKeys: true },
  });

  return values.map((v) => {
    const dependents = services.filter((s) => s.unresolvedPolicyKeys.includes(v.key));
    return {
      key: v.key,
      type: String(v.type),
      unit: v.unit,
      boundaryCount: v.boundaryCount,
      prompt: v.prompt,
      boundaries: v.boundaries,
      choice: v.choice,
      resolved: v.resolvedAt !== null,
      dependentSlugs: dependents.map((s) => s.slug).sort(),
      offeredDependentSlugs: dependents.filter((s) => s.offered).map((s) => s.slug).sort(),
    };
  });
}

/**
 * Record a contractor's decision, and rewrite every label that depended on it.
 *
 * All of it in one transaction. A half-applied policy would leave some options
 * reading "26 to 50 feet" and their siblings reading "{b1+1} to {b2} feet" in
 * the same question, which is worse than either state alone.
 *
 * Takes the contractor's own numbers and validates them as a SET — ascending,
 * positive, and exactly as many as the template asked for. Per-option
 * validation would accept "up to 20 feet" sitting above "10 to 15 feet".
 */
export async function resolvePolicy(
  db: PrismaClient,
  contractorId: string,
  key: string,
  answer: { boundaries?: number[]; choice?: string }
): Promise<ResolveResult> {
  const value = await db.contractorPolicyValue.findFirst({
    where: { contractorId, key },
  });
  if (!value) {
    return { ok: false, refusal: { code: "UNKNOWN_POLICY", message: `No policy "${key}" for this contractor.` } };
  }

  // SUPPLY_ARRANGEMENT has no boundaries — it is a choice, and the question is
  // who brings the equipment, not where a price steps.
  const isChoice = value.boundaryCount === 0;

  if (isChoice) {
    const choice = (answer.choice ?? "").trim();
    if (!choice) {
      return { ok: false, refusal: { code: "CHOICE_REQUIRED", message: "This policy needs an answer." } };
    }
    await db.$transaction(async (tx) => {
      await tx.contractorPolicyValue.update({
        where: { id: value.id },
        data: { choice, resolvedAt: new Date() },
      });
      await clearKeyFromServices(tx as unknown as PrismaClient, contractorId, key);
    });
    const cleared = await countServicesWith(db, contractorId, key);
    return { ok: true, key, optionsRelabeled: 0, servicesCleared: cleared };
  }

  const boundaries = answer.boundaries ?? [];
  const problems = validateBoundaries(boundaries, value.boundaryCount);
  if (problems.length) {
    return {
      ok: false,
      refusal: {
        code: "INVALID_BOUNDARIES",
        message: problems.map((p) => p.message).join(" "),
        problems,
      },
    };
  }

  // Every option whose pattern reads this policy, across every service this
  // contractor owns. Found by pattern rather than by a stored link, because
  // the pattern is what actually decides whether a label has a hole in it.
  const options = await db.answerOption.findMany({
    where: {
      labelPattern: { not: null },
      question: { service: { contractorId, unresolvedPolicyKeys: { has: key } } },
    },
    select: { id: true, labelPattern: true },
  });

  const rendered: { id: string; label: string }[] = [];
  for (const o of options) {
    if (!o.labelPattern) continue;
    try {
      rendered.push({ id: o.id, label: renderBandLabel(o.labelPattern, key, boundaries) });
    } catch {
      // A pattern this policy cannot fill belongs to a DIFFERENT policy on the
      // same service — a fixture-height question and a run-length question can
      // sit in one tree. Skipped rather than failed: that option is somebody
      // else's to resolve, and it keeps its own key in unresolvedPolicyKeys.
      continue;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.contractorPolicyValue.update({
      where: { id: value.id },
      data: { boundaries, resolvedAt: new Date() },
    });
    for (const r of rendered) {
      await tx.answerOption.update({ where: { id: r.id }, data: { label: r.label } });
    }
    await clearKeyFromServices(tx as unknown as PrismaClient, contractorId, key);
  });

  const cleared = await countServicesWith(db, contractorId, key);
  return { ok: true, key, optionsRelabeled: rendered.length, servicesCleared: cleared };
}

async function countServicesWith(db: PrismaClient, contractorId: string, key: string) {
  return db.service.count({ where: { contractorId, unresolvedPolicyKeys: { has: key } } });
}

/**
 * Drop the key from every service that was waiting on it.
 *
 * `unresolvedPolicyKeys` is a list on the service rather than a join, so
 * clearing is a read-modify-write. Scoped to this contractor's services, and
 * only ever removes the one key — a service waiting on two policies has one
 * answered, not both.
 */
async function clearKeyFromServices(db: PrismaClient, contractorId: string, key: string) {
  const affected = await db.service.findMany({
    where: { contractorId, unresolvedPolicyKeys: { has: key } },
    select: { id: true, unresolvedPolicyKeys: true },
  });
  for (const s of affected) {
    await db.service.update({
      where: { id: s.id },
      data: { unresolvedPolicyKeys: s.unresolvedPolicyKeys.filter((k) => k !== key) },
    });
  }
}
