/**
 * Pricing model — handoff §3, §4.
 *
 * ONE place computes suggested prices. Nothing here writes to the database or
 * touches a published price: everything returns a recommendation. Publishing
 * is an explicit admin action (§5, §31).
 *
 * The rules, in order:
 *
 *   labor    = fieldLaborHours x techCount, at the global tech-hour rate.
 *              For a PRIMARY service whose actual hours are <= 1.0, the labor
 *              component is the GREATER of that and the $250 service-call
 *              minimum — it recovers mobilization, truck, travel and the
 *              overhead of originating a visit (§3.3).
 *              While We're There pricing never applies the minimum: the
 *              technician is already on site, so there is no visit to
 *              originate (§3.4).
 *   material = assembled direct cost x tier multiplier (§4)
 *   plus       permit/admin and other direct costs
 *   rounded    up to the global increment
 */

export type PricingSettings = {
  targetRateCents: number;
  primaryMinimumCents: number;
  roundingIncrementCents: number;
  defaultPermitAdminCents: number;
};

export type ServicePricingInputs = {
  fieldLaborHours: number | null;
  wwtLaborHours: number | null;
  requiresTechCount: number;
  materialCostCents: number | null;
  /** Nullable override; the tier is derived when this is null. */
  materialMultiplier: number | null;
  permitAdminCents: number | null;
  otherDirectCostCents: number | null;
  /** False for add-on-only items, which never originate a visit. */
  isPrimaryEligible: boolean;
};

/**
 * Handoff §4 — global markup tiers, superseding the older per-service
 * schedule. Applied to the ASSEMBLED material cost for the service, not to
 * each connector and fitting separately.
 *
 * Boundaries are inclusive on the 30% tier: exactly $10.00 and exactly
 * $750.00 both use 1.30x.
 */
export function materialMultiplierFor(costCents: number): number {
  if (costCents < 1000) return 3.0; // under $10.00 — 200% markup
  if (costCents <= 75000) return 1.3; // $10.00 through $750.00 — 30%
  return 1.2; // over $750.00 — 20%
}

function roundUp(cents: number, increment: number): number {
  if (increment <= 0) return Math.round(cents);
  return Math.ceil(cents / increment) * increment;
}

export type PriceBreakdown = {
  /** Null when fieldLaborHours hasn't been established — see below. */
  totalCents: number | null;
  laborCents: number;
  materialCents: number;
  permitCents: number;
  otherCents: number;
  actualTechHours: number;
  multiplierUsed: number;
  multiplierIsOverride: boolean;
  /** True when the $250 service-call minimum set the labor component. */
  minimumApplied: boolean;
  /** Populated instead of a price when the inputs can't support one. */
  unavailableReason?: string;
};

function compute(
  hours: number | null,
  techCount: number,
  svc: ServicePricingInputs,
  settings: PricingSettings,
  isPrimary: boolean
): PriceBreakdown {
  const materialCost = svc.materialCostCents ?? 0;
  const multiplierIsOverride = svc.materialMultiplier != null;
  const multiplier = svc.materialMultiplier ?? materialMultiplierFor(materialCost);
  const materialCents = Math.round(materialCost * multiplier);
  const permitCents = svc.permitAdminCents ?? settings.defaultPermitAdminCents ?? 0;
  const otherCents = svc.otherDirectCostCents ?? 0;

  // A null here is not zero. It means nobody has established how long this job
  // actually takes, and §3.1 forbids inventing a number to fill the gap — the
  // existing labor units are exactly what happens when you do. Return no price
  // so the editor can say "not yet established" instead of showing a
  // confident figure derived from nothing.
  if (hours == null) {
    return {
      totalCents: null,
      laborCents: 0,
      materialCents,
      permitCents,
      otherCents,
      actualTechHours: 0,
      multiplierUsed: multiplier,
      multiplierIsOverride,
      minimumApplied: false,
      unavailableReason: isPrimary
        ? "Actual field labor hours not established for this service"
        : "While We're There labor hours not established for this service",
    };
  }

  const actualTechHours = hours * Math.max(techCount, 1);
  const rawLabor = actualTechHours * settings.targetRateCents;

  // §3.3 — the minimum applies only to a service that can actually be the
  // reason a technician is dispatched, and only when the work is an hour or
  // less. An add-on-only item (isPrimaryEligible false) never originates a
  // visit: applying the minimum there would price a $50 TV mount at $315.
  const minimumEligible =
    isPrimary && svc.isPrimaryEligible && actualTechHours <= 1.0;
  const laborCents = minimumEligible
    ? Math.max(rawLabor, settings.primaryMinimumCents)
    : rawLabor;

  return {
    totalCents: roundUp(
      laborCents + materialCents + permitCents + otherCents,
      settings.roundingIncrementCents
    ),
    laborCents,
    materialCents,
    permitCents,
    otherCents,
    actualTechHours,
    multiplierUsed: multiplier,
    multiplierIsOverride,
    minimumApplied: minimumEligible && rawLabor < settings.primaryMinimumCents,
  };
}

