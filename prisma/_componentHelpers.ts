/**
 * Writing job components after the canonical/contractor split.
 *
 * A component is now two rows: what it MEANS, owned by the platform, and what
 * it COSTS this contractor. Eight seeds define components, and without a
 * shared helper each would grow its own version of that two-row write —
 * which is how four copies of the material recompute happened.
 *
 * One implementation, eight callers.
 *
 * WHY THE SEEDS NAME ELITE
 *
 * These are Elite's catalog seeds. They always were: the hours, the material
 * costs and the approved prices in them are Elite's figures, and were even
 * when they lived on a model with no owner. Naming the contractor explicitly
 * is honest rather than a singleton lookup.
 *
 * Another contractor's catalog is not another set of seeds — it is a template
 * applied at onboarding, which is what the canonical layer exists for.
 */

import type { PrismaClient } from "@prisma/client";

const ELITE_SLUG = "elite-electric";

/**
 * A component as a seed declares it — meaning and economics together,
 * because that is how a person thinks about one.
 *
 * The helper splits them: identity to CanonicalComponent, everything with a
 * number attached to ContractorComponent.
 */
export type ComponentDefinition = {
  /** Stable role identity. Never a price, a contractor or a product. */
  key: string;
  name: string;
  customerFacingLabel?: string | null;
  notes?: string | null;
  active?: boolean;

  /** Elite's figures. */
  approvedPriceCents?: number | null;
  addFieldLaborHours?: number;
  addMaterialCostCents?: number;
  addScheduleMinutes?: number;
  addTechCount?: number;
};

/**
 * Elite's contractor id.
 *
 * Throws rather than creating one. A seed that silently invented a contractor
 * would be a seed that quietly built a second tenant.
 */
export async function eliteContractorId(prisma: PrismaClient): Promise<string> {
  const c = await prisma.contractor.findUnique({
    where: { slug: ELITE_SLUG },
    select: { id: true },
  });
  if (!c) {
    throw new Error(
      `No contractor "${ELITE_SLUG}". Run ` +
        `prisma/migrate-material-split-2026-08-24.ts first.`
    );
  }
  return c.id;
}

/**
 * Define a component: the role, and what it costs this contractor.
 *
 * Returns the CANONICAL id, because that is what an answer option attaches
 * to. The tree references the role; pricing resolves through the contractor.
 */
export async function upsertComponent(
  prisma: PrismaClient,
  contractorId: string,
  def: ComponentDefinition
): Promise<string> {
  const canonical = await prisma.canonicalComponent.upsert({
    where: { key: def.key },
    update: {
      name: def.name,
      customerFacingLabel: def.customerFacingLabel ?? null,
      notes: def.notes ?? null,
      ...(def.active === undefined ? {} : { active: def.active }),
    },
    create: {
      key: def.key,
      name: def.name,
      customerFacingLabel: def.customerFacingLabel ?? null,
      notes: def.notes ?? null,
      active: def.active ?? true,
    },
  });

  const economics = {
    approvedPriceCents: def.approvedPriceCents ?? null,
    addFieldLaborHours: def.addFieldLaborHours ?? 0,
    addMaterialCostCents: def.addMaterialCostCents ?? 0,
    addScheduleMinutes: def.addScheduleMinutes ?? 0,
    addTechCount: def.addTechCount ?? 0,
    notes: def.notes ?? null,
    ...(def.active === undefined ? {} : { active: def.active }),
  };

  await prisma.contractorComponent.upsert({
    where: {
      contractorId_canonicalComponentId: {
        contractorId,
        canonicalComponentId: canonical.id,
      },
    },
    // Both branches write the figures. Omitting them from update is what
    // broke the ASSUMED material costs: correcting a value and re-running
    // the seed changed the name and left the old number in place.
    update: economics,
    create: { contractorId, canonicalComponentId: canonical.id, ...economics },
  });

  return canonical.id;
}

/** Several at once, returning canonical ids keyed by component key. */
export async function upsertComponents(
  prisma: PrismaClient,
  contractorId: string,
  defs: ComponentDefinition[]
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const d of defs) ids.set(d.key, await upsertComponent(prisma, contractorId, d));
  return ids;
}

/**
 * The canonical id for a key, for attaching to an answer option.
 *
 * Throws on an unknown key rather than returning null — a tree attaching a
 * component that does not exist would silently price without it.
 */
export async function componentIdByKey(
  prisma: PrismaClient,
  key: string
): Promise<string> {
  const c = await prisma.canonicalComponent.findUnique({
    where: { key },
    select: { id: true },
  });
  if (!c) throw new Error(`No canonical component "${key}".`);
  return c.id;
}

/**
 * Retire components by key — both layers.
 *
 * Retired rather than deleted: either may appear on a booking already taken,
 * and a booked job's record should not lose the component it was priced with.
 *
 * Returns how many canonical rows were retired.
 */
export async function retireComponents(
  prisma: PrismaClient,
  keys: string[]
): Promise<number> {
  if (keys.length === 0) return 0;

  const canonicals = await prisma.canonicalComponent.findMany({
    where: { key: { in: keys } },
    select: { id: true },
  });
  // Built with a loop rather than .map(). Inference through the Prisma client
  // is where an implicit-any slips past a local typecheck and fails the real
  // build — it has done exactly that twice on this project.
  const ids: string[] = [];
  for (const c of canonicals) ids.push(c.id);
  if (ids.length === 0) return 0;

  await prisma.contractorComponent.updateMany({
    where: { canonicalComponentId: { in: ids } },
    data: { active: false },
  });
  const result = await prisma.canonicalComponent.updateMany({
    where: { id: { in: ids } },
    data: { active: false },
  });
  return result.count;
}
