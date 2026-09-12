import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { fetchJobberUsers } from "@/lib/jobber";

const PAGE_SIZE = 50;

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    try {
      const users = await fetchJobberUsers(ctx.contractorId);

      // The shared helper currently requests the first 50 Jobber users. If it
      // returns all 50 we cannot know whether another page exists, so do not
      // let a potentially partial roster become scheduling authority.
      if (users.length >= PAGE_SIZE) {
        return NextResponse.json(
          {
            error: "Jobber returned the maximum crew page size, so Price2Book cannot confirm the roster is complete. No crew changes were saved.",
            code: "JOBBER_CREW_SYNC_INCOMPLETE",
          },
          { status: 409 }
        );
      }

      const ids = users.map((user) => user.id);
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
        return NextResponse.json(
          { error: "Jobber returned an invalid crew roster. No crew changes were saved." },
          { status: 502 }
        );
      }

      const result = await db.$transaction(async (tx) => {
        for (const user of users) {
          const existing = await tx.jobberCrewMember.findFirst({
            where: { jobberUserId: user.id },
            select: { id: true },
          });

          if (existing) {
            await tx.jobberCrewMember.update({
              where: { id: existing.id },
              data: { name: user.name, lastSyncedAt: new Date() },
            });
          } else {
            await tx.jobberCrewMember.create({
              data: {
                contractorId: ctx.contractorId,
                jobberUserId: user.id,
                name: user.name,
                eligibleForWebsiteBookings: false,
              },
            });
          }
        }

        // This is a complete roster (< page size), so remove cached people
        // Jobber no longer returns. Otherwise stale eligible users would keep
        // inflating website capacity after they leave the Jobber account.
        const removed = await tx.jobberCrewMember.deleteMany({
          where: ids.length ? { jobberUserId: { notIn: ids } } : {},
        });

        return removed.count;
      });

      return NextResponse.json({ ok: true, count: users.length, removed: result });
    } catch (err) {
      console.error("Jobber crew sync failed:", err);
      return NextResponse.json(
        { error: "Price2Book could not refresh the Jobber crew roster. No scheduling assumptions were changed; try again in a moment." },
        { status: 502 }
      );
    }
  });
}
