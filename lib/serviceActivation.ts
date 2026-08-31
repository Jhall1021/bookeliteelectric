/**
 * May this service go live, and putting it live.
 *
 * ONE implementation, called by the admin route and by the tests. It was
 * inline in the route, which meant a behavioral test either drove HTTP with a
 * real session or asserted on source — and a source assertion proves the code
 * SAYS the right thing, not that it DOES it.
 *
 * There is deliberately no bulk variant. Guided Setup's launch calls this once
 * per service, so a contractor putting seven services live gets seven
 * independent decisions. A bulk path would be a second activation authority,
 * and the one that skipped a check would be the one nobody noticed.
 */

import type { PrismaClient } from "@prisma/client";
import { promiseFor } from "./onboardingReadiness";
import { loadPricingSettings } from "./routeResolver";

export type ActivationRefusal = {
  code: "UNKNOWN_SERVICE" | "PRICE_NOT_APPROVED" | "MATERIALS_UNRESOLVED";
  message: string;
  unresolvedMaterialKeys?: string[];
};

/**
 * Why this service may not go live, or null.
 *
 * Only ever blocks the transition INTO active. A service already live with a
 * material problem is the pricing guard's business, and refusing to save an
 * unrelated wording change on it would help nobody.
 */
export async function activationRefusal(
  db: PrismaClient,
  contractorId: string,
  serviceId: string
): Promise<ActivationRefusal | null> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true, slug: true, active: true, bookingType: true,
      publishedPriceApprovedAt: true, materialCostResolved: true,
      unresolvedMaterialKeys: true,
    },
  });
  if (!service) {
    return { code: "UNKNOWN_SERVICE", message: "Unknown service" };
  }
  if (service.active) return null;

  // §1.4, enforced at activation rather than only in CI.
  //
  // A tree that can quote a homeowner a fixed price, on a service with no
  // approved price, is what §1.4 forbids — and it used to be caught only
  // afterwards by a verifier. One service slipping through was a build
  // failure; a launch that activates many at once makes it a storefront
  // quoting prices nobody approved.
  //
  // Asked through the same function readiness and §1.4 use, so the three
  // cannot disagree about what a service promises.
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db as never, contractorId); } catch { settings = null; }
  const promise = await promiseFor(
    db, { id: service.id, bookingType: service.bookingType }, settings
  );
  if (promise.promisesFixedPrice && service.publishedPriceApprovedAt === null) {
    return {
      code: "PRICE_NOT_APPROVED",
      message:
        "This service can't go live yet — a homeowner could reach a price on it, " +
        "and no price has been approved.",
    };
  }

  if (service.materialCostResolved === false) {
    const keys = service.unresolvedMaterialKeys ?? [];
    return {
      code: "MATERIALS_UNRESOLVED",
      message:
        keys.length > 0
          ? `This service can't go live yet — no cost has been entered for ${keys.join(", ")}. ` +
            `Add those costs and try again.`
          : `This service can't go live yet — one of the materials it needs has no cost recorded.`,
      unresolvedMaterialKeys: keys,
    };
  }

  return null;
}

/**
 * Put one service live, or refuse and change nothing.
 *
 * The refusal and the write are together on purpose: a caller that could check
 * and then write separately is a caller that can forget the check.
 */
export async function activateService(
  db: PrismaClient,
  contractorId: string,
  serviceId: string
): Promise<{ ok: true } | { ok: false; refusal: ActivationRefusal }> {
  const refusal = await activationRefusal(db, contractorId, serviceId);
  if (refusal) return { ok: false, refusal };
  await db.service.update({ where: { id: serviceId }, data: { active: true } });
  return { ok: true };
}
