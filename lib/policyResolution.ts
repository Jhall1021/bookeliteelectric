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
import { isElectricalCatalogStandardPolicy } from "./electrical/catalogPolicyStandards";

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
  measurement: number | null;
  /** Exact template-owned choices for enumerated policies; empty means free text. */
  choices: string[];
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
  const [services, definitions] = await Promise.all([
    db.service.findMany({
      where: { contractorId },
      select: { slug: true, offered: true, unresolvedPolicyKeys: true },
    }),
    db.templatePolicyDefinition.findMany({
      where: { key: { in: values.map((value) => value.key) } },
      select: { key: true, choices: true, templateVersion: { select: { version: true } } },
      orderBy: { templateVersion: { version: "desc" } },
    }),
  ]);
  const choicesByKey = new Map<string, string[]>();
  for (const definition of definitions) {
    if (!choicesByKey.has(definition.key)) choicesByKey.set(definition.key, definition.choices);
  }

  return values.filter((v) => !isElectricalCatalogStandardPolicy(v.key)).map((v) => {
    const dependents = services.filter((s) => s.unresolvedPolicyKeys.includes(v.key));
    return {
      key: v.key,
      type: String(v.type),
      unit: v.unit,
      boundaryCount: v.boundaryCount,
      prompt: v.prompt,
      boundaries: v.boundaries,
      choice: v.choice,
      measurement: v.measurement,
      choices: choicesByKey.get(v.key) ?? [],
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
  answer: { boundaries?: number[]; choice?: string; measurement?: number }
): Promise<ResolveResult> {
  const value = await db.contractorPolicyValue.findFirst({
    where: { contractorId, key },
  });
  if (!value) {
    return { ok: false, refusal: { code: "UNKNOWN_POLICY", message: `No policy "${key}" for this contractor.` } };
  }
  /**
   * MEASUREMENT — one number, written to `measurement`, where the takeoff
   * reads it.
   *
   * These arrived with Routing V2 and fell into the `boundaryCount === 0`
   * branch below, which stores FREE TEXT in `choice`. A slack allowance of
   * 0.5 would have been saved as the string "0.5" in a column nothing reads,
   * reported as resolved, and left the takeoff permanently incomplete. Zero is
   * a real answer here and is accepted; absence is not.
   */
  if (value.type === "MEASUREMENT") {
    const m = answer.measurement;
    if (typeof m !== "number" || !Number.isFinite(m) || m < 0) {
      return { ok: false, refusal: { code: "MEASUREMENT_REQUIRED",
        message: "Enter a number, 0 or more. Enter 0 if you deliberately allow nothing extra." } };
    }
    await db.contractorPolicyValue.update({
      where: { id: value.id }, data: { measurement: m, resolvedAt: new Date() } });
    return { ok: true, key, optionsRelabeled: 0, servicesCleared: 0 };
  }

  /**
   * MATERIAL_SPECIFICATION — one of the template's own choices, and nothing
   * else. Without this check "banana" is a valid conductor gauge.
   */
  if (value.type === "MATERIAL_SPECIFICATION") {
    const choice = (answer.choice ?? "").trim();
    const def = await db.templatePolicyDefinition.findFirst({
      where: { key }, orderBy: { templateVersion: { version: "desc" } }, select: { choices: true } });
    const allowed = def?.choices ?? [];
    if (!choice || !allowed.includes(choice)) {
      return { ok: false, refusal: { code: "CHOICE_NOT_OFFERED",
        message: allowed.length
          ? `Choose one of: ${allowed.join(", ")}.`
          : "This decision has no choices defined." } };
    }
    await db.contractorPolicyValue.update({
      where: { id: value.id }, data: { choice, resolvedAt: new Date() } });
    return { ok: true, key, optionsRelabeled: 0, servicesCleared: 0 };
  }

  // SUPPLY_ARRANGEMENT has no boundaries — it is a choice, and the question is
  // who brings the equipment, not where a price steps.
  const isChoice = value.boundaryCount === 0;

  if (isChoice) {
    const choice = (answer.choice ?? "").trim();
    if (!choice) {
      return { ok: false, refusal: { code: "CHOICE_REQUIRED", message: "This policy needs an answer." } };
    }
    // Count BEFORE clearing the key. Counting afterward always reports zero,
    // which made a successful resolution look as though it affected no
    // services even when several were just unblocked.
    const servicesToClear = await countServicesWith(db, contractorId, key);
    await db.$transaction(async (tx) => {
      await tx.contractorPolicyValue.update({
        where: { id: value.id },
        data: { choice, resolvedAt: new Date() },
      });
      await clearKeyFromServices(tx as unknown as PrismaClient, contractorId, key);
    });
    return { ok: true, key, optionsRelabeled: 0, servicesCleared: servicesToClear };
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

  // Every option whose pattern reads THIS policy, across every service this
  // contractor owns.
  //
  // Scoped by policyKey, not just by the service's unresolvedPolicyKeys: a
  // service can carry TWO OR MORE band policies (fan-replacing-light needs
  // both fixture_work_height.breakpoints and switch_leg_run.breakpoints), and
  // unresolvedPolicyKeys says only "this SERVICE still owes an answer for
  // key", not "this OPTION's pattern belongs to key". An earlier version
  // matched on `labelPattern: { not: null }` plus that service-level flag
  // alone, on the theory that renderBandLabel's own boundary-count mismatch
  // would throw and skip anything belonging to a different policy — true
  // only when the two policies need a DIFFERENT number of boundaries.
  // fixture_work_height needs 3, switch_leg_run needs 2, and every
  // fixture_work_height option whose pattern references at most 2 of its 3
  // boundaries (b1, b1+1..b2) rendered successfully against switch_leg_run's
  // OWN boundaries instead — resolving switch_leg_run silently overwrote
  // fixture_height's already-correct labels with the wrong policy's numbers.
  // AnswerOption.policyKey is the stored link installCatalog already writes;
  // reading it is what actually decides whether a label belongs to THIS
  // policy, not a coincidence of how many holes its pattern happens to have.
  const options = await db.answerOption.findMany({
    where: {
      labelPattern: { not: null },
      policyKey: key,
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

  // Same rule as the choice path: capture the impact while the unresolved key
  // still exists. After the transaction succeeds those rows no longer match.
  const servicesToClear = await countServicesWith(db, contractorId, key);
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

  return { ok: true, key, optionsRelabeled: rendered.length, servicesCleared: servicesToClear };
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
