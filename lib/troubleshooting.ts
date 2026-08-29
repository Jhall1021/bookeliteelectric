/**
 * Which service is this contractor's diagnostic visit.
 *
 * ONE definition, used by every side that needs the answer, because the whole
 * point of this module is that two implementations of the same question cannot
 * drift apart. They already had: `GuidedFlowEngine` sent the customer to a
 * hard-coded `panels-troubleshooting/electrical-troubleshooting` URL while
 * `routeResolver` demanded an explicit `rerouteServiceId` on the answer and
 * called the route INVALID without one. Both were reading the same tree and
 * disagreeing about where it led.
 *
 * IDENTIFIED BY ROLE, NOT BY NAME
 *
 * `BookingType.TROUBLESHOOT_ONLY` is the schema's own words for "the $249
 * diagnostic service itself". That is a structural fact about what the service
 * IS, and it survives a contractor who renames the service, re-slugs it, or
 * files it under a different category — none of which change what it does.
 *
 * A slug would not survive any of those. `electrical-troubleshooting` is also
 * an ELECTRICAL name, and the platform is not an electrical product; the
 * second contractor's diagnostic visit has no reason to be called that.
 *
 * FAILS CLOSED, BOTH WAYS
 *
 * Missing and ambiguous are both refusals, and both say which. A contractor
 * with no diagnostic service must not have their customers routed to somebody
 * else's, and a contractor with two must not have one of them picked by
 * whatever the database returned first — that is the singleton pattern this
 * codebase has been burned by before: it does not fail when a second row
 * appears, it silently returns the wrong one.
 *
 * Inactive counts as missing. A contractor who switched the diagnostic off
 * has said they do not sell it, and routing customers to a service that is not
 * for sale is not a smaller failure than routing them nowhere.
 */

import type { PrismaClient } from "@prisma/client";

/** The schema's own marker for the diagnostic visit. */
export const TROUBLESHOOTING_BOOKING_TYPE = "TROUBLESHOOT_ONLY" as const;

export type TroubleshootingService = {
  id: string;
  slug: string;
  name: string;
  basePrice: number | null;
  /** For building the storefront link. Null when the service has no category. */
  categorySlug: string | null;
};

export type TroubleshootingLookup =
  | { ok: true; service: TroubleshootingService }
  /** Operator-facing. Never rendered to a customer as-is. */
  | { ok: false; problem: string };

/**
 * This contractor's diagnostic service, or why there isn't one.
 *
 * Takes an explicit `contractorId` and filters on it even when handed an
 * already-scoped client. Service is tenant-owned, so this is a tenant-rooted
 * top-level query — the rule `loadServiceForResolution` documents at length,
 * and for the same reason: a boundary that holds only because the caller
 * remembered to scope the client is not a boundary.
 */
export async function findTroubleshootingService(
  db: PrismaClient,
  contractorId: string
): Promise<TroubleshootingLookup> {
  const found = await db.service.findMany({
    where: {
      contractorId,
      bookingType: TROUBLESHOOTING_BOOKING_TYPE,
      active: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      contractorCategory: {
        select: { canonicalCategory: { select: { slug: true } } },
      },
    },
    // Deterministic, so an ambiguous catalogue reports the same pair every
    // time rather than a different one per call. It still refuses.
    orderBy: { slug: "asc" },
  });

  if (found.length === 0) {
    return {
      ok: false,
      problem:
        `no active ${TROUBLESHOOTING_BOOKING_TYPE} service for this contractor`,
    };
  }
  if (found.length > 1) {
    return {
      ok: false,
      problem:
        `${found.length} active ${TROUBLESHOOTING_BOOKING_TYPE} services ` +
        `(${found.map((s) => s.slug).join(", ")}) — which one is the ` +
        `diagnostic visit is not decidable`,
    };
  }

  const s = found[0];
  return {
    ok: true,
    service: {
      id: s.id,
      slug: s.slug,
      name: s.name.trim(),
      basePrice: s.basePrice,
      categorySlug: s.contractorCategory?.canonicalCategory?.slug ?? null,
    },
  };
}
