/**
 * Whether this contractor offers this service.
 *
 * Beside the other per-service admin routes — pricing, pre-work, tree —
 * because `Service.offered` is durable business configuration that the
 * Services area owns permanently. Guided Setup walks a contractor through
 * setting it the first time; it does not own it, and there is deliberately no
 * onboarding-only copy of this list that could drift from the portal.
 *
 * WHAT THIS CANNOT DO, by construction: publish a price, stamp an approval, or
 * make a service live. Selecting a service says "I sell this"; choosing its
 * crew changes a pricing input and therefore retracts any previously published
 * price until the contractor reviews the new model. Putting a service on the
 * storefront remains the separate activation lifecycle.
 */
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  let parsed: unknown;
  try { parsed = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const body = parsed as Record<string, unknown>;
  const offered = typeof body.offered === "boolean" ? body.offered : undefined;
  const laborCrewType = body.laborCrewType === "ELECTRICIAN" || body.laborCrewType === "ELECTRICIAN_AND_HELPER"
    ? body.laborCrewType
    : undefined;
  if (offered === undefined && laborCrewType === undefined) {
    return NextResponse.json({ error: "Provide offered or a valid laborCrewType." }, { status: 400 });
  }

  return withAdminRoute(async (db) => {
    // Guarded: a service id from another contractor resolves to nothing here,
    // and takes the same 404 as one that does not exist.
    const service = await db.service.findUnique({
      where: { id: params.serviceId },
      select: { id: true, slug: true, active: true, laborCrewType: true },
    });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    // Deselecting something already live would take it off the storefront by a
    // side door. Deactivate it through the normal path first.
    if (offered === false && service.active) {
      return NextResponse.json(
        {
          error: "SERVICE_IS_LIVE",
          message: "That service is live on your storefront. Take it down first, then remove it from what you offer.",
        },
        { status: 409 }
      );
    }
    if (laborCrewType !== undefined && laborCrewType !== service.laborCrewType && service.active) {
      return NextResponse.json(
        { error: "SERVICE_IS_LIVE", message: "Take this service down before changing the crew used to price it." },
        { status: 409 },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.service.update({
        where: { id: service.id },
        data: {
          ...(offered === undefined ? {} : { offered }),
          ...(laborCrewType === undefined ? {} : {
            laborCrewType,
            // A staffing change moves the model. Price and approval are one
            // database fact, so retract both prices with the approval and make
            // the contractor review the newly derived suggestion.
            basePrice: null,
            whileWeThereBasePrice: null,
            publishedPriceApprovedAt: null,
          }),
        },
      });
      if (laborCrewType !== undefined && laborCrewType !== service.laborCrewType) {
        await tx.contractorDerivedPricingApproval.deleteMany({ where: { serviceId: service.id } });
      }
    });
    return NextResponse.json({ ok: true, slug: service.slug, offered, laborCrewType });
  });
}
