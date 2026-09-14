/**
 * WHO MAY USE THE FIRST-SERVICE PILOT — the one decision, asked everywhere.
 *
 * Stage 1A is a FLAT-RATE pilot. Derived resolved-scope pricing produces a
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
 * STRUCTURED, NOT A BOOLEAN, so every caller explains the limitation the same
 * way. A bounded pilot constraint, not a rule about what Price2Book supports:
 * derived pricing is not generally time-and-materials aware in this phase.
 *
 * Eligible only when BOTH hold: the strategy is one this pilot supports, and
 * the pilot copy for it says it is available. If those ever disagree, the
 * contractor is refused — the fail-safe direction.
 */
import type { PricingStrategy, PrismaClient } from "@prisma/client";
import { pilotSetupCopy, isKnownPricingStrategy } from "../pricingCopy";

export const PILOT_SUPPORTED_STRATEGIES: readonly PricingStrategy[] = ["FLAT_RATE"];

export type PilotIneligibleCode = "PILOT_STRATEGY_NOT_SUPPORTED" | "PILOT_STRATEGY_UNKNOWN";

export type PilotEligibility =
  | { eligible: true; strategy: PricingStrategy }
  | {
      eligible: false;
      code: PilotIneligibleCode;
      /** The contractor's strategy when it is a known one; null when it is not. */
      strategy: PricingStrategy | null;
      /** Contractor-facing explanation. */
      message: string;
      /** Staff readiness state and next step, word for word. */
      supportStatus: string;
      supportNextAction: string;
      strategyLabel: string;
    };

export function pilotEligibility(strategy: unknown): PilotEligibility {
  const copy = pilotSetupCopy(strategy);
  const known = isKnownPricingStrategy(strategy);
  if (known && PILOT_SUPPORTED_STRATEGIES.includes(strategy) && copy.available) {
    return { eligible: true, strategy };
  }
  return {
    eligible: false,
    code: known ? "PILOT_STRATEGY_NOT_SUPPORTED" : "PILOT_STRATEGY_UNKNOWN",
    strategy: known ? strategy : null,
    message: copy.unavailableMessage || pilotSetupCopy(null).unavailableMessage,
    supportStatus: copy.supportStatus || pilotSetupCopy(null).supportStatus,
    supportNextAction: copy.supportNextAction || pilotSetupCopy(null).supportNextAction,
    strategyLabel: copy.strategyLabel,
  };
}

/** The contractor's own strategy, read on whatever client the caller holds. A missing contractor is unknown, never eligible. */
export async function loadPilotEligibility(db: PrismaClient, contractorId: string): Promise<PilotEligibility> {
  const c = await db.contractor.findUnique({ where: { id: contractorId }, select: { pricingStrategy: true } });
  return pilotEligibility(c?.pricingStrategy ?? null);
}

/** The JSON a server refusal carries — named, so it cannot degrade into an unexplained 400/500. */
export function pilotRefusalBody(e: Extract<PilotEligibility, { eligible: false }>) {
  return { error: e.code, message: e.message, pricingStrategy: e.strategy };
}
