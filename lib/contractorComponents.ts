/**
 * Resolving a component ROLE to what one contractor charges for it.
 *
 * The component twin of `resolveContractorCosts` in lib/materialResolution.ts,
 * and deliberately the same shape: take the canonical roles a service needs,
 * return one contractor's economics for them, keyed by role.
 *
 * WHY THIS EXISTS RATHER THAN A NESTED INCLUDE
 *
 * Components used to be loaded as `CanonicalComponent.include(contractorComponents)`
 * with a hand-written `where: { contractorId }` on the nested read. That was
 * correct, and it was correct only because someone remembered to write it.
 *
 * The live harness (scripts/verify-tenant-isolation-live.ts, NESTED READS)
 * proved why that matters: Prisma query extensions fire on the TOP-LEVEL
 * operation only. A nested include is part of the parent query and is never
 * intercepted. `CanonicalComponent` is a PLATFORM model, so the tenant guard
 * waves the whole query through — and the nested relation then returns every
 * contractor's economics. Run from a throwaway contractor's context, that
 * traversal read 5 of Elite's contractor components.
 *
 * So the fix is not to decorate nested includes with manual filters forever.
 * It is to stop asking a platform model for tenant data:
 *
 *   UNSAFE   CanonicalComponent (platform)  -> contractorComponents (tenant)
 *   SAFE     ContractorComponent (tenant)   -> canonicalComponent (platform)
 *
 * Rooting at the tenant-owned model puts the query back under the guard, where
 * the contractor filter is enforced rather than remembered.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * One contractor's economics for one component role.
 *
 * `approvedPriceCents` is nullable and that nullability is load-bearing: null
 * means this contractor has never priced the role, and the route must go to
 * review rather than quote a figure. Never zero, never a default.
 */
export type OwnComponent = {
  labelOverride: string | null;
  approvedPriceCents: number | null;
  addFieldLaborHours: number;
  addMaterialCostCents: number;
  addScheduleMinutes: number;
  addTechCount: number;
};

/** Keyed by `canonicalComponentId`. A missing key means unpriced, not free. */
export type OwnComponentMap = ReadonlyMap<string, OwnComponent>;

/**
 * Load this contractor's economics for the given component roles.
 *
 * Rooted at ContractorComponent so the tenant guard executes on it. The
 * `contractorId` filter is passed explicitly because most callers still run on
 * the unguarded client — it is belt and braces, not the only control, and it
 * stays correct once the guard is attached.
 *
 * NOT filtered on `active`. The unique constraint is (contractorId,
 * canonicalComponentId), so there is at most one row per role either way, and
 * the nested include this replaces did not filter on it. Adding that filter
 * here would silently reprice every service whose contractor had deactivated a
 * component — a behaviour change wearing a refactor's clothes.
 */
export async function loadOwnComponents(
  db: Db,
  contractorId: string,
  canonicalComponentIds: string[]
): Promise<OwnComponentMap> {
  const out = new Map<string, OwnComponent>();
  if (canonicalComponentIds.length === 0) return out;

  const rows = await db.contractorComponent.findMany({
    where: {
      contractorId,
      canonicalComponentId: { in: [...new Set(canonicalComponentIds)] },
    },
    select: {
      canonicalComponentId: true,
      labelOverride: true,
      approvedPriceCents: true,
      addFieldLaborHours: true,
      addMaterialCostCents: true,
      addScheduleMinutes: true,
      addTechCount: true,
    },
  });

  // A loop rather than rows.map(), for the reason recorded in
  // materialResolution.ts: inference through the Prisma client is exactly
  // where an implicit-any slips past a local typecheck and fails the build.
  for (const r of rows) {
    out.set(r.canonicalComponentId, {
      labelOverride: r.labelOverride,
      approvedPriceCents: r.approvedPriceCents,
      addFieldLaborHours: r.addFieldLaborHours,
      addMaterialCostCents: r.addMaterialCostCents,
      addScheduleMinutes: r.addScheduleMinutes,
      addTechCount: r.addTechCount,
    });
  }
  return out;
}

/**
 * Every canonical component role reachable through a loaded service tree.
 *
 * Shaped as the minimum the walk needs rather than a Prisma type, so it works
 * against both loaders without coupling them to each other.
 */
export function canonicalComponentIdsIn(service: {
  questions: {
    options: { components: { canonicalComponentId: string | null }[] }[];
  }[];
}): string[] {
  const ids: string[] = [];
  for (const q of service.questions) {
    for (const o of q.options) {
      for (const c of o.components) {
        if (c.canonicalComponentId) ids.push(c.canonicalComponentId);
      }
    }
  }
  return ids;
}
