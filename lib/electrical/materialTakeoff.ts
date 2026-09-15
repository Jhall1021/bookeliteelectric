/**
 * From a physical recipe to a purchase list — Stage E/F, corrected.
 *
 * THREE LAYERS, KEPT APART ON PURPOSE
 *
 *   physical requirement   31 feet of channel. True of the job, independent of
 *                          what anyone sells.
 *   purchase requirement   7 sticks. Only knowable once a contractor has chosen
 *                          a product AND the geometry says how the length is cut.
 *   unresolved             everything we cannot know yet, each with a reason.
 *
 * COMPLETENESS IS A CLAIM ABOUT REQUIREMENTS, NOT ABOUT INPUTS
 *
 * The earlier version computed `purchaseComplete` from what it had been handed:
 * an input that was never passed produced no requirement, no unresolved entry
 * and no trace, so a takeoff missing its conductors entirely reported itself
 * complete. Omission is not a statement that nothing was needed.
 *
 * So the caller now DECLARES the material classes the job requires, and every
 * declared class must be discharged — as a purchase requirement or as an
 * unresolved one with a reason. `purchaseComplete` is true only when every
 * declared class resolved. A class nobody declared but whose role appeared
 * anyway is itself reported (CLASS_NOT_ACCOUNTED_FOR) rather than absorbed.
 *
 * WHY ceil(feet / stock) IS NOT A PACKAGE COUNT ON A TURNED ROUTE
 *
 * It is exact for ONE continuous run. Put two corners in a 31 foot route and
 * the channel is cut into three legs — and 1+1+29 needs ceil(1/5) + ceil(1/5)
 * + ceil(29/5) = 8 sticks if the offcuts are not reused across legs, where
 * 10+10+11 needs 7. Both are 31 feet with 2 turns, which is everything the
 * route actually knows. So on a turned route the package count is unresolved
 * for the same reason the joint count is: total footage plus turn counts does
 * not determine either.
 *
 * Two distinct facts are missing, and they clear independently: segment
 * LENGTHS (which Route Assist has upstream, deliberately not yet canonical),
 * and an offcut-reuse POLICY (which is the contractor's, and which still
 * decides 7 versus 8 even once the lengths are known). Both are reported.
 *
 * PURE. No Prisma, no I/O, no clock. Everything it needs is passed in.
 */

/**
 * How a role's physical quantity becomes a package count.
 *
 * There is deliberately NO default. A role whose divisibility nobody declared
 * is unresolved, because the only safe guess would be DISCRETE — which is
 * precisely the guess that turned 31 feet into an exact 7 sticks.
 */
export type Divisibility =
  /** Bought as whole units — elbows, boxes, clips. ceil() is always exact. */
  | "DISCRETE"
  /** Pulled off a coil — conductor. A turn bends it; it does not cut it. */
  | "CONTINUOUS"
  /** Rigid stock — raceway channel. Every turn cuts the run into a new leg. */
  | "SEGMENTED_BY_TURNS";

/** What a canonical component physically consumes, per unit of that component. */
export type RecipeLine = { componentKey: string; role: string; perUnit: number; unit: string };

/** What the contractor has chosen to satisfy a role. Absent = not chosen. */
export type ProductSelection = {
  role: string;
  /** How much of the canonical unit one purchased package contains. */
  packageQuantity: number;
  packageUnit: string;
  packagePriceCents: number;
  /** For explanation only. Never influences a quantity. */
  productLabel?: string | null;
};

export type SelectedComponent = { key: string; quantity: number };

/** Geometry the route established. Counts, never lengths — see the header. */
export type RouteShape = {
  /** Direction-changing fittings of every kind. Zero means one straight run. */
  turnCount: number;
};

export type PhysicalRequirement = {
  role: string; quantity: number; unit: string;
  /** Which component asked for it, so the number can be explained. */
  fromComponent: string;
};

export type PurchaseRequirement = {
  role: string; packages: number; packageQuantity: number; packageUnit: string;
  costCents: number; productLabel?: string | null;
  /** The physical figure this was rounded up from. */
  physicalQuantity: number;
};

