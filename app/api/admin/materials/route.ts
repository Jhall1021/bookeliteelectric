import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withContractor } from "@/lib/tenantRoute";
import { soleContractorId } from "@/lib/categories";
import type { PrismaClient } from "@prisma/client";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  setContractorMaterialCost,
  recomputeServiceMaterialCost,
  clearLegacyMultiplierOnItemize,
  deriveUnitCost,
  impliedPackagePriceCents,
  MaterialCostError,
} from "@/lib/materialCost";

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

export async function GET(req: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  // The catalog is this contractor's costed roles, not a global material
  // list. Two contractors filling the same role each see their own figure.
  const contractorId = await soleContractorId(prisma, "the materials admin");

  // GUARD-ADOPTED (ADR-007a). Everything below is this contractor's, on the
  // guarded client.
  //
  // ADR-007: the catalog roots at ContractorMaterial, the tenant-owned model,
  // and includes the canonical role from there. Rooting at CanonicalMaterial
  // and nesting contractorMaterials would be the platform-parent shape the
  // live harness proved the guard cannot see.
  return withContractor(contractorId, "admin-session", async (db) => {
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
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const action = body.action;

  // GUARD-ADOPTED (ADR-007a). One context for the whole handler; every action
  // below reads and writes through the guarded client.
  const contractorId = await soleContractorId(prisma, "the materials admin");

  return withContractor(contractorId, "admin-session", async (db) => {
  try {
    // ---- add a material to a service ----------------------------------
    if (action === "add") {
      const { serviceId, canonicalMaterialId, quantity } = body as {
        serviceId: string;
        canonicalMaterialId: string;
        quantity: number;
      };
      if (!canonicalMaterialId) {
        return NextResponse.json(
          { error: "canonicalMaterialId is required — a recipe names a material role" },
          { status: 400 }
        );
      }
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
          data: { quantity: quantity || 1 },
        });
      } else {
        await db.service.update({
          where: { id: serviceId },
          data: {
            materials: {
              create: { canonicalMaterialId, quantity: quantity || 1, order: count },
            },
          },
        });
      }
      const { totalCents } = await afterRecipeChange(db, serviceId);
      return NextResponse.json({ ok: true, totalCents });
    }

    // ---- change how much of it a service uses --------------------------
    if (action === "quantity") {
      const { id, quantity } = body as { id: string; quantity: number };
      const row = await db.serviceMaterial.findUniqueOrThrow({ where: { id } });
      await db.serviceMaterial.update({
        where: { id },
        data: { quantity: Math.max(quantity, 0) },
      });
      const { totalCents } = await afterRecipeChange(db, row.serviceId);
      return NextResponse.json({ ok: true, totalCents });
    }

    // ---- take a material off a service ---------------------------------
    if (action === "remove") {
      const { id } = body as { id: string };
      const row = await db.serviceMaterial.findUniqueOrThrow({ where: { id } });
      await db.serviceMaterial.delete({ where: { id } });
      const { totalCents } = await afterRecipeChange(db, row.serviceId);
      return NextResponse.json({ ok: true, totalCents });
    }

    // ---- change a material's cost, everywhere --------------------------
    //
    // Accepts either a package basis (preferred — it preserves the invoice)
    // or a bare per-unit cost. Sending packagePriceCents and packageQuantity
    // lets a $189.00 box of 1000 ft of Cat6 be recorded as bought and derived
    // to 18.9 c/ft, rather than someone dividing on a calculator, typing 19,
    // and the box price being lost.
    //
    // Does NOT touch materialMultiplier. See the note at the top of the file.
    if (action === "cost") {
      const {
        contractorMaterialId,
        unitCostCents,
        packagePriceCents,
        packageQuantity,
        packageUnit,
        confidence,
      } = body as {
        contractorMaterialId: string;
        unitCostCents?: number;
        packagePriceCents?: number;
        packageQuantity?: number;
        packageUnit?: string;
        confidence?: "CONFIRMED" | "ASSUMED";
      };

      if (!contractorMaterialId) {
        return NextResponse.json(
          { error: "contractorMaterialId is required — a role has no cost, only a contractor does" },
          { status: 400 }
        );
      }

      const hasPackage =
        typeof packagePriceCents === "number" && typeof packageQuantity === "number";

      if (!hasPackage && (typeof unitCostCents !== "number" || unitCostCents < 0)) {
        return NextResponse.json({ error: "Cost must be zero or more" }, { status: 400 });
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
          ...(hasPackage
            ? {
                basis: {
                  packagePriceCents: packagePriceCents as number,
                  packageQuantity: packageQuantity as number,
                },
              }
            : { unitCostCents: unitCostCents as number }),
          packageUnit,
          confidence,
        },
        { reason: "admin edit", actor: "admin" }
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
        // A cost edit can make a service pricable again, or reveal that
        // another role is still missing. Worth surfacing rather than leaving
        // the admin to guess why a service is still not live.
        stillUnresolved: result.affected
          .filter((a) => !a.resolved)
          .map((a) => ({ slug: a.slug, missingKeys: a.missingKeys })),
      });
    }

    // ---- preview a package conversion before committing it -------------
    //
    // Read-only. Shows what a package resolves to per unit, and how far the
    // rounded integer sits from the invoice, before anything is saved. A
    // 1000 ft box at $189.00 stores as 19 c/ft and back-computes to $190.00 —
    // better shown at entry than discovered a year later.
    if (action === "preview-package") {
      const { packagePriceCents, packageQuantity } = body as {
        packagePriceCents: number;
        packageQuantity: number;
      };
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
    //
    // The key is a CANONICAL ROLE, not a product. WIRE_12_2 names the job the
    // material does; the Southwire roll that fills it belongs on a supplier
    // link. A key naming a brand, a model or an item number defeats the
    // separation the whole supplier layer rests on. See
    // docs/MATERIAL-SUPPLIER-CATALOG.md.
    if (action === "create") {
      const {
        key,
        name,
        unit,
        unitCostCents,
        packagePriceCents,
        packageQuantity,
        packageUnit,
        confidence,
      } = body as {
        key: string;
        name: string;
        unit?: string;
        unitCostCents?: number;
        packagePriceCents?: number;
        packageQuantity?: number;
        packageUnit?: string;
        confidence?: "CONFIRMED" | "ASSUMED";
      };
      if (!key || !name) {
        return NextResponse.json({ error: "A key and a name are required" }, { status: 400 });
      }

      const hasPackage =
        typeof packagePriceCents === "number" && typeof packageQuantity === "number";
      const flat = Math.max(unitCostCents || 0, 0);
      const derived = hasPackage
        ? deriveUnitCost({
            packagePriceCents: packagePriceCents as number,
            packageQuantity: packageQuantity as number,
          })
        : { unitCostCents: flat, unitCostMilliCents: flat * 1000 };

      // contractorId comes from the enclosing tenant context; the guard also
      // stamps it on the create half of the upsert below.

      // Two rows, two layers. The ROLE is platform knowledge and may already
      // exist — another contractor could have introduced it — so it is
      // upserted rather than created. The COST is this contractor's alone.
      //
      // The key is a CANONICAL ROLE, not a product. WIRE_12_2 names the job
      // the material does; the Southwire roll that fills it belongs on a
      // supplier link. A key naming a brand, model or item number defeats the
      // separation the template library rests on.
      const canonical = await db.canonicalMaterial.upsert({
        where: { key: key.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") },
        update: {},
        create: {
          key: key.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
          name: name.trim(),
          unit: unit?.trim() || "each",
        },
      });

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
        },
        create: {
          contractorId,
          canonicalMaterialId: canonical.id,
          unitCostCents: derived.unitCostCents,
          unitCostMilliCents: derived.unitCostMilliCents,
          ...(hasPackage
            ? {
                packagePriceCents,
                packageQuantity,
                packageUnit: packageUnit?.trim() || unit?.trim() || "each",
              }
            : {}),
          costSource: "CUSTOM",
          costConfidence: confidence ?? "CONFIRMED",
          costStatus: "OK",
          costUpdatedAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true, material, canonicalMaterial: canonical });
    }

    return NextResponse.json({ error: `Unknown action: ${String(action)}` }, { status: 400 });
  } catch (err) {
    // Bad cost data is the caller's mistake, not a server fault. A package
    // quantity of zero fails closed rather than becoming a free material, and
    // the admin should be told why.
    if (err instanceof MaterialCostError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unknown database error";
    console.error("[materials]", action, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}
