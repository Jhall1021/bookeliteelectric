import { NextResponse } from "next/server";

import type { PrismaClient } from "@prisma/client";
import {
  setContractorMaterialCost,
  recomputeServiceMaterialCost,
  recomputeServicesUsingRole,
  clearLegacyMultiplierOnItemize,
  deriveUnitCost,
  impliedPackagePriceCents,
  MaterialCostError,
} from "@/lib/materialCost";
import { withAdminRoute } from "@/lib/adminContext";

/**
 * A service's material list, and the shared catalog behind it.
 *
 * Two things happen here that are easy to get wrong:
 *
 *   1. Editing a material's COST changes it everywhere. That's the point —
 *      a price rise on GFCI receptacles should reprice every service using
 *      one — but it means an edit here is never local, so the response says
 *      how many other services moved.
 *
 *   2. Itemizing a service clears its legacy materialMultiplier. Those
 *      imported values are unvalidated data, not deliberate overrides, and
 *      itemizing is the moment a service's figures become real. A deliberate
 *      override is set separately and carries a reason.
 *
 * WHAT CHANGED, AND WHY
 *
 * This route used to carry a private syncTotal() that did both jobs at once:
 * recompute the cached total, and clear the multiplier. It was right for the
 * itemizing actions and wrong for the cost action, which also called it — so
 * changing the price of a receptacle would have cleared the deliberate
 * multiplier AND its recorded reason from every itemized service using one.
 * Latent rather than active, because the seed already clears the multiplier
 * on the services it itemizes, so the overlap set is empty today. It stops
 * being empty the first time somebody sets an intentional override on an
 * itemized service — which is exactly what the field is for.
 *
 * The recompute now lives in lib/materialCost.ts, shared with the seed and
 * with any future supplier sync. The multiplier clear is a separate call made
 * only by the actions that actually itemize. Both changes come from one
 * principle: a cost changing and a recipe changing are different events.
 *
 * WHAT THIS ROUTE MAY WRITE
 *
 * Material cost fields and Service.materialCostCents — pricing INPUTS. Never
 * basePrice or whileWeThereBasePrice; published prices move only through the
 * service admin and named dated migrations. See prisma/_priceGuard.ts and
 * scripts/audit-price-writers.ts.
 */

/** Recompute the cached total and return it, for the JSON response. */
async function totalFor(db: PrismaClient, serviceId: string): Promise<number> {
  // The shared helpers stay dependency-injected: they operate on the database
  // capability they are handed. Tenant context belongs at the request
  // boundary, not inside a helper.
  const result = await recomputeServiceMaterialCost(db, serviceId);
  if (result) return result.afterCents;
  // No itemized rows left. The recompute deliberately leaves a non-itemized
  // service's flat allowance alone rather than zeroing it, so read back what
  // the service actually holds instead of asserting zero.
  const svc = await db.service.findUnique({
    where: { id: serviceId },
    select: { materialCostCents: true },
  });
  return svc?.materialCostCents ?? 0;
}

/**
 * The three actions that change a RECIPE: recompute, then clear the legacy
 * multiplier because itemizing has happened. Cost edits do not come here.
 */
async function afterRecipeChange(db: PrismaClient, serviceId: string) {
  const totalCents = await totalFor(db, serviceId);
  const clearedMultiplier = await clearLegacyMultiplierOnItemize(db, serviceId);
  return { totalCents, clearedMultiplier };
}

function requiredString(value: unknown, label: string): string | NextResponse {
  if (typeof value !== "string" || value.trim() === "") {
    return NextResponse.json({ error: `${label} is required.` }, { status: 400 });
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | undefined | NextResponse {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    return NextResponse.json({ error: `${label} must be text.` }, { status: 400 });
  }
  return value.trim() || undefined;
}

function numberValue(
  value: unknown,
  label: string,
  options: { min?: number; greaterThan?: number; integer?: boolean } = {},
): number | NextResponse {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NextResponse.json({ error: `${label} must be a valid number.` }, { status: 400 });
  }
  if (options.integer && !Number.isSafeInteger(value)) {
    return NextResponse.json({ error: `${label} must be a safe whole number.` }, { status: 400 });
  }
  if (options.min !== undefined && value < options.min) {
    return NextResponse.json({ error: `${label} must be ${options.min} or greater.` }, { status: 400 });
  }
  if (options.greaterThan !== undefined && value <= options.greaterThan) {
    return NextResponse.json({ error: `${label} must be greater than ${options.greaterThan}.` }, { status: 400 });
  }
  return value;
}

