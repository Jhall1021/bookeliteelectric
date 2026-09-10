/**
 * A short, specific verb for one readiness Finding — "Set service area",
 * not "Fix". The explanation of WHY stays on the finding's own message and
 * on the destination screen; this is only the button label, so it names
 * the action a contractor is about to take, not the problem.
 */
const ACTION_LABELS: Record<string, string> = {
  BUSINESS_NAME_MISSING: "Update business details",
  SITE_MISSING: "Set up booking page",
  COUNTRY_MISSING: "Update business details",
  CONTACT_MISSING: "Update business details",
  LICENSE_MISSING: "Update business details",
  BRANDING_DEFAULTS: "Add your logo",
  TRADE_NOT_SELECTED: "Choose your trade",
  NO_SERVICES: "Install your catalog",
  TEMPLATE_NOT_INSTALLED: "Review your catalog",
  NO_SERVICES_OFFERED: "Choose services",
  NOTHING_OFFERED_YET: "Choose services",
  PRICING_SETTINGS_MISSING: "Set labor rate",
  LABOR_RATE_UNSET: "Set labor rate",
  MINIMUM_UNSET: "Set service minimum",
  MATERIAL_COST_ON_HOLD: "Review material costs",
  MATERIAL_COST_UNRESOLVED: "Review material costs",
  POLICY_UNRESOLVED: "Decide pricing policy",
  NATIVE_CAPACITY_UNSET: "Set your capacity",
  PROVIDER_CONNECTED_BUT_NATIVE: "Choose scheduling",
  SCHEDULING_AUTHORITY_UNDECLARED: "Choose scheduling",
  PROVIDER_NOT_CONNECTED: "Connect your calendar",
  NO_ELIGIBLE_CREW: "Set eligible crew",
  SERVICE_AREA_EMPTY: "Set service area",
  BUSINESS_HOURS_DEFAULTED: "Confirm your hours",
  STRIPE_NOT_CONNECTED: "Connect payments",
  STRIPE_NOT_READY: "Connect payments",
  NOTHING_ACTIVATABLE: "Choose services",
  PRE_WORK_WITHOUT_DEPOSIT: "Review before launch",
  SINGLE_SERVICE_LAUNCH: "Review before launch",
  PRICE_NOT_APPROVED: "Review pricing",
  LABOR_INPUTS_MISSING: "Review pricing",
  PRICE_DRIFTED: "Review pricing",
  SUGGESTED_NOT_APPROVED: "Approve price",
  TREE_HAS_DEAD_ROUTE: "Review pricing",
  HANDOFF_NOT_LIVE_YET: "Review pricing",
  TREE_UNBOUNDED: "Review pricing",
  ESTIMATE_BOUNDS_MISSING: "Review pricing",
  ESTIMATE_BOUNDS_INVALID: "Review pricing",
  ESTIMATE_NOT_APPROVED: "Approve estimate",
  SAME_VISIT_UNAVAILABLE: "Review pricing",
  SAME_VISIT_PARTIAL: "Review pricing",
};

export function actionLabelFor(code: string): string {
  return ACTION_LABELS[code] ?? "Review";
}
