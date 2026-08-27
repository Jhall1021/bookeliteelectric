import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { fetchJobberUsers } from "@/lib/jobber";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    try {
      const users = await fetchJobberUsers();

      for (const user of users) {
        // SCOPED FIND, THEN WRITE — deliberately not an upsert.
        //
        // This was the most dangerous row in the pass-three audit. The old
        // shape was `upsert({ where: { jobberUserId } })` against the GLOBAL
        // unique on that column, so a second contractor syncing their Jobber
        // account would match the FIRST contractor's row and take it over:
        // renaming it and resetting its booking eligibility. Not a leak — a
        // cross-tenant overwrite of live scheduling data, from an ordinary
        // admin action.
        //
        // WHY NOT THE COMPOUND UNIQUE
        //
        // `@@unique([contractorId, jobberUserId])` exists as of expand, but
        // Prisma will not expose it as a whereUnique selector while
        // contractorId is nullable — a null cannot identify a row. It becomes
        // usable only once contract makes the column required, which is the
        // same destructive event that drops the global unique. Until then an
        // upsert would have to key on the global unique, which is precisely
        // the bug.
        //
        // So: a guarded findFirst (scoped to this contractor by the extension,
        // so another contractor's row is invisible), then a scoped update or a
        // stamped create. Same semantics as the compound-keyed upsert, with no
        // dependence on either constraint.
        const existing = await db.jobberCrewMember.findFirst({
          where: { jobberUserId: user.id },
          select: { id: true },
        });

        if (existing) {
          await db.jobberCrewMember.update({
            where: { id: existing.id },
            data: { name: user.name, lastSyncedAt: new Date() },
          });
        } else {
          await db.jobberCrewMember.create({
            data: {
              // Passed explicitly, matching every other guarded create on a
              // required-owner model (see app/api/admin/services/route.ts).
              // The guard stamps it anyway and cross-checks that it matches
              // the ambient context — a different value throws rather than
              // being silently accepted — but contract made the column
              // required, so the TYPE demands it too. Stamping at runtime is
              // invisible to the compiler.
              contractorId: ctx.contractorId,
              jobberUserId: user.id,
              name: user.name,
              eligibleForWebsiteBookings: false,
            },
          });
        }
      }

      return NextResponse.json({ ok: true, count: users.length });
    } catch (err) {
      console.error("Jobber crew sync failed:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Sync failed" },
        { status: 500 }
      );
    }
  });
}
