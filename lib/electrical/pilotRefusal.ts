/**
 * A pilot eligibility refusal, in words — DOWNSTREAM of the decision.
 *
 * lib/electrical/pilotEligibility.ts decides; this only phrases the result
 * with the pilot copy for it. The body is named so a refusal can never
 * degrade into an unexplained 400/500.
 */
import { pilotSetupCopy } from "../pricingCopy";
import type { PilotEligibility } from "./pilotEligibility";

type Ineligible = Extract<PilotEligibility, { eligible: false }>;

export function pilotRefusalMessage(e: Ineligible): string {
  return pilotSetupCopy(e).unavailableMessage;
}

export function pilotRefusalBody(e: Ineligible) {
  return { error: e.code, message: pilotRefusalMessage(e), pricingStrategy: e.strategy };
}
