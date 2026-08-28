import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { pushBookingToJobber } from "@/lib/jobber";

export async function POST(_req: Request, { params }: { params: { bookingId: string } }) {
  // Authentication AND tenancy together. A booking id in a URL is not
  // authority to push another contractor's job into THIS contractor's Jobber
  // account — which is what an unscoped update here allowed.
  return withAdminRoute(async (db, ctx) => {
    // Ownership is proven BEFORE the external call, not after. Booking derives
    // through Visit (ADR-011), so a foreign id is null here and nothing
    // reaches Jobber at all. Doing this the other way round would push the job
    // first and only then discover it was never ours.
    const owned = await db.booking.findUnique({
      where: { id: params.bookingId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
      const result = await pushBookingToJobber(ctx.contractorId, db, owned.id);
      // jobberJobId stays the recovery marker: null means committed locally
      // but not successfully pushed. Unchanged by pass three.
      await db.booking.update({
        where: { id: owned.id },
        data: { jobberJobId: result.jobberJobId },
      });
      return NextResponse.json({ ok: true, jobNumber: result.jobNumber });
    } catch (err) {
      console.error("Push to Jobber failed:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error pushing to Jobber" },
        { status: 500 }
      );
    }
  });
}
