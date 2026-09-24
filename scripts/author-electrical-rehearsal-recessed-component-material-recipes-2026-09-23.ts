/**
 * Replace the two superseded additional-recessed-light material recipes on
 * the designated rehearsal branch. The only accepted old shape is the
 * historical wafer + 10 ft wire + per-job consumables package. Any other
 * existing shape fails closed.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES } from "../lib/electrical/recessedLightingComponentPackages";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";

const SUPERSEDED_RECIPE = [
  { role: "CONSUMABLES_SMALL", quantity: 1 },
  { role: "RECESSED_WAFER", quantity: 1 },
  { role: "WIRE_14_2", quantity: 10 },
] as const;

const signature = (lines: readonly { role: string; quantity: number }[]) =>
  JSON.stringify([...lines].sort((a, b) => a.role.localeCompare(b.role)));

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const componentKeys = RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES.map((recipe) => recipe.componentKey);
    const materialKeys = [...new Set(RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES.flatMap((recipe) => recipe.lines.map((line) => line.role)))];
    const [components, materials] = await Promise.all([
      db.canonicalComponent.findMany({
        where: { key: { in: componentKeys } },
        include: { materials: { include: { canonicalMaterial: { select: { key: true } } } } },
      }),
      db.canonicalMaterial.findMany({ where: { key: { in: materialKeys } }, select: { id: true, key: true, unit: true } }),
    ]);
    if (components.length !== componentKeys.length) {
      const found = new Set(components.map((component) => component.key));
      throw new Error(`missing components: ${componentKeys.filter((key) => !found.has(key)).join(", ")}`);
    }
    if (materials.length !== materialKeys.length) {
      const found = new Set(materials.map((material) => material.key));
      throw new Error(`missing materials: ${materialKeys.filter((key) => !found.has(key)).join(", ")}`);
    }
    const componentsByKey = new Map(components.map((component) => [component.key, component]));
    const materialsByKey = new Map(materials.map((material) => [material.key, material]));
    if (materialsByKey.get("WIRE_14_2")?.unit !== "ft") throw new Error("WIRE_14_2 must be priced per foot");
    for (const role of ["RECESSED_WAFER", "NM_CABLE_SUPPORT"]) {
      if (materialsByKey.get(role)?.unit !== "each") throw new Error(`${role} must be priced per used item`);
    }

    console.log(`\nELECTRICAL RECESSED COMPONENT MATERIAL RECIPES — ${apply ? "AUTHOR" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}\n`);
    const pending = [] as typeof RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES[number][];
    for (const recipe of RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES) {
      const component = componentsByKey.get(recipe.componentKey)!;
      const current = component.materials.map((line) => ({ role: line.canonicalMaterial.key, quantity: line.quantity }));
      const currentSignature = signature(current);
      const desiredSignature = signature(recipe.lines);
      if (currentSignature !== desiredSignature && currentSignature !== signature(SUPERSEDED_RECIPE)) {
        throw new Error(`${recipe.componentKey} has an unrecognized physical recipe; refusing to overwrite it`);
      }
      if (currentSignature !== desiredSignature) pending.push(recipe);
      console.log(`  ${recipe.componentKey}: ${currentSignature === desiredSignature ? "already current" : apply ? "replace superseded recipe" : "would replace superseded recipe"}`);
      for (const line of recipe.lines) console.log(`    ${line.quantity} ${materialsByKey.get(line.role)!.unit} ${line.role}`);
    }
    if (!apply) {
      console.log(`\n  would replace ${pending.length} recipe(s); no change\n`);
      return;
    }

    await db.$transaction(async (tx) => {
      for (const recipe of pending) {
        const component = componentsByKey.get(recipe.componentKey)!;
        await tx.canonicalComponentMaterial.deleteMany({ where: { canonicalComponentId: component.id } });
        for (const [order, line] of recipe.lines.entries()) {
          await tx.canonicalComponentMaterial.create({
            data: {
              canonicalComponentId: component.id,
              canonicalMaterialId: materialsByKey.get(line.role)!.id,
              quantity: line.quantity,
              order,
            },
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(`\n  replaced ${pending.length} canonical component recipe(s)\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
