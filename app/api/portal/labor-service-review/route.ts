import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdminRoute } from "@/lib/adminContext";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { saveServicePricingInputs } from "@/lib/servicePricingInputs";

export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let body: { serviceId?: unknown; expectedHours?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    if (typeof body?.serviceId !== "string" || !body.serviceId || typeof body.expectedHours !== "number" || !Number.isFinite(body.expectedHours) || body.expectedHours < 0) {
      return NextResponse.json({ error: "serviceId and nonnegative expectedHours are required." }, { status: 400 });
    }
    const serviceId = body.serviceId;
    const expectedHours = body.expectedHours;
    try {
      const receipt = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; slug: string }[]>(Prisma.sql`
          SELECT id, slug FROM services WHERE id = ${serviceId} AND "contractorId" = ${ctx.contractorId} FOR UPDATE
        `);
        const service = rows[0];
        if (!service) throw new Error("SERVICE_NOT_FOUND");
        const stored = await tx.contractorLaborOperationDecision.findMany({
          where: { contractorId: ctx.contractorId, trade: "electrical" },
          select: { operationKey: true, hoursPerUnit: true, source: true },
        });
        const projection = projectElectricalServiceLabor(service.slug, stored.map((decision) => ({
          operationKey: decision.operationKey, hoursPerUnit: decision.hoursPerUnit, source: decision.source,
        })));
        if (projection.kind !== "READY_FOR_APPROVAL") throw new Error(`NOT_READY:${projection.kind}`);
        if (Math.abs(projection.suggestedHours - expectedHours) > 1e-9) throw new Error("STALE_PROJECTION");
        await saveServicePricingInputs(tx, service.id, { fieldLaborHours: projection.suggestedHours });
        return { serviceId: service.id, serviceSlug: service.slug, fieldLaborHours: projection.suggestedHours, recipeKey: projection.recipeKey };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ ok: true, ...receipt, published: false });
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
