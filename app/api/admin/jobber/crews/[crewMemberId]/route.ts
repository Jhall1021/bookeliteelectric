import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export async function PATCH(req: Request, { params }: { params: { crewMemberId: string } }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { eligibleForWebsiteBookings } = await req.json();

  await prisma.jobberCrewMember.update({
    where: { id: params.crewMemberId },
    data: { eligibleForWebsiteBookings: !!eligibleForWebsiteBookings },
  });

  return NextResponse.json({ ok: true });
}