export type UnresolvedCode =
  | "NO_CONTRACTOR_PRODUCT"
  | "DIVISIBILITY_NOT_DECLARED"
  | "SEGMENT_GEOMETRY_REQUIRED"
  | "OFFCUT_POLICY_REQUIRED"
  | "CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED"
  | "GROUNDING_SYSTEM_REQUIRED"
  | "TERMINATION_SLACK_NOT_ESTABLISHED"
  | "SUPPORT_SPACING_NOT_ESTABLISHED"
  | "END_FITTING_POLICY_NOT_ESTABLISHED"
  | "CLASS_NOT_ACCOUNTED_FOR"
  | "MATERIAL_SYSTEM_NOT_SELECTED"
  | "GROUNDING_STRATEGY_NOT_ESTABLISHED"
  | "SUPPORT_TERMINUS_RULE_NOT_ESTABLISHED"
  | "TERMINATION_ASSEMBLY_NOT_ESTABLISHED";

/**
 * RETIRED: CIRCUIT_AMPACITY_REQUIRED.
 *
 * It framed the gap as a missing homeowner fact — 15A or 20A. The service's own
 * routing says otherwise: `outlet_load_type` continues only for `everyday` and
 * `outlet_power_source` only for `tap_existing`; every other load and a
 * dedicated circuit reroute to a different service. So the whole envelope this
 * takeoff can ever see is one everyday load tapped off an existing general
 * purpose branch circuit, and a single conductor specification can be valid
 * across all of it. That makes the gap CONTRACTOR CONFIGURATION, not a question
 * to ask the homeowner — hence CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED.
 */

export type UnresolvedRequirement = {
  code: UnresolvedCode;
  role: string | null;
  reason: string;
  /**
   * NOT A PURCHASE QUANTITY. NOT A COST INPUT. NOT A READINESS SIGNAL.
   *
   * The floor the aggregate footage puts under the package count, shown only so
   * the unknown has a scale. The true count is this or higher, and on the
   * worked example it is 8 where this says 7. It is carried on an UNRESOLVED
   * requirement, which has no cost field and can never satisfy a required
   * class, so no arithmetic downstream can reach it by accident.
   */
  minimumTheoreticalPackages?: number;
};

/**
 * A material class the job is known to require.
 *
 * Declaring one is a commitment: it must be discharged. Leaving it out is the
 * only way to say "not needed", and that omission is now visible in the
 * declaration rather than hidden in an unpassed argument.
 */
export type RequiredClass = {
  classKey: string;
  /** Roles that must ALL resolve for this class to count as satisfied. */
  roles: string[];
  /** Why the job needs it, so a reader can challenge the list itself. */
  because: string;
  /**
   * Set when the class is required but cannot be quantified at all yet — the
   * support clips a route certainly needs but whose spacing nobody established.
   * Such a class is always UNRESOLVED; that is the honest outcome, not a gap.
   */
  unquantifiable?: { code: UnresolvedCode; reason: string };
};

export type MaterialClassStatus = {
  classKey: string;
  status: "RESOLVED" | "UNRESOLVED";
  roles: string[];
  /** Empty when RESOLVED. */
  unresolvedCodes: UnresolvedCode[];
};

export type ConductorRequirement =
  | {
      known: true;
      /**
       * ONE ENTRY PER ELECTRICAL FUNCTION, EACH NAMING ITS OWN ROLE.
       *
       * Not a single role with a count. ContractorMaterial is unique per
       * (contractor, canonicalMaterial) and carries ONE activeSupplierLink, so
       * a role resolves to exactly one purchasable product. Asking for
       * "3 x CONDUCTOR_THHN_14" therefore asks for three of the SAME product —
       * one wire — which cannot satisfy an ungrounded, a grounded and an
       * equipment grounding conductor at once.
       */
      functions: { function: string; role: string }[];
      footPerConductor: number;
    }
  | { known: false; code: UnresolvedCode; reason: string };

