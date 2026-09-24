/**
 * Pricing a terminal physical outcome as ONE resolved scope.
 *
 * THE FORMULA IS NOT NEW. This calls `suggestConfigurationPrice`, which calls
 * the same `compute()` every other price in the product goes through — the
 * progressive 30%/20% material markup applied once to the assembled package,
 * the permit fallback, the primary minimum, the rounding. Reimplementing any
 * of that here would create a second definition of what a price is, and the
 * two would disagree within a release.
 *
 * WHAT IS NEW is only the material figure it is given: the package-aware
 * takeoff total, where the legacy path passes Σ(per-unit recipe × quantity).
 * That single substitution is the whole point of the phase. On the pilot route
 * it is the difference between 9 021c of channel and the 10 199c of seven
 * actual sticks.
 *
 * A DERIVED SCOPE NEVER READS approvedPriceCents.
 *
 * Not once, not as a fallback, not as a floor. The components of a derived
 * scope are cost and labor INPUTS to one scope price; they are not also
 * independently approved selling increments. Consuming both would charge for
 * the same work twice, and the suite asserts this module cannot see the field.
 *
 * PURE. Takes plain records, returns a decision. No Prisma, no I/O, no clock.
 */
import { suggestConfigurationPrice, type PriceBreakdown, type PricingSettings } from "../pricing";
import type { MaterialTakeoff } from "./materialTakeoff";
import {
  incompleteReason, requiredFields, resolvePricingSettings,
  type PricingContext, type PricingSettingsRow,
} from "../pricingSettingsState";

export type ScopeComponent = {
  key: string;
  quantity: number;
  /** null = this contractor has not established labor. Never coerced. */
  addFieldLaborHours: number | null;
};

export type DerivedScopeRefusalCode =
  | "MATERIAL_TAKEOFF_INCOMPLETE"
  | "COMPONENT_LABOR_NOT_ESTABLISHED"
  | "ATOMIC_LABOR_NOT_ESTABLISHED"
  | "PRICING_SETTINGS_MISSING"
  | "PRICING_SETTINGS_INCOMPLETE"
  | "DERIVED_PRICING_NOT_APPROVED"
  | "DERIVED_PRICING_APPROVAL_STALE";

export type DerivedScopeResult =
  | {
      kind: "PRICED";
      breakdown: PriceBreakdown;
      totalCents: number;
      /** The fingerprint this price was computed under, for the booking record. */
      basisFingerprint: string;
      materialCostCents: number;
      /** Crew-hours the price was computed from — the contractor's own component labor. */
      laborHours: number;
      /**
       * The crew size those crew-hours were priced with. Carried with them so the
       * scheduling duration comes from the SAME basis as the price
       * (elapsedMinutesFromCrewHours) rather than a second estimate.
       */
      techCount: number;
    }
  | {
      kind: "REVIEW";
      code: DerivedScopeRefusalCode;
      /** Specific enough for a contractor to act on. Never "materials incomplete". */
      reason: string;
      /** Populated where the refusal names particular things. */
      detail?: string[];
    };

export type DerivedScopeInput = {
  components: ScopeComponent[];
  /** When present, this is the labor authority; component labor is ignored. */
  atomicLabor?:
    | { kind: "READY"; hours: number }
    | { kind: "INCOMPLETE"; missingOperations: string[]; missingQuantities: string[]; invalidConditions: string[] };
  takeoff: MaterialTakeoff;
  settingsRow: PricingSettingsRow | null;
  context: PricingContext;
  /** Service-level economics the legacy formula already understands. */
  service: {
    materialMultiplier: number | null;
    permitAdminCents: number | null;
    otherDirectCostCents: number | null;
    isPrimaryEligible: boolean;
    laborCrewType?: "ELECTRICIAN" | "ELECTRICIAN_AND_HELPER" | string | null;
  };
  /** What the contractor has standing approval for, if anything. */
  approval: { approvedBasisFingerprint: string } | null;
  /** The fingerprint of the inputs as they are RIGHT NOW. */
  currentBasisFingerprint: string;
  /** Route-specific labor adjustment, such as fixture working height. */
  laborMultiplier?: number;
};

/** The package-aware cost. Purchase requirements only — never physical totals. */
export const takeoffCostCents = (takeoff: MaterialTakeoff): number =>
  takeoff.purchaseRequirements.reduce((n, p) => n + p.costCents, 0);

