import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function PATCH(req: Request, { params }: { params: { crewMemberId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  if (typeof body.eligibleForWebsiteBookings !== "boolean") {
    return NextResponse.json(
      { error: "Website-booking eligibility must be true or false." },
      { status: 400 }
    );
  }

  return withAdminRoute(async (db) => {
    // Guarded. A crew member id belonging to another contractor matches
    // nothing here rather than being updated — the id alone is not authority
    // to change whose crew takes website bookings.
    const updated = await db.jobberCrewMember.updateMany({
      where: { id: params.crewMemberId },
      data: { eligibleForWebsiteBookings: body.eligibleForWebsiteBookings },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, eligibleForWebsiteBookings: body.eligibleForWebsiteBookings });
  });
}
