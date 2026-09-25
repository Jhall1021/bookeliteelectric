import { pilotLog } from "@/lib/electrical/pilotLog";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { policiesFor, resolvePolicy } from "@/lib/policyResolution";
import { isElectricalCatalogStandardPolicy } from "@/lib/electrical/catalogPolicyStandards";

/**
 * The contractor's own pricing policies — the decisions the catalog can't make.
 *
 * GET  — every policy this contractor owes an answer to, with the services
 *        waiting on each one.
 * PATCH— record one decision. { key, boundaries?: number[], choice?: string, measurement?: number }
 *
 * Deliberately NOT a route that clears `unresolvedPolicyKeys`. It goes through
 * lib/policyResolution, which rewrites the customer-visible band labels the
 * decision produces and clears the key as a consequence of that. A surface
 * whose only effect was clearing the flag would leave the storefront reading
 * "{b1} feet or less" and call the problem solved.
 */
export async function GET() {
  return withAdminRoute(async (db, ctx) =>
    NextResponse.json({ policies: await policiesFor(db, ctx.contractorId) })
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
    return NextResponse.json({ error: "Missing policy key" }, { status: 400 });
  }
  const key = body.key.trim();
  if (isElectricalCatalogStandardPolicy(key)) {
    return NextResponse.json({
      error: "This value is maintained by the prepared electrical catalog and is not a contractor policy.",
      code: "CATALOG_STANDARD",
    }, { status: 400 });
  }

  let boundaries: number[] | undefined;
  if (body.boundaries !== undefined) {
    if (!Array.isArray(body.boundaries)) {
      return NextResponse.json({ error: "Policy boundaries must be a list of numbers." }, { status: 400 });
    }

    const converted = body.boundaries.map((value) => {
      if (value === null || value === undefined || value === "") return NaN;
      return typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    });
    if (converted.some((value) => !Number.isFinite(value))) {
      return NextResponse.json(
        { error: "Every policy boundary must be a finite number." },
        { status: 400 }
      );
    }
    boundaries = converted;
  }

  let choice: string | undefined;
  if (body.choice !== undefined) {
    if (typeof body.choice !== "string" || body.choice.trim() === "") {
      return NextResponse.json({ error: "Policy choice must be non-empty text." }, { status: 400 });
    }
    choice = body.choice.trim();
  }

  // Routing V2's own measurement policy shape — a plain finite number, not a
  // boundary list or a named choice. Same "reject rather than coerce" rule as
  // boundaries/choice above: a non-numeric measurement is dropped, not zeroed.
  const measurement = typeof body.measurement === "number" && Number.isFinite(body.measurement)
    ? body.measurement
    : undefined;

  return withAdminRoute(async (db, ctx) => {
    const result = await resolvePolicy(db, ctx.contractorId, key, { boundaries, choice, measurement });
    // Only the first-service pilot's own decisions, so this is not a general policy log.
    if (key.startsWith("surface_")) {
      pilotLog("setup_write", { contractorId: ctx.contractorId, step: "material_setup",
        outcome: result.ok ? "ok" : "refused", status: result.ok ? 200 : 400, code: result.ok ? null : result.refusal.code });
    }
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
