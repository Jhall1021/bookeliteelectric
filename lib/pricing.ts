/**
 * Pricing model — handoff §3, §4.
 *
 * ONE place computes suggested prices. Nothing here writes to the database or
 * touches a published price: everything returns a recommendation. Publishing
 * is an explicit admin action (§5, §31).
 *
 * The rules, in order:
 *
 *   labor    = fieldLaborHours x the global CREW-hour rate.
 *
 *              A crew-hour is one Elite van for one hour. Every van carries a
 *              lead electrician and a helper, so both are already inside the
 *              rate — the figure is NOT multiplied by the people on board.
 *              Doing so bills a second time for labor that was always there.
 *              For a PRIMARY service the labor component is the GREATER of
 *              that and the service-call minimum, whatever the duration. The
 *              minimum recovers mobilization, truck, travel and the overhead
 *              of originating a visit, and is set independently of the rate —
 *              lowering the hourly rate must never lower the floor.
 *              While We're There pricing never applies the minimum: the
 *              technician is already on site, so there is no visit to
 *              originate (§3.4).
 *   material = assembled direct cost, marked up progressively:
 *              30% of the first $750, 20% above it. Applied ONCE to the
 *              whole package, never per part.
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
/**
 * What a material package sells for.
 *
 * 30% on the first $750 of direct cost, 20% on everything above it. Applied
 * ONCE to the assembled package — never to individual screws, connectors or
 * receptacles, which would compound the markup on a job with many small parts.
 *
 *   $2    ->  $2.60
 *   $10   ->  $13.00
 *   $22   ->  $28.60
 *   $750  ->  $975.00
 *   $751  ->  $976.20
 *   $1000 ->  $1,275.00
 *
 * WHY THIS REPLACED THE TIER TABLE
 *
 * The old rule had bands: 3.00x under $10, 1.30x to $750, 1.20x above. Bands
 * create cliffs, and this one ran backwards — a package costing $9.99 sold
 * for $29.97, while one costing $10.01 sold for $13.01. Elite's cost rising
 * by two cents dropped the customer's price by seventeen dollars.
 *
 * Progressive markup can't do that: the sell price rises monotonically with
 * cost, everywhere.
 *
 * Customer-supplied equipment contributes nothing — the customer's own device
 * isn't Elite's material — unless Elite supplies parts alongside it.
 */
export function calculateMaterialSellCents(directCostCents: number): number {
  if (directCostCents <= 0) return 0;
  const BREAK = 75000;
  if (directCostCents <= BREAK) {
    return Math.round(directCostCents * 1.3);
  }
  return Math.round(BREAK * 1.3 + (directCostCents - BREAK) * 1.2);
}

/**
 * The blended markup, for display only.
 *
 * Above $750 there is no single multiplier — the number here is a summary of
 * what happened, not an input to it. Never calculate from this.
 */
export function effectiveMaterialMarkup(directCostCents: number): number {
  if (directCostCents <= 0) return 0;
  return calculateMaterialSellCents(directCostCents) / directCostCents;
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
  /** Blended rate actually applied. Above $750 this is a summary, not an input. */
  multiplierUsed: number;
  multiplierIsOverride: boolean;
  /** True when the $250 service-call minimum set the labor component. */
  minimumApplied: boolean;
  /** Populated instead of a price when the inputs can't support one. */
  unavailableReason?: string;
};

