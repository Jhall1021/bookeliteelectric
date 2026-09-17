import { pilotLog } from "@/lib/electrical/pilotLog";
import { NextResponse } from "next/server";

import type { PrismaClient } from "@prisma/client";
import {
  setContractorMaterialCost,
  overrideUnresolvedMaterialCost,
  recomputeServiceMaterialCost,
  clearLegacyMultiplierOnItemize,
  declarePolicyMaterialQuantity,
  deriveUnitCost,
  impliedPackagePriceCents,
  MaterialCostError,
} from "@/lib/materialCost";
import { withAdminRoute } from "@/lib/adminContext";
import { writeMaterialCost } from "@/lib/admin/onboardingActions";
import { loadMaterialCatalog, deriveStatus } from "@/lib/materialCatalog";
import { categorizeMaterial } from "@/lib/materialCategory";

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
  const result = await recomputeServiceMaterialCost(db, serviceId);
  if (result) return result.afterCents;
  const svc = await db.service.findUnique({
    where: { id: serviceId },
    select: { materialCostCents: true },
  });
  return svc?.materialCostCents ?? 0;
}

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
  bounds: { min?: number; greaterThan?: number; integer?: boolean } = {},
): number | NextResponse {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NextResponse.json({ error: `${label} must be a valid number.` }, { status: 400 });
  }
  if (bounds.integer && !Number.isSafeInteger(value)) {
    return NextResponse.json({ error: `${label} must be a safe whole number.` }, { status: 400 });
  }
  if (bounds.min !== undefined && value < bounds.min) {
    return NextResponse.json({ error: `${label} must be ${bounds.min} or greater.` }, { status: 400 });
  }
  if (bounds.greaterThan !== undefined && value <= bounds.greaterThan) {
    return NextResponse.json({ error: `${label} must be greater than ${bounds.greaterThan}.` }, { status: 400 });
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

  return withAdminRoute(async (db, ctx) => {
    const contractorId = ctx.contractorId;

    // The catalog-PAGE shape: every role this contractor has costed (active
    // and retired) plus the roles a recipe reaches with no cost yet, each
    // carrying usage and a derived category/status. See
    // lib/materialCatalog.ts. Separate from the per-service shape below
    // because a service editing its own recipe has never needed usage counts
    // or retired materials, and computing them on every quantity tweak would
    // be pure overhead.
    if (!serviceId) {
      const materialCatalog = await loadMaterialCatalog(db, contractorId);
      return NextResponse.json({ ...materialCatalog, items: [] });
    }

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

    // Status for a catalog-page entry is always derived with hasCost: true —
    // every row here came from an active ContractorMaterial, which is a real
    // cost by definition. Reused by the service-level "add material" picker
    // (components/admin/materials/AddMaterialDialog.tsx) so it can show the
    // exact same status word the catalog page would for the same material.
    const catalogOut = catalog.map((c) => {
      const { status } = deriveStatus({
        hasCost: true,
        costStatus: c.costStatus,
        costConfidence: c.costConfidence,
        hasSupplierLink: !!c.activeSupplierLink,
      });
      return {
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
        status,
      };
    });

    const items = await db.serviceMaterial.findMany({
      where: { serviceId },
      orderBy: { order: "asc" },
      include: { canonicalMaterial: true },
    });

    const costs = new Map(catalog.map((c) => [c.canonicalMaterialId, c]));

    // How many of THIS contractor's services (this one included) use each
    // recipe line's role — the same fact the "cost" action's own
    // `affectedServices` count already answers, read here instead of
    // written, so MaterialCostDrawer's shared-cost impact notice
    // ("updates the material totals for N services") is accurate from this
    // panel too, not just the catalog page.
    const itemCanonicalIds = [
      ...new Set(items.map((i) => i.canonicalMaterialId).filter((id): id is string => id !== null)),
    ];
    const usageRows = itemCanonicalIds.length
      ? await db.serviceMaterial.findMany({
          where: { canonicalMaterialId: { in: itemCanonicalIds }, service: { contractorId } },
          select: { canonicalMaterialId: true, serviceId: true },
          distinct: ["canonicalMaterialId", "serviceId"],
        })
      : [];
    const usageCounts = new Map<string, number>();
    for (const row of usageRows) {
      if (!row.canonicalMaterialId) continue;
      usageCounts.set(row.canonicalMaterialId, (usageCounts.get(row.canonicalMaterialId) ?? 0) + 1);
    }

    return NextResponse.json({
      catalog: catalogOut,
      items: items.map((i) => {
        const cost = i.canonicalMaterialId ? costs.get(i.canonicalMaterialId) : undefined;
        const { status, statusBucket } = deriveStatus({
          hasCost: !!cost,
          costStatus: cost?.costStatus ?? null,
          costConfidence: cost?.costConfidence ?? null,
          hasSupplierLink: !!cost?.activeSupplierLink,
        });
        return {
          id: i.id,
          canonicalMaterialId: i.canonicalMaterialId,
          contractorMaterialId: cost?.id ?? null,
          key: i.canonicalMaterial?.key ?? null,
          name: cost?.nameOverride ?? i.canonicalMaterial?.name ?? null,
          unit: i.canonicalMaterial?.unit ?? null,
          category: i.canonicalMaterial ? categorizeMaterial(i.canonicalMaterial.key) : "Other",
          quantity: i.quantity,
          quantityIsPolicy: i.quantityIsPolicy,
          unitCostCents: cost?.unitCostCents ?? null,
          // Null quantity means an undeclared policy allowance — there is no
          // line total to show yet, cost entered or not.
          lineTotalCents: cost && i.quantity !== null ? Math.round(cost.unitCostCents * i.quantity) : null,
          unpriced: !cost,
          costSource: cost?.costSource ?? null,
          costConfidence: cost?.costConfidence ?? null,
          costStatus: cost?.costStatus ?? null,
          packagePriceCents: cost?.packagePriceCents ?? null,
          packageQuantity: cost?.packageQuantity ?? null,
          packageUnit: cost?.packageUnit ?? null,
          status,
          statusBucket,
          usageCount: i.canonicalMaterialId ? usageCounts.get(i.canonicalMaterialId) ?? 0 : 0,
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

  return withAdminRoute(async (db, ctx) => {
    const contractorId = ctx.contractorId;
    try {
      // ---- set a cost by canonical ROLE, for guided onboarding ----------
      //
      // Lives on THIS route, deliberately: it stays the single place a
      // contractor's material cost is written. A fresh contractor has no
      // ContractorMaterial rows at all — installCatalog creates none — so the
      // `cost` action below, which needs a row id, cannot be the first write.
      // This upserts the same one-row-per-role record `cost` edits later.
      if (action === "set-cost-by-role") {
        const r = await writeMaterialCost(db, { contractorId }, body as never);
        pilotLog("setup_write", { contractorId, step: "materials", outcome: r.ok ? "ok" : "refused", status: r.ok ? 200 : r.status });
        return r.ok
          ? NextResponse.json({ ok: true, ...r.data })
          : NextResponse.json({ error: r.error }, { status: r.status });
      }

      if (action === "add") {
        const serviceId = requiredString(body.serviceId, "serviceId");
        if (isResponse(serviceId)) return serviceId;
        const canonicalMaterialId = requiredString(body.canonicalMaterialId, "canonicalMaterialId");
        if (isResponse(canonicalMaterialId)) return canonicalMaterialId;
        const quantity = body.quantity === undefined
          ? 1
          : numberValue(body.quantity, "Quantity", { greaterThan: 0 });
        if (isResponse(quantity)) return quantity;

        // Resolve both sides before attempting the nested write. A foreign or
        // missing service is deliberately indistinguishable here and returns
        // the same 404 instead of falling through to a Prisma exception/500.
        const service = await db.service.findUnique({ where: { id: serviceId }, select: { id: true } });
        if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
        const canonicalMaterial = await db.canonicalMaterial.findUnique({
          where: { id: canonicalMaterialId },
          select: { id: true },
        });
        if (!canonicalMaterial) {
          return NextResponse.json({ error: "Material role not found" }, { status: 404 });
        }

        const count = await db.serviceMaterial.count({ where: { serviceId } });
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

      if (action === "quantity") {
        const id = requiredString(body.id, "Material line id");
        if (isResponse(id)) return id;
        const quantity = numberValue(body.quantity, "Quantity", { min: 0 });
        if (isResponse(quantity)) return quantity;

        const row = await db.serviceMaterial.findUnique({ where: { id } });
        if (!row) return NextResponse.json({ error: "Material line not found" }, { status: 404 });

        // A POLICY role's quantity is a contractor's declared allowance, not
        // a structural recipe edit — it goes through the shared, ATOMIC
        // declarePolicyMaterialQuantity (quantity write + readiness/total
        // recompute in one transaction), the same authority a wizard or a
        // rehearsal fixture uses. A structural role keeps the ordinary direct
        // edit below: its quantity is the template's own recipe figure, an
        // admin correcting it is curating that recipe, not declaring an
        // allowance, and there is no separate "undeclared" state to guard.
        if (row.quantityIsPolicy) {
          if (!row.canonicalMaterialId) {
            return NextResponse.json({ error: "This material line has no canonical role to declare a quantity for." }, { status: 400 });
          }
          // declarePolicyMaterialQuantity already recomputes atomically, in
          // the same transaction as the quantity write — a second call to
          // recomputeServiceMaterialCost via afterRecipeChange would just
          // read the identical figure back a moment later. Only the
          // multiplier clear is still needed here: it is a distinct,
          // idempotent side effect afterRecipeChange also performs, not a
          // second recompute.
          const declared = await declarePolicyMaterialQuantity(db, row.serviceId, row.canonicalMaterialId, quantity);
          await clearLegacyMultiplierOnItemize(db, row.serviceId);
          const totalCents = declared.recompute?.afterCents
            ?? (await db.service.findUnique({ where: { id: row.serviceId }, select: { materialCostCents: true } }))?.materialCostCents
            ?? 0;
          return NextResponse.json({ ok: true, totalCents });
        }

        await db.serviceMaterial.update({ where: { id }, data: { quantity } });
        const { totalCents } = await afterRecipeChange(db, row.serviceId);
        return NextResponse.json({ ok: true, totalCents });
      }

      if (action === "remove") {
        const id = requiredString(body.id, "Material line id");
        if (isResponse(id)) return id;
        const row = await db.serviceMaterial.findUnique({ where: { id } });
        if (!row) return NextResponse.json({ error: "Material line not found" }, { status: 404 });
        await db.serviceMaterial.delete({ where: { id } });
        const { totalCents } = await afterRecipeChange(db, row.serviceId);
        return NextResponse.json({ ok: true, totalCents });
      }

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
          return NextResponse.json({ error: "Package price and package quantity must be provided together." }, { status: 400 });
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

        const cm = await db.contractorMaterial.findUnique({
          where: { id: contractorMaterialId },
          select: { canonicalMaterialId: true, contractorId: true },
        });
        if (!cm) return NextResponse.json({ error: "Unknown material" }, { status: 404 });
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

      if (action === "create") {
        const canonicalMaterialId = requiredString(body.canonicalMaterialId, "canonicalMaterialId");
        if (isResponse(canonicalMaterialId)) return canonicalMaterialId;
        const packageUnit = optionalString(body.packageUnit, "Package unit");
        if (isResponse(packageUnit)) return packageUnit;
        const confidence = confidenceValue(body.confidence);
        if (isResponse(confidence)) return confidence;

        const hasPackagePrice = body.packagePriceCents !== undefined && body.packagePriceCents !== null;
        const hasPackageQuantity = body.packageQuantity !== undefined && body.packageQuantity !== null;
        if (hasPackagePrice !== hasPackageQuantity) {
          return NextResponse.json({ error: "Package price and package quantity must be provided together." }, { status: 400 });
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

        // Role IDENTITY is a separate concern from PRICING it (ADR-001), and
        // this action never creates it — "create" names the ACTION (giving a
        // role its first cost), not a write to CanonicalMaterial. A
        // contractor-facing route deriving or creating canonical identity
        // from typed text is a tenant-boundary violation: the shared
        // platform catalog is not this contractor's to add to. The
        // canonicalMaterialId here must be the role's own real, existing id
        // — the current catalog flow (a missing-price row a contractor is
        // pricing) already carries it, straight from lib/materialCatalog.ts,
        // never reconstructed from a name. Resolved read-only; refused
        // outright if it doesn't name a real, active role. What must be
        // atomic, race-safe and event-logged is the cost assignment below,
        // so it goes through the same first-resolution authority every
        // other "give this contractor's first cost to a role" caller
        // already uses — the same one the Guided Setup baseline batch
        // review's "override" action calls.
        const canonical = await db.canonicalMaterial.findUnique({
          where: { id: canonicalMaterialId },
        });
        if (!canonical || !canonical.active) {
          return NextResponse.json(
            { error: "That material isn't in the catalog. Refresh and try again." },
            { status: 404 },
          );
        }

        const result = await overrideUnresolvedMaterialCost(
          db,
          {
            contractorId,
            canonicalMaterialId: canonical.id,
            ...(packagePriceCents !== undefined && packageQuantity !== undefined
              ? { basis: { packagePriceCents, packageQuantity } }
              : { unitCostCents: unitCostCents! }),
            // NOT `packageUnit ?? unit` — the material's purchasing unit is
            // not a package type, and falling back to it here produced
            // exactly the misleading "10 each"-style text this field exists
            // to prevent. Passed straight through, matching the "cost"
            // action's own line above: undefined (no package type typed)
            // reaches overrideUnresolvedMaterialCost as undefined, which it
            // already turns into a real, legitimate null — never `unit`.
            packageUnit,
            confidence,
          },
          { reason: "admin priced a new material", actor: "admin" },
        );

        if (!result.ok) {
          // Someone already gave this role a cost between the admin's screen
          // loading and this request landing — the same race
          // /api/portal/material-baselines's "override" action refuses the
          // same way. The "cost" action, not this one, is how an existing
          // figure gets changed.
          return NextResponse.json(
            { error: "That role already has a cost for your account — refresh and try again." },
            { status: 409 },
          );
        }

        const material = await db.contractorMaterial.findUniqueOrThrow({
          where: { id: result.contractorMaterialId },
        });
        return NextResponse.json({
          ok: true,
          material,
          canonicalMaterial: canonical,
          recomputed: result.affected.length,
        });
      }

      return NextResponse.json({ error: "Unknown materials action." }, { status: 400 });
    } catch (err) {
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