/** Suggested standalone price. Recommendation only — never auto-published. */
export function suggestPrimaryPrice(
  svc: ServicePricingInputs,
  settings: PricingSettings,
  overrides?: { techCount?: number | null; fieldLaborHours?: number | null }
): PriceBreakdown {
  return compute(
    overrides?.fieldLaborHours ?? svc.fieldLaborHours,
    overrides?.techCount ?? svc.requiresTechCount,
    svc,
    settings,
    true
  );
}

/**
 * Suggested While We're There price. No service-call minimum (§3.4) — the
 * visit is already paid for by the primary service.
 */
export function suggestWwtPrice(
  svc: ServicePricingInputs,
  settings: PricingSettings,
  overrides?: { techCount?: number | null }
): PriceBreakdown {
  return compute(
    svc.wwtLaborHours,
    overrides?.techCount ?? svc.requiresTechCount,
    svc,
    settings,
    false
  );
}

/**
 * Dispatch duration for a booking, honouring any branch-level override.
 *
 * An answer can change the job rather than just its price — the TV size
 * question puts a second technician on 56-85 in installs at the same
 * 90-minute duration, which doubles both the labor hours and the calendar
 * capacity consumed.
 */
export function resolveJobShape(
  svc: { estimatedMinutes: number | null; requiresTechCount: number; fieldLaborHours: number | null },
  branch?: {
    overrideEstimatedMinutes?: number | null;
    overrideTechCount?: number | null;
    overrideFieldLaborHours?: number | null;
  } | null
) {
  return {
    estimatedMinutes: branch?.overrideEstimatedMinutes ?? svc.estimatedMinutes,
    techCount: branch?.overrideTechCount ?? svc.requiresTechCount,
    fieldLaborHours: branch?.overrideFieldLaborHours ?? svc.fieldLaborHours,
  };
}

export function formatBreakdown(b: PriceBreakdown): string {
  if (b.totalCents == null) return b.unavailableReason ?? "No price available";
  const d = (c: number) => `$${(c / 100).toFixed(2)}`;
  const parts = [`labor ${d(b.laborCents)}`];
  if (b.materialCents) parts.push(`material ${d(b.materialCents)} (${b.multiplierUsed}x)`);
  if (b.permitCents) parts.push(`permit ${d(b.permitCents)}`);
  if (b.otherCents) parts.push(`other ${d(b.otherCents)}`);
  return `${d(b.totalCents)} = ${parts.join(" + ")}${b.minimumApplied ? " (service-call minimum applied)" : ""}`;
}

// ---------------------------------------------------------------------------
// Component-based configuration (handoff §13-§15)
// ---------------------------------------------------------------------------

/**
 * A job as configured by the answers given so far.
 *
 * The engine accumulates INPUTS through the tree — technician-hours, direct
 * material, calendar minutes, crew size — and prices the finished
 * configuration once at the end. It does not add dollar modifiers and try to
 * infer labor afterwards.
 *
 * That ordering is what makes the $250 service-call minimum behave: it applies
 * once to the complete primary configuration, never separately to each switch
 * leg or dimmer along the way.
 *
 * Calendar minutes and labor hours are tracked independently and neither is
 * derived from the other. A second technician doubles the hours at the same
 * clock duration; a component can add setup time without adding hours.
 */
export type JobConfiguration = {
  fieldLaborHours: number | null;
  materialCostCents: number;
  estimatedMinutes: number | null;
  techCount: number;
  /** For the customer's scope summary and the technician's job sheet. */
  components: { key: string; label: string | null; quantity: number }[];
  /**
   * True when some answer selected components whose customer-facing increment
   * hasn't been approved. Such a route must go to review — a calculated price
   * is a recommendation, not something to publish automatically.
   */
  awaitingComponentApproval: boolean;
  /** Approved customer-facing increments accumulated along the route. */
  approvedIncrementCents: number;
  /** Legacy flat modifiers, for trees built before components existed. */
  legacyModifierCents: number;
};