export type TakeoffInput = {
  components: SelectedComponent[];
  recipes: RecipeLine[];
  selections: ProductSelection[];
  shape: RouteShape;
  /** Per role. No default — an undeclared role is unresolved, never assumed. */
  divisibility: { role: string; divisibility: Divisibility }[];
  /**
   * Every material class this job requires. Required, and exhaustive by
   * contract: `purchaseComplete` means every entry here resolved.
   */
  requiredClasses: RequiredClass[];
  /**
   * The role whose purchased segmentation produces joints, and the role those
   * joints are — or an explicit statement that this route has no such role.
   * Required either way: "not applicable" is a claim with a reason, not the
   * absence of an argument.
   */
  segmentation:
    | { linearRole: string; jointRole: string }
    | { notApplicable: true; because: string };
  /**
   * Required — deliberately not optional. An electrical route needs conductors;
   * the only question is whether they can be stated. Omitting the argument used
   * to delete the entire class from the completeness account, so omission is
   * now a compile error and `{ known: false, reason }` is the way to say so.
   */
  conductors: ConductorRequirement;
  /**
   * Requirements that exist because a DECLARED RULE produced them, rather than
   * because a component recipe listed them — support clips at the system's own
   * interval, the fitting each terminus takes.
   *
   * They arrive already quantified because the rule that quantifies them is
   * the contractor's declaration, not this function's arithmetic. What this
   * function guarantees is that they are purchased and counted for
   * completeness exactly like a recipe requirement, so a declared rule cannot
   * produce a requirement that quietly costs nothing.
   */
  derivedRequirements: PhysicalRequirement[];
};

export type MaterialTakeoff = {
  physicalRequirements: PhysicalRequirement[];
  purchaseRequirements: PurchaseRequirement[];
  unresolvedRequirements: UnresolvedRequirement[];
  /** One entry per declared required class. */
  classStatuses: MaterialClassStatus[];
  /**
   * True only when EVERY declared required class resolved and nothing is
   * outstanding. A subsystem being finished — all the raceway packages known —
   * does not make this true; read `classStatuses` for that.
   */
  purchaseComplete: boolean;
};

/** Whole packages. Nobody sells 6.2 sticks. */
const packagesFor = (required: number, per: number) => Math.ceil(required / per);

