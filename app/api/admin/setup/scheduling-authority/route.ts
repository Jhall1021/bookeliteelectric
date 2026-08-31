/**
 * Who owns the calendar — Price2Book, or a system the contractor already uses.
 *
 * Durable operating configuration, not wizard state. It decides every day
 * afterwards whether zero bookable crew is a legitimate standalone setup or a
 * configuration failure, and whether availability may be shown at all when the
 * external provider cannot be reached.
 */
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

const VALID = ["NATIVE", "EXTERNAL"] as const;

export async function PATCH(req: Request) {
  let body: { authority?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (typeof body.authority !== "string" || !VALID.includes(body.authority as (typeof VALID)[number])) {
    return NextResponse.json(
      { error: `authority must be one of ${VALID.join(", ")}.` },
      { status: 400 }
    );
  }

  return withAdminRoute(async (db, ctx) => {
    await db.contractor.update({
      where: { id: ctx.contractorId },
      data: { schedulingAuthority: body.authority as (typeof VALID)[number] },
    });
    return NextResponse.json({ ok: true, authority: body.authority });
  });
}
