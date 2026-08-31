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
 * make a service live. It writes one boolean. Selecting a service says "I sell
 * this"; whether a homeowner can buy it is derived readiness, and putting it
 * on the storefront is the activation lifecycle. Those stay separate because
 * collapsing them is how something reaches a customer that nobody priced.
 */
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  let body: { offered?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (typeof body.offered !== "boolean") {
    return NextResponse.json({ error: "offered is required." }, { status: 400 });
  }

  return withAdminRoute(async (db) => {
    // Guarded: a service id from another contractor resolves to nothing here,
    // and takes the same 404 as one that does not exist.
    const service = await db.service.findUnique({
      where: { id: params.serviceId },
      select: { id: true, slug: true, active: true },
    });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    // Deselecting something already live would take it off the storefront by a
    // side door. Deactivate it through the normal path first.
    if (body.offered === false && service.active) {
      return NextResponse.json(
        {
          error: "SERVICE_IS_LIVE",
          message: "That service is live on your storefront. Take it down first, then remove it from what you offer.",
        },
        { status: 409 }
      );
    }

    await db.service.update({
      where: { id: service.id },
      data: { offered: body.offered as boolean },
    });
    return NextResponse.json({ ok: true, slug: service.slug, offered: body.offered });
  });
}