function compute(
  hours: number | null,
  /** Elite vans dispatched. One van = lead + helper. Almost always 1. */
  crewUnits: number,
  svc: ServicePricingInputs,
  settings: PricingSettings,
  isPrimary: boolean
): PriceBreakdown {
  const materialCost = svc.materialCostCents ?? 0;
  const multiplierIsOverride = svc.materialMultiplier != null;
  // A legacy override still wins where one survives, but it's flagged in the
  // reconciliation rather than trusted — an imported multiplier is
  // unvalidated data, not a decision. Everything else uses the progressive
  // markup, applied once to the assembled package.
  const materialSell =
    svc.materialMultiplier !== null && svc.materialMultiplier !== undefined
      ? Math.round(materialCost * svc.materialMultiplier)
      : calculateMaterialSellCents(materialCost);
  const materialCents = materialSell;
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
      multiplierUsed: effectiveMaterialMarkup(materialCost),
      multiplierIsOverride,
      minimumApplied: false,
      unavailableReason: isPrimary
        ? "Actual field labor hours not established for this service"
        : "While We're There labor hours not established for this service",
    };
  }

  // Crew-hours, not person-hours.
  //
  // This was `hours * techCount`, which charged again for the helper who
  // rides in every van as standard. crewUnits survives because a genuine
  // second van is a real thing — but it is 1 for every service in the
  // catalog, and normal staffing must never touch it.
  const actualTechHours = hours * Math.max(crewUnits, 1);
  const rawLabor = actualTechHours * settings.targetRateCents;

  // The minimum is a FLOOR on the first service, not a rule about short jobs.
  //
  // It used to apply only when the work was an hour or less, which was
  // invisible while the rate and the minimum were both $250 — one crew-hour
  // met the floor exactly. Drop the rate to $100 and the flaw appears: a
  // 1.0-hour job floors at $300, a 1.25-hour job prices at $125, and the
  // price FALLS as the work grows.
  //
  // So it floors every visit-originating service regardless of duration.
  // A first service is never cheaper than the minimum; past that point
  // actual hours take over on their own, because the labor exceeds it.
  //
  // Still never applies to an add-on-only item (isPrimaryEligible false) —
  // a $50 TV mount can't be the reason a van is dispatched, and flooring it
  // would price it at the minimum.
  const minimumEligible = isPrimary && svc.isPrimaryEligible;
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
    multiplierUsed: effectiveMaterialMarkup(materialCost),
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
 * Dispatch shape for a booking, honouring any branch-level override.
 *
 * techCount here counts ELITE VANS, not people. One van carries a lead and a
 * helper, so a value of 1 is two people on site. It reaches Jobber as the
 * resource being booked and no longer affects price.
 *
 * Reading it as "one person" is exactly how the TV tier came to charge for a
 * second electrician who was already in the van.
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
  /**
   * Access classification established so far, from whichever question asked.
   * Once set it persists, so a later module conditions on it without asking
   * again (§29).
   */
  accessClass: AccessClass | null;
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
    accessClass: null,
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

/**
 * The three things an access answer can mean to the pricing engine.
 * Derived from the answer's own declaration, never inferred from wording.
 */
/**
 * A configuration for DISPLAY, with no cost inputs.
 *
 * The browser still accumulates a route as the customer answers — it has to,
 * to show "+$135" against an option and a running total on the price screen.
 * But those are approved CUSTOMER-FACING increments, which is different from
 * Elite's crew-hours and material costs.
 *
 * So the client builds a configuration whose cost fields are empty. It tracks
 * access classification and approved increments, which is all it needs to
 * render, and it cannot compute a price from labor because it no longer has
 * any labor to compute from. The server does that.
 *
 * If a caller ever reads fieldLaborHours off one of these and gets null, that
 * is the design working, not a bug to patch.
 */
export function startDisplayConfiguration(svc: { estimatedMinutes: number | null }): JobConfiguration {
  return {
    accessClass: null,
    // Null, because the client genuinely doesn't know the labor — that's the
    // point. materialCostCents is 0 rather than null because it's an
    // accumulator: components add to it, and nothing the client receives
    // carries a material cost, so it stays 0 and no price can be derived
    // from it.
    fieldLaborHours: null,
    materialCostCents: 0,
    estimatedMinutes: svc.estimatedMinutes,
    techCount: 1,
    components: [],
    awaitingComponentApproval: false,
    approvedIncrementCents: 0,
    legacyModifierCents: 0,
  };
}

export type AccessClass = "ACCESSIBLE" | "FINISHED" | "UNKNOWN";

