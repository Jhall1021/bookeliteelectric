/**
 * The compound key for a service slug.
 *
 * `Service.slug` used to be globally unique, so `where: { slug }` identified a
 * row on its own. It is now unique PER CONTRACTOR — a bare slug is no longer a
 * unique selector, and every lookup has to say whose slug it means.
 *
 * These callers are seeds and one-shot scripts from the single-contractor era.
 * They legitimately mean Elite's catalogue, so they resolve Elite explicitly
 * rather than assuming whatever row comes back first. That is the same
 * distinction the migration-provenance rule draws: naming a contractor on
 * purpose is fine; defaulting to one silently is not.
 *
 * Application code does NOT use this. It goes through the guarded client,
 * which scopes `findFirst` to the active contractor automatically — see
 * app/api/services/[slug]/route.ts.
 */
import type { PrismaClient } from "@prisma/client";
import { eliteContractorId } from "./_componentHelpers";

export async function serviceSlugKey(prisma: PrismaClient, slug: string) {
  return { contractorId_slug: { contractorId: await eliteContractorId(prisma), slug } };
}
