import type { Prisma, PrismaClient } from "@prisma/client";
import { SURFACE_RACEWAY_SYSTEM_KEY } from "./surfaceSystemConfiguration";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Install Price2Book's prepared material-system starting point without ever
 * overwriting a contractor's later selection or declaration.
 */
export async function installPreparedElectricalMaterialSystems(db: Db, contractorId: string) {
  const transition = await db.canonicalMaterial.findUniqueOrThrow({
    where: { key: SURFACE_ROLES.transition }, select: { id: true },
  });
  await db.contractorMaterialSystem.upsert({
    where: { contractorId_systemKey: { contractorId, systemKey: SURFACE_RACEWAY_SYSTEM_KEY } },
    update: {},
    create: {
      contractorId,
      systemKey: SURFACE_RACEWAY_SYSTEM_KEY,
      declaredSystemLabel: "Legrand Wiremold 500/700-series metal surface raceway",
      groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR",
      supportSpacingFt: 5,
      supportAtEachTerminus: true,
      sourceTermination: "FITTING_REQUIRED",
      sourceTerminationMaterialId: transition.id,
      destinationTermination: "DIRECT_ENTRY",
      destinationTerminationMaterialId: null,
      declaredAt: new Date(),
    },
  });
}
