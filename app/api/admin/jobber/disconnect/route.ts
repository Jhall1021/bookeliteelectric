import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {

  // This contractor's connection only. `id: "default"` would have
  // disconnected every contractor's Jobber account at once.
  await db.jobberConnection.deleteMany({ where: { contractorId: ctx.contractorId } });
  return NextResponse.json({ ok: true });
  });
}
