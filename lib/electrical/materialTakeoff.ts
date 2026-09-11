/**
 * From a physical recipe to a purchase list — Stage E/F.
 *
 * THREE LAYERS, KEPT APART ON PURPOSE
 *
 *   physical requirement   31 feet of channel. True of the job, independent of
 *                          what anyone sells.
 *   purchase requirement   7 sticks. Only knowable once a contractor has chosen
 *                          a product, because the stock length is the product's.
 *   unresolved             everything we cannot know yet, each with a reason.
 *
 * The third is the point. A route whose elbow count is exact and whose joint
 * count is unknowable is not an invalid route and not a guess — it is a
 * partially resolved takeoff, and saying so is more useful than either
 * alternative.
 *
 * WHY JOINTS ARE NOT ceil(feet / stock) - 1 IN GENERAL
 *
 * That formula holds for ONE continuous straight run. Put two corners in a 31
 * foot route and the channel is cut into three straight legs — but 10+10+11 and
 * 3+14+14 are the same 31 feet and do not need the same number of joints, and
 * nothing in the homeowner's answers says which it is. Routing V2 knows total
 * feet and turn COUNTS; it does not know segment LENGTHS.
 *
 * Route Assist has ordered geometry upstream, deliberately not yet a canonical
 * input. Deriving joints from it would make camera users priceable and
 * keyboard users not, for the same physical job. So a turned route reports
 * SEGMENT_GEOMETRY_REQUIRED and everything else stays exact.
 *
 * PURE. No Prisma, no I/O, no clock. Everything it needs is passed in.
 */

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
  | "SEGMENT_GEOMETRY_REQUIRED"
  | "OFFCUT_POLICY_REQUIRED"
  | "CIRCUIT_AMPACITY_REQUIRED"
  | "GROUNDING_SYSTEM_REQUIRED"
  | "TERMINATION_SLACK_NOT_ESTABLISHED";

export type UnresolvedRequirement = { code: UnresolvedCode; role: string | null; reason: string };

export type MaterialTakeoff = {
  physicalRequirements: PhysicalRequirement[];
  purchaseRequirements: PurchaseRequirement[];
  unresolvedRequirements: UnresolvedRequirement[];
  /** True only when every physical requirement became a purchase requirement. */
  purchaseComplete: boolean;
};

export type TakeoffInput = {
  components: SelectedComponent[];
  recipes: RecipeLine[];
  selections: ProductSelection[];
  shape: RouteShape;
  /**
   * The role whose purchased segmentation produces joints, and the role those
   * joints are. Both canonical keys, supplied by the caller so this function
   * knows nothing about raceway specifically.
   */
  segmentation?: { linearRole: string; jointRole: string };
  /**
   * Conductor requirement, when the circuit is known well enough to state one.
   * Absent means the caller could not establish it — the reason comes with it.
   */
  conductors?:
    | {
        known: true;
        /**
         * ONE ENTRY PER ELECTRICAL FUNCTION, EACH NAMING ITS OWN ROLE.
         *
         * Not a single role with a count. ContractorMaterial is unique per
         * (contractor, canonicalMaterial) and carries ONE activeSupplierLink,
         * so a role resolves to exactly one purchasable product. Asking for
         * "3 x CONDUCTOR_THHN_14" therefore asks for three of the SAME
         * product — one colour — which cannot satisfy an ungrounded, a
         * grounded and an equipment-grounding conductor at once.
         *
         * Distinct roles are how the existing model expresses distinct
         * products, so function belongs in the role.
         */
        functions: { function: string; role: string }[];
        footPerConductor: number;
      }
    | { known: false; code: UnresolvedCode; reason: string };
};

/** Whole packages. Nobody sells 6.2 sticks. */
const packagesFor = (required: number, per: number) => Math.ceil(required / per);