function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

function confidenceValue(value: unknown): "CONFIRMED" | "ASSUMED" | undefined | NextResponse {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "CONFIRMED" || value === "ASSUMED") return value;
  return NextResponse.json({ error: "Choose a valid cost confidence." }, { status: 400 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  // The catalog is this contractor's costed roles, not a global material
  // list. Two contractors filling the same role each see their own figure.

  // GUARD-ADOPTED (ADR-007a). Everything below is this contractor's, on the
  // guarded client.
  //
  // ADR-007: the catalog roots at ContractorMaterial, the tenant-owned model,
  // and includes the canonical role from there. Rooting at CanonicalMaterial
  // and nesting contractorMaterials would be the platform-parent shape the
  // live harness proved the guard cannot see.
  return withAdminRoute(async (db, ctx) => {
    const contractorId = ctx.contractorId;
    const catalog = await db.contractorMaterial.findMany({
      where: { contractorId, active: true },
      orderBy: { canonicalMaterial: { name: "asc" } },
      include: {
        canonicalMaterial: { select: { id: true, key: true, name: true, unit: true } },
        activeSupplierLink: {
          select: {
            id: true,
            supplier: true,
            supplierProductId: true,
            productName: true,
            productUrl: true,
            storeLabel: true,
            packagePriceCents: true,
            packageQuantity: true,
            packageUnit: true,
            lastSyncedAt: true,
            lastSyncStatus: true,
          },
        },
      },
    });

    const catalogOut = catalog.map((c) => ({
      /** The CONTRACTOR material's id — what a cost edit targets. */
      id: c.id,
      canonicalMaterialId: c.canonicalMaterialId,
      key: c.canonicalMaterial.key,
      name: c.nameOverride ?? c.canonicalMaterial.name,
      unit: c.canonicalMaterial.unit,
      unitCostCents: c.unitCostCents,
      costSource: c.costSource,
      costConfidence: c.costConfidence,
      costStatus: c.costStatus,
      packagePriceCents: c.packagePriceCents,
      packageQuantity: c.packageQuantity,
      packageUnit: c.packageUnit,
      activeSupplierLink: c.activeSupplierLink,
    }));

    if (!serviceId) return NextResponse.json({ catalog: catalogOut, items: [] });

    const items = await db.serviceMaterial.findMany({
      where: { serviceId },
      orderBy: { order: "asc" },
      include: { canonicalMaterial: true },
    });

    // A recipe line whose role this contractor hasn't costed is reported as
    // unpriced rather than shown at zero. A dash-priced row that still sums
    // into a total is how a job gets underquoted.
    const costs = new Map(catalog.map((c) => [c.canonicalMaterialId, c]));

    return NextResponse.json({
      catalog: catalogOut,
      items: items.map((i) => {
        const cost = i.canonicalMaterialId ? costs.get(i.canonicalMaterialId) : undefined;
        return {
          id: i.id,
          canonicalMaterialId: i.canonicalMaterialId,
          contractorMaterialId: cost?.id ?? null,
          key: i.canonicalMaterial?.key ?? null,
          name: cost?.nameOverride ?? i.canonicalMaterial?.name ?? null,
          unit: i.canonicalMaterial?.unit ?? null,
          quantity: i.quantity,
          unitCostCents: cost?.unitCostCents ?? null,
          lineTotalCents: cost ? Math.round(cost.unitCostCents * i.quantity) : null,
          /** True when this contractor has no cost for the role. */
          unpriced: !cost,
          costSource: cost?.costSource ?? null,
          costConfidence: cost?.costConfidence ?? null,
          costStatus: cost?.costStatus ?? null,
          packagePriceCents: cost?.packagePriceCents ?? null,
          packageQuantity: cost?.packageQuantity ?? null,
          packageUnit: cost?.packageUnit ?? null,
        };
      }),
    });
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (typeof action !== "string") {
    return NextResponse.json({ error: "A materials action is required." }, { status: 400 });
  }

  // GUARD-ADOPTED (ADR-007a). One context for the whole handler; every action
  // below reads and writes through the guarded client.
  return withAdminRoute(async (db, ctx) => {
    const contractorId = ctx.contractorId;
    try {
      // ---- add a material to a service ----------------------------------
      if (action === "add") {
        const serviceId = requiredString(body.serviceId, "serviceId");
        if (isResponse(serviceId)) return serviceId;
        const canonicalMaterialId = requiredString(body.canonicalMaterialId, "canonicalMaterialId");
        if (isResponse(canonicalMaterialId)) return canonicalMaterialId;
        const quantity = body.quantity === undefined
          ? 1
          : numberValue(body.quantity, "Quantity", { greaterThan: 0 });
        if (isResponse(quantity)) return quantity;

        const count = await db.serviceMaterial.count({ where: { serviceId } });
        // ADR-010: ServiceMaterial is DERIVED-owned, so upsert() would throw —
        // there is no contractorId to stamp on the create half and the guard
        // refuses to invent one. Split into a scoped update and, failing that, a
        // nested create through the already-scoped Service, which makes
        // ownership structural rather than asserted.
        const existingLine = await db.serviceMaterial.findFirst({
          where: { serviceId, canonicalMaterialId },
          select: { id: true },
        });
        if (existingLine) {
          await db.serviceMaterial.update({
            where: { id: existingLine.id },
            data: { quantity },
          });
        } else {
          await db.service.update({
            where: { id: serviceId },
            data: {
              materials: {
                create: { canonicalMaterialId, quantity, order: count },
              },
            },
          });
        }
        const { totalCents } = await afterRecipeChange(db, serviceId);
        return NextResponse.json({ ok: true, totalCents });
      }

      // ---- change how much of it a service uses --------------------------
      if (action === "quantity") {
        const id = requiredString(body.id, "Material line id");
        if (isResponse(id)) return id;
        const quantity = numberValue(body.quantity, "Quantity", { min: 0 });
        if (isResponse(quantity)) return quantity;

        const row = await db.serviceMaterial.findUnique({ where: { id } });
        if (!row) return NextResponse.json({ error: "Material line not found" }, { status: 404 });
        await db.serviceMaterial.update({
          where: { id },
          data: { quantity },
        });
        const { totalCents } = await afterRecipeChange(db, row.serviceId);
        return NextResponse.json({ ok: true, totalCents });
      }

      // ---- take a material off a service ---------------------------------
      if (action === "remove") {
        const id = requiredString(body.id, "Material line id");
        if (isResponse(id)) return id;
        const row = await db.serviceMaterial.findUnique({ where: { id } });
        if (!row) return NextResponse.json({ error: "Material line not found" }, { status: 404 });
        await db.serviceMaterial.delete({ where: { id } });
        const { totalCents } = await afterRecipeChange(db, row.serviceId);
        return NextResponse.json({ ok: true, totalCents });
      }

      // ---- change a material's cost, everywhere --------------------------
      // Does NOT touch materialMultiplier. See the note at the top of the file.
      if (action === "cost") {
        const contractorMaterialId = requiredString(body.contractorMaterialId, "contractorMaterialId");
        if (isResponse(contractorMaterialId)) return contractorMaterialId;
        const packageUnit = optionalString(body.packageUnit, "Package unit");
        if (isResponse(packageUnit)) return packageUnit;
        const confidence = confidenceValue(body.confidence);
        if (isResponse(confidence)) return confidence;

        const hasPackagePrice = body.packagePriceCents !== undefined && body.packagePriceCents !== null;
        const hasPackageQuantity = body.packageQuantity !== undefined && body.packageQuantity !== null;
        if (hasPackagePrice !== hasPackageQuantity) {
          return NextResponse.json(
            { error: "Package price and package quantity must be provided together." },
            { status: 400 },
          );
        }

        let packagePriceCents: number | undefined;
        let packageQuantity: number | undefined;
        let unitCostCents: number | undefined;

        if (hasPackagePrice && hasPackageQuantity) {
          const parsedPrice = numberValue(body.packagePriceCents, "Package price", { min: 0, integer: true });
          if (isResponse(parsedPrice)) return parsedPrice;
          const parsedQuantity = numberValue(body.packageQuantity, "Package quantity", { greaterThan: 0 });
          if (isResponse(parsedQuantity)) return parsedQuantity;
          packagePriceCents = parsedPrice;
          packageQuantity = parsedQuantity;
        } else {
          const parsedUnit = numberValue(body.unitCostCents, "Unit cost", { min: 0, integer: true });
          if (isResponse(parsedUnit)) return parsedUnit;
          unitCostCents = parsedUnit;
        }

        // How many of THIS contractor's services hold the role, independent of
        // whether the cost moved — preserves the existing response contract.
        const cm = await db.contractorMaterial.findUnique({
          where: { id: contractorMaterialId },
          select: { canonicalMaterialId: true, contractorId: true },
        });
        if (!cm) {
          return NextResponse.json({ error: "Unknown material" }, { status: 404 });
        }
        const using = await db.serviceMaterial.findMany({
          where: {
            canonicalMaterialId: cm.canonicalMaterialId,
            service: { contractorId: cm.contractorId },
          },
          select: { serviceId: true },
          distinct: ["serviceId"],
        });

        const result = await setContractorMaterialCost(
          db,
          {
            contractorMaterialId,
            ...(packagePriceCents !== undefined && packageQuantity !== undefined
              ? { basis: { packagePriceCents, packageQuantity } }
              : { unitCostCents: unitCostCents! }),
            packageUnit,
            confidence,
          },
          { reason: "admin edit", actor: "admin" },
        );

        return NextResponse.json({
          ok: true,
          affectedServices: using.length,
          changed: result.changed,
          beforeCents: result.beforeCents,
          afterCents: result.afterCents,
          servicesMoved: result.affected.filter((a) => a.changed).length,
          movedServices: result.affected
            .filter((a) => a.changed)
            .map((a) => ({ slug: a.slug, beforeCents: a.beforeCents, afterCents: a.afterCents })),
          stillUnresolved: result.affected
            .filter((a) => !a.resolved)
            .map((a) => ({ slug: a.slug, missingKeys: a.missingKeys })),
        });
      }

      // ---- preview a package conversion before committing it -------------
      if (action === "preview-package") {
        const packagePriceCents = numberValue(body.packagePriceCents, "Package price", { min: 0, integer: true });
        if (isResponse(packagePriceCents)) return packagePriceCents;
        const packageQuantity = numberValue(body.packageQuantity, "Package quantity", { greaterThan: 0 });
        if (isResponse(packageQuantity)) return packageQuantity;

        const derived = deriveUnitCost({ packagePriceCents, packageQuantity });
        const implied = impliedPackagePriceCents(derived.unitCostCents, packageQuantity);
        return NextResponse.json({
          ok: true,
          ...derived,
          impliedPackagePriceCents: implied,
          roundingDriftCents: implied - packagePriceCents,
        });
      }

      // ---- add a new part to the catalog ---------------------------------
      // The key is a CANONICAL ROLE, not a product.
      if (action === "create") {
        const keyInput = requiredString(body.key, "Key");
        if (isResponse(keyInput)) return keyInput;
        const name = requiredString(body.name, "Name");
        if (isResponse(name)) return name;
        const unit = optionalString(body.unit, "Unit");
        if (isResponse(unit)) return unit;
        const packageUnit = optionalString(body.packageUnit, "Package unit");
        if (isResponse(packageUnit)) return packageUnit;
        const confidence = confidenceValue(body.confidence);
        if (isResponse(confidence)) return confidence;

        const key = keyInput.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        if (!key) {
          return NextResponse.json({ error: "Key must contain at least one letter or number." }, { status: 400 });
        }

        const hasPackagePrice = body.packagePriceCents !== undefined && body.packagePriceCents !== null;
        const hasPackageQuantity = body.packageQuantity !== undefined && body.packageQuantity !== null;
        if (hasPackagePrice !== hasPackageQuantity) {
          return NextResponse.json(
            { error: "Package price and package quantity must be provided together." },
            { status: 400 },
          );
        }

        let packagePriceCents: number | undefined;
        let packageQuantity: number | undefined;
        let derived: { unitCostCents: number; unitCostMilliCents: number };

        if (hasPackagePrice && hasPackageQuantity) {
          const parsedPrice = numberValue(body.packagePriceCents, "Package price", { min: 0, integer: true });
          if (isResponse(parsedPrice)) return parsedPrice;
          const parsedQuantity = numberValue(body.packageQuantity, "Package quantity", { greaterThan: 0 });
          if (isResponse(parsedQuantity)) return parsedQuantity;
          packagePriceCents = parsedPrice;
          packageQuantity = parsedQuantity;
          derived = deriveUnitCost({ packagePriceCents, packageQuantity });
        } else {
          const flat = numberValue(body.unitCostCents, "Unit cost", { min: 0, integer: true });
          if (isResponse(flat)) return flat;
          derived = { unitCostCents: flat, unitCostMilliCents: flat * 1000 };
        }

        const canonical = await db.canonicalMaterial.upsert({
          where: { key },
          update: {},
          create: {
            key,
            name,
            unit: unit ?? "each",
          },
        });

        const packageCost = packagePriceCents !== undefined && packageQuantity !== undefined;
        const material = await db.contractorMaterial.upsert({
          where: {
            contractorId_canonicalMaterialId: {
              contractorId,
              canonicalMaterialId: canonical.id,
            },
          },
          update: {
            unitCostCents: derived.unitCostCents,
            unitCostMilliCents: derived.unitCostMilliCents,
            packagePriceCents: packageCost ? packagePriceCents : null,
            packageQuantity: packageCost ? packageQuantity : null,
            packageUnit: packageCost ? (packageUnit ?? unit ?? "each") : null,
            costSource: "CUSTOM",
            costConfidence: confidence ?? "CONFIRMED",
            costStatus: "OK",
            costUpdatedAt: new Date(),
          },
          create: {
            contractorId,
            canonicalMaterialId: canonical.id,
            unitCostCents: derived.unitCostCents,
            unitCostMilliCents: derived.unitCostMilliCents,
            ...(packageCost
              ? {
                  packagePriceCents,
                  packageQuantity,
                  packageUnit: packageUnit ?? unit ?? "each",
                }
              : {}),
            costSource: "CUSTOM",
            costConfidence: confidence ?? "CONFIRMED",
            costStatus: "OK",
            costUpdatedAt: new Date(),
          },
        });

        const affected = await recomputeServicesUsingRole({
          db,
          canonicalMaterialId: canonical.id,
          contractorId,
        });
        return NextResponse.json({
          ok: true,
          material,
          canonicalMaterial: canonical,
          recomputed: affected.length,
        });
      }

      return NextResponse.json({ error: "Unknown materials action." }, { status: 400 });
    } catch (err) {
      // MaterialCostError is intentionally safe for the contractor to see: it
      // describes invalid cost input, not database or infrastructure details.
      if (err instanceof MaterialCostError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error("[materials]", action, err);
      return NextResponse.json(
        { error: "Price2Book could not update materials. Nothing was intentionally published; try again." },
        { status: 500 },
      );
    }
  });
}
