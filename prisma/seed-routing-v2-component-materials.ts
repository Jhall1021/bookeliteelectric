/**
 * Which canonical MATERIAL ROLE each surface-route component consumes.
 *
 * Only the relationships that are unambiguously ONE-TO-ONE. A turn consumes
 * one elbow of its own kind; an endpoint box consumes one box; a foot of route
 * consumes a foot of channel. Nothing here derives, rounds, or segments —
 * joint covers depend on how a run is cut from stock, and that is the takeoff
 * layer's problem, not a fixed quantity on a recipe line.
 *
 * The three turns map to three DIFFERENT roles, which is the whole point of
 * keeping them separate as questions.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** component key -> [material role key, quantity per unit of that component] */
export const SURFACE_COMPONENT_MATERIALS: [string, string, number][] = [
  ["SURFACE_ROUTE_FT", "SURFACE_RACEWAY_CHANNEL", 1],
  ["SURFACE_ROUTE_INSIDE_CORNER", "SURFACE_RACEWAY_ELBOW_INSIDE", 1],
  ["SURFACE_ROUTE_OUTSIDE_CORNER", "SURFACE_RACEWAY_ELBOW_OUTSIDE", 1],
  ["SURFACE_ROUTE_FLAT_CORNER", "SURFACE_RACEWAY_ELBOW_FLAT", 1],
  ["SURFACE_DEVICE_BOX_OUTLET", "SURFACE_DEVICE_BOX_1G", 1],
  ["SURFACE_DEVICE_BOX_SWITCH", "SURFACE_DEVICE_BOX_1G", 1],
];

export async function seedSurfaceComponentMaterials(db: PrismaClient = prisma) {
  let n = 0;
  for (const [componentKey, materialKey, quantity] of SURFACE_COMPONENT_MATERIALS) {
    const c = await db.canonicalComponent.findUnique({ where: { key: componentKey }, select: { id: true } });
    const m = await db.canonicalMaterial.findUnique({ where: { key: materialKey }, select: { id: true } });
    if (!c) throw new Error(`No canonical component "${componentKey}"`);
    if (!m) throw new Error(`No canonical material role "${materialKey}"`);
    await db.canonicalComponentMaterial.upsert({
      where: { canonicalComponentId_canonicalMaterialId: { canonicalComponentId: c.id, canonicalMaterialId: m.id } },
      update: { quantity },
      create: { canonicalComponentId: c.id, canonicalMaterialId: m.id, quantity, order: n },
    });
    n++;
  }
  return n;
}

if (process.argv[1] && process.argv[1].endsWith("seed-routing-v2-component-materials.ts")) {
  seedSurfaceComponentMaterials()
    .then(async (n) => { console.log(`\n  ${n} component->role recipe lines.\n`); await prisma.$disconnect(); })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
