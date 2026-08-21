import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

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
 */

/** Recompute the flat total from the itemized rows, so both stay in step. */
async function syncTotal(serviceId: string) {
  const rows = await prisma.serviceMaterial.findMany({
    where: { serviceId },
    include: { material: true },
  });
  const total = rows.reduce(
    (sum, r) => sum + Math.round(r.material.unitCostCents * r.quantity),
    0
  );
  await prisma.service.update({
    where: { id: serviceId },
    data: {
      materialCostCents: total,
      // Cleared on itemizing — see above. Only when rows actually exist, so
      // emptying a list doesn't quietly discard a deliberate override.
      ...(rows.length > 0 ? { materialMultiplier: null, materialMultiplierReason: null } : {}),
    },
  });
  return total;
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
      const total = await syncTotal(serviceId);
      return NextResponse.json({ ok: true, totalCents: total });
    }

    // ---- change how much of it a service uses --------------------------
    if (action === "quantity") {
      const { id, quantity } = body as { id: string; quantity: number };
      const row = await prisma.serviceMaterial.findUniqueOrThrow({ where: { id } });
      await prisma.serviceMaterial.update({
        where: { id },
        data: { quantity: Math.max(quantity, 0) },
      });
      const total = await syncTotal(row.serviceId);
      return NextResponse.json({ ok: true, totalCents: total });
    }

    // ---- take a material off a service ---------------------------------
    if (action === "remove") {
      const { id } = body as { id: string };
      const row = await prisma.serviceMaterial.findUniqueOrThrow({ where: { id } });
      await prisma.serviceMaterial.delete({ where: { id } });
      const total = await syncTotal(row.serviceId);
      return NextResponse.json({ ok: true, totalCents: total });
    }

    // ---- change a material's cost, everywhere --------------------------
    if (action === "cost") {
      const { materialId, unitCostCents } = body as {
        materialId: string;
        unitCostCents: number;
      };
      if (typeof unitCostCents !== "number" || unitCostCents < 0) {
        return NextResponse.json({ error: "Cost must be zero or more" }, { status: 400 });
      }
      await prisma.material.update({
        where: { id: materialId },
        data: { unitCostCents },
      });

      // Every service holding this part now has a stale total. Resyncing
      // them here is the whole reason for a shared catalog — otherwise the
      // itemized rows and the flat field disagree until someone re-seeds.
      const affected = await prisma.serviceMaterial.findMany({
        where: { materialId },
        select: { serviceId: true },
        distinct: ["serviceId"],
      });
      for (const a of affected) await syncTotal(a.serviceId);

      return NextResponse.json({ ok: true, affectedServices: affected.length });
    }

    // ---- add a new part to the catalog ---------------------------------
    if (action === "create") {
      const { key, name, unitCostCents, unit } = body as {
        key: string;
        name: string;
        unitCostCents: number;
        unit?: string;
      };
      if (!key || !name) {
        return NextResponse.json({ error: "A key and a name are required" }, { status: 400 });
      }
      const material = await prisma.material.create({
        data: {
          key: key.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
          name: name.trim(),
          unitCostCents: Math.max(unitCostCents || 0, 0),
          unit: unit?.trim() || "each",
        },
      });
      return NextResponse.json({ ok: true, material });
    }

    return NextResponse.json({ error: `Unknown action: ${String(action)}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    console.error("[materials]", action, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
