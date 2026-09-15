/**
 * Where the contractor is in getting their first service ready — over HTTP.
 *
 * The authenticated door. The decision, including the fixed-price pilot
 * eligibility refusal, is lib/electrical/firstServiceReadiness.ts.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { readFirstServiceReadiness } from "@/lib/electrical/firstServiceReadiness";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return withAdminContractor(async (db, ctx) => {
    const outcome = await readFirstServiceReadiness(db, ctx.contractorId);
    return NextResponse.json(outcome.body, { status: outcome.status });
  });
}
