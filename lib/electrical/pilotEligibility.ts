/**
 * WHO MAY USE THE FIRST-SERVICE PILOT — the one decision, asked everywhere.
 *
 * Stage 1A is a FIXED-PRICE pilot. Derived resolved-scope pricing produces a
 * fixed total, and a time-and-materials storefront never shows one: it renders
 * a labor range from estimate bounds the pilot never collects, with no booking
 * action, while /api/visit would still record the fixed total. So a contractor
 * who does not price flat rate is refused before they can:
 *
 *   - enter the wizard            (lib/electrical/firstServiceWizardData.ts,
 *                                   lib/electrical/firstServiceReadiness.ts)
 *   - approve the derived price   (lib/electrical/derivedPricingApproval.ts)
 *   - activate the pilot service  (lib/serviceActivation.ts, derived branch)
 *   - be priced by it             (lib/electrical/resolveWithDerivedPricing.ts,
 *                                   which /api/visit and /api/quotes use)
 *
 * and the staff diagnostic reports the refusal as the readiness state.
 *
 * THE AUTHORITY, AND ONLY A DOMAIN DECISION. This module imports no copy and
 * reads no presentation field: changing what the pilot SAYS can never change
 * who may enter, approve or activate it. Words are applied downstream —
 * lib/pricingCopy.ts's pilotSetupCopy() consumes this result, and
 * lib/electrical/pilotRefusal.ts turns a refusal into a response body.
 *
 * A bounded pilot constraint, not a rule about what Price2Book supports:
 * derived pricing is not generally time-and-materials aware in this phase.
 */
import type { PricingStrategy, PrismaClient } from "@prisma/client";

/**
 * The canonical supported-strategy definition for Stage 1A.
 *
 * Keyed by the existing `PricingStrategy` enum, so a strategy added to the
 * schema is a compile error here until someone decides whether the pilot
 * supports it — never a silent default either way.
 */
export const PILOT_STRATEGY_SUPPORT: Readonly<Record<PricingStrategy, "SUPPORTED" | "NOT_SUPPORTED">> = {
  FLAT_RATE: "SUPPORTED",
  TIME_AND_MATERIALS: "NOT_SUPPORTED",
};

export const PILOT_SUPPORTED_STRATEGIES: readonly PricingStrategy[] =
  (Object.keys(PILOT_STRATEGY_SUPPORT) as PricingStrategy[]).filter((s) => PILOT_STRATEGY_SUPPORT[s] === "SUPPORTED");

export type PilotIneligibleCode = "PILOT_STRATEGY_NOT_SUPPORTED" | "PILOT_STRATEGY_UNKNOWN";

export type PilotEligibility =
  | { eligible: true; strategy: PricingStrategy }
  | {
      eligible: false;
      code: PilotIneligibleCode;
      /** The contractor's strategy when it is a value of the enum; null when it is not. */
      strategy: PricingStrategy | null;
    };

/** A value of the canonical enum — not merely a string that looks like one ("constructor", "__proto__"). */
export function isPricingStrategy(v: unknown): v is PricingStrategy {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PILOT_STRATEGY_SUPPORT, v);
}

export function pilotEligibility(strategy: unknown): PilotEligibility {
  if (!isPricingStrategy(strategy)) return { eligible: false, code: "PILOT_STRATEGY_UNKNOWN", strategy: null };
  return PILOT_STRATEGY_SUPPORT[strategy] === "SUPPORTED"
    ? { eligible: true, strategy }
    : { eligible: false, code: "PILOT_STRATEGY_NOT_SUPPORTED", strategy };
}

/** The contractor's own strategy, read on whatever client the caller holds. A missing contractor is unknown, never eligible. */
export async function loadPilotEligibility(db: PrismaClient, contractorId: string): Promise<PilotEligibility> {
  const c = await db.contractor.findUnique({ where: { id: contractorId }, select: { pricingStrategy: true } });
  return pilotEligibility(c?.pricingStrategy ?? null);
}
