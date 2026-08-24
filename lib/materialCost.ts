/**
 * Material cost — derivation and propagation.
 *
 * WHY THIS FILE EXISTS
 *
 * `Service.materialCostCents` is a cache of the service's itemized materials.
 * The pricing engine reads that cached number; it never sums ServiceMaterial
 * rows itself. So a material's cost only reaches a customer-facing price if
 * something recomputes the cache afterwards.
 *
 * That recomputation existed twice — once inside `prisma/seed-materials.ts`,
 * once as a private `syncTotal()` in `app/api/admin/materials/route.ts`. Both
 * were correct. Neither was reachable from anywhere else, which meant a
 * supplier sync writing `Material.unitCostCents` directly would have updated
 * the material and moved no prices at all: the reconciler would have reported
 * every service still matching, because every service would still have been
 * pricing off its stale cached total.
 *
 * One implementation, three callers: the seed, the Materials API, and the
 * future supplier sync.
 *
 * WHAT THIS FILE MAY AND MAY NOT WRITE
 *
 * It writes `Material` cost fields and `Service.materialCostCents`. Both are
 * pricing INPUTS. It must never write `basePrice`, `whileWeThereBasePrice`,
 * or any other published customer price — only the admin and named dated
 * migrations may do that (`prisma/_priceGuard.ts`,
 * `scripts/audit-price-writers.ts`). Changing a cost moves the MODEL price;
 * the published price stays put until a person publishes it. That gap is the
 * governance, not a bug.
 *
 * It also does not touch `materialMultiplier`. Clearing that legacy override
 * is an itemization decision — the moment a service's material figures become
 * real — not a consequence of a cost changing. The seed still does it at the
 * point of itemizing.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

/** Any Prisma client or interactive-transaction client. */
type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Package -> unit conversion
// ---------------------------------------------------------------------------

/**
 * Costs arrive as packages and are consumed as units.
 *
 * A 1000 ft box of Cat6 at $189.00 is bought once and used 25 ft at a time.
 * The invoice says $189.00; the material says 18.9 cents per foot. Storing
 * only the rounded 19 makes the two disagree — the box back-computes to
 * $190.00, and a year later nobody can tell a rounding artifact from a price
 * rise.
 *
 * So the package figures are the record and the unit cost is derived from
 * them. `unitCostCents` stays an integer for the pricing engine, which is
 * unchanged; `unitCostMilliCents` carries the precision that lets the package
 * price be reproduced exactly.
 *
 * Milli-cents rather than micro-cents deliberately: an Int column caps near
 * 2.1 billion, so micro-cents would overflow at $21.47 a unit. Milli-cents
 * gives three decimal places on a cent and a ceiling above $21,000, which is
 * comfortably past the most expensive thing on a van.
 */
export type PackageBasis = {
  /** What the package costs, in cents. The invoice figure. */
  packagePriceCents: number;
  /** How many canonical units the package contains. 250 ft, 100 nuts, 1 each. */
  packageQuantity: number;
};

export type DerivedUnitCost = {
  /** Precise per-unit cost. 18.9 cents/ft -> 18900. */
  unitCostMilliCents: number;
  /** Rounded per-unit cost. What the pricing engine consumes. */
  unitCostCents: number;
};

export class MaterialCostError extends Error {}

/**
 * Derive a per-unit cost from a package.
 *
 * Fails closed. A zero or negative package quantity is not a free material —
 * it's bad data, and guessing at it would put a wrong number into every
 * service using the part. The trees fail closed to review; so does this.
 */
export function deriveUnitCost(basis: PackageBasis): DerivedUnitCost {
  const { packagePriceCents, packageQuantity } = basis;

  if (!Number.isFinite(packagePriceCents) || packagePriceCents < 0) {
    throw new MaterialCostError(
      `Package price must be a non-negative number of cents, got ${packagePriceCents}`
    );
  }
  if (!Number.isFinite(packageQuantity) || packageQuantity <= 0) {
    throw new MaterialCostError(
      `Package quantity must be greater than zero, got ${packageQuantity}. ` +
        `A material with no quantity has no unit cost — fix the package data ` +
        `rather than defaulting it.`
    );
  }

  const unitCostMilliCents = Math.round((packagePriceCents * 1000) / packageQuantity);
  return {
    unitCostMilliCents,
    unitCostCents: Math.round(unitCostMilliCents / 1000),
  };
}

/**
 * What the stored integer unit cost implies the package costs.
 *
 * For showing the admin how far the rounded figure sits from the invoice, so
 * a 52-cent discrepancy on a box of wire reads as rounding rather than as a
 * price change nobody logged.
 */
export function impliedPackagePriceCents(
  unitCostCents: number,
  packageQuantity: number
): number {
  return Math.round(unitCostCents * packageQuantity);
}

/**
 * Sum one service's materials.
 *
 * Rounds per line, matching what the seed and the Materials API have always
 * done — 2 ft of 12/2 at 72 c/ft is 144 cents, and the rounding happens on
 * each line rather than once at the end. Changing that would move existing
 * totals by a cent or two and make every reconciled service look like it had
 * drifted, for no gain.
 */
