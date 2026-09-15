import { pilotLog } from "@/lib/electrical/pilotLog";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { activationRefusal } from "@/lib/serviceActivation";

function optionalText(
  value: unknown,
  fieldLabel: string
): { ok: true; value: string | null | undefined } | { ok: false; response: NextResponse } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${fieldLabel} must be text or null.` },
        { status: 400 }
      ),
    };
  }
  return { ok: true, value: value.trim() || null };
}

/**
 * ACTIVATION IS GUARDED
 *
 * A service cannot be made active while a material role it requires has no
 * cost recorded for the contractor who owns it.
 *
 *   A homeowner-facing price may never be calculated using an unresolved
 *   required material cost. Missing required cost = no price.
 *
 * This is the first of two guards. It catches configuration mistakes before a
 * homeowner ever sees the service — which is the cheap place to catch them.
 * The second lives in lib/routeResolver.ts and routes to review at pricing
 * time, catching what this cannot: a cost deleted, deactivated, or lost to a
 * template update or bad import AFTER activation.
 *
 * The first makes the second rare. The second is why the first is not relied
 * upon.
 *
 * DEACTIVATING IS NEVER BLOCKED. Turning a broken service off must always be
 * possible; the guard only stands between a service and going live — and,
 * below, only fires on a genuine inactive-to-active TRANSITION, not on every
 * edit of a service that is already active.
 */
export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const { name, shortDescription, disclaimer, startingPriceLabel, active } = body;

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (active !== undefined && typeof active !== "boolean") {
    return NextResponse.json({ error: "Visibility must be true or false." }, { status: 400 });
  }

  const descriptionValue = optionalText(shortDescription, "Description");
  if (!descriptionValue.ok) return descriptionValue.response;
  const disclaimerValue = optionalText(disclaimer, "Disclaimer");
  if (!disclaimerValue.ok) return disclaimerValue.response;
  const startingLabelValue = optionalText(startingPriceLabel, "Starting price label");
  if (!startingLabelValue.ok) return startingLabelValue.response;

  return withAdminRoute(async (db, ctx) => {
    const service = await db.service.findUnique({
      where: { id: params.serviceId },
      select: {
        id: true,
        active: true,
        shortDescription: true,
        disclaimer: true,
        startingPriceLabel: true,
      },
    });
    if (!service) return NextResponse.json({ error: "Unknown service" }, { status: 404 });

    const wantsActive = typeof active === "boolean" ? active : service.active;

    if (wantsActive && !service.active) {
      const refusal = await activationRefusal(db, ctx.contractorId, params.serviceId);
      // Routing V2's own DERIVED_RESOLVED_SCOPE services get their activation
      // attempts logged for the pilot — every other pricing method is silent
      // here, same as before this telemetry existed.
      const method = await db.service.findFirst({ where: { id: params.serviceId }, select: { pricingMethod: true } });
      if (method?.pricingMethod === "DERIVED_RESOLVED_SCOPE") {
        pilotLog("activation", { contractorId: ctx.contractorId, serviceId: params.serviceId, step: "activation",
          outcome: refusal ? "refused" : "ok", status: refusal ? 409 : 200, code: refusal?.code ?? null });
      }
      if (refusal) {
        if (refusal.code === "UNKNOWN_SERVICE") {
          return NextResponse.json({ error: "Unknown service" }, { status: 404 });
        }
        console.error(`[admin/services] refused to activate ${params.serviceId}: ${refusal.code}`);
        return NextResponse.json(
          {
            error: refusal.code,
            message: refusal.message,
            ...(refusal.unresolvedMaterialKeys ? { unresolvedMaterialKeys: refusal.unresolvedMaterialKeys } : {}),
            ...(refusal.missingPrerequisites ? { missingPrerequisites: refusal.missingPrerequisites } : {}),
            ...(refusal.prerequisites ? { prerequisites: refusal.prerequisites } : {}),
          },
          { status: 409 }
        );
      }
    }

    await db.service.update({
      where: { id: params.serviceId },
      data: {
        name: name.trim(),
        shortDescription:
          descriptionValue.value === undefined ? service.shortDescription : descriptionValue.value,
        disclaimer:
          disclaimerValue.value === undefined ? service.disclaimer : disclaimerValue.value,
        startingPriceLabel:
          startingLabelValue.value === undefined ? service.startingPriceLabel : startingLabelValue.value,
        active: wantsActive,
      },
    });

    return NextResponse.json({ ok: true });
  });
}
