/**
 * Turning a resolved scope into an estimated RANGE — ADR-018.
 *
 * ONE SCOPE ENGINE, TWO INTERPRETATIONS. There is no separate T&M catalogue.
 * The same service, the same questions, the same answers, the same components
 * produce the same scope; only the last step differs:
 *
 *   FLAT_RATE           scope + economics -> one approved fixed price
 *   TIME_AND_MATERIALS  scope + bounds + crew-hour rate + materials -> a range
 *
 * That is the payoff from separating canonical trade knowledge from contractor
 * policy and economics: the trade knowledge did not have to change at all.
 *
 * WHAT THIS DOES NOT DO. It does not clock a technician, record final labour,
 * produce an invoice, or do job costing. Price2Book estimates scope, estimates
 * duration, estimates materials, presents a range, and captures the
 * homeowner's authorisation. Everything after that is the FSM's.
 *
 * FAILS CLOSED. Given anything less than an approved, structurally valid pair
 * of bounds it returns a refusal, never a manufactured range. A plausible
 * invented range is worse than no range: the homeowner believes it.
 */
import type { PricingSettings } from "./pricing";
import { validateEstimateBounds } from "./pricingReadiness";

export type EstimateInputs = {
  /** Contractor calibration, in crew-hours. Both required, both approved. */
  estimateLowCrewHours: number | null;
  estimateHighCrewHours: number | null;
  estimateApprovedAt: Date | null;
  /**
   * Crew-hours the resolved ANSWERS add on top of the service baseline —
   * summed from the components the route selected. Answer-driven duration is
   * real scope, so it widens the estimate rather than being averaged away.
   */
  addedCrewHours: number;
  /** The material figure the flat-rate engine already computes, as an estimate. */
  materialCostCents: number | null;
};

export type Estimate =
  | { ok: true
      crewHourRateCents: number
      lowHours: number; highHours: number
      lowLaborCents: number; highLaborCents: number
      materialCents: number | null
      lowTotalCents: number; highTotalCents: number }
  | { ok: false; reason: string };

/**
 * Rounded to the nearest quarter hour, because that is the granularity a
 * contractor actually thinks in, and a range reading "5.3–8.1 hours" claims a
 * precision an estimate does not have.
 */
const quarter = (h: number) => Math.round(h * 4) / 4;

export function estimateRange(inputs: EstimateInputs, settings: PricingSettings): Estimate {
  const bad = validateEstimateBounds(inputs.estimateLowCrewHours, inputs.estimateHighCrewHours);
  if (bad.length) return { ok: false, reason: bad[0].message };
  if (inputs.estimateApprovedAt === null)
    return { ok: false, reason: "Estimated hours are suggested but not yet approved." };
  if (!Number.isFinite(settings.crewHourRateCents) || settings.crewHourRateCents <= 0)
    return { ok: false, reason: "No crew-hour rate is configured." };

  const added = Number.isFinite(inputs.addedCrewHours) ? Math.max(inputs.addedCrewHours, 0) : 0;
  const lowHours = quarter(inputs.estimateLowCrewHours! + added);
  const highHours = quarter(inputs.estimateHighCrewHours! + added);

  const lowLaborCents = Math.round(lowHours * settings.crewHourRateCents);
  const highLaborCents = Math.round(highHours * settings.crewHourRateCents);

  // Materials stay a single figure in V1. A material low/high would be two
  // more numbers per service with no evidence anyone needs them, and the
  // labour band is where the real variance lives.
  const materialCents = inputs.materialCostCents;

  // The minimum is NOT applied. It is a floor on a fixed price — a promise
  // about the smallest job worth quoting. Under T&M the homeowner is told the
  // rate and billed for the hours, so flooring the estimate would advertise a
  // charge the final invoice may not contain.
  return {
    ok: true,
    crewHourRateCents: settings.crewHourRateCents,
    lowHours, highHours,
    lowLaborCents, highLaborCents,
    materialCents,
    lowTotalCents: lowLaborCents + (materialCents ?? 0),
    highTotalCents: highLaborCents + (materialCents ?? 0),
  };
}
