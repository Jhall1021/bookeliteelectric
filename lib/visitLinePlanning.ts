/**
 * Where a new line would sit on a visit, and what it would cost — READ-ONLY.
 *
 * Extracted from POST /api/visit so the storefront's price evaluation
 * (POST /api/price-evaluation) and the add-to-visit write reach a homeowner's
 * price through the SAME code: candidate placement, a derived service's
 * computed standalone and add-on prices, primary selection, and finally
 * resolveRouteWithDerivedPricing. A price shown before "Add to My Visit" and
 * the price stored on the LineItem therefore cannot come from two
 * implementations — and if economics or approval change in between, the write
 * re-plans and fails closed to review rather than storing the shown figure.
 *
 * Nothing here writes. The caller supplies the lines already on the visit (an
 * empty list for a visitor with no open visit) and decides what to persist.
 */
import type { PrismaClient } from "@prisma/client";
import { resolveRouteWithDerivedPricing, derivedPlacementPrices, type DerivedVerdict } from "./electrical/resolveWithDerivedPricing";
import { loadServiceForResolution, loadPricingSettings } from "./routeResolver";
import { selectPrimary } from "./visitPrimary";

type LoadedService = NonNullable<Awaited<ReturnType<typeof loadServiceForResolution>>>;

export type ExistingLine = {
  id: string;
  serviceId: string;
  isPrimary: boolean;
  answersSnapshot: unknown;
  service: { slug: string; basePrice: number | null; whileWeThereBasePrice: number | null; pricingMethod: string };
};

export const NEW_LINE = Symbol("new-line");

export type PlacementCandidate = {
  ref: string | symbol;
  slug: string;
  basePrice: number | null;
  whileWeThereBasePrice: number | null;
  isPrimary: boolean;
};

export type LinePlan =
  /** A derived service that cannot be priced right now — before placement. */
  | { kind: "REVIEW_BEFORE_PLACEMENT"; verdict: DerivedVerdict | null }
  /** No valid arrangement of the visit's services. */
  | { kind: "UNRESOLVABLE"; conflict: string }
  | {
      kind: "PLACED";
      candidates: PlacementCandidate[];
      isPrimary: boolean;
      settings: Awaited<ReturnType<typeof loadPricingSettings>>;
      answers: Record<string, string>;
      resolved: DerivedVerdict;
    };

export async function planNewLine(
  db: PrismaClient,
  input: { contractorId: string; service: LoadedService; answersSnapshot: unknown; existing: ExistingLine[] },
): Promise<LinePlan> {
  const { contractorId, service, existing } = input;
  const answersSnapshot = input.answersSnapshot as Record<string, string> | null | undefined;

  const candidates: PlacementCandidate[] = [
    ...existing.map((li) => ({
      ref: li.id as string | symbol,
      slug: li.service.slug,
      basePrice: li.service.basePrice,
      whileWeThereBasePrice: li.service.whileWeThereBasePrice,
      isPrimary: li.isPrimary,
    })),
    {
      ref: NEW_LINE as string | symbol,
      slug: service.slug,
      basePrice: service.basePrice,
      whileWeThereBasePrice: service.whileWeThereBasePrice,
      // Not on the visit yet, so it holds no flag to preserve.
      isPrimary: false,
    },
  ];

  // A derived service publishes no prices, so composition gets its COMPUTED
  // standalone and add-on prices instead — or null when they cannot be
  // computed, which the existing rules already refuse. Legacy candidates are
  // untouched.
  const hasDerived =
    (service as { pricingMethod?: string }).pricingMethod === "DERIVED_RESOLVED_SCOPE" ||
    existing.some((li) => li.service.pricingMethod === "DERIVED_RESOLVED_SCOPE");
  if (hasDerived) {
    let placementSettings: Parameters<typeof resolveRouteWithDerivedPricing>[4] | null = null;
    try { placementSettings = await loadPricingSettings(db, contractorId); } catch { placementSettings = null; }
    for (const cand of candidates) {
      const isNew = cand.ref === NEW_LINE;
      const li = isNew ? null : existing.find((e) => e.id === cand.ref);
      const method = isNew
        ? (service as { pricingMethod?: string }).pricingMethod
        : li?.service.pricingMethod;
      if (method !== "DERIVED_RESOLVED_SCOPE") continue;
      if (!placementSettings) { cand.basePrice = null; cand.whileWeThereBasePrice = null; continue; }
      const svcForPlacement = isNew ? service : await loadServiceForResolution(db, li!.serviceId);
      if (!svcForPlacement) { cand.basePrice = null; cand.whileWeThereBasePrice = null; continue; }
      const answersForPlacement = isNew
        ? ((answersSnapshot ?? {}) as Record<string, string>)
        : ((li!.answersSnapshot ?? {}) as Record<string, string>);
      const prices = await derivedPlacementPrices(db, svcForPlacement, answersForPlacement, placementSettings);
      cand.basePrice = prices.basePrice;
      cand.whileWeThereBasePrice = prices.whileWeThereBasePrice;
    }

    // THE NEW DERIVED LINE CANNOT BE PRICED RIGHT NOW — say so as a review.
    //
    // Without this, a derived service with a stale approval or incomplete setup
    // fell through to composition with no prices and came back as
    // PRIMARY_UNRESOLVABLE: "we can't combine those services". True that
    // nothing was booked, wrong about why, and it skipped the quote path a
    // homeowner should be offered. Found by the authenticated HTTP pass after a
    // cost change. The verdict here carries the real reason.
    const newCand = candidates.find((c) => c.ref === NEW_LINE);
    if (
      (service as { pricingMethod?: string }).pricingMethod === "DERIVED_RESOLVED_SCOPE" &&
      newCand && newCand.basePrice === null && newCand.whileWeThereBasePrice === null
    ) {
      const verdict = placementSettings
        ? await resolveRouteWithDerivedPricing(db, service, (answersSnapshot ?? {}) as Record<string, string>, true, placementSettings)
        : null;
      // A physical conclusion (INVALID, REROUTE…) is not a price review; the
      // normal path below reports it.
      if (!verdict || verdict.status === "REVIEW") {
        return { kind: "REVIEW_BEFORE_PLACEMENT", verdict };
      }
    }
  }

  const chosen = selectPrimary(candidates);
  if (!chosen.ok) return { kind: "UNRESOLVABLE", conflict: chosen.conflict };

  const isPrimary = chosen.primary.ref === NEW_LINE;

  // The service being added names its own contractor, so no ambient context
  // is needed here. Throws for a service with no owner rather than reaching
  // for whichever pricing settings exist.
  const settings = await loadPricingSettings(db, contractorId);
  const answers: Record<string, string> = answersSnapshot ?? {};
  // Derived-aware: a pass-through for every legacy service, and the ONLY way a
  // derived service reaches a price.
  const resolved = await resolveRouteWithDerivedPricing(db, service, answers, isPrimary, settings);
  return { kind: "PLACED", candidates, isPrimary, settings, answers, resolved };
}
