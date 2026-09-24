import { saveLaborOperationDecisions } from "../lib/laborCalibrationPersistence";

/**
 * Deterministic Stage 1A labor fixture expressed in the same atomic operation
 * vocabulary and persistence path used by the contractor calibration wizard.
 * Zeroes are explicit decisions, never missing labor.
 */
export const PILOT_ATOMIC_LABOR_HOURS: Readonly<Record<string, number>> = {
  ELEC_SURFACE_RACEWAY_SETUP: 0,
  ELEC_SURFACE_RACEWAY: 0.02,
  ELEC_PULL_SURFACE_RACEWAY_CONDUCTOR: 0,
  ELEC_SURFACE_RACEWAY_JOINT: 0,
  ELEC_SURFACE_RACEWAY_SUPPORT: 0,
  ELEC_SURFACE_RACEWAY_INSIDE_CORNER: 0,
  ELEC_SURFACE_RACEWAY_OUTSIDE_CORNER: 0,
  ELEC_SURFACE_RACEWAY_FLAT_CORNER: 0,
  ELEC_SURFACE_RACEWAY_END: 0,
  ELEC_SURFACE_RACEWAY_TRANSITION: 0,
  ELEC_SURFACE_DEVICE_BOX: 0.2,
  ELEC_CONNECT_EXISTING_BRANCH_SOURCE: 0,
  ELEC_INSTALL_NEW_RECEPTACLE: 0.6,
  ELEC_TEST_BRANCH_EXTENSION: 0,
  ELEC_BRANCH_WORK_CLEANUP: 0,
};

type LaborFixtureDb = Parameters<typeof saveLaborOperationDecisions>[0];

export async function savePilotAtomicLabor(db: LaborFixtureDb, contractorId: string) {
  return saveLaborOperationDecisions(db, contractorId, "electrical",
    Object.entries(PILOT_ATOMIC_LABOR_HOURS).map(([operationKey, hoursPerUnit]) => ({
      operationKey,
      hoursPerUnit,
      source: "DIRECT" as const,
      basis: {
        method: "DIRECT_ENTRY" as const,
        scenarioKeys: [],
        note: "Deterministic rehearsal value entered through the atomic labor setup path.",
      },
    })));
}

export async function restorePilotAtomicLaborOperation(
  db: LaborFixtureDb,
  contractorId: string,
  operationKey: keyof typeof PILOT_ATOMIC_LABOR_HOURS,
) {
  return saveLaborOperationDecisions(db, contractorId, "electrical", [{
    operationKey,
    hoursPerUnit: PILOT_ATOMIC_LABOR_HOURS[operationKey],
    source: "DIRECT",
    basis: {
      method: "DIRECT_ENTRY",
      scenarioKeys: [],
      note: "Deterministic rehearsal value restored through the atomic labor setup path.",
    },
  }]);
}

/**
 * The current New 120V Outlet tree has homeowner reroutes to these services.
 * Pilot suites assert the dependency refusal first, then stage the unrelated
 * prerequisites so they can continue testing the original pilot concern.
 */
export async function stagePilotRerouteDependencies(
  db: Pick<import("@prisma/client").PrismaClient, "service">,
  contractorId: string,
) {
  const slugs = ["dedicated-120v-circuit-outlet", "level-2-ev-charger"];
  const result = await db.service.updateMany({
    where: { contractorId, slug: { in: slugs } },
    data: { active: true },
  });
  if (result.count !== slugs.length) throw new Error(`expected ${slugs.length} pilot reroute dependencies, found ${result.count}`);
}
