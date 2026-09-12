import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { fetchAllJobberUsers } from "@/lib/jobberUsers";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    try {
      // This helper follows Jobber's cursor pagination until the API explicitly
      // reports hasNextPage=false. Only a confirmed-complete roster is allowed
      // to reconcile removals, because crew eligibility affects customer-facing
      // scheduling capacity.
      const users = await fetchAllJobberUsers(ctx.contractorId);
      const ids = users.map((user) => user.id);

      const removedCount = await db.$transaction(async (tx) => {
        for (const user of users) {
          // Keep contractorId explicit inside the transaction even though the
          // enclosing client is tenant-guarded. Transaction-client extension
          // behavior must never be the only thing preventing a Jobber user id
          // from matching another contractor's cached crew row.
          const existing = await tx.jobberCrewMember.findFirst({
            where: {
              contractorId: ctx.contractorId,
              jobberUserId: user.id,
            },
            select: { id: true },
          });

          if (existing) {
            // Preserve the contractor's explicit eligibility choice while
            // refreshing Jobber-owned identity fields.
            await tx.jobberCrewMember.update({
              where: {
                id: existing.id,
                contractorId: ctx.contractorId,
              },
              data: { name: user.name, lastSyncedAt: new Date() },
            });
          } else {
            // Newly discovered people never become booking capacity by accident.
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

        // The roster is complete here, so rows Jobber no longer returns can be
        // removed safely. The contractor filter stays explicit so an empty
        // Jobber roster can only clear THIS contractor's cache, even if this
        // transaction were ever executed without the query extension.
        const removed = await tx.jobberCrewMember.deleteMany({
          where: {
            contractorId: ctx.contractorId,
            ...(ids.length ? { jobberUserId: { notIn: ids } } : {}),
          },
        });
        return removed.count;
      });

      return NextResponse.json({ ok: true, count: users.length, removed: removedCount });
    } catch (err) {
      console.error("Jobber crew sync failed:", err);
      return NextResponse.json(
        {
          error:
            "Price2Book could not confirm a complete Jobber crew roster. No scheduling assumptions were changed; try again in a moment.",
        },
        { status: 502 }
      );
    }
  });
}
