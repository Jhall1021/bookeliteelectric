import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { promiseFor } from "@/lib/onboardingReadiness";
import { loadPricingSettings } from "@/lib/routeResolver";


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
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // GUARD-ADOPTED (ADR-007a). Took a service id from the URL with no
  // contractor condition; the guard supplies it centrally now.
  return withAdminContractor(async (db, ctx) => {
  const contractorId = ctx.contractorId;

  const body = await req.json();
  // basePrice and whileWeThereBasePrice are NOT read from the body.
  //
  // They used to be, which meant a number typed into the service editor
  // reached a homeowner without passing through the pricing engine or anyone's
  // approval. A customer-facing price now has exactly one way in — the publish
  // action on this service's pricing route, which derives it and stamps
  // publishedPriceApprovedAt. Anything sent here is ignored on purpose.
  const { name, shortDescription, disclaimer, startingPriceLabel, active } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const wantsActive = !!active;

  if (wantsActive) {
    const service = await db.service.findUnique({
      where: { id: params.serviceId },
      select: {
        id: true,
        active: true,
        slug: true,
        bookingType: true,
        publishedPriceApprovedAt: true,
        materialCostResolved: true,
        unresolvedMaterialKeys: true,
      },
    });

    if (!service) {
      return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    }

    // Asked of the TREE, through the same function readiness and §1.4 use, so
    // the three cannot disagree about what a service promises.
    let settings: unknown = null;
    try { settings = await loadPricingSettings(db as never, contractorId); } catch { settings = null; }
    const promise = await promiseFor(
      db, { id: service.id, bookingType: service.bookingType }, settings
    );


    // Only blocks the transition INTO active. A service already live with a
    // material problem is handled by the pricing guard, and refusing to save
    // an unrelated wording change on it would help nobody.
    // §1.4, enforced AT ACTIVATION rather than only in CI.
    //
    // The guard below covers material costs. It did not cover the promise the
    // service makes: a tree that can quote a homeowner a fixed price, on a
    // service with no approved price, is exactly what §1.4 forbids — and it
    // was only caught by a verifier after the fact. One service slipping
    // through was a build failure; Guided Setup's launch activates many at
    // once, so the same gap becomes a storefront quoting prices nobody
    // approved.
    if (!service.active && promise.promisesFixedPrice && service.publishedPriceApprovedAt === null) {
      return NextResponse.json(
        {
          error: "PRICE_NOT_APPROVED",
          message:
            "This service can't go live yet — a homeowner could reach a price on it, " +
            "and no price has been approved.",
        },
        { status: 409 }
      );
    }

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

  await db.service.update({
    where: { id: params.serviceId },
    data: {
      name,
      shortDescription: shortDescription ?? null,
      disclaimer: disclaimer ?? null,
      startingPriceLabel: startingPriceLabel ?? null,
      active: wantsActive,
    },
  });

  return NextResponse.json({ ok: true });
  });
}
