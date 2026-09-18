/**
 * Approving the economics a derived service prices from — the authenticated
 * door. Every decision (pilot eligibility, completeness, a changed price) is
 * made in lib/electrical/derivedPricingApproval.ts, on the guarded client with
 * the tenant resolved here.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { decideDerivedPricingApproval, type ApprovalRequest } from "@/lib/electrical/derivedPricingApproval";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as ApprovalRequest;
  return withAdminContractor(async (db, ctx) => {
    const outcome = await decideDerivedPricingApproval(db, ctx, body);
    return NextResponse.json(outcome.body, { status: outcome.status });
  });
}
