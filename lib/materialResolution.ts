/**
 * Resolving a material ROLE to what one contractor pays for it.
 *
 * THE INVARIANT THIS EXISTS TO ENFORCE
 *
 *   A homeowner-facing price may never be calculated using an unresolved
 *   required material cost. Missing required cost = no price.
 *
 * Not "treat it as zero", not "leave it out of the total", not "price the
 * rest and hope". A service whose recipe needs a role the contractor has not
 * costed cannot produce a price, and says so.
 *
 * WHY THIS BECOMES POSSIBLE NOW
 *
 * Before the canonical/contractor split there was one Material row carrying
 * both the role and the cost, so a role without a cost could not exist. After
 * the split it can, and it will: the whole point of the template library is
 * that a contractor receives service definitions BEFORE entering their own
 * economics. Contractor B will have a catalog full of roles they have not
 * priced yet, on day one, by design.
 *
 * That is a feature. What must not happen is those services quietly pricing
 * as though the unpriced materials were free.
 *
 * Defense IN DEPTH
 *
 *   1. Activation is blocked  — a service cannot go live until every role it
 *                               requires resolves. Catches configuration
 *                               mistakes before a homeowner sees anything.
 *   2. Pricing fails closed   — even after activation, an unresolved role
 *                               routes to review. Catches what activation
 *                               cannot: a deleted cost, a template update, a
 *                               bad import, a migration.
 *
 * The first makes the second rare. The second is why the first is not relied
 * upon.
 *
 * WHAT COUNTS AS REQUIRED
 *
 * Every ServiceMaterial row. Today that is the whole story: itemized roles
 * exist only on the base recipe, and everything conditional — components,
 * answer options — carries material as a flat cents figure rather than a role
 * reference.
 *
 * When conditional material becomes itemized, readiness must be assessed
 * against the roles reachable by the service's possible pricing paths rather
 * than every role associated with the template. The shape below is built for
 * that: requiredRolesFor() is the single place that decides, so widening it
 * later is one function rather than a search.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type RequiredRole = {
  canonicalMaterialId: string;
  key: string;
  name: string;
  quantity: number;
};

export type ResolvedRole = RequiredRole & {
  unitCostCents: number;
  contractorMaterialId: string;
};

export type MaterialReadiness =
  | { ready: true; roles: ResolvedRole[]; totalCents: number }
  | { ready: false; missing: RequiredRole[]; resolved: ResolvedRole[] };

export class MaterialResolutionError extends Error {}

/**
 * The roles a service requires.
 *
 * The one place that decides what "required" means. Today: every itemized
 * row on the base recipe. When conditional material becomes itemized, this is
 * where the reachable-paths logic goes — an optional role should only block
 * readiness on the pricing paths that actually consume it.
 */
export async function requiredRolesFor(
  db: Db,
  serviceId: string
): Promise<RequiredRole[]> {
  const rows = await db.serviceMaterial.findMany({
    where: { serviceId },
    orderBy: { order: "asc" },
    select: {
      quantity: true,
      canonicalMaterialId: true,
      canonicalMaterial: { select: { id: true, key: true, name: true } },
    },
  });

  const roles: RequiredRole[] = [];
  for (const r of rows) {
    if (!r.canonicalMaterial) {
      // A recipe line pointing at nothing. Should be impossible after the
      // migration, which reported zero unlinked — but if it happens, it is a
      // broken recipe rather than a free material.
      throw new MaterialResolutionError(
        `Service ${serviceId} has a material line with no canonical role. ` +
          `The recipe is broken; it must not be priced.`
      );
    }
    roles.push({
      canonicalMaterialId: r.canonicalMaterial.id,
      key: r.canonicalMaterial.key,
      name: r.canonicalMaterial.name,
      quantity: r.quantity,
    });
  }
  return roles;
}

/**
 * What one contractor pays for a set of roles.
 *
 * Returns only what actually resolves. A role with no ContractorMaterial, or
 * one marked inactive, is simply absent from the map — the caller decides
 * what that means, and every caller here treats it as fatal.
 */
export async function contractorCostsFor(
  db: Db,
  contractorId: string,
  canonicalMaterialIds: string[]
): Promise<Map<string, { unitCostCents: number; contractorMaterialId: string }>> {
  if (canonicalMaterialIds.length === 0) return new Map();

  const rows = await db.contractorMaterial.findMany({
    where: {
      contractorId,
      canonicalMaterialId: { in: canonicalMaterialIds },
      active: true,
    },
    select: { id: true, canonicalMaterialId: true, unitCostCents: true },
  });

  // Built with a loop rather than rows.map(). Inference through the Prisma
  // client is exactly where an implicit-any slips past a local typecheck and
  // fails the real build — which is how an unused spike broke the deploy.
  const out = new Map<string, { unitCostCents: number; contractorMaterialId: string }>();
  for (const r of rows) {
    out.set(r.canonicalMaterialId, {
      unitCostCents: r.unitCostCents,
      contractorMaterialId: r.id,
    });
  }
  return out;
}

/**
 * Can this contractor price this service's materials?
 *
 * The single question both guards ask. Activation calls it before allowing a
 * service to go live; the cost recompute calls it before writing a total.
 */
export async function assessMaterialReadiness(
  db: Db,
  serviceId: string,
  contractorId: string
): Promise<MaterialReadiness> {
  const required = await requiredRolesFor(db, serviceId);

  // A service with no itemized materials is ready by definition. Its flat
  // allowance is a hand-entered figure and there is nothing to resolve.
  if (required.length === 0) return { ready: true, roles: [], totalCents: 0 };

  const costs = await contractorCostsFor(
    db,
    contractorId,
    required.map((r) => r.canonicalMaterialId)
  );

  const resolved: ResolvedRole[] = [];
  const missing: RequiredRole[] = [];

  for (const role of required) {
    const cost = costs.get(role.canonicalMaterialId);
    if (!cost) {
      missing.push(role);
      continue;
    }
    resolved.push({ ...role, ...cost });
  }

  if (missing.length > 0) return { ready: false, missing, resolved };

  // Rounds per line, matching what every previous implementation did. 2 ft of
  // 12/2 at 72 c/ft is 144 cents, and the rounding happens on each line
  // rather than once at the end. Changing that would shift existing totals
  // and make every reconciled service look like it had drifted.
  const totalCents = resolved.reduce(
    (t, r) => t + Math.round(r.unitCostCents * r.quantity),
    0
  );

  return { ready: true, roles: resolved, totalCents };
}

/**
 * A short, human sentence for an admin screen or a log line.
 *
 * Names the roles rather than counting them — "needs a cost for CABLE_CAT6"
 * is actionable, "3 materials unpriced" sends someone hunting.
 */
export function describeMissing(missing: RequiredRole[]): string {
  if (missing.length === 0) return "";
  const names = missing.map((m) => `${m.name} (${m.key})`);
  if (names.length === 1) return `no cost entered for ${names[0]}`;
  if (names.length <= 3) return `no cost entered for ${names.join(", ")}`;
  return (
    `no cost entered for ${names.slice(0, 3).join(", ")} ` +
    `and ${names.length - 3} more`
  );
}
