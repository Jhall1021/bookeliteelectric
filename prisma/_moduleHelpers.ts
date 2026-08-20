/**
 * Helpers for attaching reusable question modules to a service tree.
 *
 * These exist because the first version of the lighting-control seed deleted
 * and recreated its questions on every run. That gave them new ids, and the
 * rewire step only looked for answers still marked RESOLVE_* — which the
 * first run had already converted to CONTINUE. So the second run left every
 * rewired answer pointing at ids that no longer existed.
 *
 * nextQuestionId has no foreign key, so nothing complained. The engine fails
 * safe on a dangling target by resolving to a price, which meant customers
 * silently skipped whole modules and got quoted for work that was never
 * qualified.
 *
 * Two rules come out of that:
 *
 *   1. Never delete a question that other answers point at. Look it up by key
 *      and update it in place so its id survives.
 *   2. A rewire must repair, not just convert. Anything pointing at a missing
 *      question is as broken as an un-rewired answer and has to be caught by
 *      the same pass.
 */

import type { PrismaClient } from "@prisma/client";

/**
 * Create a question, or update the existing one with this key in place.
 * The id is preserved, so answers already pointing here keep working.
 */
export async function upsertQuestion(
  prisma: PrismaClient,
  serviceId: string,
  data: { key: string; prompt: string; helpText?: string | null; order: number }
) {
  const existing = await prisma.question.findFirst({
    where: { serviceId, key: data.key },
  });

  if (existing) {
    // Options are rebuilt each run — they carry no inbound references, so
    // replacing them is safe. The question itself must not be touched.
    await prisma.answerOption.deleteMany({ where: { questionId: existing.id } });
    return prisma.question.update({
      where: { id: existing.id },
      data: {
        prompt: data.prompt,
        helpText: data.helpText ?? null,
        order: data.order,
      },
    });
  }

  return prisma.question.create({
    data: {
      serviceId,
      key: data.key,
      prompt: data.prompt,
      helpText: data.helpText ?? null,
      inputType: "SINGLE_SELECT",
      order: data.order,
    },
  });
}

/**
 * Point every answer that currently ENDS the flow — or that points nowhere
 * real — at `targetQuestionId`.
 *
 * Catches three cases:
 *   - RESOLVE_INSTANT / RESOLVE_ADJUSTED: a first-run conversion
 *   - CONTINUE with a nextQuestionId that doesn't exist: repairing damage
 *   - CONTINUE with no nextQuestionId at all: a tree that was never finished
 *
 * Deliberate exits — photo review, reroute, troubleshooting — are left alone.
 * A customer heading to review doesn't need more qualifying questions first.
 */
export async function rewireTerminalsInto(
  prisma: PrismaClient,
  serviceId: string,
  targetQuestionId: string,
  excludeQuestionKeys: string[]
) {
  const questions = await prisma.question.findMany({
    where: { serviceId },
    select: { id: true, key: true },
  });
  const liveIds = new Set(questions.map((q) => q.id));
  const editableQuestionIds = questions
    .filter((q) => !excludeQuestionKeys.includes(q.key))
    .map((q) => q.id);

  if (editableQuestionIds.length === 0) return { converted: 0, repaired: 0 };

  const options = await prisma.answerOption.findMany({
    where: { questionId: { in: editableQuestionIds } },
    select: { id: true, routeAction: true, nextQuestionId: true },
  });

  const toConvert = options.filter(
    (o) => o.routeAction === "RESOLVE_INSTANT" || o.routeAction === "RESOLVE_ADJUSTED"
  );
  const toRepair = options.filter(
    (o) =>
      o.routeAction === "CONTINUE" &&
      (!o.nextQuestionId || !liveIds.has(o.nextQuestionId))
  );

  const ids = [...toConvert, ...toRepair].map((o) => o.id);
  if (ids.length > 0) {
    await prisma.answerOption.updateMany({
      where: { id: { in: ids } },
      data: { routeAction: "CONTINUE", nextQuestionId: targetQuestionId },
    });
  }

  return { converted: toConvert.length, repaired: toRepair.length };
}

/**
 * Report any answer pointing at a question that doesn't exist. Run at the end
 * of a seed so a broken tree is visible immediately rather than discovered by
 * a customer being quoted the wrong price.
 */
export async function findDanglingReferences(prisma: PrismaClient, serviceId: string) {
  const questions = await prisma.question.findMany({
    where: { serviceId },
    select: { id: true, key: true, options: true },
  });
  const liveIds = new Set(questions.map((q) => q.id));
  const broken: string[] = [];

  for (const q of questions) {
    for (const o of q.options) {
      if (o.routeAction === "CONTINUE" && (!o.nextQuestionId || !liveIds.has(o.nextQuestionId))) {
        broken.push(`${q.key} → "${o.label}"`);
      }
    }
  }
  return broken;
}

/**
 * Questions nothing routes to, other than the entry point. A customer will
 * never see these — the symptom that exposed the id-churn bug.
 */
export async function findUnreachableQuestions(prisma: PrismaClient, serviceId: string) {
  const questions = await prisma.question.findMany({
    where: { serviceId },
    orderBy: { order: "asc" },
    select: { id: true, key: true, options: true },
  });
  if (questions.length === 0) return [];

  const reachable = new Set<string>([questions[0].id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of questions) {
      if (!reachable.has(q.id)) continue;
      for (const o of q.options) {
        if (o.routeAction === "CONTINUE" && o.nextQuestionId && !reachable.has(o.nextQuestionId)) {
          reachable.add(o.nextQuestionId);
          changed = true;
        }
      }
    }
  }
  return questions.filter((q) => !reachable.has(q.id)).map((q) => q.key);
}