export type BranchContribution = {
  /** Set when this answer answers a route-access question. */
  accessClassification?: AccessClass | null;
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
    /**
     * Apply only when the access classification established earlier matches.
     * Preferred over the raw key/value condition for anything access-dependent
     * — it survives rewording and doesn't care which question asked.
     */
    conditionAccessClass?: AccessClass | null;
    /** §29 — apply only when a previously collected answer matches. */
    conditionAnswerKey?: string | null;
    conditionAnswerValue?: string | null;
    component: {
      key: string;
      customerFacingLabel: string | null;
      /** Null = not approved; any route using it goes to review. */
      approvedPriceCents?: number | null;
      // Optional, because the BROWSER doesn't receive them.
      //
      // The server sends the client only what a customer may see: the
      // component's key, its customer-facing label and its approved price.
      // Elite's crew-hours and material costs stay server-side. So a client
      // calling this gets a configuration whose labor and material totals are
      // empty — which is correct, since the client no longer prices anything.
      //
      // The SERVER passes all four and gets the full operational shape.
      addFieldLaborHours?: number | null;
      addMaterialCostCents?: number | null;
      addScheduleMinutes?: number | null;
      addTechCount?: number | null;
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
  // Absolute overrides replace; they are not deltas. Reserved for a genuine
  // second van — normal lead-plus-helper staffing is already inside the rate
  // and must never be expressed here.
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

  // An access answer sets the classification for the rest of the flow. Once
  // established it isn't overwritten by a later non-access answer.
  const accessClass = branch.accessClassification ?? config.accessClass;

  const declared = branch.components ?? [];
  // Keep only the variants whose conditions match. A component may condition
  // on the access classification, on a raw answer, on both, or on nothing.
  const selected = declared.filter((sel) => {
    if (sel.conditionAccessClass && sel.conditionAccessClass !== accessClass) return false;
    if (sel.conditionAnswerKey && answers[sel.conditionAnswerKey] !== sel.conditionAnswerValue) {
      return false;
    }
    return true;
  });

  for (const sel of selected) {
    const q = Math.max(sel.quantity, 1);
    const c = sel.component;
    if (c.addFieldLaborHours) addHours(c.addFieldLaborHours * q);
    if (c.addMaterialCostCents) material += c.addMaterialCostCents * q;
    if (c.addScheduleMinutes && minutes !== null) minutes += c.addScheduleMinutes * q;
    // Extra VANS, not extra people. Zero on every component today.
    if (c.addTechCount) techCount += c.addTechCount * q;
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
    accessClass,
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
  answers: Record<string, string> = {},
  /** Classification established earlier in the flow, for access-conditioned parts. */
  accessClass: AccessClass | null = null
): {
  cents: number | null;
  needsReview: boolean;
  /** Rate per unit when this answer buys several of something. */
  perUnitCents?: number | null;
  /** What one unit is called, for the label. */
  unitLabel?: string | null;
} {
  const declared = branch.components ?? [];
  const selected = declared.filter((sel) => {
    if (sel.conditionAccessClass && sel.conditionAccessClass !== accessClass) return false;
    if (sel.conditionAnswerKey && answers[sel.conditionAnswerKey] !== sel.conditionAnswerValue) {
      return false;
    }
    return true;
  });

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

  // When the selected components are per-unit — additional recessed lights,
  // say — surface the unit rate too. The customer shouldn't have to divide to
  // see that the extras are cheaper than the first, and the rate can't be
  // written into the label because it differs by access tier.
  const units = selected.reduce((n, sel) => n + Math.max(sel.quantity, 1), 0);
  const unitLabel = selected.find((sel) => Math.max(sel.quantity, 1) > 1)
    ?.component.customerFacingLabel ?? null;

  return {
    cents: componentCents + (branch.priceModifierCents ?? 0),
    needsReview: false,
    perUnitCents: units > 1 && componentCents > 0 ? Math.round(componentCents / units) : null,
    unitLabel,
  };
}
