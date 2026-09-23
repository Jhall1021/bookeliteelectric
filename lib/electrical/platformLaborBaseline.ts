import type { LaborOperation } from "../laborOperations";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "./atomicLabor";

export type ElectricalPlatformLaborBaseline = {
  operationKey: string;
  hoursPerUnit: number;
  status: "PUBLISHED_REFERENCE" | "WORKBOOK_PLANNING_FACTOR";
  sourceKeys: string[];
  note: string;
};

type PlanningSeed = Omit<ElectricalPlatformLaborBaseline, "operationKey" | "status">;

/**
 * Platform starting values translated from price2book_atomic_recipes.xlsx.
 *
 * These values are not contractor observations. Composite workbook atoms are
 * split where the runtime vocabulary keeps route, support, termination, test
 * and cleanup separate. The note on every split states the allocation so the
 * parts can be reviewed without hiding work or counting it twice.
 */
const BRANCH_CIRCUIT_PLANNING_SEEDS: Record<string, PlanningSeed> = {
  ELEC_ROUTE_LAYOUT_SETUP: { hoursPerUnit: 0.20, sourceKeys: ["CONFIRM_SCOPE", "PROTECT_AREA"], note: "Combines the workbook's 0.10-hour scope confirmation and 0.10-hour work-area protection atoms once per route." },
  ELEC_DRILL_TOP_OR_BOTTOM_PLATE: { hoursPerUnit: 0.25, sourceKeys: ["DRILL_WALL_PLATE"], note: "Direct workbook planning factor for one wall-plate penetration." },
  ELEC_FISH_WALL_TO_BOX: { hoursPerUnit: 0.35, sourceKeys: ["FISH_WALL_DROP"], note: "Direct workbook planning factor for one finished wall drop to a box." },
  ELEC_FISH_WALL_TO_EQUIPMENT: { hoursPerUnit: 0.35, sourceKeys: ["FISH_WALL_DROP"], note: "Uses the same bounded wall-drop task at an equipment endpoint; equipment termination remains separate." },
  ELEC_NM_CABLE_ACCESSIBLE: { hoursPerUnit: 0.01, sourceKeys: ["RUN_CABLE_ACCESSIBLE_FT"], note: "Route-only allocation from the workbook's 0.018 hr/ft run-and-support factor; supports, framing drills, source makeup and testing remain separate runtime operations." },
  ELEC_HEAVY_BRANCH_CABLE_ACCESSIBLE: { hoursPerUnit: 0.015, sourceKeys: ["RUN_CABLE_ACCESSIBLE_FT", "NEE-06", "NEE-08"], note: "Provisional route-only allocation for larger cable, above the ordinary NM route allocation; supports, drilling and terminations remain separate." },
  ELEC_SUPPORT_NM_CABLE: { hoursPerUnit: 0.03, sourceKeys: ["RUN_CABLE_ACCESSIBLE_FT"], note: "Per-support allocation removed from the workbook's combined run-and-support factor so support count remains explicit." },
  ELEC_FISH_CABLE_CONCEALED: { hoursPerUnit: 0.045, sourceKeys: ["RUN_CABLE_FINISHED_FT"], note: "Direct workbook planning factor for concealed cable movement after openings and framing crossings are separately created." },
  ELEC_DRILL_FRAMING_CROSSING: { hoursPerUnit: 0.12, sourceKeys: ["DRILL_BLOCKING"], note: "Direct workbook planning factor per framing penetration." },
  ELEC_CUT_DRYWALL_ACCESS_OPENING: { hoursPerUnit: 0.18, sourceKeys: ["CUT_SINGLE_GANG", "CUT_FIXTURE_OPENING"], note: "Planning allocation for one protected access opening; patching and finish restoration remain excluded." },
  ELEC_MOUNT_SURFACE_4S_DEVICE_BOX: { hoursPerUnit: 0.22, sourceKeys: ["INSTALL_SURFACE_BOX"], note: "Direct workbook planning factor for one exposed surface box; endpoint device work remains separate." },
  ELEC_CONNECT_EXISTING_BRANCH_SOURCE: { hoursPerUnit: 0.22, sourceKeys: ["MAKEUP_SOURCE"], note: "Direct workbook planning factor for one established source connection." },
  ELEC_TEST_BRANCH_EXTENSION: { hoursPerUnit: 0.20, sourceKeys: ["ENERGIZE_TEST"], note: "Direct workbook planning factor for circuit energization and functional verification." },
  ELEC_BRANCH_WORK_CLEANUP: { hoursPerUnit: 0.15, sourceKeys: ["LABEL_DOCUMENT"], note: "Provisional closeout allocation for ordinary cleanup and labeling; repair and finish restoration remain excluded." },
  ELEC_BRANCH_PANEL_OPEN_VERIFY_CLOSE: { hoursPerUnit: 0.30, sourceKeys: ["PANEL_OPEN_CLOSE"], note: "Direct workbook planning factor for one panel access and safe closeout occurrence." },
  ELEC_TERMINATE_NEW_BREAKER_CONDUCTOR: { hoursPerUnit: 0.06, sourceKeys: ["INSTALL_BREAKER", "NEE-24", "NEE-25"], note: "Per-conductor allocation of the workbook's composite breaker task after retaining the published mechanical breaker units separately." },
  ELEC_INSTALL_NEW_RECEPTACLE: { hoursPerUnit: 0.23, sourceKeys: ["TERMINATE_RECEPTACLE", "INSTALL_PLATE"], note: "Workbook device termination plus plate only; the recipe's separate branch test supplies energization and verification." },
  ELEC_INSTALL_NEW_GFCI_RECEPTACLE: { hoursPerUnit: 0.27, sourceKeys: ["TERMINATE_GFCI", "INSTALL_PLATE"], note: "Workbook GFCI termination plus plate only; the recipe's separate branch test supplies energization and verification." },
  ELEC_INSTALL_NEW_240V_RECEPTACLE: { hoursPerUnit: 0.35, sourceKeys: ["TERMINATE_RECEPTACLE"], note: "Provisional larger-conductor endpoint factor; box, cable route, breaker work and branch testing remain separate." },
  ELEC_TERMINATE_EVSE: { hoursPerUnit: 0.75, sourceKeys: ["INSTALL_EV_CHARGER"], note: "Direct workbook planning factor for mounting and terminating customer-selected hardwired EV equipment at a prepared endpoint." },
};

