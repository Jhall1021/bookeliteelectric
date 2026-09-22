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
 *
 * EVERY CUSTOMER-FACING CALL SITE MUST USE THIS, NOT resolveRoute. The first
 * authenticated HTTP pass found /api/visit and /api/quotes still calling the
 * pure resolver, which for a derived service returns the pending sentinel — so
 * the earlier "homeowner receives PRICED" proof held for the library and not
 * for the route a homeowner actually hits.
 */
import type { PrismaClient } from "@prisma/client";
import { DERIVED_PRICING_PENDING, resolveRoute } from "../routeResolver";
import { loadAndPriceDerivedScope } from "./loadDerivedScope";
import { elapsedMinutesFromCrewHours } from "./derivedScopePricing";
import { loadPilotEligibility } from "./pilotEligibility";
import { SURFACE_KEYS } from "../../prisma/_surfaceRouteModule";
import { calculateCircuitPackage } from "./circuitPackagePricing";

type Resolved = ReturnType<typeof resolveRoute>;

export type DerivedVerdict = Resolved & {
  /** Present on a derived PRICED verdict — recorded on the booked line. */
  derivedBasisFingerprint?: string;
  derivedMaterialCostCents?: number;
  /** Present on a derived REVIEW verdict — the specific readiness refusal. */
  derivedRefusalCode?: string;
};

const num = (v: string | undefined, measured = false): number => {
  const n = Number(v);
  return Number.isFinite(n) && (measured || Number.isSafeInteger(n)) && n >= 0 ? n : 0;
};

/**
 * Route geometry from the homeowner's own answers.
 *
 * Derived here so no call site has to know which questions carry route
 * length. Only the surface raceway takeoff exists today; a derived service
 * whose route is not a surface route produces an incomplete takeoff and
 * therefore REVIEW — the fail-closed outcome, not a guess.
 */
export function routeShapeFromAnswers(answers: Record<string, string>) {
  return {
    routeFeet: num(answers[SURFACE_KEYS.feet], true),
    turnCount:
      num(answers[SURFACE_KEYS.inside]) +
      num(answers[SURFACE_KEYS.outside]) +
      num(answers[SURFACE_KEYS.flat]),
  };
}

