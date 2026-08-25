import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

/**
 * The admin service editor.
 *
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
 * WHY IT READS A FLAG RATHER THAN RECOMPUTING
 *
 * `materialCostResolved` is maintained by the cost recompute, which is the
 * one place that resolves roles to a contractor's costs. Recomputing here
 * would be a second implementation of that resolution, and this codebase has
 * already paid for having four copies of the material recompute.
 *
 * It also means this route needs no contractor context, which it could not
 * obtain correctly today — Service is not yet tenant-scoped.
 *
 * DEACTIVATING IS NEVER BLOCKED. Turning a broken service off must always be
 * possible; the guard only stands between a service and going live.
 */
export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, shortDescription, disclaimer, basePrice, whileWeThereBasePrice, startingPriceLabel, active } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const wantsActive = !!active;

  if (wantsActive) {
    const service = await prisma.service.findUnique({
      where: { id: params.serviceId },
      select: {
        active: true,
        slug: true,
        materialCostResolved: true,
        unresolvedMaterialKeys: true,
      },
    });

    if (!service) {
      return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    }

    // Only blocks the transition INTO active. A service already live with a
    // material problem is handled by the pricing guard, and refusing to save
    // an unrelated wording change on it would help nobody.
    if (!service.active && service.materialCostResolved === false) {
      const keys = service.unresolvedMaterialKeys ?? [];
      console.error(
        `[admin/services] refused to activate ${service.slug}: ` +
          `unresolved material roles ${keys.join(", ") || "(none recorded)"}`
      );
      return NextResponse.json(
        {
          error: "MATERIALS_UNRESOLVED",
          message:
            keys.length > 0
              ? `This service can't go live yet — no cost has been entered for ` +
                `${keys.join(", ")}. Add those costs and try again.`
              : `This service can't go live yet — one of the materials it needs ` +
                `has no cost recorded.`,
          unresolvedMaterialKeys: keys,
        },
        { status: 409 }
      );
    }
  }

  await prisma.service.update({
    where: { id: params.serviceId },
    data: {
      name,
      shortDescription: shortDescription ?? null,
      disclaimer: disclaimer ?? null,
      basePrice: typeof basePrice === "number" ? basePrice : null,
      whileWeThereBasePrice: typeof whileWeThereBasePrice === "number" ? whileWeThereBasePrice : null,
      startingPriceLabel: startingPriceLabel ?? null,
      active: wantsActive,
    },
  });

  return NextResponse.json({ ok: true });
}
