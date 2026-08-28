/**
 * A throwaway contractor that sets itself up and takes itself apart.
 *
 * The template suites used to depend on a contractor somebody had created by
 * hand. That precondition was invisible until it went stale, and then the
 * suite failed for a reason that had nothing to do with the thing it tests.
 * A test that needs a fixture should build it.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";

/** Runs the real provisioning script, so the suites test the shipped path. */
export function provision(slug: string, extra: string[] = []) {
  return execFileSync("npx",
    ["tsx", "scripts/provision-from-template.ts", "--contractor", slug, "--apply", ...extra],
    { encoding: "utf8", stdio: "pipe" });
}

/** Services are RESTRICT on purpose, so teardown follows the FK graph. */
export async function destroyContractor(prisma: PrismaClient, slug: string) {
  const c = await prisma.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  const ids = (await prisma.service.findMany({ where: { contractorId: c.id }, select: { id: true } })).map((s) => s.id);
  await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } });
  await prisma.question.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.service.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
}

/**
 * Create the contractor, run the body, and remove it whatever happens. A
 * failed assertion must not leave a half-built tenant behind for the next run
 * to trip over.
 */
export async function withThrowaway<T>(
  prisma: PrismaClient, slug: string, name: string, body: (id: string) => Promise<T>,
): Promise<T> {
  await destroyContractor(prisma, slug);
  const c = await prisma.contractor.create({ data: { slug, name, active: false }, select: { id: true } });
  try {
    return await body(c.id);
  } finally {
    await destroyContractor(prisma, slug);
  }
}
