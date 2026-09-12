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

    let result;
    try {
      result = await pushBookingToJobber(ctx.contractorId, db, owned.id);
    } catch (err) {
      console.error("Push to Jobber failed before completion:", err);
      return NextResponse.json(
        { error: "Could not send this booking to Jobber. Try again in a moment." },
        { status: 502 }
      );
    }

    try {
      await db.booking.update({
        where: { id: owned.id },
        data: { jobberJobId: result.jobberJobId },
      });
    } catch (err) {
      console.error(
        "Jobber returned success but Price2Book could not persist the result for booking",
        owned.id,
        err
      );
      return NextResponse.json(
        {
          error:
            "Jobber returned a result, but Price2Book could not finish recording it. Check Jobber before trying again.",
          uncertain: true,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, jobNumber: result.jobNumber, alreadySent: false });
  });
}
