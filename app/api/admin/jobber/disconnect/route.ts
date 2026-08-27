import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

export async function POST() {
  return withAdminContractor(async (db, ctx) => {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // This contractor's connection only. `id: "default"` would have
  // disconnected every contractor's Jobber account at once.
  await db.jobberConnection.deleteMany({ where: { contractorId: ctx.contractorId } });
  return NextResponse.json({ ok: true });
  });
}
