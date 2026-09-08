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

import { Prisma, type PrismaClient } from "@prisma/client";
import { assessMaterialReadiness, describeMissing } from "./materialResolution";

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
  /** False when a required role has no cost for this service's contractor. */
  resolved: boolean;
  /** Canonical keys with no cost. Empty when resolved. */
  missingKeys: string[];
};

/**
 * Recompute one service's cached material total from its current itemized
 * materials.
 *
 * NON-DESTRUCTIVE. Reads ServiceMaterial rows, writes only
 * `Service.materialCostCents`. It never deletes or recreates an assembly —
 * that distinction matters, because the seed's version does exactly that as
 * part of itemizing, and a nightly supplier sync calling into that behavior
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
    select: {
      id: true,
      slug: true,
      contractorId: true,
      materialCostCents: true,
      materialCostResolved: true,
    },
  });
  if (!service) return null;

  // A service with no owner cannot have its material costs resolved — there
  // is nobody to resolve them against. Fail closed rather than reaching for
  // "the only contractor", which is the pattern that silently returns the
  // wrong one the day a second contractor exists.
  if (!service.contractorId) {
    throw new MaterialCostError(
      `${service.slug} has no contractor. Its material costs cannot be ` +
        `resolved — run prisma/backfill-service-contractor-2026-08-25.ts.`
    );
  }

  const readiness = await assessMaterialReadiness(db, serviceId, service.contractorId);

  // Not itemized — the flat allowance stands, unchanged. See note above.
  if (readiness.ready && readiness.roles.length === 0) return null;

  if (!readiness.ready) {
    console.error(
      `[materialCost] ${service.slug} cannot be priced: ${describeMissing(readiness.missing)}`
    );
    await db.service.update({
      where: { id: serviceId },
      data: {
        materialCostResolved: false,
        unresolvedMaterialKeys: readiness.missing.map((m) => m.key),
      },
    });
    return {
      serviceId,
      slug: service.slug,
      beforeCents: service.materialCostCents,
      // The previous figure, unchanged. Reported for completeness, and
      // guarded from use by the flag rather than by being zeroed.
      afterCents: service.materialCostCents ?? 0,
      changed: false,
      itemCount: readiness.resolved.length + readiness.missing.length,
      resolved: false,
      missingKeys: readiness.missing.map((m) => m.key),
    };
  }

  const total = readiness.totalCents;
  const changed =
    service.materialCostCents !== total || service.materialCostResolved === false;

  if (changed) {
    await db.service.update({
      where: { id: serviceId },
      data: {
        materialCostCents: total,
        materialCostResolved: true,
        unresolvedMaterialKeys: [],
      },
    });
  }

  return {
    serviceId,
    slug: service.slug,
    beforeCents: service.materialCostCents,
    afterCents: total,
    changed,
    itemCount: readiness.roles.length,
    resolved: true,
    missingKeys: [],
  };
}

/**
 * Recompute every service that consumes a given material ROLE.
 *
 * Scoped to one contractor: a cost is that contractor's, so only their
 * services move. Another contractor using the same role is unaffected, which
 * is the whole point of the split.
 *
 * This is the function a supplier sync calls after updating a cost, and the
 * reason the sync can't quietly do nothing.
 */
/**
 * NAMED ARGUMENTS, DELIBERATELY.
 *
 * This took `(db, canonicalMaterialId, contractorId)` positionally. Both ids
 * are cuid strings, so a caller who swapped them type-checked cleanly, matched
 * nothing, and got back an empty array — which reads exactly like "no service
 * uses this role". It happened: a copper cost was updated, the recompute was
 * called with the last two arguments reversed, and it reported zero services
 * recomputed. The service that did use the role kept a stale material cache,
 * and was one command away from publishing a price derived from a superseded
 * figure.
 *
 * Two changes, because either alone is insufficient:
 *
 *   1. The arguments are named, so there is no position to get wrong.
 *   2. Both ids are CHECKED to resolve. A wrong id now throws instead of
 *      quietly matching nothing — so an empty result means what it says,
 *      which is the property the caller was relying on all along.
 *
 * The second matters more. Named arguments stop this particular mistake; the
 * existence check stops the whole class, including an id that is simply stale
 * or from another environment.
 */
