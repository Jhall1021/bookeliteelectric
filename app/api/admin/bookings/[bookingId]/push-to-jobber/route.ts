import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { pushBookingToJobber } from "@/lib/jobber";

export async function POST(_req: Request, { params }: { params: { bookingId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    const owned = await db.booking.findUnique({
      where: { id: params.bookingId },
      select: { id: true, jobberJobId: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // jobberJobId is the durable success marker for this integration. Once it
    // exists, a repeated request is already complete and must not create a
    // second Jobber job.
    if (owned.jobberJobId) {
      return NextResponse.json({ ok: true, alreadySent: true });
    }

    try {
      const result = await pushBookingToJobber(ctx.contractorId, db, owned.id);
      await db.booking.update({
        where: { id: owned.id },
        data: { jobberJobId: result.jobberJobId },
      });
      return NextResponse.json({ ok: true, jobNumber: result.jobNumber, alreadySent: false });
    } catch (err) {
      console.error("Push to Jobber failed:", err);
      return NextResponse.json(
        { error: "Could not send this booking to Jobber. Nothing was marked as sent; try again." },
        { status: 502 }
      );
    }
  });
}
