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

import type { PrismaClient, Prisma, AccessClassification } from "@prisma/client";
import { parseAccessSlot, PRIMARY_SLOT, type AccessSlot } from "./accessSlots";

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

/**
 * A disclaimer's resolved presentation — ADR-009.
 *
 * The CONDITION is canonical (`accessClass` — when it applies); the STATEMENT
 * is contractor policy (`text`, `active` — what they promise). Both `active`
 * flags matter: the platform can retire a concept, and a contractor can switch
 * off their own statement independently, so a disclaimer renders only when
 * both say so.
 *
 * Here rather than at each call site for the reason the category resolvers
 * are: two read paths resolving policy slightly differently is how a customer
 * gets told something their contractor did not promise.
 */
export type PresentableDisclaimer = {
  text: string;
  active: boolean;
  canonicalDisclaimer: {
    // The real enum, not `string`. Widening it here would quietly widen every
    // DTO that carries an access classification downstream.
    accessClass: AccessClassification | null;
    /**
     * WHICH slot the condition reads — G1. A stored string, validated by
     * lib/accessSlots.ts rather than widened into this type: the slot key is
     * deliberately not a database enum, and the one module that knows the
     * grammar is the one that should parse it.
     */
    accessSlot: string;
    active: boolean;
  };
};

/** Does this disclaimer render at all? Both lifecycles must agree. */
export function disclaimerIsActive(d: PresentableDisclaimer): boolean {
  return d.active && d.canonicalDisclaimer.active;
}

/** When it applies. Null means always. */
export function disclaimerAccessClass(
  d: PresentableDisclaimer
): AccessClassification | null {
  return d.canonicalDisclaimer.accessClass;
}

/**
 * WHICH access slot the condition reads — G1.
 *
 * Meaningful only when `disclaimerAccessClass` is non-null; a concept that
 * always applies has no slot to read, and the verifier refuses a non-PRIMARY
 * slot in that state rather than storing a value that reads as significant.
 *
 * Falls back to PRIMARY on an unparseable stored value rather than throwing.
 * A disclaimer is customer-facing text, and the fail-closed direction for text
 * whose condition cannot be read is to evaluate it against the route every
 * existing disclaimer was authored against — not to crash a booking flow.
 * `verify-access-slots.ts` is what stops such a value existing.
 */
export function disclaimerAccessSlot(d: PresentableDisclaimer): AccessSlot {
  return parseAccessSlot(d.canonicalDisclaimer.accessSlot) ?? PRIMARY_SLOT;
}

/**
 * The contractor's policy row, or a thrown error.
 *
 * Nullable for the duration of the ADR-009 migration. A missing one means the
 * attachment was written without running the backfill — and defaulting to the
 * legacy shared text would tell a homeowner a promise that belongs to a
 * different contractor, which is precisely what the split exists to prevent.
 */
export function requireContractorDisclaimer<T>(key: string, d: T | null | undefined): T {
  if (!d) {
    throw new Error(
      `Disclaimer attachment "${key}" has no contractor policy row. Run ` +
        `prisma/backfill-disclaimer-split-2026-08-27.ts --apply.`
    );
  }
  return d;
}

/**
 * Does this category have anything a homeowner can actually book?
 *
 * STOREFRONT NAVIGATION IS DERIVED, NOT DECLARED. A ContractorCategory row
 * exists for every category the installed catalog covers, whether or not the
 * contractor offers anything in it — which is right for the dashboard, where
 * an empty category is a place to add work, and wrong for the storefront,
 * where it is a door into an empty room.
 *
 * Invisible on a mature catalog: Elite has live services in nearly every
 * category. BrightPath launched with three, so nine of its thirteen category
 * tiles read "0 services" and led nowhere.
 *
 * A rule rather than a filter written at each call site, because the next
 * navigation surface should inherit it rather than remember it.
 */
export function categoryIsCustomerVisible(c: { services: unknown[] }): boolean {
  return c.services.length > 0;
}

/** The customer-visible subset, in the order given. */
export function customerVisibleCategories<T extends { services: unknown[] }>(cats: T[]): T[] {
  return cats.filter(categoryIsCustomerVisible);
}
