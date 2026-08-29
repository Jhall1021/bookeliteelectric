/**
 * Phase B — convert lump-sum component material into physical recipes.
 * Electrical Template v1.1 §3.1, §4.1, §4.2, §20 Phase B.
 *
 * Only roles whose physical composition is actually KNOWN. Each conversion
 * below reconciles to the cent against the reference costs, and the script
 * refuses to write any recipe that does not — matching a dollar amount is the
 * evidence that the composition was understood, not a target to hit.
 *
 * Recipes live on the CANONICAL component (§1.1): what the work consumes is a
 * trade fact. What it costs stays on ContractorMaterial, which is why the
 * verification below is expressed against a named contractor's costs rather
 * than baked in.
 *
 * The legacy addMaterialCostCents is deliberately LEFT IN PLACE. It is ignored
 * while a recipe exists (applyBranch prefers the recipe), so it costs nothing,
 * and it remains a readable record of what the constant was — plus a fallback
 * if a recipe is ever removed.
 *
 *   npx tsx scripts/convert-component-recipes.ts            # report only
 *   npx tsx scripts/convert-component-recipes.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const REFERENCE_CONTRACTOR = arg("contractor") ?? "elite-electric";
const APPLY = process.argv.includes("--apply");

/**
 * Each entry states the physical package and the constant it must reproduce.
 *
 * `expectCents` is not the source of the recipe — it is the check on it. A
 * recipe that does not reproduce the constant means either the composition is
 * wrong or a cost has moved since the constant was written, and both are
 * reasons to stop rather than to write.
 */
const CONVERSIONS: {
  component: string;
  expectCents: number;
  why: string;
  recipe: { role: string; quantity: number }[];
}[] = [
  {
    component: "OUTLET_RUN_ACCESSIBLE_10_20",
    expectCents: 500,
    why: "the extra ten feet of cable a 10–20 ft run consumes over a short one",
    recipe: [{ role: "WIRE_14_2", quantity: 10 }],
  },
  {
    component: "OUTLET_RUN_FINISHED_10_20",
    expectCents: 500,
    why: "same ten feet; the finished route differs in labour, not in material",
    recipe: [{ role: "WIRE_14_2", quantity: 10 }],
  },
  {
    component: "EXT_GFCI_RUN_ACCESSIBLE_10_20",
    expectCents: 720,
    why: "ten feet of 12/2 — exterior GFCI circuits run the heavier gauge",
    recipe: [{ role: "WIRE_12_2", quantity: 10 }],
  },
  {
    component: "EXT_GFCI_RUN_FINISHED_10_20",
    expectCents: 720,
    why: "same ten feet of 12/2",
    recipe: [{ role: "WIRE_12_2", quantity: 10 }],
  },
  {
    component: "RECESSED_ADDITIONAL_ACCESSIBLE",
    expectCents: 3800,
    why: "one more can: the fixture, the cable to reach it, and consumables",
    recipe: [
      { role: "RECESSED_WAFER", quantity: 1 },
      { role: "WIRE_14_2", quantity: 10 },
      { role: "CONSUMABLES_SMALL", quantity: 1 },
    ],
  },
  {
    component: "RECESSED_ADDITIONAL_FINISHED",
    expectCents: 3800,
    why: "same package; the finished ceiling costs labour, not material",
    recipe: [
      { role: "RECESSED_WAFER", quantity: 1 },
      { role: "WIRE_14_2", quantity: 10 },
      { role: "CONSUMABLES_SMALL", quantity: 1 },
    ],
  },
  {
    component: "LED_DIMMER_UPGRADE",
    expectCents: 3000,
    why: "the dimmer itself",
    recipe: [{ role: "DIMMER_LED", quantity: 1 }],
  },
];

async function main() {
  const ref = await prisma.contractor.findUnique({
    where: { slug: REFERENCE_CONTRACTOR },
    select: { id: true, name: true },
  });
  if (!ref) throw new Error(`No contractor "${REFERENCE_CONTRACTOR}" to check costs against.`);

  const costs = new Map(
    (await prisma.contractorMaterial.findMany({
      where: { contractorId: ref.id },
      select: { unitCostCents: true, canonicalMaterial: { select: { key: true, id: true } } },
    })).map((m) => [m.canonicalMaterial.key, { id: m.canonicalMaterial.id, cents: m.unitCostCents }]),
  );

  console.log(`\nPHASE B — COMPONENT RECIPES${APPLY ? "" : "   (report only — pass --apply to write)"}`);
  console.log(`  checked against ${ref.name}'s costs\n`);

  let refused = 0, written = 0, already = 0;

  for (const c of CONVERSIONS) {
    const component = await prisma.canonicalComponent.findUnique({
      where: { key: c.component },
      select: { id: true, materials: { select: { id: true } } },
    });
    if (!component) { console.log(`  REFUSE ${c.component} — no such canonical component`); refused++; continue; }

    // Price the proposed package at the reference contractor's costs.
    let total = 0, missing: string[] = [];
    for (const line of c.recipe) {
      const cost = costs.get(line.role);
      if (!cost) { missing.push(line.role); continue; }
      total += cost.cents * line.quantity;
    }
    if (missing.length) {
      console.log(`  REFUSE ${c.component} — no cost for ${missing.join(", ")}`);
      refused++; continue;
    }

    const detail = c.recipe.map((l) => `${l.role}×${l.quantity}`).join(" + ");
    if (total !== c.expectCents) {
      console.log(`  REFUSE ${c.component}`);
      console.log(`         ${detail} = $${(total / 100).toFixed(2)}, expected $${(c.expectCents / 100).toFixed(2)}`);
      console.log(`         Either the composition is wrong or a cost has moved. Not written.`);
      refused++; continue;
    }

    if (component.materials.length > 0) {
      console.log(`  ok     ${c.component.padEnd(32)} already converted`);
      already++; continue;
    }

    console.log(`  ${APPLY ? "WRITE " : "would "} ${c.component.padEnd(32)} ${detail} = $${(total / 100).toFixed(2)}`);
    console.log(`         ${c.why}`);

    if (APPLY) {
      for (const [i, line] of c.recipe.entries()) {
        await prisma.canonicalComponentMaterial.create({
          data: {
            canonicalComponentId: component.id,
            canonicalMaterialId: costs.get(line.role)!.id,
            quantity: line.quantity,
            order: i,
          },
        });
      }
      written++;
    }
  }

  console.log(`\n  ${written} written · ${already} already converted · ${refused} refused`);
  if (!APPLY) console.log(`  Nothing was changed.`);
  console.log();
  await prisma.$disconnect();
  process.exit(refused === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
