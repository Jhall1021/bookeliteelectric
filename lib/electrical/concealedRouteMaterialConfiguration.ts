import {
  computeMaterialTakeoff,
  type MaterialTakeoff,
  type ProductSelection,
  type RequiredClass,
  type SelectedComponent,
} from "./materialTakeoff";

export const CONCEALED_ROUTE_POLICY_KEYS = {
  cableRole: "concealed_branch.cable_role",
  slackPerTermination: "concealed_branch.cable_slack_per_termination",
  backToBackCableAllowance: "concealed_branch.back_to_back_cable_allowance",
  supportSpacing: "concealed_branch.cable_support_spacing",
  supportAtEachTermination: "concealed_branch.support_at_each_termination",
  drywallFramingSpacing: "concealed_branch.drywall_framing_spacing_inches",
  drywallOpeningWidth: "concealed_branch.drywall_opening_width_inches",
  drywallOpeningHeight: "concealed_branch.drywall_opening_height_inches",
  drywallCompoundPerSquareFoot: "concealed_branch.drywall_compound_lb_per_sqft",
} as const;

export const CONCEALED_BRANCH_CABLE_CHOICES = ["WIRE_14_2", "WIRE_12_2"] as const;
export type ConcealedBranchCableRole = (typeof CONCEALED_BRANCH_CABLE_CHOICES)[number];
export type ConcealedEndpoint = "OUTLET" | "SWITCH";

export type ConcealedRouteMaterialConfiguration = {
  cableRole: ConcealedBranchCableRole | null;
  slackPerTerminationFt: number | null;
  backToBackCableAllowanceFt: number | null;
  supportSpacingFt: number | null;
  supportAtEachTermination: boolean | null;
  drywallFramingSpacingInches?: number | null;
  drywallOpeningWidthInches?: number | null;
  drywallOpeningHeightInches?: number | null;
  drywallCompoundLbPerSqFt?: number | null;
};

export function drywallOpeningGeometry(args: {
  routeFeet: number;
  framingSpacingInches: number;
  openingWidthInches: number;
  openingHeightInches: number;
}) {
  const { routeFeet, framingSpacingInches, openingWidthInches, openingHeightInches } = args;
  if (![routeFeet, framingSpacingInches, openingWidthInches, openingHeightInches].every((value) => Number.isFinite(value) && value > 0)) return null;
  const openingCount = Math.ceil((routeFeet * 12) / framingSpacingInches);
  return {
    openingCount,
    drywallSqFt: openingCount * openingWidthInches * openingHeightInches / 144,
    tapeFt: openingCount * 2 * (openingWidthInches + openingHeightInches) / 12,
  };
}

const endpointRoles: Record<ConcealedEndpoint, string[]> = {
  OUTLET: ["BOX_OLD_WORK", "RECEPTACLE_STANDARD", "WALL_PLATE", "CONSUMABLES_SMALL"],
  SWITCH: ["BOX_OLD_WORK", "SWITCH_STANDARD", "WALL_PLATE", "CONSUMABLES_SMALL"],
};

const qty = (components: SelectedComponent[], key: string): number =>
  components.filter((component) => component.key === key).reduce((sum, component) => sum + component.quantity, 0);

/**
 * Build the purchase takeoff for concealed routes. Finished drywall never
 * infers hidden framing: its opening count exists only when measured route
 * footage and the contractor's declared framing/patch rules are all present.
 */
