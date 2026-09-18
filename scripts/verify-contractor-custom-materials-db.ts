/**
 * Contractor-private custom materials — disposable database proof.
 *
 * Run only on an isolated rehearsal branch whose schema already includes the
 * additive custom-material columns:
 *
 *   P2B_ALLOW_CUSTOM_MATERIAL_DB_TEST=1 DATABASE_URL=... \
 *     node --import tsx scripts/verify-contractor-custom-materials-db.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  createContractorCustomMaterial,
  MaterialCostError,
  overrideUnresolvedMaterialCost,
} from "../lib/materialCost";
import { loadMaterialCatalog } from "../lib/materialCatalog";

if (process.env.P2B_ALLOW_CUSTOM_MATERIAL_DB_TEST !== "1") {
  throw new Error("REFUSING: set P2B_ALLOW_CUSTOM_MATERIAL_DB_TEST=1 only on an isolated rehearsal branch.");
}

const db = new PrismaClient();
const stamp = `${process.pid.toString(36)}${Date.now().toString(36).slice(-6)}`;
const slugA = `test-custom-material-a-${stamp}`;
const slugB = `test-custom-material-b-${stamp}`;
const customName = `Fixture weatherproof fitting ${stamp}`;
let failures = 0;

function check(label: string, condition: boolean) {
  console.log(`  ${condition ? "✓" : "✗"} ${label}`);
  if (!condition) failures++;
}

async function cleanup() {
  const contractors = await db.contractor.findMany({
    where: { slug: { in: [slugA, slugB] } },
    select: { id: true },
  });
  const ids = contractors.map((entry) => entry.id);
  if (!ids.length) return;
  await db.materialCostEvent.deleteMany({ where: { contractorId: { in: ids } } });
  await db.contractorMaterial.deleteMany({ where: { contractorId: { in: ids } } });
  await db.canonicalMaterial.deleteMany({ where: { ownerContractorId: { in: ids } } });
  await db.contractor.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  console.log("\nCONTRACTOR-PRIVATE CUSTOM MATERIALS — DATABASE\n");
  await cleanup();

  const [a, b] = await Promise.all([
    db.contractor.create({ data: { slug: slugA, name: "Custom Material Fixture A", active: true }, select: { id: true } }),
    db.contractor.create({ data: { slug: slugB, name: "Custom Material Fixture B", active: true }, select: { id: true } }),
  ]);

  const createdA = await createContractorCustomMaterial(
    db,
    { contractorId: a.id, name: customName, unit: "each", unitCostCents: 1234 },
    { reason: "custom material database verification", actor: "test" },
  );
  check("contractor A can create a private material with its first cost", createdA.ok);
  if (!createdA.ok) throw new Error("fixture creation unexpectedly collided");

  const [catalogA, catalogB] = await Promise.all([
    loadMaterialCatalog(db, a.id),
    loadMaterialCatalog(db, b.id),
  ]);
  check(
    "the owner sees the custom material in its active catalog",
    catalogA.active.some((row) => row.canonicalMaterialId === createdA.canonicalMaterialId && row.isCustom),
  );
  check(
    "another contractor cannot see the private identity anywhere",
    ![...catalogB.active, ...catalogB.inactive, ...catalogB.missing, ...catalogB.available]
      .some((row) => row.canonicalMaterialId === createdA.canonicalMaterialId),
  );

  let foreignOverrideBlocked = false;
  try {
    await overrideUnresolvedMaterialCost(
      db,
      { contractorId: b.id, canonicalMaterialId: createdA.canonicalMaterialId, unitCostCents: 999 },
      { reason: "cross-tenant refusal probe", actor: "test" },
    );
  } catch (error) {
    foreignOverrideBlocked = error instanceof MaterialCostError;
  }
  check("another contractor cannot price the private identity by guessed id", foreignOverrideBlocked);

  const duplicateA = await createContractorCustomMaterial(
    db,
    { contractorId: a.id, name: `  ${customName.toUpperCase()}  `, unit: "each", unitCostCents: 999 },
    { reason: "duplicate refusal probe", actor: "test" },
  );
  check("case/spacing variants are duplicates within the same contractor", !duplicateA.ok && duplicateA.code === "DUPLICATE_NAME");

  const createdB = await createContractorCustomMaterial(
    db,
    { contractorId: b.id, name: customName, unit: "each", unitCostCents: 777 },
    { reason: "same name in another tenant", actor: "test" },
  );
  check("the same custom name is valid for a different contractor", createdB.ok);

  const events = await db.materialCostEvent.groupBy({
    by: ["contractorId"],
    where: { contractorId: { in: [a.id, b.id] } },
    _count: { _all: true },
  });
  const eventCounts = new Map(events.map((entry) => [entry.contractorId, entry._count._all]));
  check("each successful create wrote exactly one cost event", eventCounts.get(a.id) === 1 && eventCounts.get(b.id) === 1);

  if (failures) throw new Error(`${failures} database check(s) failed`);
  console.log("\nAll custom-material database checks passed.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((error) => console.error("fixture cleanup failed", error));
    await db.$disconnect();
  });
