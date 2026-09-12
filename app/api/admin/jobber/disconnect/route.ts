import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    try {
      // The local crew list is a cache of THIS connection, not durable staff
      // identity. Keeping it after disconnect is unsafe: reconnecting a
      // different Jobber account could leave users from the old account marked
      // eligible and therefore counted as website-booking capacity.
      //
      // Clear the cache and the OAuth connection together. Reconnecting starts
      // fail-closed: sync the new account's users, then explicitly choose who
      // counts toward website capacity again.
      const [, disconnected] = await db.$transaction([
        db.jobberCrewMember.deleteMany({ where: { contractorId: ctx.contractorId } }),
        db.jobberConnection.deleteMany({ where: { contractorId: ctx.contractorId } }),
      ]);

      return NextResponse.json({ ok: true, disconnected: disconnected.count > 0 });
    } catch (err) {
      console.error("[jobber disconnect]", ctx.contractorId, err);
      return NextResponse.json(
        { error: "Could not disconnect Jobber. Nothing was changed." },
        { status: 500 }
      );
    }
  });
}
