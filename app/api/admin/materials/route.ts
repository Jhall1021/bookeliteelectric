import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  setMaterialUnitCost,
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
async function totalFor(serviceId: string): Promise<number> {
  const result = await recomputeServiceMaterialCost(prisma, serviceId);
  if (result) return result.afterCents;
  // No itemized rows left. The recompute deliberately leaves a non-itemized
  // service's flat allowance alone rather than zeroing it, so read back what
  // the service actually holds instead of asserting zero.
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { materialCostCents: true },
  });
  return svc?.materialCostCents ?? 0;
}

/**
 * The three actions that change a RECIPE: recompute, then clear the legacy
 * multiplier because itemizing has happened. Cost edits do not come here.
 */
async function afterRecipeChange(serviceId: string) {
  const totalCents = await totalFor(serviceId);
  const clearedMultiplier = await clearLegacyMultiplierOnItemize(prisma, serviceId);
  return { totalCents, clearedMultiplier };
}

export async function GET(req: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const catalog = await prisma.material.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
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

  if (!serviceId) return NextResponse.json({ catalog, items: [] });

  const items = await prisma.serviceMaterial.findMany({
    where: { serviceId },
    orderBy: { order: "asc" },
    include: { material: true },
  });

  return NextResponse.json({
    catalog,
    items: items.map((i) => ({
      id: i.id,
      materialId: i.materialId,
      key: i.material.key,
      name: i.material.name,
      unit: i.material.unit,
      unitCostCents: i.material.unitCostCents,
      quantity: i.quantity,
      lineTotalCents: Math.round(i.material.unitCostCents * i.quantity),
      // Additive — where the cost came from and whether it can be trusted.
      // Existing consumers can ignore these.
      costSource: i.material.costSource,
      costConfidence: i.material.costConfidence,
      costStatus: i.material.costStatus,
      packagePriceCents: i.material.packagePriceCents,
      packageQuantity: i.material.packageQuantity,
      packageUnit: i.material.packageUnit,
    })),
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

  try {
    // ---- add a material to a service ----------------------------------
    if (action === "add") {
      const { serviceId, materialId, quantity } = body as {
        serviceId: string;
        materialId: string;
        quantity: number;
      };
      const count = await prisma.serviceMaterial.count({ where: { serviceId } });
      await prisma.serviceMaterial.upsert({
        where: { serviceId_materialId: { serviceId, materialId } },
        update: { quantity: quantity || 1 },
        create: { serviceId, materialId, quantity: quantity || 1, order: count },
      });
      const { totalCents } = await afterRecipeChange(serviceId);
      return NextResponse.json({ ok: true, totalCents });
    }

    // ---- change how much of it a service uses --------------------------
    if (action === "quantity") {
      const { id, quantity } = body as { id: string; quantity: number };
      const row = await prisma.serviceMaterial.findUniqueOrThrow({ where: { id } });
      await prisma.serviceMaterial.update({
        where: { id },
        data: { quantity: Math.max(quantity, 0) },
      });
      const { totalCents } = await afterRecipeChange(row.serviceId);
      return NextResponse.json({ ok: true, totalCents });
    }

    // ---- take a material off a service ---------------------------------
    if (action === "remove") {
      const { id } = body as { id: string };
      const row = await prisma.serviceMaterial.findUniqueOrThrow({ where: { id } });
      await prisma.serviceMaterial.delete({ where: { id } });
      const { totalCents } = await afterRecipeChange(row.serviceId);
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
        materialId,
        unitCostCents,
        packagePriceCents,
        packageQuantity,
        packageUnit,
        confidence,
      } = body as {
        materialId: string;
        unitCostCents?: number;
        packagePriceCents?: number;
        packageQuantity?: number;
        packageUnit?: string;
        confidence?: "CONFIRMED" | "ASSUMED";
      };

      const hasPackage =
        typeof packagePriceCents === "number" && typeof packageQuantity === "number";

      if (!hasPackage && (typeof unitCostCents !== "number" || unitCostCents < 0)) {
        return NextResponse.json({ error: "Cost must be zero or more" }, { status: 400 });
      }

      // How many services hold this part, independent of whether the cost
      // actually moved — preserves the existing response contract.
      const using = await prisma.serviceMaterial.findMany({
        where: { materialId },
        select: { serviceId: true },
        distinct: ["serviceId"],
      });

      const result = await setMaterialUnitCost(
        prisma,
        {
          materialId,
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
        // Additive detail: what actually moved, and by how much. A cost edit
        // that changes nothing should not look like one that repriced
        // fourteen services.
        changed: result.changed,
        beforeCents: result.beforeCents,
        afterCents: result.afterCents,
        servicesMoved: result.affected.filter((a) => a.changed).length,
        movedServices: result.affected
          .filter((a) => a.changed)
          .map((a) => ({ slug: a.slug, beforeCents: a.beforeCents, afterCents: a.afterCents })),
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
        unitCostCents,
        unit,
        packagePriceCents,
        packageQuantity,
        packageUnit,
        confidence,
      } = body as {
        key: string;
        name: string;
        unitCostCents?: number;
        unit?: string;
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

      const material = await prisma.material.create({
        data: {
          key: key.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
          name: name.trim(),
          unitCostCents: derived.unitCostCents,
          unitCostMilliCents: derived.unitCostMilliCents,
          unit: unit?.trim() || "each",
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
      return NextResponse.json({ ok: true, material });
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
}
