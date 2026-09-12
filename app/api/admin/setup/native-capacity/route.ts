/**
 * How many jobs this contractor can run at the same time.
 *
 * CAPACITY, NOT STAFFING. Price2Book does not model technicians, rosters or
 * assignments for native scheduling and must not start: a native booking names
 * nobody, and the contractor decides who goes exactly as they did before. The
 * one thing availability cannot answer honestly without is how many
 * appointments may overlap.
 *
 * Durable operating configuration like the authority it accompanies — it keeps
 * deciding what a homeowner is offered long after setup is over.
 */
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function PATCH(req: Request) {
  let parsed: unknown;
  try { parsed = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const body = parsed as { concurrentJobs?: unknown };

  // A blank box is "not answered" and clears the value, which readiness then
  // blocks on. Zero is refused rather than stored: a contractor who can run no
  // jobs at once has not described a business, and storing it would read as a
  // decision to accept no bookings.
  const raw = body.concurrentJobs;
  if (raw === null || raw === "") {
    return withAdminRoute(async (db, ctx) => {
      await db.contractor.update({
        where: { id: ctx.contractorId }, data: { nativeConcurrentJobs: null },
      });
      return NextResponse.json({ ok: true, concurrentJobs: null });
    });
  }

  // Forms may send a numeric string, but booleans/objects must not be allowed
  // through JavaScript's Number() coercion (Number(true) === 1). Capacity is a
  // deliberate operating decision, not something malformed JSON can invent.
  if (
    (typeof raw !== "number" && typeof raw !== "string") ||
    (typeof raw === "string" && raw.trim() === "")
  ) {
    return NextResponse.json(
      { error: "Tell us a whole number of jobs between 1 and 100." },
      { status: 400 }
    );
  }

  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > 100) {
    return NextResponse.json(
      { error: "Tell us a whole number of jobs between 1 and 100." },
      { status: 400 }
    );
  }

  return withAdminRoute(async (db, ctx) => {
    await db.contractor.update({
      where: { id: ctx.contractorId }, data: { nativeConcurrentJobs: n },
    });
    return NextResponse.json({ ok: true, concurrentJobs: n });
  });
}
