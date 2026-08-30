import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { findDefinition } from "@/lib/theme/definition";

/**
 * Apply a storefront design — Phase 4, ADR-015.
 *
 * Under /api/portal rather than /api/admin on purpose: this is a
 * contractor-facing product feature that will live in the Price2Book portal,
 * and naming it after the route structure it happens to be reachable from
 * today would make moving it a rename of the API.
 *
 * Persists all three parts of the choice. The VERSION is written from the
 * request and never resolved to "the newest one", because a contractor who
 * chose v1 must keep rendering v1 after v2 ships — adoption is a separate,
 * explicit act that does not exist yet.
 */
export async function PUT(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }

    const { family, variant, version } = (body ?? {}) as Record<string, unknown>;
    if (typeof family !== "string" || typeof variant !== "string" || typeof version !== "number") {
      return NextResponse.json({ error: "family, variant and version are required." }, { status: 400 });
    }

    // Resolved against the real catalog, not trusted from the request. An
    // unknown design would otherwise be stored and then silently fall back to
    // the baseline at render time — the storefront would look wrong and the
    // settings page would say it was fine.
    const def = findDefinition(family, variant, version);
    if (!def) {
      return NextResponse.json({ error: `No design ${family} ${variant} v${version}.` }, { status: 404 });
    }
    // The parity anchor is not a design anyone may choose.
    if (!def.selectable) {
      return NextResponse.json({ error: "That design is not selectable." }, { status: 400 });
    }

    await db.contractor.update({
      where: { id: ctx.contractorId },
      data: { themeFamily: def.family, themeVariant: def.variant, themeVersion: def.version },
    });

    return NextResponse.json({
      ok: true,
      applied: { family: def.family, variant: def.variant, version: def.version, label: def.label },
    });
  });
}
