import { NextResponse } from "next/server";
import { withAdminContractor } from "@/lib/adminContext";
import { previewStep } from "@/lib/adminQuestionPreview";

/**
 * The admin "preview customer experience" pane's one endpoint.
 *
 * READ-ONLY. Walks the service's SAVED question tree with the exact
 * evaluation lib/routeResolver.ts uses for a real checkout — see
 * lib/adminQuestionPreview.ts's header for why that, and not a second
 * pricing engine, is what this calls. Nothing here creates a booking or
 * writes to the service or any customer data; the contractor can click
 * through an entire branching tree with no side effect at all.
 *
 * Always previews the SAVED tree — an unsaved draft in the editor is not
 * reflected here until it's actually saved. The editor UI is responsible
 * for making that distinction visible rather than this route guessing at
 * unsaved state it was never given.
 */
export async function POST(req: Request, { params }: { params: { serviceId: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  const answers = (body as { answers?: unknown })?.answers;
  if (answers !== undefined && (typeof answers !== "object" || answers === null || Array.isArray(answers))) {
    return NextResponse.json({ error: "answers must be an object of question key -> answer value" }, { status: 400 });
  }

  return withAdminContractor(async (db, ctx) => {
    // Scoped by the guard — a service belonging to another contractor
    // resolves the same way a nonexistent one does, via loadServiceForResolution's
    // own contractor-owner check.
    const service = await db.service.findUnique({
      where: { id: params.serviceId },
      select: { contractorId: true },
    });
    if (!service || service.contractorId !== ctx.contractorId) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const outcome = await previewStep(db, params.serviceId, (answers as Record<string, string>) ?? {});
    return NextResponse.json(outcome);
  });
}
