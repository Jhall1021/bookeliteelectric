/**
 * Writing categories after the canonical/contractor split — ADR-006.
 *
 * A category is now two rows: what it IS, owned by the platform, and how one
 * contractor PRESENTS it. Same shape as _componentHelpers.ts, and here for the
 * same reason: three seeds create categories or services, and without a shared
 * helper each grows its own version of the multi-row write.
 *
 * WHY THIS EXISTS RATHER THAN A REPAIR PASS
 *
 * Until now seeds wrote only the pre-split `ServiceCategory` and left
 * `Service.contractorCategoryId` null, so the rule was "re-run the backfill
 * after any seed". Every operational read now fails closed on a null one, so
 * forgetting produced a 500 rather than a cosmetic problem — and the rule
 * lived in RUN-ORDER.md, where it depended on someone reading it.
 *
 * The ordering is encoded in the write path instead. Verification is the
 * backstop, not the mechanism: scripts/verify-category-integrity.ts.
 *
 * THE IDEMPOTENCY RULE
 *
 * A re-run must never reset contractor-owned presentation:
 *
 *   sortOrder, navGroup, nameOverride, iconOverride, active
 *
 * Those are the contractor's decisions, made in the admin. A seed stamping
 * them back to its own defaults is exactly the bug prisma/seed.ts already
 * avoids by not syncing sortOrder — generalised to every field the contractor
 * owns. They are written on CREATE and never touched again.
 *
 * Platform defaults on CanonicalCategory — name and defaultIcon — ARE
 * maintained on re-run. Those belong to the seed.
 *
 * THE LEGACY DUAL WRITE
 *
 * `Service.categoryId` is still NOT NULL, so the pre-split row is written too,
 * as rollback scaffolding. It is derived, never a source of truth, and the
 * whole branch disappears in the contract phase.
 */

import type { PrismaClient } from "@prisma/client";

/** A category as a seed declares it — identity and presentation together. */
export type CategoryDefinition = {
  /** Canonical identity. Shared across contractors, never overridden. */
  slug: string;
  /** Platform default name. Maintained on re-run. */
  name: string;
  /** Platform default icon. Maintained on re-run. */
  icon?: string | null;

  /**
   * Contractor presentation. Applied on CREATE ONLY — a re-run leaves whatever
   * the contractor has since set.
   */
  sortOrder?: number;
  navGroup?: string | null;
};

/**
 * The three ids a seeded service needs.
 *
 * `legacyCategoryId` is scaffolding. Spread `categoryAttachment()` rather than
 * reading it directly, so the contract phase is one edit here.
 */
export type SeededCategory = {
  canonicalCategoryId: string;
  contractorCategoryId: string;
  legacyCategoryId: string;
};

/**
 * What a service create/upsert spreads into `data` to attach its category.
 *
 * Both pointers, together, always. A service written with one and not the
 * other is exactly the orphan the verify gate rejects.
 */
export function categoryAttachment(c: SeededCategory): {
  categoryId: string;
  contractorCategoryId: string;
} {
  return {
    categoryId: c.legacyCategoryId,
    contractorCategoryId: c.contractorCategoryId,
  };
}

/**
 * Create or refresh a category for one contractor, across all three rows.
 */
export async function upsertCategory(
  prisma: PrismaClient,
  contractorId: string,
  def: CategoryDefinition
): Promise<SeededCategory> {
  const canonical = await prisma.canonicalCategory.upsert({
    where: { slug: def.slug },
    // Platform defaults belong to the seed and are kept current.
    update: { name: def.name, defaultIcon: def.icon ?? null },
    create: { slug: def.slug, name: def.name, defaultIcon: def.icon ?? null },
  });

  const contractorCategory = await prisma.contractorCategory.upsert({
    where: {
      contractorId_canonicalCategoryId: {
        contractorId,
        canonicalCategoryId: canonical.id,
      },
    },
    // DELIBERATELY EMPTY. See the idempotency rule above: every field on this
    // row is the contractor's, and a seed re-run must not stamp any of them
    // back to its defaults.
    update: {},
    create: {
      contractorId,
      canonicalCategoryId: canonical.id,
      sortOrder: def.sortOrder ?? 0,
      navGroup: def.navGroup ?? null,
      nameOverride: null,
      iconOverride: null,
      active: true,
    },
  });

  // Scaffolding, derived from the canonical row. Removed at contract.
  const legacy = await prisma.serviceCategory.upsert({
    where: { slug: def.slug },
    // sortOrder is not synced here either, for the original reason: it is set
    // in the admin, and rewriting it undoes the ordering on every reseed.
    update: { name: def.name, icon: def.icon ?? null, navGroup: def.navGroup ?? null },
    create: {
      slug: def.slug,
      name: def.name,
      icon: def.icon ?? null,
      sortOrder: def.sortOrder ?? 0,
      navGroup: def.navGroup ?? null,
    },
  });

  return {
    canonicalCategoryId: canonical.id,
    contractorCategoryId: contractorCategory.id,
    legacyCategoryId: legacy.id,
  };
}

/**
 * Find an existing category for one contractor by canonical slug.
 *
 * Accepts several slugs because a couple of seeds already probe for
 * alternatives ("appliance-install" or "appliance-installation"). Returns null
 * rather than throwing so those seeds keep their skip-and-log behaviour.
 */
export async function findCategory(
  prisma: PrismaClient,
  contractorId: string,
  slugs: string[]
): Promise<SeededCategory | null> {
  const canonical = await prisma.canonicalCategory.findFirst({
    where: { slug: { in: slugs } },
  });
  if (!canonical) return null;

  const contractorCategory = await prisma.contractorCategory.findUnique({
    where: {
      contractorId_canonicalCategoryId: {
        contractorId,
        canonicalCategoryId: canonical.id,
      },
    },
    select: { id: true },
  });
  if (!contractorCategory) return null;

  const legacy = await prisma.serviceCategory.findUnique({
    where: { slug: canonical.slug },
    select: { id: true },
  });
  if (!legacy) return null;

  return {
    canonicalCategoryId: canonical.id,
    contractorCategoryId: contractorCategory.id,
    legacyCategoryId: legacy.id,
  };
}

/**
 * The category attachment of an existing service, for seeds that place a new
 * service "wherever its sibling lives" rather than naming a slug.
 *
 * Returns both pointers or null — never one of the two. A sibling that is
 * itself an orphan yields null rather than propagating the orphan, which is
 * how one missing row would otherwise become several.
 */
export async function categoryOfService(
  prisma: PrismaClient,
  slug: string
): Promise<{ categoryId: string; contractorCategoryId: string } | null> {
  // findFirst, not findUnique: slug is unique PER CONTRACTOR now, so it is no
  // longer a unique selector on its own. These callers are single-contractor
  // era seeds; scoping to Elite explicitly would need a contractor argument
  // threaded through every caller, and "the service with this slug" is still
  // unambiguous while one contractor exists. It stops being unambiguous the
  // moment a second one has a catalogue — at which point this helper must
  // take a contractorId rather than guess.
  const s = await prisma.service.findFirst({
    where: { slug },
    select: { categoryId: true, contractorCategoryId: true },
  });
  if (!s?.contractorCategoryId) return null;
  return { categoryId: s.categoryId, contractorCategoryId: s.contractorCategoryId };
}