export function computeConcealedRouteMaterialTakeoff(args: {
  components: SelectedComponent[];
  endpoint: ConcealedEndpoint;
  configuration: ConcealedRouteMaterialConfiguration;
  selections: ProductSelection[];
}): MaterialTakeoff {
  const routeFeet = qty(args.components, "CONCEALED_ROUTE_FT");
  const backToBack = qty(args.components, "ELEC_ROUTE_BACK_TO_BACK") > 0;
  const accessible = qty(args.components, "ELEC_ROUTE_ACCESSIBLE_CONCEALED") > 0;
  const finished = qty(args.components, "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS") > 0
    || qty(args.components, "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS") > 0;
  const drywall = qty(args.components, "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS") > 0;
  const cableRole = args.configuration.cableRole;
  const slack = args.configuration.slackPerTerminationFt;
  const backToBackAllowance = args.configuration.backToBackCableAllowanceFt;
  const supportSpacing = args.configuration.supportSpacingFt;
  const supportAtEachTermination = args.configuration.supportAtEachTermination;
  const drywallFramingSpacingInches = args.configuration.drywallFramingSpacingInches ?? null;
  const drywallOpeningWidthInches = args.configuration.drywallOpeningWidthInches ?? null;
  const drywallOpeningHeightInches = args.configuration.drywallOpeningHeightInches ?? null;
  const drywallCompoundLbPerSqFt = args.configuration.drywallCompoundLbPerSqFt ?? null;

  const cableQuantity = cableRole
    ? (accessible || finished) && routeFeet > 0 && slack !== null
      ? routeFeet + (2 * slack)
      : backToBack && backToBackAllowance !== null
        ? backToBackAllowance
        : null
    : null;

  const endpointKey = args.endpoint === "OUTLET" ? "OUTLET_EXTENSION_CORE" : "SWITCH_ENDPOINT_CORE";
  const recipes = endpointRoles[args.endpoint].map((role) => ({
    componentKey: endpointKey,
    role,
    perUnit: 1,
    unit: "each",
  }));
  if (cableRole && cableQuantity !== null) {
    recipes.push({ componentKey: "CONCEALED_CABLE_ASSEMBLY", role: cableRole, perUnit: cableQuantity, unit: "ft" });
  }
  const supportCount = accessible && routeFeet > 0 && supportSpacing !== null && supportSpacing > 0 && supportAtEachTermination !== null
    ? Math.floor(routeFeet / supportSpacing) + (supportAtEachTermination ? 2 : 0)
    : 0;
  if (supportCount > 0) {
    recipes.push({ componentKey: "CONCEALED_CABLE_SUPPORTS", role: "NM_CABLE_SUPPORT", perUnit: supportCount, unit: "each" });
  }
  const drywallGeometry = drywall && routeFeet > 0
    && drywallFramingSpacingInches !== null
    && drywallOpeningWidthInches !== null
    && drywallOpeningHeightInches !== null
    ? drywallOpeningGeometry({
        routeFeet,
        framingSpacingInches: drywallFramingSpacingInches,
        openingWidthInches: drywallOpeningWidthInches,
        openingHeightInches: drywallOpeningHeightInches,
      })
    : null;
  if (drywallGeometry) {
    recipes.push(
      { componentKey: "DRYWALL_PATCH_ASSEMBLY", role: "DRYWALL_PATCH_PANEL", perUnit: drywallGeometry.drywallSqFt, unit: "sqft" },
      { componentKey: "DRYWALL_PATCH_ASSEMBLY", role: "DRYWALL_JOINT_TAPE", perUnit: drywallGeometry.tapeFt, unit: "ft" },
    );
    if (drywallCompoundLbPerSqFt !== null) {
      recipes.push({ componentKey: "DRYWALL_PATCH_ASSEMBLY", role: "DRYWALL_JOINT_COMPOUND", perUnit: drywallGeometry.drywallSqFt * drywallCompoundLbPerSqFt, unit: "lb" });
    }
  }

  const requiredClasses: RequiredClass[] = endpointRoles[args.endpoint].map((role) => ({
    classKey: `ENDPOINT_${role}`,
    roles: [role],
    because: `The concealed ${args.endpoint.toLowerCase()} endpoint physically requires ${role}.`,
  }));
  requiredClasses.push(cableRole && cableQuantity !== null
    ? { classKey: "CONCEALED_BRANCH_CABLE", roles: [cableRole], because: "The concealed route requires one contractor-selected jacketed branch-cable assembly." }
    : {
        classKey: "CONCEALED_BRANCH_CABLE",
        roles: cableRole ? [cableRole] : [],
        because: "The concealed route requires a contractor-selected jacketed branch-cable assembly.",
        unquantifiable: {
          code: cableRole === null
            ? "CONCEALED_CABLE_SPECIFICATION_NOT_ESTABLISHED"
            : (accessible || finished) && routeFeet <= 0
              ? "CONCEALED_ROUTE_LENGTH_NOT_ESTABLISHED"
              : accessible && slack === null
                ? "TERMINATION_SLACK_NOT_ESTABLISHED"
                : "BACK_TO_BACK_CABLE_ALLOWANCE_NOT_ESTABLISHED",
          reason: cableRole === null
            ? "The contractor has not selected the standard jacketed cable role for this accepted branch-extension scope."
            : (accessible || finished) && routeFeet <= 0
              ? "The accessible concealed path has no established measured route length."
              : accessible && slack === null
                ? "The contractor has not declared cable slack per termination."
                : "The contractor has not declared the cable allowance for a confirmed back-to-back wall pass.",
        },
      });
  if (accessible) {
    requiredClasses.push(supportSpacing !== null && supportSpacing > 0 && supportAtEachTermination !== null
      ? { classKey: "CONCEALED_CABLE_SUPPORT", roles: ["NM_CABLE_SUPPORT"], because: "An accessible NM cable run is mechanically supported at the contractor-declared interval and termination rule." }
      : {
          classKey: "CONCEALED_CABLE_SUPPORT",
          roles: ["NM_CABLE_SUPPORT"],
          because: "An accessible NM cable run requires mechanical supports.",
          unquantifiable: {
            code: supportSpacing === null ? "SUPPORT_SPACING_NOT_ESTABLISHED" : "SUPPORT_TERMINUS_RULE_NOT_ESTABLISHED",
            reason: supportSpacing === null
              ? "The contractor has not declared the spacing used to estimate NM cable supports."
              : "The contractor has not declared whether the estimate includes a support at each termination.",
          },
        });
  }
  if (drywall) {
    const missingGeometry = drywallFramingSpacingInches === null
      ? "DRYWALL_FRAMING_SPACING_NOT_ESTABLISHED"
      : drywallOpeningWidthInches === null || drywallOpeningHeightInches === null
        ? "DRYWALL_OPENING_SIZE_NOT_ESTABLISHED"
        : null;
    requiredClasses.push(missingGeometry === null && drywallGeometry
      ? { classKey: "DRYWALL_PATCH_PANEL", roles: ["DRYWALL_PATCH_PANEL"], because: "Measured route length and the contractor's framing/opening rules establish patch area." }
      : { classKey: "DRYWALL_PATCH_PANEL", roles: ["DRYWALL_PATCH_PANEL"], because: "Drywall access must be restored from explicit opening geometry.", unquantifiable: { code: missingGeometry ?? "DRYWALL_GEOMETRY_INVALID", reason: "The contractor has not completed the drywall opening geometry used for estimating." } });
    requiredClasses.push(missingGeometry === null && drywallGeometry
      ? { classKey: "DRYWALL_JOINT_TAPE", roles: ["DRYWALL_JOINT_TAPE"], because: "Tape length follows the perimeter of every estimated access patch." }
      : { classKey: "DRYWALL_JOINT_TAPE", roles: ["DRYWALL_JOINT_TAPE"], because: "Every access patch requires joint tape.", unquantifiable: { code: missingGeometry ?? "DRYWALL_GEOMETRY_INVALID", reason: "The contractor has not completed the drywall opening geometry used for estimating." } });
    requiredClasses.push(missingGeometry === null && drywallGeometry && drywallCompoundLbPerSqFt !== null
      ? { classKey: "DRYWALL_JOINT_COMPOUND", roles: ["DRYWALL_JOINT_COMPOUND"], because: "Compound quantity follows the contractor's declared pounds per patch square foot." }
      : { classKey: "DRYWALL_JOINT_COMPOUND", roles: ["DRYWALL_JOINT_COMPOUND"], because: "Every access patch requires joint compound.", unquantifiable: { code: missingGeometry ?? "DRYWALL_COMPOUND_RATE_NOT_ESTABLISHED", reason: "The contractor has not completed the drywall patch-material rule." } });
  }

  const components = [
    ...args.components,
    ...(cableRole && cableQuantity !== null ? [{ key: "CONCEALED_CABLE_ASSEMBLY", quantity: 1 }] : []),
    ...(supportCount > 0 ? [{ key: "CONCEALED_CABLE_SUPPORTS", quantity: 1 }] : []),
    ...(drywallGeometry ? [{ key: "DRYWALL_PATCH_ASSEMBLY", quantity: 1 }] : []),
  ];
  const divisibility = [
    ...endpointRoles[args.endpoint].map((role) => ({ role, divisibility: "DISCRETE" as const })),
    ...(cableRole ? [{ role: cableRole, divisibility: "CONTINUOUS" as const }] : []),
    { role: "NM_CABLE_SUPPORT", divisibility: "DISCRETE" as const },
    { role: "DRYWALL_PATCH_PANEL", divisibility: "CONTINUOUS" as const },
    { role: "DRYWALL_JOINT_TAPE", divisibility: "CONTINUOUS" as const },
    { role: "DRYWALL_JOINT_COMPOUND", divisibility: "CONTINUOUS" as const },
  ];

  return computeMaterialTakeoff({
    components,
    recipes,
    selections: args.selections,
    shape: { turnCount: 0 },
    divisibility,
    requiredClasses,
    segmentation: { notApplicable: true, because: "Jacketed cable bends through the concealed route and is purchased continuously rather than as rigid route segments." },
    conductors: { known: true, functions: [], footPerConductor: 0 },
    derivedRequirements: [],
  });
}