export function startConfiguration(svc: {
  fieldLaborHours: number | null;
  materialCostCents: number | null;
  estimatedMinutes: number | null;
  requiresTechCount: number;
}): JobConfiguration {
  return {
    fieldLaborHours: svc.fieldLaborHours,
    materialCostCents: svc.materialCostCents ?? 0,
    estimatedMinutes: svc.estimatedMinutes,
    techCount: svc.requiresTechCount,
    components: [],
    awaitingComponentApproval: false,
    approvedIncrementCents: 0,
    legacyModifierCents: 0,
  };
}

export type BranchContribution = {
  overrideEstimatedMinutes?: number | null;
  overrideTechCount?: number | null;
  overrideFieldLaborHours?: number | null;
  addFieldLaborHours?: number | null;
  addMaterialCostCents?: number | null;
  addScheduleMinutes?: number | null;
  priceModifierCents?: number;
  approvedComponentPriceCents?: number | null;
  components?: {
    quantity: number;
    /** §29 — apply only when a previously collected answer matches. */
    conditionAnswerKey?: string | null;
    conditionAnswerValue?: string | null;
    component: {
      key: string;
      customerFacingLabel: string | null;
      /** Null = not approved; any route using it goes to review. */
      approvedPriceCents?: number | null;
      addFieldLaborHours: number;
      addMaterialCostCents: number;
      addScheduleMinutes: number;
      addTechCount: number;
    };
  }[];
};

/** Fold one answer into the running configuration. Pure — returns a new object. */
export function applyBranch(
  config: JobConfiguration,
  branch: BranchContribution,
  /** Answers collected so far, for conditional components (§29). */
  answers: Record<string, string> = {}
): JobConfiguration {
  // Absolute overrides replace; they are not deltas. The TV size answer sets
  // techCount to 2 outright rather than adding one.
  let hours = branch.overrideFieldLaborHours ?? config.fieldLaborHours;
  let minutes = branch.overrideEstimatedMinutes ?? config.estimatedMinutes;
  let techCount = branch.overrideTechCount ?? config.techCount;
  let material = config.materialCostCents;
  const components = [...config.components];

  const addHours = (n: number) => {
    // Adding hours to a service whose own hours aren't established leaves it
    // unestablished. A component's hours can't stand in for the base job's.
    if (hours !== null) hours += n;
  };

  if (branch.addFieldLaborHours) addHours(branch.addFieldLaborHours);
  if (branch.addMaterialCostCents) material += branch.addMaterialCostCents;
  if (branch.addScheduleMinutes && minutes !== null) minutes += branch.addScheduleMinutes;

  const declared = branch.components ?? [];
  // Keep only the variants whose condition matches what the customer has
  // already told us. An unconditional component always applies.
  const selected = declared.filter(
    (sel) =>
      !sel.conditionAnswerKey ||
      answers[sel.conditionAnswerKey] === sel.conditionAnswerValue
  );

  for (const sel of selected) {
    const q = Math.max(sel.quantity, 1);
    const c = sel.component;
    addHours(c.addFieldLaborHours * q);
    material += c.addMaterialCostCents * q;
    if (c.addScheduleMinutes && minutes !== null) minutes += c.addScheduleMinutes * q;
    techCount += c.addTechCount * q;
    components.push({ key: c.key, label: c.customerFacingLabel, quantity: q });
  }

  // An answer that declares components but matched none of them means the
  // condition was never established — we don't know which variant of the work
  // applies. Book nothing on a guess; send it to review.
  const declaredButUnmatched = declared.length > 0 && selected.length === 0;

  // Price comes from the components actually selected. An explicit figure on
  // the answer overrides them, for the simple case where one answer has one
  // fixed price regardless of variant.
  let componentPriceCents = 0;
  let anyComponentUnapproved = false;
  for (const sel of selected) {
    const p = sel.component.approvedPriceCents;
    if (p === null || p === undefined) anyComponentUnapproved = true;
    else componentPriceCents += p * Math.max(sel.quantity, 1);
  }

  const answerOverride = branch.approvedComponentPriceCents;
  const approved =
    answerOverride !== null && answerOverride !== undefined
      ? answerOverride
      : selected.length > 0
        ? anyComponentUnapproved
          ? null
          : componentPriceCents
        : 0;

  return {
    fieldLaborHours: hours,
    materialCostCents: material,
    estimatedMinutes: minutes,
    techCount,
    components,
    // Null approval on a component-bearing branch means nobody has signed off
    // a customer price for that work yet. Zero is fine — that's an approved
    // no-charge component.
    awaitingComponentApproval:
      config.awaitingComponentApproval ||
      declaredButUnmatched ||
      approved === null ||
      approved === undefined,
    approvedIncrementCents: config.approvedIncrementCents + (approved ?? 0),
    legacyModifierCents: config.legacyModifierCents + (branch.priceModifierCents ?? 0),
  };
}

