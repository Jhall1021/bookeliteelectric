import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CONTRACTOR_COOKIE, resolveAdminContractor } from "@/lib/adminContext";

/**
 * Record which contractor this account is working on.
 *
 * Validated before it is stored. The cookie is a CHOICE among memberships the
 * account already has, never a way to acquire one, so the id is resolved
 * through the same membership check every other request uses — a forged value
 * is refused here rather than trusted downstream.
 */
export async function PUT(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
  const { contractorId } = (body ?? {}) as Record<string, unknown>;
  if (typeof contractorId !== "string" || !contractorId) {
    return NextResponse.json({ error: "contractorId is required." }, { status: 400 });
  }

  try {
    const ctx = await resolveAdminContractor(contractorId);
    cookies().set(CONTRACTOR_COOKIE, ctx.contractorId, {
      httpOnly: true, sameSite: "lax", path: "/",
      secure: process.env.NODE_ENV === "production",
      // Deliberately a session cookie. Which business someone is working on is
      // a decision for this sitting, not a preference to remember for a month.
    });
    return NextResponse.json({ ok: true, contractorId: ctx.contractorId, slug: ctx.contractorSlug });
  } catch {
    // Same answer whether the contractor does not exist or is not theirs.
    return NextResponse.json({ error: "No such contractor for this account." }, { status: 403 });
  }
}
