/**
 * Category presentation — ADR-006, and the read direction ADR-007 requires.
 *
 * THE READ DIRECTION
 *
 * A query that needs contractor category configuration roots at
 * ContractorCategory, never at CanonicalCategory:
 *
 *   SAFE     ContractorCategory (tenant)   -> canonicalCategory (platform)
 *   UNSAFE   CanonicalCategory (platform)  -> contractorCategories (tenant)
 *
 * The unsafe direction reproduces the platform-parent / tenant-child blind
 * spot the live harness proved: Prisma query extensions fire on the top-level
 * operation only, so a platform root means the guard never runs and the
 * nested tenant rows come back unfiltered.
 *
 * A read already rooted at Service is fine as it stands —
 * Service (tenant) -> contractorCategory (tenant) -> canonicalCategory
 * (platform) — because the top-level root is tenant-owned. Those are not
 * rewritten just to match a shape.
 *
 * WHY THE FALLBACKS LIVE HERE
 *
 * `nameOverride ?? canonical.name` written at seven call sites is seven
 * chances to write it differently, and a category silently rendering the
 * platform default where a contractor set an override is the kind of bug
 * nobody reports. It is the same failure mode as the hand-written contractor
 * filter that lib/contractorComponents.ts exists to remove: correct exactly as
 * long as someone remembers.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Everything needed to resolve one category's presentation.
 *
 * Structural rather than a Prisma type, so a caller can select whatever else
 * it needs alongside without this becoming the union of every call site.
 */
/**
 * The fields each resolver needs, declared per resolver rather than as one
 * shared shape.
 *
 * A single PresentableCategory type would force every call site to select all
 * three fields even when it only wants the slug — and a route that selects
 * fields it never reads is how a select grows until nobody knows what it is
 * for. Each function asks for exactly what it reads.
 */
export type NameableCategory = {
  nameOverride: string | null;
  canonicalCategory: { name: string };
};

export type IconableCategory = {
  iconOverride: string | null;
  canonicalCategory: { defaultIcon: string | null };
};

export type SluggableCategory = {
  canonicalCategory: { slug: string };
};

/** The canonical fields every presentation resolution needs. */
export const CANONICAL_CATEGORY_SELECT = {
  select: { id: true, slug: true, name: true, defaultIcon: true },
} as const;

/** The contractor's wording if they set one, else the platform default. */
export function categoryName(c: NameableCategory): string {
  return c.nameOverride ?? c.canonicalCategory.name;
}

/** The contractor's icon if they set one, else the platform default. */
export function categoryIcon(c: IconableCategory): string | null {
  return c.iconOverride ?? c.canonicalCategory.defaultIcon;
}

export function categorySlug(c: SluggableCategory): string {
  return c.canonicalCategory.slug;
}

/**
 * The one contractor, or a thrown error.
 *
 * A deliberate, visible placeholder, moved here from
 * app/api/admin/materials/route.ts so the admin surfaces share one copy
 * rather than growing a private "find the only one" each.
 *
 * There is one contractor today and most admin surfaces have no tenant
 * context yet. Rather than scattering that assumption, it lives here, named,
 * and THROWS the moment it stops holding. The migration audit's warning about
 * unscoped findFirst was that it returns the wrong row silently; this one
 * refuses.
 *
 * When the admin becomes tenant-aware, this is the single place that changes.
 */
export async function soleContractorId(db: Db, surface: string): Promise<string> {
  const all = await db.contractor.findMany({ select: { id: true }, take: 2 });
  if (all.length === 0) throw new Error("No contractor exists.");
  if (all.length > 1) {
    throw new Error(
      `More than one contractor exists — ${surface} needs tenant context ` +
        `before it can be used safely.`
    );
  }
  return all[0].id;
}

/**
 * The service's contractor category, or a thrown error.
 *
 * `Service.contractorCategoryId` is nullable for the duration of the ADR-006
 * migration and becomes required in the contract phase. Until then every read
 * has to decide what a missing one means.
 *
 * It means stop. The alternative — `?? ""` or `?? null` — puts the string
 * "undefined" into a customer-facing URL, or silently renders a service with
 * no category heading. Both look like working software. The backfill points
 * all 75 services, so this throws only if a service was created without one,
 * which is a defect worth hearing about immediately.
 *
 * Generic over the selected shape so each call site can select only the
 * fields it needs without this becoming a union of all of them.
 */
export function requireContractorCategory<T>(serviceSlug: string, cc: T | null | undefined): T {
  if (!cc) {
    throw new Error(
      `Service "${serviceSlug}" has no contractor category. Run ` +
        `prisma/backfill-category-split-2026-08-27.ts, or check how it was created.`
    );
  }
  return cc;
}