export function computeMaterialTakeoff(input: TakeoffInput): MaterialTakeoff {
  const physical: PhysicalRequirement[] = [];
  const purchase: PurchaseRequirement[] = [];
  const unresolved: UnresolvedRequirement[] = [];

  const byRole = new Map<string, ProductSelection>();
  for (const s of input.selections) byRole.set(s.role, s);

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

  // ── purchase requirements, where a product has been chosen ────────────────
  for (const p of physical) {
    const sel = byRole.get(p.role);
    if (!sel) {
      unresolved.push({
        code: "NO_CONTRACTOR_PRODUCT", role: p.role,
        reason: `No contractor product is selected for ${p.role}, so package geometry and cost are unknown. The physical requirement of ${p.quantity} ${p.unit} stands.`,
      });
      continue;
    }
    const packages = packagesFor(p.quantity, sel.packageQuantity);
    purchase.push({
      role: p.role, packages, packageQuantity: sel.packageQuantity,
      packageUnit: sel.packageUnit, costCents: packages * sel.packagePriceCents,
      productLabel: sel.productLabel ?? null, physicalQuantity: p.quantity,
    });
  }

  // ── joints, and only where segmentation is actually knowable ──────────────
  if (input.segmentation) {
    const { linearRole, jointRole } = input.segmentation;
    const linear = purchase.find((x) => x.role === linearRole);
    if (input.shape.turnCount > 0) {
      unresolved.push({
        code: "SEGMENT_GEOMETRY_REQUIRED", role: jointRole,
        reason: `The route has ${input.shape.turnCount} direction change(s), so the channel is cut into separate straight legs. Total footage does not say how long each leg is — 10+10+11 and 3+14+14 are both 31 feet and need different cut plans — so the straight-joint count cannot be derived. Every other requirement on this route is exact.`,
      });
    } else if (!linear) {
      // The linear role itself is unresolved; its joints cannot be known either,
      // and NO_CONTRACTOR_PRODUCT above already says why.
      unresolved.push({
        code: "NO_CONTRACTOR_PRODUCT", role: jointRole,
        reason: `Joints follow from how many pieces of ${linearRole} are purchased, and no product is selected for it.`,
      });
    } else if (linear.packages > 1) {
      // ONE straight run: the pieces are laid end to end, so the joins between
      // them are exactly one fewer than the pieces. No offcut policy is needed
      // because nothing is being reused across legs — there is only one leg.
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
  }

  // ── conductors ────────────────────────────────────────────────────────────
  if (input.conductors) {
    if (!input.conductors.known) {
      unresolved.push({ code: input.conductors.code, role: null, reason: input.conductors.reason });
    } else {
      const { functions, footPerConductor } = input.conductors;

      // A role resolves to ONE product. Two functions sharing a role would
      // both resolve to that one product, silently satisfying an ungrounded
      // and a grounded conductor with the same wire.
      const byRoleCount = new Map<string, string[]>();
      for (const f of functions) {
        byRoleCount.set(f.role, [...(byRoleCount.get(f.role) ?? []), f.function]);
      }
      const shared = [...byRoleCount.entries()].filter(([, fns]) => fns.length > 1);
      if (shared.length > 0) {
        for (const [role, fns] of shared) {
          unresolved.push({
            code: "GROUNDING_SYSTEM_REQUIRED", role,
            reason: `${fns.join(" and ")} both require ${role}, but a role resolves to a single contractor product — one wire cannot serve two electrical functions. Each function needs its own canonical role.`,
          });
        }
      } else {
        for (const f of functions) {
          physical.push({
            role: f.role, quantity: footPerConductor, unit: "ft",
            fromComponent: `${f.function} conductor`,
          });
        }
        unresolved.push({
          code: "TERMINATION_SLACK_NOT_ESTABLISHED", role: null,
          reason: `Conductor figures above are route length only. Conductors are also cut long at each termination, and no canonical or contractor-owned slack policy exists — so no allowance has been added rather than inventing one.`,
        });
      }
    }
  }

  return {
    physicalRequirements: physical,
    purchaseRequirements: purchase,
    unresolvedRequirements: unresolved,
    purchaseComplete: unresolved.length === 0 && physical.length > 0,
  };
}
