import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdminRoute } from "@/lib/adminContext";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { saveServicePricingInputs } from "@/lib/servicePricingInputs";

type ReviewItem = { serviceId: string; expectedHours: number };

export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let body: { items?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      return NextResponse.json({ error: "Choose between 1 and 100 service durations." }, { status: 400 });
    }
    const items = body.items as ReviewItem[];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item.serviceId !== "string" || !item.serviceId || typeof item.expectedHours !== "number" || !Number.isFinite(item.expectedHours) || item.expectedHours < 0) {
        return NextResponse.json({ error: "Each selection needs a serviceId and nonnegative expectedHours." }, { status: 400 });
      }
      if (seen.has(item.serviceId)) return NextResponse.json({ error: "A service may be selected only once." }, { status: 400 });
      seen.add(item.serviceId);
    }
    try {
      const approved = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; slug: string }[]>(Prisma.sql`
          SELECT id, slug FROM services
          WHERE id IN (${Prisma.join(items.map((item) => item.serviceId))})
            AND "contractorId" = ${ctx.contractorId}
          ORDER BY id
          FOR UPDATE
        `);
        if (rows.length !== items.length) throw new Error("SERVICE_NOT_FOUND");
        const stored = await tx.contractorLaborOperationDecision.findMany({
          where: { contractorId: ctx.contractorId, trade: "electrical" },
          select: { operationKey: true, hoursPerUnit: true, source: true },
        });
        const decisions = stored.map((decision) => ({ operationKey: decision.operationKey, hoursPerUnit: decision.hoursPerUnit, source: decision.source }));
        const itemById = new Map(items.map((item) => [item.serviceId, item]));
        const projections = rows.map((service) => {
          const projection = projectElectricalServiceLabor(service.slug, decisions);
          if (projection.kind !== "READY_FOR_APPROVAL") throw new Error(`NOT_READY:${projection.kind}`);
          if (Math.abs(projection.suggestedHours - itemById.get(service.id)!.expectedHours) > 1e-9) throw new Error("STALE_PROJECTION");
          return { service, projection };
        });
        const receipts = [];
        for (const { service, projection } of projections) {
          await saveServicePricingInputs(tx, service.id, { fieldLaborHours: projection.suggestedHours });
          receipts.push({ serviceId: service.id, serviceSlug: service.slug, fieldLaborHours: projection.suggestedHours, recipeKey: projection.recipeKey });
        }
        return receipts;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ ok: true, approved, published: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "SERVICE_NOT_FOUND") return NextResponse.json({ error: "Service not found." }, { status: 404 });
      if (message === "STALE_PROJECTION") return NextResponse.json({ error: "Labor inputs changed. Reload the current suggestion before approving." }, { status: 409 });
      if (message.startsWith("NOT_READY:")) return NextResponse.json({ error: "This service does not have a complete bounded labor suggestion." }, { status: 409 });
      if ((error as { code?: string }).code === "P2034") return NextResponse.json({ error: "A concurrent labor change was detected. Reload and try again." }, { status: 409 });
      throw error;
    }
  });
}
