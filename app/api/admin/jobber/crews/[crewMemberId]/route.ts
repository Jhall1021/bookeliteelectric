import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function PATCH(req: Request, { params }: { params: { crewMemberId: string } }) {
  return withAdminRoute(async (db) => {
    const { eligibleForWebsiteBookings } = await req.json();

    // Guarded. A crew member id belonging to another contractor matches
    // nothing here rather than being updated — the id alone is not authority
    // to change whose crew takes website bookings.
    const updated = await db.jobberCrewMember.updateMany({
      where: { id: params.crewMemberId },
      data: { eligibleForWebsiteBookings: !!eligibleForWebsiteBookings },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  });
}