function publishedBaseline(operation: LaborOperation): ElectricalPlatformLaborBaseline | null {
  if (operation.referenceLaborHours === null || operation.referenceStatus === "DISPUTED") return null;
  return {
    operationKey: operation.key,
    hoursPerUnit: operation.referenceLaborHours,
    status: "PUBLISHED_REFERENCE",
    sourceKeys: operation.evidence.map((item) => item.observationId),
    note: `${operation.referenceStatus} numeric reference from the checked atomic labor evidence.`,
  };
}

export const ELECTRICAL_PLATFORM_LABOR_BASELINES: ElectricalPlatformLaborBaseline[] =
  ELECTRICAL_ATOMIC_LABOR_OPERATIONS.flatMap((operation) => {
    const published = publishedBaseline(operation);
    if (published) return [published];
    const seed = BRANCH_CIRCUIT_PLANNING_SEEDS[operation.key];
    return seed ? [{ operationKey: operation.key, status: "WORKBOOK_PLANNING_FACTOR" as const, ...seed }] : [];
  });

export const electricalPlatformLaborBaselineByOperation = new Map(
  ELECTRICAL_PLATFORM_LABOR_BASELINES.map((baseline) => [baseline.operationKey, baseline]),
);

export function platformLaborHours(): Record<string, number> {
  return Object.fromEntries(ELECTRICAL_PLATFORM_LABOR_BASELINES.map((baseline) => [baseline.operationKey, baseline.hoursPerUnit]));
}