/**
 * What the CUSTOMER is charged.
 *
 * Built from the service's published price plus approved increments — never
 * from the calculated configuration. Handoff §5/§31: a calculated price is a
 * recommendation until someone approves it, so a service whose field hours
 * aren't established still sells at its published price rather than falling
 * back to review.
 *
 * Returns null when the route can't be priced for a customer at all, with a
 * reason the flow can act on.
 */
export function customerPrice(
  config: JobConfiguration,
  publishedBaseCents: number | null
): { totalCents: number | null; mustReview: boolean; reason?: string } {
  if (config.awaitingComponentApproval) {
    return {
      totalCents: null,
      mustReview: true,
      reason: "This option includes work we price individually",
    };
  }
  if (publishedBaseCents === null) {
    return {
      totalCents: null,
      mustReview: true,
      reason: "No published price for this service",
    };
  }
  return {
    totalCents:
      publishedBaseCents + config.approvedIncrementCents + config.legacyModifierCents,
    mustReview: false,
  };
}

/**
 * INTERNAL suggested price for the configuration as answered. Admin-facing
 * only. Returns null when field hours aren't established, rather than
 * inventing a figure.
 */
export function suggestConfigurationPrice(
  config: JobConfiguration,
  svc: Pick<ServicePricingInputs, "materialMultiplier" | "permitAdminCents" | "otherDirectCostCents" | "isPrimaryEligible">,
  settings: PricingSettings,
  isPrimary = true
): PriceBreakdown {
  return compute(
    config.fieldLaborHours,
    config.techCount,
    {
      fieldLaborHours: config.fieldLaborHours,
      wwtLaborHours: null,
      requiresTechCount: config.techCount,
      materialCostCents: config.materialCostCents,
      materialMultiplier: svc.materialMultiplier,
      permitAdminCents: svc.permitAdminCents,
      otherDirectCostCents: svc.otherDirectCostCents,
      isPrimaryEligible: svc.isPrimaryEligible,
    },
    settings,
    isPrimary
  );
}

/**
 * What one answer will add to the price, for display BEFORE the customer
 * picks it.
 *
 * Needs the answers collected so far because a conditional component's price
 * depends on them: "a wall switch controls an outlet" costs $220 with attic
 * access and $360 through finished space, and which applies was decided
 * several questions ago.
 *
 * Returns null cents when the route can't be priced up front — the customer
 * should be told that plainly rather than shown a number that might change.
 */
export function answerPriceDelta(
  branch: BranchContribution,
  answers: Record<string, string> = {}
): { cents: number | null; needsReview: boolean } {
  const declared = branch.components ?? [];
  const selected = declared.filter(
    (sel) =>
      !sel.conditionAnswerKey ||
      answers[sel.conditionAnswerKey] === sel.conditionAnswerValue
  );

  // Declared components but none matched: we don't know which variant applies.
  if (declared.length > 0 && selected.length === 0) {
    return { cents: null, needsReview: true };
  }

  const override = branch.approvedComponentPriceCents;
  let componentCents = 0;
  if (override !== null && override !== undefined) {
    componentCents = override;
  } else {
    for (const sel of selected) {
      const p = sel.component.approvedPriceCents;
      if (p === null || p === undefined) return { cents: null, needsReview: true };
      componentCents += p * Math.max(sel.quantity, 1);
    }
  }

  return {
    cents: componentCents + (branch.priceModifierCents ?? 0),
    needsReview: false,
  };
}
