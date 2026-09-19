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
};

const endpointRoles: Record<ConcealedEndpoint, string[]> = {
  OUTLET: ["BOX_OLD_WORK", "RECEPTACLE_STANDARD", "WALL_PLATE", "CONSUMABLES_SMALL"],
  SWITCH: ["BOX_OLD_WORK", "SWITCH_STANDARD", "WALL_PLATE", "CONSUMABLES_SMALL"],
};

const qty = (components: SelectedComponent[], key: string): number =>
  components.filter((component) => component.key === key).reduce((sum, component) => sum + component.quantity, 0);

/**
 * Build a purchase takeoff for the two concealed strategies whose physical
 * cable quantity is actually established: measured accessible routes and the
 * contractor-declared back-to-back allowance.
 *
 * Finished-wall routes deliberately remain outside this function until their
 * opening/restoration geometry is established. No framing or patch count is
 * inferred from route footage alone.
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
  const cableRole = args.configuration.cableRole;
  const slack = args.configuration.slackPerTerminationFt;
  const backToBackAllowance = args.configuration.backToBackCableAllowanceFt;
  const supportSpacing = args.configuration.supportSpacingFt;
  const supportAtEachTermination = args.configuration.supportAtEachTermination;

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

  const components = [
    ...args.components,
    ...(cableRole && cableQuantity !== null ? [{ key: "CONCEALED_CABLE_ASSEMBLY", quantity: 1 }] : []),
    ...(supportCount > 0 ? [{ key: "CONCEALED_CABLE_SUPPORTS", quantity: 1 }] : []),
  ];
  const divisibility = [
    ...endpointRoles[args.endpoint].map((role) => ({ role, divisibility: "DISCRETE" as const })),
    ...(cableRole ? [{ role: cableRole, divisibility: "CONTINUOUS" as const }] : []),
    { role: "NM_CABLE_SUPPORT", divisibility: "DISCRETE" as const },
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
