import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { policiesFor, resolvePolicy } from "@/lib/policyResolution";

/**
 * The contractor's own pricing policies — the decisions the catalog can't make.
 *
 * GET  — every policy this contractor owes an answer to, with the services
 *        waiting on each one.
 * PATCH— record one decision. { key, boundaries?: number[], choice?: string }
 *
 * Deliberately NOT a route that clears `unresolvedPolicyKeys`. It goes through
 * lib/policyResolution, which rewrites the customer-visible band labels the
 * decision produces and clears the key as a consequence of that. A surface
 * whose only effect was clearing the flag would leave the storefront reading
 * "{b1} feet or less" and call the problem solved.
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return withAdminContractor(async (db, ctx) =>
    NextResponse.json({ policies: await policiesFor(db, ctx.contractorId) })
  );
}

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : null;
  if (!key) return NextResponse.json({ error: "Missing policy key" }, { status: 400 });

  // Numbers arrive from a form, so they arrive as strings. Anything that is
  // not a finite number is dropped rather than coerced to zero — a blank box
  // is "not answered", and zero is not a boundary.
  const boundaries = Array.isArray(body.boundaries)
    ? body.boundaries
        .map((v) => (v === null || v === undefined || v === "" ? NaN : Number(v)))
        .filter((n) => Number.isFinite(n))
    : undefined;
  const choice = typeof body.choice === "string" ? body.choice : undefined;

  return withAdminContractor(async (db, ctx) => {
    const result = await resolvePolicy(db, ctx.contractorId, key, { boundaries, choice });
    if (!result.ok) {
      const status = result.refusal.code === "UNKNOWN_POLICY" ? 404 : 400;
      return NextResponse.json({ error: result.refusal.message, code: result.refusal.code }, { status });
    }
    return NextResponse.json({
      ok: true,
      key: result.key,
      optionsRelabeled: result.optionsRelabeled,
      servicesCleared: result.servicesCleared,
    });
  });
}
