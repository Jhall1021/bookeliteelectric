/**
 * Can this contractor actually keep the same-visit promise?
 *
 * The storefront tells a homeowner that anything extra uses same-visit
 * pricing — a badge, a two-rung ladder, a step in "How Our Pricing Works" and
 * an upsell on the cart. That copy was unconditional, so it described the
 * PLATFORM's capability rather than the contractor's configuration.
 *
 * BrightPath launched four services, none with a published add-on price, and
 * advertised same-visit pricing on every page. A homeowner who took the offer
 * got PRIMARY_UNRESOLVABLE at the cart: "we can't combine those services on
 * one visit just now."
 *
 * THE MECHANIC
 *
 * A service with no add-on price cannot be demoted — it can only ever be the
 * primary (see lib/visitPrimary). One such service on a visit is fine; it
 * simply carries the service call. TWO is unplaceable, and that is the refusal.
 *
 * TWO SEPARATE QUESTIONS, and conflating them was the first attempt's mistake.
 *
 * "May this contractor make the promise at all?" is answered by whether ANY
 * live service has an add-on price. Elite has 59 of 65 and the promise is
 * plainly true of their business; BrightPath has none and it is false of
 * theirs. Requiring that EVERY pair be placeable would have silenced Elite's
 * storefront over 15 unplaceable combinations out of 2,080 — 0.7% — which is
 * not a false promise, it is a gap in a catalog.
 *
 * "May this particular service be added to this particular visit?" is the
 * other question, and it belongs at the point of adding rather than in the
 * copy. That is what canPlaceAlongside answers, so the 0.7% never reaches a
 * homeowner as a refusal: those services simply are not offered while an
 * undemotable one is already on the visit.
 */

import type { PrismaClient } from "@prisma/client";

export type SameVisitCandidate = { whileWeThereBasePrice: number | null };

/** True when this contractor has any same-visit pricing to offer at all. */
export function canPromiseSameVisit(services: readonly SameVisitCandidate[]): boolean {
  if (services.length < 2) return false;
  return services.some((s) => s.whileWeThereBasePrice !== null);
}

/**
 * Can this service be added to a visit that already holds these?
 *
 * The placement rule itself, asked before the service is offered rather than
 * after it is chosen. selectPrimary is the authority — this passes it the
 * hypothetical visit rather than reimplementing "undemotable", so the offer
 * and the add can never disagree about what is possible.
 */
export function canPlaceAlongside(
  onVisit: readonly PlacementCandidate[],
  candidate: PlacementCandidate,
  selectPrimary: (c: PlacementCandidate[]) => { ok: boolean }
): boolean {
  return selectPrimary([...onVisit, candidate]).ok;
}

export type PlacementCandidate = {
  slug: string;
  basePrice: number | null;
  whileWeThereBasePrice: number | null;
};

/**
 * The promise for one storefront, from its live catalog.
 *
 * Reads ACTIVE services only: what a homeowner can reach is what the promise
 * is about, and a contractor's unlaunched add-on prices keep no promises.
 */
export async function sameVisitAvailable(
  db: PrismaClient,
  contractorId: string
): Promise<boolean> {
  const services = await db.service.findMany({
    where: { contractorId, active: true },
    select: { whileWeThereBasePrice: true },
  });
  return canPromiseSameVisit(services);
}

/**
 * Live services with no add-on price, for the contractor's own readiness.
 *
 * None of them is the case that silences the storefront; a few of them is a
 * catalog gap worth mentioning, because each one is a service a homeowner
 * cannot add to a visit that already has another like it.
 */
export async function servicesWithoutAddOnPrice(
  db: PrismaClient,
  contractorId: string
): Promise<string[]> {
  const services = await db.service.findMany({
    where: { contractorId, active: true, whileWeThereBasePrice: null },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  return services.map((s) => s.slug);
}
