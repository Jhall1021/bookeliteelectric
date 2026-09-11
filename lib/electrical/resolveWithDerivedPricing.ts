/**
 * The customer-facing verdict for a derived service.
 *
 * `resolveRoute` is pure and synchronous by design: routing receives resolved
 * facts and never queries mid-walk. A derived price cannot be computed that
 * way — it needs the takeoff, the contractor's declarations and the standing
 * approval, none of which are known until the route's components are. So the
 * physical resolution happens first, and the money happens here.
 *
 * A LEGACY service passes straight through untouched. That is the whole
 * compatibility story: this function is a no-op for every service that exists
 * today, and a service only reaches the derived path by carrying the pricing
 * method that says so.
 */
import type { PrismaClient } from "@prisma/client";
import { DERIVED_PRICING_PENDING, resolveRoute } from "../routeResolver";
import { loadAndPriceDerivedScope } from "./loadDerivedScope";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loaded = any;
type Verdict = any;

export async function resolveRouteWithDerivedPricing(
  db: PrismaClient,
  service: Loaded,
  answers: Record<string, string>,
  isPrimary: boolean,
  settings: unknown,
  routeShape: { routeFeet: number; turnCount: number },
): Promise<Verdict> {
  const resolved = resolveRoute(service, answers, isPrimary, settings as never) as Verdict;

  if (service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") return resolved;

  // Anything that is not the sentinel is a verdict the pure resolver reached on
  // its own — INVALID for a broken tree, REVIEW for an unapproved component,
  // PHOTO_REVIEW. Those are physical and routing conclusions and they stand.
  if (resolved?.status !== "REVIEW" || resolved.reason !== DERIVED_PRICING_PENDING) {
    return resolved;
  }

  const components = (resolved.config?.components ?? []) as { key: string; quantity: number }[];

  const priced = await loadAndPriceDerivedScope(db, {
    contractorId: service.contractorId,
    serviceId: service.id,
    components,
    routeFeet: routeShape.routeFeet,
    turnCount: routeShape.turnCount,
    context: {
      isPrimary,
      isPrimaryEligible: service.isPrimaryEligible ?? true,
      servicePermitAdminEstablished: service.permitAdminCents !== null,
    },
    service: {
      materialMultiplier: service.materialMultiplier ?? null,
      permitAdminCents: service.permitAdminCents ?? null,
      otherDirectCostCents: service.otherDirectCostCents ?? null,
      isPrimaryEligible: service.isPrimaryEligible ?? true,
    },
  });

  if (priced.kind === "PRICED") {
    return {
      ...resolved,
      status: "PRICED",
      priceCents: priced.totalCents,
      reason: undefined,
      floorPriceCents: undefined,
      // Carried so a booking can record WHICH economics produced this price.
      derivedBasisFingerprint: priced.basisFingerprint,
      derivedMaterialCostCents: priced.materialCostCents,
    };
  }

  // Fails closed with the specific reason, never a fallback price. No legacy
  // base, no V1 component increments, no zero.
  return {
    ...resolved,
    status: "REVIEW",
    reason: priced.reason,
    derivedRefusalCode: priced.code,
    floorPriceCents: null,
  };
}
