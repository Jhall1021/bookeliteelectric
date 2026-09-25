import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { syncPreparedServiceLabor } from "@/lib/electrical/syncPreparedServiceLabor";

/** Select or clear the contractor's visible prepared services in one write. */
export async function PATCH(req: Request) {
  let parsed: unknown;
  try { parsed = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { offered?: unknown }).offered !== "boolean") {
    return NextResponse.json({ error: "offered is required and must be true or false." }, { status: 400 });
  }
  const offered = (parsed as { offered: boolean }).offered;

  return withAdminRoute(async (db, ctx) => {
    const where = {
      contractorId: ctx.contractorId,
      slug: { not: { startsWith: "rv2-fixture-" } },
      ...(offered ? {} : { active: false }),
    } as const;
    const result = await db.service.updateMany({ where, data: { offered } });
    if (offered) await syncPreparedServiceLabor(db, ctx.contractorId);
    return NextResponse.json({ ok: true, offered, updated: result.count });
  });
}
