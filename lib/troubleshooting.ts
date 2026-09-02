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
 *
 * SCOPED BY TRADE — G2
 *
 * The lookup used to ask only "which service is this CONTRACTOR's diagnostic".
 * For a contractor selling one trade that is the same question; for one selling
 * Electrical and Plumbing it is not, and the answer was "ambiguous" — so every
 * REROUTE_TROUBLESHOOTING route on a multi-trade contractor fell to review,
 * quietly, because a review is not an error anybody investigates.
 *
 * ANOTHER TRADE'S DIAGNOSTIC IS NOW INVISIBLE, NOT AMBIGUOUS. That distinction
 * is the design: a filter that merely broke the tie would still be treating a
 * Plumbing service call as a candidate answer to an Electrical question. It is
 * not a worse candidate — it is not a candidate.
 *
 * `tradeKey` is a SERVER-DERIVED value, read from a concrete Service's own
 * `Service.tradeKey`. A caller that does not legitimately hold a trade must
 * obtain one from an authoritative server-owned object; it may never guess, and
 * the browser may never supply one. The client says which service it is
 * rendering; the server decides what that service means.
 *
 * THE ONE AUTHORITY
 *
 * Four places used to answer this question and three did it with `findFirst`
 * and no `orderBy` — silently picking a row, non-deterministically. They all
 * consume this function now. No local query, no `.find()` over offered rows, no
 * slug, category or name inference.
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
  contractorId: string,
  /**
   * The originating service's own trade. Server-derived, never client-supplied.
   *
   * Required rather than optional: an optional trade would make the unscoped
   * lookup reachable by omission, and the caller that forgot it would get the
   * pre-G2 behavior back without anything failing.
   */
  tradeKey: string
): Promise<TroubleshootingLookup> {
  // A caller with no established trade has not asked a well-formed question.
  // Refused here rather than resolved unscoped, because "any trade" is exactly
  // the ambiguity this parameter exists to remove.
  if (typeof tradeKey !== "string" || tradeKey.trim() === "") {
    return {
      ok: false,
      problem:
        "no trade was established for the originating service, so its diagnostic " +
        "cannot be resolved — Service.tradeKey is null or empty",
    };
  }

  const found = await db.service.findMany({
    where: {
      contractorId,
      tradeKey,
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
    // Deterministic, so an ambiguous catalog reports the same pair every
    // time rather than a different one per call. It still refuses.
    orderBy: { slug: "asc" },
  });

  if (found.length === 0) {
    return {
      ok: false,
      problem:
        `no active ${TROUBLESHOOTING_BOOKING_TYPE} service for this contractor ` +
        `in trade "${tradeKey}"`,
    };
  }
  if (found.length > 1) {
    return {
      ok: false,
      problem:
        `${found.length} active ${TROUBLESHOOTING_BOOKING_TYPE} services in ` +
        `trade "${tradeKey}" (${found.map((s) => s.slug).join(", ")}) — which one ` +
        `is the diagnostic visit is not decidable`,
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


/**
 * The trade a live service belongs to, or a refusal — G2.
 *
 * The ONE sanctioned way for a caller to obtain a `tradeKey`. Everything that
 * needs to resolve a diagnostic starts from a concrete Service and reads its
 * stored identity; nothing derives a trade from a slug, a category, a name, or
 * the contractor's enrolment.
 *
 * Tenant-rooted and scoped to `contractorId` even when handed an already-scoped
 * client — the same rule loadServiceForResolution documents, and for the same
 * reason: a boundary that holds only because the caller remembered to scope the
 * client is not a boundary.
 */
export async function tradeOfService(
  db: PrismaClient,
  contractorId: string,
  serviceId: string
): Promise<{ ok: true; tradeKey: string } | { ok: false; problem: string }> {
  const svc = await db.service.findFirst({
    where: { id: serviceId, contractorId },
    select: { slug: true, tradeKey: true },
  });
  if (!svc) return { ok: false, problem: "unknown service for this contractor" };
  if (!svc.tradeKey) {
    // Fails closed. A service whose trade was never established cannot resolve
    // its own destination, and guessing one here would be the inference the
    // whole design forbids.
    return {
      ok: false,
      problem: `${svc.slug} has no tradeKey, so its diagnostic destination is not resolvable`,
    };
  }
  return { ok: true, tradeKey: svc.tradeKey };
}
