import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { pendingContractorDisclaimers, authorContractorDisclaimer } from "@/lib/disclaimerAuthoring";

/**
 * The contractor's own wording for canonical disclaimer concepts — the
 * disclaimer counterpart to app/api/admin/policies/route.ts.
 *
 * GET   — every disclaimer concept this contractor's catalog reaches, with
 *         which services depend on it and whether it has been authored yet.
 * PATCH — record one concept's wording. { key, text }
 *
 * Deliberately mirrors the policies route's shape: one PATCH, keyed by the
 * canonical concept, atomic against every real row it needs to reach.
 */
export async function GET() {
  return withAdminRoute(async (db, ctx) =>
    NextResponse.json({ disclaimers: await pendingContractorDisclaimers(db, ctx.contractorId) })
  );
}

export async function PATCH(req: Request) {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  if (typeof body.key !== "string" || body.key.trim() === "") {
    return NextResponse.json({ error: "Missing disclaimer key" }, { status: 400 });
  }
  if (typeof body.text !== "string") {
    return NextResponse.json({ error: "Missing disclaimer text" }, { status: 400 });
  }
  const key = body.key.trim();

  return withAdminRoute(async (db, ctx) => {
    const result = await authorContractorDisclaimer(db, ctx.contractorId, key, body.text as string);
    if (!result.ok) {
      const status = result.code === "UNKNOWN_DISCLAIMER" ? 404 : 400;
      return NextResponse.json({ error: result.message, code: result.code }, { status });
    }
    return NextResponse.json({ ok: true, key: result.key, attached: result.attached });
  });
}