export function computeMaterialTakeoff(input: TakeoffInput): MaterialTakeoff {
  const physical: PhysicalRequirement[] = [];
  const purchase: PurchaseRequirement[] = [];
  const unresolved: UnresolvedRequirement[] = [];

  const byRole = new Map<string, ProductSelection>();
  for (const s of input.selections) byRole.set(s.role, s);

  const divisibilityOf = new Map<string, Divisibility>();
  for (const d of input.divisibility) divisibilityOf.set(d.role, d.divisibility);

  // ── physical requirements: component quantity x recipe quantity ───────────
  const totals = new Map<string, { qty: number; unit: string; from: string }>();
  for (const c of input.components) {
    for (const r of input.recipes.filter((x) => x.componentKey === c.key)) {
      const prev = totals.get(r.role);
      totals.set(r.role, {
        qty: (prev?.qty ?? 0) + r.perUnit * c.quantity,
        unit: r.unit,
        from: prev ? `${prev.from}, ${c.key}` : c.key,
      });
    }
  }
  for (const [role, t] of totals) {
    physical.push({ role, quantity: t.qty, unit: t.unit, fromComponent: t.from });
  }

  /** Turn one physical requirement into packages, or say why it cannot be. */
  const resolvePurchase = (p: PhysicalRequirement): void => {
    const sel = byRole.get(p.role);
    if (!sel) {
      unresolved.push({
        code: "NO_CONTRACTOR_PRODUCT", role: p.role,
        reason: `No contractor product is selected for ${p.role}, so package geometry and cost are unknown. The physical requirement of ${p.quantity} ${p.unit} stands.`,
      });
      return;
    }
    const div = divisibilityOf.get(p.role);
    if (!div) {
      unresolved.push({
        code: "DIVISIBILITY_NOT_DECLARED", role: p.role,
        reason: `${p.role} has no declared divisibility, so whether ${p.quantity} ${p.unit} rounds up cleanly to packages is unknown. Assuming it does is how a cut-from-stock role gets an exact package count it has not earned.`,
      });
      return;
    }

    if (div === "SEGMENTED_BY_TURNS" && input.shape.turnCount > 0) {
      const floor = packagesFor(p.quantity, sel.packageQuantity);
      unresolved.push({
        code: "SEGMENT_GEOMETRY_REQUIRED", role: p.role,
        minimumTheoreticalPackages: floor,
        reason: `${p.role} is cut from ${sel.packageQuantity} ${sel.packageUnit} stock, and this route's ${input.shape.turnCount} direction change(s) cut it into separate legs. ${p.quantity} ${p.unit} total does not say how long each leg is — 10+10+11 and 1+1+29 are both 31 feet, and the second needs 8 pieces where the first needs 7 — so the purchased piece count cannot be derived from the total. ${floor} is the floor, not the requirement.`,
      });
      unresolved.push({
        code: "OFFCUT_POLICY_REQUIRED", role: p.role,
        reason: `Even with every leg length known, the piece count for ${p.role} depends on whether the offcut from one leg may be reused on another. On 1+1+29 that is the whole difference between 7 pieces and 8. No canonical or contractor-owned offcut policy exists, so neither number can be claimed.`,
      });
      return;
    }

    const packages = packagesFor(p.quantity, sel.packageQuantity);
    purchase.push({
      role: p.role, packages, packageQuantity: sel.packageQuantity,
      packageUnit: sel.packageUnit, costCents: packages * sel.packagePriceCents,
      productLabel: sel.productLabel ?? null, physicalQuantity: p.quantity,
    });
  };

  for (const d of input.derivedRequirements) physical.push(d);
  for (const p of [...physical]) resolvePurchase(p);

  // ── joints, and only where segmentation is actually knowable ──────────────
  if (!("notApplicable" in input.segmentation)) {
    const { linearRole, jointRole } = input.segmentation;
    const linear = purchase.find((x) => x.role === linearRole);
    if (input.shape.turnCount > 0) {
      unresolved.push({
        code: "SEGMENT_GEOMETRY_REQUIRED", role: jointRole,
        reason: `Joints join the pieces of ${linearRole}, and this route's ${input.shape.turnCount} direction change(s) leave the piece count itself underdetermined. A count that follows from an unknown cannot be known.`,
      });
    } else if (!linear) {
      // The linear role itself is unresolved; its joints cannot be known
      // either, and the entry above already says why.
      unresolved.push({
        code: "NO_CONTRACTOR_PRODUCT", role: jointRole,
        reason: `Joints follow from how many pieces of ${linearRole} are purchased, and that count is not established.`,
      });
    } else if (linear.packages > 1) {
      // ONE straight run: the pieces are laid end to end, so the joins between
      // them are exactly one fewer than the pieces. No offcut policy is needed
      // because nothing is reused across legs — there is only one leg.
      const joints = linear.packages - 1;
      const sel = byRole.get(jointRole);
      if (!sel) {
        unresolved.push({
          code: "NO_CONTRACTOR_PRODUCT", role: jointRole,
          reason: `${joints} joint(s) are required — one fewer than the ${linear.packages} pieces of a single straight run — but no contractor product is selected for ${jointRole}.`,
        });
      } else {
        physical.push({ role: jointRole, quantity: joints, unit: "each", fromComponent: `derived from ${linear.packages} pieces of ${linearRole}` });
        const packages = packagesFor(joints, sel.packageQuantity);
        purchase.push({
          role: jointRole, packages, packageQuantity: sel.packageQuantity,
          packageUnit: sel.packageUnit, costCents: packages * sel.packagePriceCents,
          productLabel: sel.productLabel ?? null, physicalQuantity: joints,
        });
      }
    }
    // linear.packages === 1: one piece, no joins. Exact, and nothing to report.
  }

  // ── conductors ────────────────────────────────────────────────────────────
  if (!input.conductors.known) {
    unresolved.push({ code: input.conductors.code, role: null, reason: input.conductors.reason });
  } else {
    const { functions, footPerConductor } = input.conductors;

    // A role resolves to ONE product. Two functions sharing a role would both
    // resolve to that product, silently satisfying an ungrounded and a
    // grounded conductor with the same wire.
    const sharing = new Map<string, string[]>();
    for (const f of functions) {
      sharing.set(f.role, [...(sharing.get(f.role) ?? []), f.function]);
    }
    const shared = [...sharing.entries()].filter(([, fns]) => fns.length > 1);
    if (shared.length > 0) {
      for (const [role, fns] of shared) {
        unresolved.push({
          code: "GROUNDING_SYSTEM_REQUIRED", role,
          reason: `${fns.join(" and ")} both require ${role}, but a role resolves to a single contractor product — one wire cannot serve two electrical functions. Each function needs its own canonical role.`,
        });
      }
    } else {
      for (const f of functions) {
        const req: PhysicalRequirement = {
          role: f.role, quantity: footPerConductor, unit: "ft",
          fromComponent: `${f.function} conductor`,
        };
        physical.push(req);
        resolvePurchase(req);
      }
      // SLACK IS NOT THIS FUNCTION'S TO CLAIM.
      //
      // An earlier version pushed TERMINATION_SLACK_NOT_ESTABLISHED here
      // unconditionally, which was right while nothing could establish it and
      // wrong the moment something could: a contractor who HAS declared their
      // allowance got told it was unknown, and their complete takeoff could
      // never complete. `footPerConductor` arrives already including whatever
      // allowance the caller established, and this function cannot see where
      // that number came from. The layer that knows — the one that reads the
      // policy — refuses there instead.
    }
  }

  // ── discharge every declared class ────────────────────────────────────────
  const purchasedRoles = new Set(purchase.map((x) => x.role));
  const unresolvedByRole = new Map<string, UnresolvedCode[]>();
  for (const u of unresolved) {
    if (u.role === null) continue;
    unresolvedByRole.set(u.role, [...(unresolvedByRole.get(u.role) ?? []), u.code]);
  }

  const classStatuses: MaterialClassStatus[] = [];
  for (const rc of input.requiredClasses) {
    if (rc.unquantifiable) {
      unresolved.push({ code: rc.unquantifiable.code, role: rc.roles[0] ?? null, reason: rc.unquantifiable.reason });
      classStatuses.push({ classKey: rc.classKey, status: "UNRESOLVED", roles: rc.roles, unresolvedCodes: [rc.unquantifiable.code] });
      continue;
    }
    if (rc.roles.length === 0) {
      // Required, quantifiable in principle, but naming no role: the class
      // cannot be satisfied and cannot explain itself either.
      const code: UnresolvedCode = "CLASS_NOT_ACCOUNTED_FOR";
      unresolved.push({
        code, role: null,
        reason: `${rc.classKey} is declared as required (${rc.because}) but names no canonical role and is not marked unquantifiable, so nothing can discharge it.`,
      });
      classStatuses.push({ classKey: rc.classKey, status: "UNRESOLVED", roles: [], unresolvedCodes: [code] });
      continue;
    }
    const codes = rc.roles.flatMap((r) => unresolvedByRole.get(r) ?? []);
    const allPurchased = rc.roles.every((r) => purchasedRoles.has(r));
    classStatuses.push({
      classKey: rc.classKey,
      status: allPurchased && codes.length === 0 ? "RESOLVED" : "UNRESOLVED",
      roles: rc.roles,
      unresolvedCodes: codes,
    });
  }

  // A role the recipes produced that no declared class covers means the class
  // list under-declares what this job actually needs. Report it; never absorb it.
  const declaredRoles = new Set(input.requiredClasses.flatMap((c) => c.roles));
  for (const p of physical) {
    if (declaredRoles.has(p.role)) continue;
    unresolved.push({
      code: "CLASS_NOT_ACCOUNTED_FOR", role: p.role,
      reason: `${p.role} appeared in the takeoff (${p.quantity} ${p.unit}, from ${p.fromComponent}) but belongs to no declared required class, so completeness could not have accounted for it.`,
    });
  }

  const everyClassResolved = classStatuses.every((c) => c.status === "RESOLVED");

  return {
    physicalRequirements: physical,
    purchaseRequirements: purchase,
    unresolvedRequirements: unresolved,
    classStatuses,
    purchaseComplete:
      everyClassResolved && unresolved.length === 0 && physical.length > 0 && classStatuses.length > 0,
  };
}
