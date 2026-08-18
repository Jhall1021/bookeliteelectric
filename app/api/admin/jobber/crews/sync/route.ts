import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchJobberUsers } from "@/lib/jobber";

export async function POST() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const users = await fetchJobberUsers();

    for (const user of users) {
      await prisma.jobberCrewMember.upsert({
        where: { jobberUserId: user.id },
        update: { name: user.name, lastSyncedAt: new Date() },
        create: { jobberUserId: user.id, name: user.name, eligibleForWebsiteBookings: false },
      });
    }

    return NextResponse.json({ ok: true, count: users.length });
  } catch (err) {
    console.error("Jobber crew sync failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
