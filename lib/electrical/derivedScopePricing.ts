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
      laborHours: number;
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
  takeoff: MaterialTakeoff;
  settingsRow: PricingSettingsRow | null;
  context: PricingContext;
  /** Service-level economics the legacy formula already understands. */
  service: {
    materialMultiplier: number | null;
    permitAdminCents: number | null;
    otherDirectCostCents: number | null;
    isPrimaryEligible: boolean;
  };
  /** What the contractor has standing approval for, if anything. */
  approval: { approvedBasisFingerprint: string } | null;
  /** The fingerprint of the inputs as they are RIGHT NOW. */
  currentBasisFingerprint: string;
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
    return {
      kind: "REVIEW",
      code: "MATERIAL_TAKEOFF_INCOMPLETE",
      reason:
        `The material takeoff for this route is not complete, so its cost is not known. ` +
        `Outstanding: ${codes.join(", ")}.`,
      detail: input.takeoff.unresolvedRequirements.map((u) =>
        u.role ? `${u.code} (${u.role})` : u.code,
      ),
    };
  }

  // ── 2. labor ──────────────────────────────────────────────────────────────
  // NULL IS NOT ZERO, and this is the last place it could be quietly coerced.
  // An explicit 0 is a real calibration and prices perfectly well.
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
  const laborHours = input.components.reduce(
    (n, c) => n + (c.addFieldLaborHours as number) * Math.max(c.quantity, 1),
    0,
  );

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
      techCount: 1,
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
  };
}

/** Re-exported so callers do not reach past this module for the requirement list. */
export { requiredFields };