export async function recomputeServicesUsingRole(args: {
  db: Db;
  canonicalMaterialId: string;
  contractorId: string;
}): Promise<RecomputeResult[]> {
  const { db, canonicalMaterialId, contractorId } = args;

  const [role, contractor] = await Promise.all([
    db.canonicalMaterial.findUnique({ where: { id: canonicalMaterialId }, select: { id: true } }),
    db.contractor.findUnique({ where: { id: contractorId }, select: { id: true } }),
  ]);
  if (!role) {
    throw new Error(
      `recomputeServicesUsingRole: no CanonicalMaterial "${canonicalMaterialId}". ` +
        `An empty result would have been indistinguishable from "nothing uses this role".`
    );
  }
  if (!contractor) {
    throw new Error(
      `recomputeServicesUsingRole: no Contractor "${contractorId}". ` +
        `An empty result would have been indistinguishable from "nothing uses this role".`
    );
  }

  const uses = await db.serviceMaterial.findMany({
    where: { canonicalMaterialId, service: { contractorId } },
    select: { serviceId: true },
    distinct: ["serviceId"],
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
  /**
   * The CONTRACTOR's material — their cost for a role — not the canonical
   * role itself. A role has no cost; only a contractor does.
   */
  contractorMaterialId: string;
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
  contractorMaterialId: string;
  /** The canonical role's key, for logging and admin display. */
  key: string;
  beforeCents: number;
  afterCents: number;
  changed: boolean;
  affected: RecomputeResult[];
};

/**
 * Change what ONE contractor pays for a material role, record why, and
 * propagate.
 *
 * Every cost change should go through here — admin edit, seed, supplier sync
 * alike — so that three things always happen together: the contractor
 * material updates, a `MaterialCostEvent` records the movement, and every one
 * of THAT CONTRACTOR's services using the role gets its cached total
 * recomputed.
 *
 * The contractor scoping is the part that matters after the split. Elite
 * changing what they pay for 12/2 must not move another contractor's prices,
 * and the cascade below is filtered accordingly.
 *
 * The event log is what lets the reconciler eventually distinguish "this
 * service diverged because Lowe's raised the price of 12/2 on 14 March" from
 * "this service diverged and nobody knows why". Without it, live costs would
 * turn the health check into noise within a month.
 *
 * ATOMIC, DELIBERATELY. The update, the recompute cascade and the event are
 * one `$transaction` — not three sequential statements hoping nothing fails
 * in between. That gap was real, not hypothetical: `MaterialCostEvent`
 * lacked a `contractorId` column until the fix alongside this one, so the
 * event write threw `NotYetTenantScopedError` on every genuine cost change
 * routed through a guarded caller — after the cost had already been
 * updated. Fixing the column closes that particular throw; wrapping the
 * writes closes the general case, for this and any future failure between
 * the same two statements. Requires a top-level `PrismaClient`, not a
 * `Prisma.TransactionClient` — every real caller already passes one (the
 * guarded client `withContractor`/`withAdminRoute` hand a route), and
 * nesting `$transaction` inside an existing transaction is not something
 * Prisma supports, so the type says so rather than allowing a call nobody
 * makes and everybody could get wrong.
 */
export async function setContractorMaterialCost(
  db: PrismaClient,
  input: SetCostInput,
  provenance: CostProvenance,
  /**
   * TEST SEAM ONLY. Invoked with the transaction client immediately after
   * the cost update, before the recompute cascade and the event write —
   * lets a verifier force a fault between the writes and prove the whole
   * transaction rolls back together, rather than asserting it from reading
   * the code. No production caller passes this; default is untouched.
   */
  injectFaultAfterCostUpdate?: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<SetCostResult> {
  const cm = await db.contractorMaterial.findUniqueOrThrow({
    where: { id: input.contractorMaterialId },
    select: {
      id: true,
      contractorId: true,
      canonicalMaterialId: true,
      unitCostCents: true,
      unitCostMilliCents: true,
      costSource: true,
      canonicalMaterial: { select: { key: true } },
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
        "setContractorMaterialCost needs either a package basis or a unit cost."
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

  const changed = cm.unitCostCents !== derived.unitCostCents;

  // Update, recompute cascade and event: one transaction. If any step
  // throws, Prisma rolls back everything the callback did — the cost update
  // included — so a fault in the event write can never leave a moved cost
  // with no record of having moved.
  const affected = await db.$transaction(async (tx) => {
    await tx.contractorMaterial.update({
      where: { id: cm.id },
      data: {
        unitCostCents: derived.unitCostCents,
        unitCostMilliCents: derived.unitCostMilliCents,
        ...packageFields,
        ...(input.confidence ? { costConfidence: input.confidence } : {}),
        costStatus: "OK",
        costStatusNote: null,
        costUpdatedAt: new Date(),
      },
    });

    if (injectFaultAfterCostUpdate) await injectFaultAfterCostUpdate(tx);

    // Only this contractor's services.
    const recomputed = changed
      ? await recomputeServicesUsingRole({
          db: tx,
          canonicalMaterialId: cm.canonicalMaterialId,
          contractorId: cm.contractorId,
        })
      : [];

    if (changed) {
      await tx.materialCostEvent.create({
        data: {
          contractorMaterialId: cm.id,
          // Set explicitly from the ContractorMaterial row just read — the
          // authoritative relationship — rather than relied on implicitly. A
          // guarded caller's tenant context would stamp the same value; a raw
          // client (a script, a seed) has no context to stamp it from at all,
          // and this event must never be the one row nobody can attribute.
          contractorId: cm.contractorId,
          oldUnitCostCents: cm.unitCostCents,
          newUnitCostCents: derived.unitCostCents,
          oldUnitCostMilliCents: cm.unitCostMilliCents,
          newUnitCostMilliCents: derived.unitCostMilliCents,
          source: cm.costSource,
          reason: provenance.reason,
          actor: provenance.actor ?? null,
          syncRunId: provenance.syncRunId ?? null,
          affectedServiceIds: recomputed.filter((a) => a.changed).map((a) => a.serviceId),
        },
      });
    }

    return recomputed;
  });

  return {
    contractorMaterialId: cm.id,
    key: cm.canonicalMaterial.key,
    beforeCents: cm.unitCostCents,
    afterCents: derived.unitCostCents,
    changed,
    affected,
  };
}

/**
 * Mark a contractor's cost stale or errored WITHOUT changing the cost.
 *
 * Requirement: an API outage or a missing product price retains the last
 * successful cost. The number a customer's price was built from does not move
 * because a request timed out — the material is flagged, the admin sees it,
 * and nothing downstream changes. Fail closed.
 */
export async function markContractorMaterialCostStale(
  db: Db,
  contractorMaterialId: string,
  status: "STALE" | "ERROR",
  error?: string
): Promise<void> {
  await db.contractorMaterial.update({
    where: { id: contractorMaterialId },
    data: { costStatus: status, costStatusNote: error ?? null },
  });
}

// ---------------------------------------------------------------------------
// MATERIAL BASELINE PRICING
//
// Resolving a role this contractor has never costed, from a platform
// reference rather than a blank field. See MaterialBaselineVersion's own doc
// comment in prisma/schema.prisma for what a baseline is and is not.
//
// SERVER-SIDE RESOLUTION, DELIBERATELY. Accepting a baseline never takes a
// cost number from the caller — only a baselineVersionId. Every figure that
// ends up on the ContractorMaterial row is read back out of the
// MaterialBaselineVersion row by this function, so a compromised or buggy
// client can misdirect WHICH role gets resolved but can never inject an
// arbitrary cost under a baseline's name.
// ---------------------------------------------------------------------------

function isUniqueConstraintViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export type ResolveUnresolvedRoleResult =
  | { ok: true; contractorMaterialId: string; unitCostCents: number; affected: RecomputeResult[] }
  /**
   * The role already had a ContractorMaterial row by the time this write
   * reached the database — a concurrent accept, override, or ordinary admin
   * edit won the race. Never overwritten: the FIRST resolution for a role
   * stands, exactly the same "first write wins, everything after refuses"
   * shape the invitation and ownership authorities use elsewhere in this
   * codebase. The caller should treat this as "someone already handled it",
   * not as an error to surface loudly.
   */
  | { ok: false; code: "ALREADY_RESOLVED" };

type ResolvedCreateFields = {
  contractorId: string;
  canonicalMaterialId: string;
  unitCostCents: number;
  unitCostMilliCents: number | null;
  packagePriceCents: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  costSource: "CUSTOM" | "BASELINE";
  costConfidence: "CONFIRMED" | "ASSUMED";
  acceptedBaselineVersionId: string | null;
};

/**
 * The one place a brand-new ContractorMaterial row is born for an
 * UNRESOLVED role — accept and override both end here, sharing one atomic
 * create and one event write so the two paths cannot record history
 * differently for the same kind of act.
 *
 * `create`, never `upsert`. An unresolved role has no row yet by definition;
 * if one exists by the time this reaches the database, that is a race this
 * function lost, not a value to merge into. The unique constraint on
 * (contractorId, canonicalMaterialId) is what makes that atomic — two
 * concurrent callers resolving the SAME role settle to exactly one winner,
 * the same way ContractorInvitation's atomic consume does.
 */
async function createResolvedContractorMaterial(
  db: Db,
  fields: ResolvedCreateFields,
  provenance: CostProvenance,
  baselineVersionId: string | null
): Promise<ResolveUnresolvedRoleResult> {
  let cm: { id: string };
  try {
    cm = await db.contractorMaterial.create({
      data: {
        contractorId: fields.contractorId,
        canonicalMaterialId: fields.canonicalMaterialId,
        unitCostCents: fields.unitCostCents,
        unitCostMilliCents: fields.unitCostMilliCents,
        packagePriceCents: fields.packagePriceCents,
        packageQuantity: fields.packageQuantity,
        packageUnit: fields.packageUnit,
        costSource: fields.costSource,
        costConfidence: fields.costConfidence,
        costStatus: "OK",
        costUpdatedAt: new Date(),
        acceptedBaselineVersionId: fields.acceptedBaselineVersionId,
      },
      select: { id: true },
    });
  } catch (e) {
    if (isUniqueConstraintViolation(e)) return { ok: false, code: "ALREADY_RESOLVED" };
    throw e;
  }

  // Only this contractor's services — same scoping setContractorMaterialCost
  // uses, for the same reason.
  const affected = await recomputeServicesUsingRole({
    db, canonicalMaterialId: fields.canonicalMaterialId, contractorId: fields.contractorId,
  });

  // ALWAYS written, unlike setContractorMaterialCost's guarded `if (changed)`
  // — a brand-new role resolving from nothing IS the change; there is no
  // "before" value an unchanged write could be measured against.
  await db.materialCostEvent.create({
    data: {
      contractorMaterialId: cm.id,
      contractorId: fields.contractorId,
      newUnitCostCents: fields.unitCostCents,
      newUnitCostMilliCents: fields.unitCostMilliCents,
      source: fields.costSource,
      baselineVersionId,
      reason: provenance.reason,
      actor: provenance.actor ?? null,
      syncRunId: provenance.syncRunId ?? null,
      affectedServiceIds: affected.filter((a) => a.changed).map((a) => a.serviceId),
    },
  });

  return { ok: true, contractorMaterialId: cm.id, unitCostCents: fields.unitCostCents, affected };
}

export type AcceptBaselineResult = ResolveUnresolvedRoleResult | { ok: false; code: "BASELINE_NOT_FOUND" };

/**
 * Accept a platform Material Baseline for a role this contractor has not
 * costed yet.
 *
 * Takes ONLY a baselineVersionId — see the section header for why. Every
 * figure written (cost, package basis, unit) is read back from the
 * MaterialBaselineVersion row itself, never from the caller.
 *
 * `costConfidence: ASSUMED`, always. A baseline is a reference figure, not an
 * invoice this contractor holds — the same distinction CONFIRMED/ASSUMED
 * already draws for a hand-entered cost that is a working guess rather than
 * a confirmed number.
 */
export async function acceptMaterialBaselineVersion(
  db: Db,
  params: { contractorId: string; baselineVersionId: string },
  provenance: CostProvenance
): Promise<AcceptBaselineResult> {
  const version = await db.materialBaselineVersion.findUnique({
    where: { id: params.baselineVersionId },
    select: {
      id: true, canonicalMaterialId: true, unitCostCents: true, unitCostMilliCents: true,
      packagePriceCents: true, packageQuantity: true, packageUnit: true,
    },
  });
  if (!version) return { ok: false, code: "BASELINE_NOT_FOUND" };

  return createResolvedContractorMaterial(
    db,
    {
      contractorId: params.contractorId,
      canonicalMaterialId: version.canonicalMaterialId,
      unitCostCents: version.unitCostCents,
      unitCostMilliCents: version.unitCostMilliCents,
      packagePriceCents: version.packagePriceCents,
      packageQuantity: version.packageQuantity,
      packageUnit: version.packageUnit,
      costSource: "BASELINE",
      costConfidence: "ASSUMED",
      acceptedBaselineVersionId: version.id,
    },
    provenance,
    version.id
  );
}

export type OverrideUnresolvedMaterialCostInput = {
  contractorId: string;
  canonicalMaterialId: string;
  /** Package figures when known — preferred, for the same reason as SetCostInput. */
  basis?: PackageBasis;
  /** A bare per-unit cost, when there is no package behind it. Ignored when `basis` is supplied. */
  unitCostCents?: number;
  packageUnit?: string;
};

/**
 * Resolve a role this contractor has not costed yet with THEIR OWN figure,
 * instead of accepting the baseline offered (or when none is offered at
 * all). Always lands as CUSTOM, confirmed — this is exactly the "individual
 * override" the batch-review screen offers alongside bulk baseline
 * acceptance, sharing the same atomic create-and-event path so the history
 * an accept leaves and the history an override leaves are the same shape.
 */
export async function overrideUnresolvedMaterialCost(
  db: Db,
  input: OverrideUnresolvedMaterialCostInput,
  provenance: CostProvenance
): Promise<ResolveUnresolvedRoleResult> {
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
        "overrideUnresolvedMaterialCost needs either a package basis or a unit cost."
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
    packageFields = { packagePriceCents: null, packageQuantity: null, packageUnit: input.packageUnit ?? null };
  }

  return createResolvedContractorMaterial(
    db,
    {
      contractorId: input.contractorId,
      canonicalMaterialId: input.canonicalMaterialId,
      unitCostCents: derived.unitCostCents,
      unitCostMilliCents: derived.unitCostMilliCents,
      ...packageFields,
      costSource: "CUSTOM",
      costConfidence: "CONFIRMED",
      acceptedBaselineVersionId: null,
    },
    provenance,
    null
  );
}

export type OfferedBaseline = {
  id: string;
  unitCostCents: number;
  unit: string;
  sourceLabel: string;
  sourceUrl: string | null;
  specNote: string;
  sourcedAt: Date;
};

/**
 * The current baseline offer per canonical role — the most recently sourced
 * MaterialBaselineVersion for each id in the list. "Current" is computed
 * here, not stored anywhere: see the model's own doc comment on why there is
 * no supersededAt to maintain.
 *
 * A role with no baseline at all is simply absent from the returned map —
 * the batch-review screen still lists it, with override as the only path.
 */
export async function latestBaselineVersionsFor(
  db: Db,
  canonicalMaterialIds: string[]
): Promise<Map<string, OfferedBaseline>> {
  if (canonicalMaterialIds.length === 0) return new Map();

  const rows = await db.materialBaselineVersion.findMany({
    where: { canonicalMaterialId: { in: canonicalMaterialIds } },
    orderBy: { sourcedAt: "desc" },
    select: {
      id: true, canonicalMaterialId: true, unitCostCents: true, unit: true,
      sourceLabel: true, sourceUrl: true, specNote: true, sourcedAt: true,
    },
  });

  // First hit per id wins — rows arrive newest-sourced first.
  const out = new Map<string, OfferedBaseline>();
  for (const r of rows) {
    if (out.has(r.canonicalMaterialId)) continue;
    out.set(r.canonicalMaterialId, {
      id: r.id, unitCostCents: r.unitCostCents, unit: r.unit,
      sourceLabel: r.sourceLabel, sourceUrl: r.sourceUrl, specNote: r.specNote, sourcedAt: r.sourcedAt,
    });
  }
  return out;
}
