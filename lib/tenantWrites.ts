/**
 * Creating derived-owned rows — ADR-010.
 *
 * THE INVARIANT
 *
 *   A direct create on a derived-owned model may never accept an ownership
 *   foreign key without first proving that key belongs to the active
 *   contractor.
 *
 * WHY THE GUARD CANNOT DO THIS ITSELF
 *
 * `Question` has no `contractorId` to stamp — that is the entire point of
 * derived ownership. The guard therefore throws `DerivedCreateError` on a
 * direct create rather than inventing an owner, and the proof has to happen
 * where a client is available: here.
 *
 * The guard is not weakened to make existing creates compile. A create that
 * accepted `serviceId` on trust is exactly how a row lands under the wrong
 * contractor with every individual column valid.
 *
 * HOW THE PROOF WORKS
 *
 * The parent is fetched through the GUARDED client. If it belongs to another
 * contractor the guarded read returns null — the same mechanism the live
 * harness proved at one and two hops — and the create never happens. Only then
 * does the write run on the unguarded client, which is safe because the
 * ownership FK has just been established rather than assumed.
 *
 * NESTED CREATES ARE A DIFFERENT THING
 *
 * `service.update({ data: { questions: { create: ... } } })` beneath a
 * tenant-scoped parent needs none of this: ownership is structural, and the
 * child guard does not fire for it anyway (ADR-007). Prefer that shape where
 * the parent is already being written.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { CrossTenantError } from "./tenantContext";

/**
 * Prove a Service belongs to the active contractor, then run a write.
 *
 * `guarded` establishes ownership; `write` performs it. Returning the proven
 * id rather than a boolean means the caller cannot forget to use it.
 */
export async function withProvenService<T>(
  guarded: PrismaClient,
  serviceId: string,
  write: (provenServiceId: string) => Promise<T>
): Promise<T> {
  const owned = await guarded.service.findUnique({
    where: { id: serviceId },
    select: { id: true },
  });
  if (!owned) {
    throw new CrossTenantError(
      `Service ${serviceId} does not belong to the active contractor, so ` +
        `nothing may be created under it.`
    );
  }
  return write(owned.id);
}

/**
 * Prove a Question belongs to the active contractor, then run a write.
 *
 * Two hops from the owner — Question -> Service -> contractorId — and proven
 * by the same guarded read.
 */
export async function withProvenQuestion<T>(
  guarded: PrismaClient,
  questionId: string,
  write: (provenQuestionId: string) => Promise<T>
): Promise<T> {
  const owned = await guarded.question.findUnique({
    where: { id: questionId },
    select: { id: true },
  });
  if (!owned) {
    throw new CrossTenantError(
      `Question ${questionId} does not belong to the active contractor, so ` +
        `nothing may be created under it.`
    );
  }
  return write(owned.id);
}

/**
 * Prove an AnswerOption belongs to the active contractor, then run a write.
 *
 * For the join tables — AnswerOptionComponent, AnswerOptionPhotoGroup,
 * AnswerOptionDisclaimer — whose owner is three hops up.
 */
export async function withProvenAnswerOption<T>(
  guarded: PrismaClient,
  answerOptionId: string,
  write: (provenAnswerOptionId: string) => Promise<T>
): Promise<T> {
  const owned = await guarded.answerOption.findUnique({
    where: { id: answerOptionId },
    select: { id: true },
  });
  if (!owned) {
    throw new CrossTenantError(
      `AnswerOption ${answerOptionId} does not belong to the active ` +
        `contractor, so nothing may be created under it.`
    );
  }
  return write(owned.id);
}

/**
 * Prove a set of ids all belong to the active contractor before they are used
 * as write targets.
 *
 * For routes that take a list of ids from a request body — a reorder, a bulk
 * delete. A guarded `deleteMany` would already filter safely, but silently:
 * the caller learns nothing about the ids that did not match. This refuses the
 * whole operation instead, which is the right behavior when a client has sent
 * something it should not have.
 */
export async function proveAllOwned(
  guarded: PrismaClient,
  model: "question" | "answerOption" | "service",
  ids: string[],
  label: string
): Promise<void> {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found: { id: string }[] = await (guarded as any)[model].findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    const missing = unique.filter((i) => !found.some((f) => f.id === i));
    throw new CrossTenantError(
      `${label}: ${missing.length} of ${unique.length} ${model} id(s) do not ` +
        `belong to the active contractor.`
    );
  }
}

/** Re-exported so callers catch one error type rather than two. */
export { CrossTenantError };
export type { Prisma };
