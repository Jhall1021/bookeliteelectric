import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function PATCH(req: Request, { params }: { params: { crewMemberId: string } }) {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  if (typeof body.eligibleForWebsiteBookings !== "boolean") {
    return NextResponse.json(
      { error: "Website-booking eligibility must be true or false." },
      { status: 400 }
    );
  }
  const eligibleForWebsiteBookings = body.eligibleForWebsiteBookings;

  return withAdminRoute(async (db) => {
    const updated = await db.jobberCrewMember.updateMany({
      where: { id: params.crewMemberId },
      data: { eligibleForWebsiteBookings },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, eligibleForWebsiteBookings });
  });
}