export function assembleMaterialCostCents(
  items: { unitCostCents: number; quantity: number }[]
): number {
  return items.reduce(
    (total, i) => total + Math.round(i.unitCostCents * i.quantity),
    0
  );
}

// ---------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------

export type RecomputeResult = {
  serviceId: string;
  slug: string;
  beforeCents: number | null;
  afterCents: number;
  changed: boolean;
  itemCount: number;
};

/**
 * Recompute one service's cached material total from its current itemized
 * materials.
 *
 * NON-DESTRUCTIVE. Reads ServiceMaterial rows, writes only
 * `Service.materialCostCents`. It never deletes or recreates an assembly —
 * that distinction matters, because the seed's version does exactly that as
 * part of itemizing, and a nightly supplier sync calling into that behaviour
 * would silently rebuild every recipe in the catalog.
 *
 * A service with no itemized materials is left ALONE. Its flat
 * `materialCostCents` is a hand-entered allowance for a service nobody has
 * itemized yet; zeroing it would quietly drop material out of that service's
 * price. Only itemized services have a total to recompute.
 */
export async function recomputeServiceMaterialCost(
  db: Db,
  serviceId: string
): Promise<RecomputeResult | null> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    select: { id: true, slug: true, materialCostCents: true },
  });
  if (!service) return null;

  const links = await db.serviceMaterial.findMany({
    where: { serviceId },
    select: { quantity: true, material: { select: { unitCostCents: true } } },
  });

  // Not itemized — the flat allowance stands. See note above.
  if (links.length === 0) return null;

  const items: { unitCostCents: number; quantity: number }[] = [];
  for (const link of links) {
    items.push({
      unitCostCents: link.material.unitCostCents,
      quantity: link.quantity,
    });
  }

  const total = assembleMaterialCostCents(items);

  const changed = service.materialCostCents !== total;
  if (changed) {
    await db.service.update({
      where: { id: serviceId },
      data: { materialCostCents: total },
    });
  }

  return {
    serviceId,
    slug: service.slug,
    beforeCents: service.materialCostCents,
    afterCents: total,
    changed,
    itemCount: links.length,
  };
}

/**
 * Recompute every service that consumes a given material.
 *
 * This is the function a supplier sync calls after updating a cost, and the
 * reason the sync can't quietly do nothing.
 */
export async function recomputeServicesUsingMaterial(
  db: Db,
  materialId: string
): Promise<RecomputeResult[]> {
  const uses = await db.serviceMaterial.findMany({
    where: { materialId },
    select: { serviceId: true },
  });

  const results: RecomputeResult[] = [];
  for (const { serviceId } of uses) {
    const r = await recomputeServiceMaterialCost(db, serviceId);
    if (r) results.push(r);
  }
  return results;
}

/**
 * Recompute the whole catalog. For the seed's final pass and for verification.
 */
export async function recomputeAllServiceMaterialCosts(
  db: Db
): Promise<RecomputeResult[]> {
  const serviceIds = await db.serviceMaterial.findMany({
    distinct: ["serviceId"],
    select: { serviceId: true },
  });

  const results: RecomputeResult[] = [];
  for (const { serviceId } of serviceIds) {
    const r = await recomputeServiceMaterialCost(db, serviceId);
    if (r) results.push(r);
  }
  return results;
}

/**
 * Clear a service's legacy material multiplier because it has been ITEMIZED.
 *
 * Deliberately separate from the recompute above, and deliberately not called
 * by it.
 *
 * Itemizing is the moment a service's material figures become real, so the
 * global markup should govern from there and an unvalidated imported
 * multiplier should go. A cost changing is a different event entirely: it
 * says nothing about whether an override was a business decision.
 *
 * Fusing the two is how a deliberate override gets destroyed by an unrelated
 * edit. The previous private syncTotal() in the Materials API cleared the
 * multiplier on every call, and one of its callers was the "change a
 * material's cost" action — so editing the price of a GFCI receptacle would
 * have wiped the multiplier AND its recorded reason from every itemized
 * service using one. The reason field exists precisely so nobody has to guess
 * six months later whether a 2.5 was intentional.
 *
 * Only clears when the service actually has itemized rows, so emptying a
 * material list doesn't quietly discard an override either. Clears the reason
 * alongside the multiplier — a reason explaining an override that no longer
 * exists is worse than no reason at all.
 */
export async function clearLegacyMultiplierOnItemize(
  db: Db,
  serviceId: string
): Promise<boolean> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    select: { id: true, materialMultiplier: true },
  });
  if (!service || service.materialMultiplier === null) return false;

  const itemCount = await db.serviceMaterial.count({ where: { serviceId } });
  if (itemCount === 0) return false;

  await db.service.update({
    where: { id: serviceId },
    data: { materialMultiplier: null, materialMultiplierReason: null },
  });
  return true;
}

// ---------------------------------------------------------------------------
// The single entry point for changing a cost
// ---------------------------------------------------------------------------

