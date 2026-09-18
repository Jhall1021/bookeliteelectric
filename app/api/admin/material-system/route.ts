/**
 * The contractor's declaration of how a material system they install behaves.
 *
 * Every physical field is nullable and means "not established"; writing null
 * withdraws a declaration and sends affected routes back to review. Termination
 * materials are named by canonical ROLE KEY on the wire, so a caller stays in
 * the takeoff's vocabulary rather than needing row ids.
 */
import { pilotLog } from "@/lib/electrical/pilotLog";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { writeMaterialSystem } from "@/lib/admin/onboardingActions";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const systemKey = new URL(req.url).searchParams.get("systemKey");
  return withAdminContractor(async (db, ctx) => {
    const rows = await db.contractorMaterialSystem.findMany({
      where: { contractorId: ctx.contractorId, ...(systemKey ? { systemKey } : {}) },
      select: {
        id: true, systemKey: true, declaredSystemLabel: true, groundingStrategy: true,
        supportSpacingFt: true, supportAtEachTerminus: true,
        sourceTermination: true, destinationTermination: true, declaredAt: true,
        sourceTerminationMaterial: { select: { key: true, name: true } },
        destinationTerminationMaterial: { select: { key: true, name: true } },
      },
      orderBy: { systemKey: "asc" },
    });
    return NextResponse.json({
      systems: rows.map((r) => ({
        ...r,
        sourceTerminationRole: r.sourceTerminationMaterial?.key ?? null,
        destinationTerminationRole: r.destinationTerminationMaterial?.key ?? null,
        outstanding: [
          r.groundingStrategy === null && "groundingStrategy",
          r.supportSpacingFt === null && "supportSpacingFt",
          r.supportAtEachTerminus === null && "supportAtEachTerminus",
          r.sourceTermination === null && "sourceTermination",
          r.destinationTermination === null && "destinationTermination",
        ].filter(Boolean),
      })),
    });
  });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  return withAdminContractor(async (db, ctx) => {
    const r = await writeMaterialSystem(db, ctx, body);
    pilotLog("setup_write", { contractorId: ctx.contractorId, step: "material_setup", outcome: r.ok ? "ok" : "refused", status: r.ok ? 200 : r.status });
    return r.ok
      ? NextResponse.json({ ok: true, ...r.data })
      : NextResponse.json({ error: r.error }, { status: r.status });
  });
}