export async function resolveRouteWithDerivedPricing(
  db: PrismaClient,
  service: Parameters<typeof resolveRoute>[0],
  answers: Record<string, string>,
  isPrimary: boolean,
  settings: Parameters<typeof resolveRoute>[3],
  routeShape?: { routeFeet: number; turnCount: number },
): Promise<DerivedVerdict> {
  const resolved = resolveRoute(service, answers, isPrimary, settings) as DerivedVerdict;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const svc = service as any;
  if (svc.pricingMethod !== "DERIVED_RESOLVED_SCOPE") return resolved;

  // Anything that is not the sentinel is a verdict the pure resolver reached on
  // its own — INVALID for a broken tree, REROUTE, PHOTO_REVIEW. Those are
  // physical and routing conclusions and they stand.
  if (resolved.status !== "REVIEW" || (resolved as any).reason !== DERIVED_PRICING_PENDING) {
    return resolved;
  }

  const r = resolved as any;

  // FIXED-PRICE PILOT ONLY. Derived pricing produces a fixed total; for a
  // contractor this pilot does not support (time and materials, or a strategy
  // that cannot be read), no derived price is computed at all — so /api/visit
  // and /api/quotes cannot record one, and nothing downstream can mistake it
  // for what that contractor's storefront offers. Fails closed to REVIEW with
  // the named code. The homeowner-facing reason stays neutral: the limitation
  // is the pilot's, not something to explain to a customer.
  const eligibility = await loadPilotEligibility(db, svc.contractorId);
  if (!eligibility.eligible) {
    return {
      ...r,
      status: "REVIEW",
      reason: "This job needs a quick review before it can be priced",
      floorPriceCents: null,
      derivedRefusalCode: eligibility.code,
    } as DerivedVerdict;
  }

  const circuit = await calculateCircuitPackage(db, svc, answers, isPrimary, true);
  if (circuit.kind === "PRICED") {
    return {
      status: "PRICED",
      priceCents: circuit.totalCents,
      isPrimary,
      config: {
        ...r.config,
        fieldLaborHours: circuit.laborHours,
        techCount: circuit.techCount,
        estimatedMinutes: circuit.estimatedMinutes,
      },
      photoLabels: r.photoLabels ?? [],
      photoSafetyNotes: r.photoSafetyNotes ?? [],
      disclaimers: r.disclaimers ?? [],
      consumed: r.consumed ?? [],
      derivedBasisFingerprint: circuit.basisFingerprint,
      derivedMaterialCostCents: circuit.materialCostCents,
    } as unknown as DerivedVerdict;
  }
  if (circuit.kind === "REVIEW") {
    return {
      ...r,
      status: "REVIEW",
      reason: circuit.reason,
      floorPriceCents: null,
      derivedRefusalCode: circuit.code,
    } as DerivedVerdict;
  }

  const components = (r.config?.components ?? []) as { key: string; quantity: number }[];
  const shape = routeShape ?? routeShapeFromAnswers(answers);

  const priced = await loadAndPriceDerivedScope(db, {
    contractorId: svc.contractorId,
    serviceId: svc.id,
    components,
    routeFeet: shape.routeFeet,
    turnCount: shape.turnCount,
    context: {
      isPrimary,
      isPrimaryEligible: svc.isPrimaryEligible ?? true,
      servicePermitAdminEstablished: svc.permitAdminCents !== null && svc.permitAdminCents !== undefined,
    },
    service: {
      materialMultiplier: svc.materialMultiplier ?? null,
      permitAdminCents: svc.permitAdminCents ?? null,
      otherDirectCostCents: svc.otherDirectCostCents ?? null,
      isPrimaryEligible: svc.isPrimaryEligible ?? true,
    },
  });

  if (priced.kind === "PRICED") {
    return {
      status: "PRICED",
      priceCents: priced.totalCents,
      isPrimary,
      // The labor that priced the job is the labor that schedules it. The pure
      // resolver's config carries the SERVICE's legacy fieldLaborHours and
      // estimatedMinutes (null for a derived service), which is how a booking
      // priced from 1.42 known crew-hours stored no duration at all. Everything
      // downstream (/api/visit's snapshot, checkout and schedule duration sums)
      // already reads these three fields.
      config: {
        ...r.config,
        fieldLaborHours: priced.laborHours,
        techCount: priced.techCount,
        estimatedMinutes: elapsedMinutesFromCrewHours(priced.laborHours, priced.techCount),
      },
      photoLabels: r.photoLabels ?? [],
      photoSafetyNotes: r.photoSafetyNotes ?? [],
      disclaimers: r.disclaimers ?? [],
      consumed: r.consumed ?? [],
      derivedBasisFingerprint: priced.basisFingerprint,
      derivedMaterialCostCents: priced.materialCostCents,
    } as unknown as DerivedVerdict;
  }

  // Fails closed with the specific reason, never a fallback price. No legacy
  // base, no V1 component increments, no zero.
  return {
    ...r,
    status: "REVIEW",
    reason: priced.reason,
    floorPriceCents: null,
    derivedRefusalCode: priced.code,
  } as DerivedVerdict;
}

/**
 * The standalone and add-on prices a derived service would carry on a visit.
 *
 * Visit composition (lib/visitPrimary) chooses the primary service from each
 * candidate's PUBLISHED base and add-on prices. A derived service publishes
 * neither, so it was rejected as "neither a standalone nor an add-on price"
 * and could never be placed on a visit at all — found by the first
 * authenticated HTTP pass, which got PRIMARY_UNRESOLVABLE before pricing began.
 *
 * It does have both prices; they are computed rather than published. The
 * standalone price is the primary context (service-call minimum applies) and
 * the add-on price is the While-We're-There context (it never does). Each is
 * null when it cannot be computed right now — incomplete setup, stale
 * approval — which leaves the existing composition rules to refuse, exactly as
 * they do for a service with no published price. Nothing here invents a price.
 */
export async function derivedPlacementPrices(
  db: PrismaClient,
  service: Parameters<typeof resolveRoute>[0],
  answers: Record<string, string>,
  settings: Parameters<typeof resolveRoute>[3],
): Promise<{ basePrice: number | null; whileWeThereBasePrice: number | null }> {
  const standalone = await resolveRouteWithDerivedPricing(db, service, answers, true, settings);
  const addOn = await resolveRouteWithDerivedPricing(db, service, answers, false, settings);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    basePrice: standalone.status === "PRICED" ? (standalone as any).priceCents : null,
    whileWeThereBasePrice: addOn.status === "PRICED" ? (addOn as any).priceCents : null,
  };
}