export type CostProvenance = {
  /** Free text: "admin edit", "lowes sync", "seed-materials", "invoice 4471". */
  reason: string;
  /** Who or what did it. An admin email, or a job name. */
  actor?: string;
  /** Set by the supplier sync so a batch of changes can be read together. */
  syncRunId?: string;
};

export type SetCostInput = {
  materialId: string;
  /** Package figures when known. Preferred — they preserve the invoice. */
  basis?: PackageBasis;
  /**
   * A bare per-unit cost, for materials genuinely priced per unit with no
   * package behind them. Ignored when `basis` is supplied.
   */
  unitCostCents?: number;
  packageUnit?: string;
  confidence?: "CONFIRMED" | "ASSUMED";
};

export type SetCostResult = {
  materialId: string;
  key: string;
  beforeCents: number;
  afterCents: number;
  changed: boolean;
  affected: RecomputeResult[];
};

/**
 * Change a material's cost, record why, and propagate.
 *
 * Every cost change should go through here — admin edit, seed, supplier sync
 * alike — so that three things always happen together: the material updates,
 * a `MaterialCostEvent` records the movement, and every service using the
 * part gets its cached total recomputed.
 *
 * The event log is what lets the reconciler eventually distinguish "this
 * service diverged because Lowe's raised the price of 12/2 on 14 March" from
 * "this service diverged and nobody knows why". Without it, live costs would
 * turn the health check into noise within a month. That reconciler change is
 * a separate drop; the events it will read start accumulating now.
 */
export async function setMaterialUnitCost(
  db: Db,
  input: SetCostInput,
  provenance: CostProvenance
): Promise<SetCostResult> {
  const material = await db.material.findUniqueOrThrow({
    where: { id: input.materialId },
    select: {
      id: true,
      key: true,
      unitCostCents: true,
      unitCostMilliCents: true,
      costSource: true,
    },
  });

  let derived: DerivedUnitCost;
  let packageFields: {
    packagePriceCents: number | null;
    packageQuantity: number | null;
    packageUnit: string | null;
  };

  if (input.basis) {
    derived = deriveUnitCost(input.basis);
    packageFields = {
      packagePriceCents: input.basis.packagePriceCents,
      packageQuantity: input.basis.packageQuantity,
      packageUnit: input.packageUnit ?? null,
    };
  } else {
    if (input.unitCostCents === undefined) {
      throw new MaterialCostError(
        "setMaterialUnitCost needs either a package basis or a unit cost."
      );
    }
    if (!Number.isFinite(input.unitCostCents) || input.unitCostCents < 0) {
      throw new MaterialCostError(
        `Unit cost must be a non-negative number of cents, got ${input.unitCostCents}`
      );
    }
    derived = {
      unitCostCents: Math.round(input.unitCostCents),
      unitCostMilliCents: Math.round(input.unitCostCents) * 1000,
    };
    // No package behind this figure — clear any stale one rather than leaving
    // a package price that no longer reproduces the unit cost.
    packageFields = {
      packagePriceCents: null,
      packageQuantity: null,
      packageUnit: input.packageUnit ?? null,
    };
  }

  const changed = material.unitCostCents !== derived.unitCostCents;

  await db.material.update({
    where: { id: material.id },
    data: {
      unitCostCents: derived.unitCostCents,
      unitCostMilliCents: derived.unitCostMilliCents,
      ...packageFields,
      ...(input.confidence ? { costConfidence: input.confidence } : {}),
      costStatus: "OK",
      costUpdatedAt: new Date(),
    },
  });

  const affected = changed
    ? await recomputeServicesUsingMaterial(db, material.id)
    : [];

  if (changed) {
    await db.materialCostEvent.create({
      data: {
        materialId: material.id,
        oldUnitCostCents: material.unitCostCents,
        newUnitCostCents: derived.unitCostCents,
        oldUnitCostMilliCents: material.unitCostMilliCents,
        newUnitCostMilliCents: derived.unitCostMilliCents,
        source: material.costSource,
        reason: provenance.reason,
        actor: provenance.actor ?? null,
        syncRunId: provenance.syncRunId ?? null,
        affectedServiceIds: affected.filter((a) => a.changed).map((a) => a.serviceId),
      },
    });
  }

  return {
    materialId: material.id,
    key: material.key,
    beforeCents: material.unitCostCents,
    afterCents: derived.unitCostCents,
    changed,
    affected,
  };
}

/**
 * Mark a material's cost as stale or errored WITHOUT changing the cost.
 *
 * Requirement: an API outage or a missing product price retains the last
 * successful cost. The number a customer's price was built from does not move
 * because a request timed out — the material is flagged, the admin sees it,
 * and nothing downstream changes. Fail closed.
 */
export async function markMaterialCostStale(
  db: Db,
  materialId: string,
  status: "STALE" | "ERROR",
  error?: string
): Promise<void> {
  await db.material.update({
    where: { id: materialId },
    data: { costStatus: status, costStatusNote: error ?? null },
  });
}