export function priceDerivedScope(input: DerivedScopeInput): DerivedScopeResult {
  // ── 1. materials ──────────────────────────────────────────────────────────
  // Order matters: an incomplete takeoff is reported before anything else,
  // because every later number would be computed over a partial bill.
  if (!input.takeoff.purchaseComplete) {
    const codes = [...new Set(input.takeoff.unresolvedRequirements.map((u) => u.code))];
    const unresolvedClasses = input.takeoff.classStatuses
      .filter((c) => c.status === "UNRESOLVED")
      .map((c) => `class:${c.classKey}`);
    const outstanding = codes.length > 0 ? codes : unresolvedClasses;
    return {
      kind: "REVIEW",
      code: "MATERIAL_TAKEOFF_INCOMPLETE",
      reason:
        `The material takeoff for this route is not complete, so its cost is not known. ` +
        `Outstanding: ${outstanding.join(", ")}.`,
      detail: input.takeoff.unresolvedRequirements.length > 0
        ? input.takeoff.unresolvedRequirements.map((u) =>
            u.role ? `${u.code} (${u.role})` : u.code,
          )
        : unresolvedClasses,
    };
  }

  // ── 2. labor ──────────────────────────────────────────────────────────────
  // NULL IS NOT ZERO, and this is the last place it could be quietly coerced.
  // An explicit 0 is a real calibration and prices perfectly well.
  let laborHours: number;
  if (input.atomicLabor) {
    if (input.atomicLabor.kind === "INCOMPLETE") {
      return {
        kind: "REVIEW",
        code: "ATOMIC_LABOR_NOT_ESTABLISHED",
        reason: "The physical route is known, but one or more atomic labor units or quantities are not established.",
        detail: [
          ...input.atomicLabor.missingOperations.map((key) => `operation:${key}`),
          ...input.atomicLabor.missingQuantities.map((key) => `quantity:${key}`),
          ...input.atomicLabor.invalidConditions.map((key) => `condition:${key}`),
        ],
      };
    }
    laborHours = input.atomicLabor.hours;
  } else {
    const unestablished = input.components.filter((c) => c.addFieldLaborHours === null);
    if (unestablished.length > 0) {
      return {
        kind: "REVIEW",
        code: "COMPONENT_LABOR_NOT_ESTABLISHED",
        reason:
          `Labor is not established for ${unestablished.length} of the ` +
          `${input.components.length} components this route uses, so the job's duration ` +
          `is unknown. A published reference figure is not the contractor's calibration.`,
        detail: unestablished.map((c) => c.key),
      };
    }
    laborHours = input.components.reduce(
      (n, c) => n + (c.addFieldLaborHours as number) * Math.max(c.quantity, 1),
      0,
    );
  }
  laborHours *= input.laborMultiplier ?? 1;

  // The crew the price assumes. Derived pricing has no crew-selection input yet,
  // so this is the one-crew behavior compute() has always been given here —
  // named, and returned with the hours, rather than re-assumed by a consumer.
  const techCount = DERIVED_PRICING_TECH_COUNT;

  // ── 3. business decisions ─────────────────────────────────────────────────
  const settingsState = resolvePricingSettings(input.settingsRow, input.context);
  if (settingsState.kind === "MISSING") {
    return {
      kind: "REVIEW",
      code: "PRICING_SETTINGS_MISSING",
      reason: "This contractor has no pricing settings row at all — onboarding did not complete.",
    };
  }
  if (settingsState.kind === "INCOMPLETE") {
    return {
      kind: "REVIEW",
      code: "PRICING_SETTINGS_INCOMPLETE",
      reason: incompleteReason(settingsState.missing),
      detail: settingsState.missing,
    };
  }
  const settings: PricingSettings = settingsState.settings;

  // ── 4. approval of THESE economics ────────────────────────────────────────
  // Deliberately after the readiness checks: a contractor should be told what
  // is still missing before being told they have not approved it, because
  // approving is the last step and the others are what they do first.
  if (!input.approval) {
    return {
      kind: "REVIEW",
      code: "DERIVED_PRICING_NOT_APPROVED",
      reason:
        "The economics for this service are complete, but the contractor has not yet " +
        "approved pricing customers from them.",
    };
  }
  if (input.approval.approvedBasisFingerprint !== input.currentBasisFingerprint) {
    return {
      kind: "REVIEW",
      code: "DERIVED_PRICING_APPROVAL_STALE",
      reason:
        "An input that affects this price has changed since the contractor approved it, " +
        "so the standing approval no longer covers these numbers. Nothing is wrong — " +
        "they need to review and approve the current basis.",
    };
  }

  // ── 5. the existing formula, with the package-aware material figure ───────
  const materialCostCents = takeoffCostCents(input.takeoff);
  const breakdown = suggestConfigurationPrice(
    {
      // Only the fields compute() reads. approvedIncrementCents is deliberately
      // not among them and is not even in scope in this file.
      accessClass: null,
      accessBySlot: {},
      awaitingComponentMaterialCost: false,
      awaitingComponentLabor: false,
      awaitingComponentApproval: false,
      fieldLaborHours: laborHours,
      materialCostCents,
      estimatedMinutes: null,
      techCount,
      components: [],
      addedCrewHours: 0,
      approvedIncrementCents: 0,
      legacyModifierCents: 0,
    } as never,
    input.service,
    settings,
    input.context.isPrimary,
  );

  if (breakdown.totalCents === null) {
    return {
      kind: "REVIEW",
      code: "COMPONENT_LABOR_NOT_ESTABLISHED",
      reason: breakdown.unavailableReason ?? "Labor hours are not established.",
    };
  }

  return {
    kind: "PRICED",
    breakdown,
    totalCents: breakdown.totalCents,
    basisFingerprint: input.currentBasisFingerprint,
    materialCostCents,
    laborHours,
    techCount,
  };
}

/** The crew size derived pricing prices with. No crew-selection logic exists yet. */
export const DERIVED_PRICING_TECH_COUNT = 1;

/**
 * The elapsed on-site time a priced job's crew-hours represent, in whole minutes.
 *
 *   elapsed hours = crew-hours / crew count
 *
 * Integer minutes because every scheduling field (LineItem.estimatedMinutes,
 * Booking.estimatedDurationMinutes) is an integer. There is no canonical
 * crew-hours-to-schedule-minutes helper in this codebase to reuse — the only
 * hours-to-minutes conversions round for DISPLAY labels — so the rule is the
 * conservative one: a fractional minute rounds UP, because scheduling a job
 * shorter than its own labor would under-allocate the crew's day. The
 * tolerance keeps floating-point noise (4.8 h × 60 = 288.00000000000006) from
 * adding a minute nobody's labor contains.
 */
export function elapsedMinutesFromCrewHours(crewHours: number, techCount: number): number {
  if (!(crewHours >= 0) || !(techCount >= 1)) throw new Error(`elapsedMinutesFromCrewHours: invalid ${crewHours} / ${techCount}`);
  return Math.ceil((crewHours / techCount) * 60 - 1e-6);
}

/** Re-exported so callers do not reach past this module for the requirement list. */
export { requiredFields };
