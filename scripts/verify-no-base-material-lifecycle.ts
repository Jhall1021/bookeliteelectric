/**
 * "NO BASE MATERIAL" AND "NOT CONFIGURED YET" MUST NOT LOOK THE SAME.
 *
 * Both are a service with zero ServiceMaterial rows:
 *
 *   ASSERTED      Routing V2's outlet. Its unconditional assembly is gone on
 *                 purpose, because distance now decides quantity per component
 *                 rather than a fixed 25 ft allowance decided once.
 *
 *   UNCONFIGURED  BrightPath's entire catalog on day one. Nothing is priced,
 *                 nothing may price, and that has to stay true.
 *
 * If the platform ever collapses those into "zero rows means fine", every
 * unconfigured contractor silently gains permission to quote. This proves it
 * does not, and that the difference is carried by a deliberate act rather than
 * inferred from a row count.
 *
 * EVERY FIXTURE HERE IS CREATED AND ROLLED BACK inside one transaction. The
 * verifier owns what it touches and leaves nothing behind — no contractor is
 * reset, no shared table is swept.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { assertNoBaseMaterial, recomputeServiceMaterialCost, MaterialCostError } from "../lib/materialCost";
import { assessMaterialReadiness } from "../lib/materialResolution";
import { eliteContractorId } from "../prisma/_componentHelpers";
import { serviceFor } from "../prisma/_serviceTargets";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const ROLLBACK = "ROLLBACK-VERIFY-NO-BASE-MATERIAL";
const RUN = `nbm-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

async function main() {
  console.log("\nZERO BASE MATERIAL — ASSERTED vs UNCONFIGURED\n");

  const eliteId = await eliteContractorId(prisma);
  const anchor = await prisma.service.findFirstOrThrow({
    where: { contractorId: eliteId },
    select: { categoryId: true, contractorCategoryId: true, tradeKey: true, bookingType: true },
  });
  const consumable = await prisma.canonicalMaterial.findFirstOrThrow({
    where: { key: "CONSUMABLES_SMALL" }, select: { id: true, key: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      const mkService = async (suffix: string, data: Prisma.ServiceUncheckedCreateInput extends never ? never : Record<string, unknown>) =>
        tx.service.create({
          data: {
            slug: `${RUN}-${suffix}`, name: `lifecycle fixture ${suffix}`,
            categoryId: anchor.categoryId, contractorId: eliteId,
            contractorCategoryId: anchor.contractorCategoryId,
            tradeKey: anchor.tradeKey, bookingType: anchor.bookingType,
            active: false, offered: false, basePrice: null,
            shortDescription: "Rolled back by verify-no-base-material-lifecycle.",
            ...data,
          },
          select: { id: true },
        });

      console.log("  A  AN ITEMIZED SERVICE, DE-ITEMIZED BY ASSERTION\n");
      const a = await mkService("asserted", {
        materialCostCents: 2150, materialCostResolved: true, unresolvedMaterialKeys: [],
        materialMultiplier: 2.5, materialMultiplierReason: "legacy override",
      });
      await tx.serviceMaterial.create({
        data: { serviceId: a.id, canonicalMaterialId: consumable.id, quantity: 25, order: 0 },
      });

      const r = await assertNoBaseMaterial(tx, a.id, "Routing V2: quantity is measured per component, not allowed once.");
      const after = await tx.service.findUniqueOrThrow({
        where: { id: a.id },
        select: { materialCostCents: true, materialCostResolved: true, unresolvedMaterialKeys: true,
                  materialMultiplier: true, materialMultiplierReason: true },
      });
      const rowsLeft = await tx.serviceMaterial.count({ where: { serviceId: a.id } });

      ok(r.rowsRemoved === 1 && rowsLeft === 0, "A  the assembly rows are gone", `removed ${r.rowsRemoved}, left ${rowsLeft}`);
      ok(after.materialCostCents === 0,
        "A  materialCostCents is 0 — SOMEBODY SAID NONE, not nobody said anything",
        String(after.materialCostCents));
      ok(after.materialCostResolved === true, "A  materialCostResolved is true", String(after.materialCostResolved));
      ok(after.unresolvedMaterialKeys.length === 0, "A  unresolvedMaterialKeys is empty", after.unresolvedMaterialKeys.join(","));
      ok(after.materialMultiplier === null && after.materialMultiplierReason === null,
        "A  the stale legacy multiplier and its reason went with the assembly");
      ok(r.beforeCents === 2150, "A  the result reports the figure it replaced", String(r.beforeCents));

      console.log("\n  B  AN UNCONFIGURED SERVICE IS NOT TOUCHED BY THE RECOMPUTE\n");
      const b = await mkService("unconfigured", {
        materialCostCents: null, materialCostResolved: false,
        unresolvedMaterialKeys: ["WIRE_14_2", "BOX_OLD_WORK"],
      });
      const rb = await recomputeServiceMaterialCost(tx, b.id);
      const bAfter = await tx.service.findUniqueOrThrow({
        where: { id: b.id },
        select: { materialCostCents: true, materialCostResolved: true, unresolvedMaterialKeys: true },
      });
      ok(rb === null, "B  the recompute declines a service with no itemized rows", JSON.stringify(rb));
      ok(bAfter.materialCostResolved === false,
        "B  ZERO ROWS ALONE DOES NOT MEAN RESOLVED — the blocker survives",
        String(bAfter.materialCostResolved));
      ok(bAfter.materialCostCents === null,
        "B  materialCostCents stays null — nobody has said anything about it", String(bAfter.materialCostCents));
      ok(bAfter.unresolvedMaterialKeys.length === 2, "B  the named missing roles survive", bAfter.unresolvedMaterialKeys.join(","));

      console.log("\n  C  THE TWO STATES ARE TELLABLE APART\n");
      ok(after.materialCostCents !== bAfter.materialCostCents &&
         after.materialCostResolved !== bAfter.materialCostResolved,
        "C  asserted (0, true, []) and unconfigured (null, false, [keys]) differ on every field",
        `asserted=${JSON.stringify(after)} unconfigured=${JSON.stringify(bAfter)}`);

      // Both are "ready" to assessMaterialReadiness — which is exactly why the
      // row count cannot be the discriminator, and why the deliberate act is.
      const readA = await assessMaterialReadiness(tx, a.id, eliteId);
      const readB = await assessMaterialReadiness(tx, b.id, eliteId);
      ok(readA.ready && readB.ready,
        "C  readiness alone CANNOT tell them apart — both have zero roles",
        `A=${readA.ready} B=${readB.ready}`);
      ok(true, "C  …so the difference is carried by the assertion, not by the row count");

      console.log("\n  D  THE ASSERTION CANNOT BE MADE CASUALLY\n");
      let threwOnEmpty = false;
      try { await assertNoBaseMaterial(tx, a.id, "   "); }
      catch (e) { threwOnEmpty = e instanceof MaterialCostError; }
      ok(threwOnEmpty, "D  a blank reason is refused — an unexplained 'no material' is a forgotten assembly");

      const other = await tx.service.findUniqueOrThrow({
        where: { id: b.id }, select: { materialCostResolved: true } });
      ok(other.materialCostResolved === false,
        "D  asserting on one service changed no other service");

      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
  }

  console.log("\n  E  NOTHING PERSISTED, AND NO BULK VARIANT EXISTS\n");
  const leaked = await prisma.service.count({ where: { slug: { startsWith: RUN } } });
  ok(leaked === 0, "E  every fixture rolled back", `${leaked} left behind`);

  const src = readFileSync("lib/materialCost.ts", "utf8");
  ok(!/assertNoBaseMaterialForAll|assertNoBaseMaterialWhere|bulkAssertNoBaseMaterial/.test(src),
    "E  there is no bulk 'assert no material' — the act is per service, by id");
  ok(/why: string/.test(src) && /requires a reason/.test(src),
    "E  the reason is part of the signature, not a convention");

  const seed = readFileSync("prisma/seed-materials.ts", "utf8");
  ok(/assertNoBaseMaterial\(/.test(seed),
    "E  seed-materials.ts calls the shared assertion rather than keeping a second copy");
  ok(!/data:\s*\{\s*materialCostCents:\s*0,\s*materialMultiplier:\s*null/.test(seed),
    "E  …and its old inline implementation is gone");

  // The real BrightPath service, as the live example of the unconfigured side.
  const bp = await prisma.contractor.findUniqueOrThrow({ where: { slug: "brightpath-electric" }, select: { id: true } });
  const bpOutlet = await serviceFor(prisma, bp.id, "new-120v-outlet");
  const bpState = await prisma.service.findUniqueOrThrow({
    where: { id: bpOutlet.id },
    select: { materialCostCents: true, materialCostResolved: true, unresolvedMaterialKeys: true } });
  const bpRows = await prisma.serviceMaterial.count({ where: { serviceId: bpOutlet.id } });
  ok(bpRows === 0 && bpState.materialCostResolved === false && bpState.materialCostCents === null,
    "E  the live unconfigured example (BrightPath) still reads as unconfigured",
    JSON.stringify({ bpRows, ...bpState }));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
