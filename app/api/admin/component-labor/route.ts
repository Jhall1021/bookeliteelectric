/**
 * The contractor's own labor calibration — the supported write path.
 *
 * This endpoint exists because the component economics layer previously had
 * NO supported contractor write path at all: labor could only be set by a seed
 * or a migration, which meant onboarding could not ask for it and a contractor
 * could not answer.
 *
 * REFERENCE EVIDENCE IS NOT CALIBRATION. `ComponentLaborEvidence` is published
 * intelligence — an MLU figure is what a book says, not what this contractor
 * does. GET returns it alongside the contractor's own value so a setup screen
 * can show both, clearly separated. The only way evidence becomes calibration
 * is `action: "accept-reference"`, which writes a contractor-owned value and
 * records that it came from a named source. Nothing inherits silently.
 *
 * THREE STATES, ALL REACHABLE:
 *   set      a number (including an explicit 0 — "adds no time", a real answer)
 *   clear    back to null — "I have not established this", also a real answer
 *   accept   take a published figure deliberately, with provenance
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const keys = (searchParams.get("keys") ?? "").split(",").map((k) => k.trim()).filter(Boolean);

  return withAdminContractor(async (db, ctx) => {
    const components = await db.canonicalComponent.findMany({
      where: keys.length > 0 ? { key: { in: keys } } : {},
      select: {
        id: true, key: true, customerFacingLabel: true,
        referenceLaborHours: true, referenceLaborUnit: true, referenceLaborStatus: true,
        laborEvidence: {
          select: { source: true, edition: true, publishedLineItem: true,
                    normalizedLabor: true, normalizedUnit: true, scopeMatch: true,
                    confidence: true, caution: true },
        },
      },
      orderBy: { key: "asc" },
    });
    const own = await db.contractorComponent.findMany({
      where: { contractorId: ctx.contractorId },
      select: { canonicalComponentId: true, addFieldLaborHours: true, notes: true },
    });
    const mine = new Map(own.map((o) => [o.canonicalComponentId, o]));

    return NextResponse.json({
      components: components.map((c) => {
        const row = mine.get(c.id);
        return {
          key: c.key,
          label: c.customerFacingLabel,
          // THE CONTRACTOR'S OWN. null means unestablished, and the client must
          // render that differently from 0 — they are different answers.
          contractorLaborHours: row ? row.addFieldLaborHours : null,
          contractorLaborEstablished: row ? row.addFieldLaborHours !== null : false,
          notes: row?.notes ?? null,
          // REFERENCE ONLY. Never merged into the field above.
          reference: {
            hours: c.referenceLaborHours,
            unit: c.referenceLaborUnit,
            status: c.referenceLaborStatus,
            evidence: c.laborEvidence,
          },
        };
      }),
    });
  });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: "set" | "clear" | "accept-reference";
    componentKey?: string;
    hours?: number | null;
    note?: string | null;
  };
  const { action, componentKey } = body;
  if (!componentKey) return NextResponse.json({ error: "componentKey required" }, { status: 400 });

  return withAdminContractor(async (db, ctx) => {
    const canonical = await db.canonicalComponent.findUnique({
      where: { key: componentKey },
      select: { id: true, referenceLaborHours: true, referenceLaborUnit: true },
    });
    if (!canonical) {
      return NextResponse.json({ error: `Unknown component ${componentKey}` }, { status: 404 });
    }

    const upsert = async (hours: number | null, note: string | null) =>
      db.contractorComponent.upsert({
        where: {
          contractorId_canonicalComponentId: {
            contractorId: ctx.contractorId, canonicalComponentId: canonical.id,
          },
        },
        update: { addFieldLaborHours: hours, ...(note !== null ? { notes: note } : {}) },
        create: {
          contractorId: ctx.contractorId, canonicalComponentId: canonical.id,
          addFieldLaborHours: hours, ...(note !== null ? { notes: note } : {}),
        },
        select: { addFieldLaborHours: true, notes: true },
      });

    if (action === "clear") {
      // Back to unestablished. A contractor may withdraw a calibration they no
      // longer stand behind, and the route must go back to review when they do.
      const r = await upsert(null, body.note ?? null);
      return NextResponse.json({ ok: true, componentKey, ...r, established: false });
    }

    if (action === "set") {
      const h = body.hours;
      if (typeof h !== "number" || !Number.isFinite(h) || h < 0) {
        return NextResponse.json(
          { error: "hours must be a number >= 0. Use action \"clear\" to unset." },
          { status: 400 },
        );
      }
      const r = await upsert(h, body.note ?? null);
      return NextResponse.json({ ok: true, componentKey, ...r, established: true });
    }

    if (action === "accept-reference") {
      if (canonical.referenceLaborHours === null) {
        return NextResponse.json(
          { error: `No published reference exists for ${componentKey}.` },
          { status: 400 },
        );
      }
      // AUDITABLE. The note records that this figure came from a book rather
      // than from the contractor's own experience, so a later reader can tell.
      const note =
        `Accepted published reference ${canonical.referenceLaborHours} ` +
        `${canonical.referenceLaborUnit ?? "hours"} on ${new Date().toISOString()}.`;
      const r = await upsert(canonical.referenceLaborHours, note);
      return NextResponse.json({
        ok: true, componentKey, ...r, established: true, acceptedFromReference: true,
      });
    }

    return NextResponse.json(
      { error: 'action must be "set", "clear" or "accept-reference"' }, { status: 400 },
    );
  });
}
