import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { pushBookingToJobber } from "@/lib/jobber";

export async function POST(_req: Request, { params }: { params: { bookingId: string } }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const result = await pushBookingToJobber(params.bookingId);
    await prisma.booking.update({
      where: { id: params.bookingId },
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
}
