/**
 * Component material recipes — Electrical Template v1.1 §3.1, Phase A.
 *
 * A component role can now say what it PHYSICALLY consumes instead of carrying
 * a dollar constant that goes stale the moment a supplier moves. This proves
 * the three properties that make converting them safe:
 *
 *   1. A component with no recipe still uses its constant, so the library can
 *      be converted one role at a time without mispricing in between.
 *   2. A recipe REPLACES the constant rather than adding to it — the constant
 *      was always meant to be those same materials.
 *   3. A recipe naming a role the contractor has never costed fails closed:
 *      review, not a cheaper price.
 *
 *   npx tsx scripts/verify-component-recipes.ts
 */
import { pathToFileURL } from "node:url";
import { applyBranch, startConfiguration } from "../lib/pricing";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const base = () =>
  startConfiguration({ estimatedMinutes: 60, requiresTechCount: 1, fieldLaborHours: 1, materialCostCents: 0 });

const component = (over: Record<string, unknown>) => ({
  quantity: 1,
  component: {
    key: "TEST", customerFacingLabel: "Test", approvedPriceCents: 0,
    addFieldLaborHours: 0, addMaterialCostCents: 0, addScheduleMinutes: 0, addTechCount: 0,
    ...over,
  },
});

function main() {
  console.log("\nCOMPONENT MATERIAL RECIPES\n");

  console.log("  UNCONVERTED COMPONENTS ARE UNAFFECTED");
  const legacy = applyBranch(base(), { components: [component({ addMaterialCostCents: 500 })] as any }, {});
  ok(legacy.materialCostCents === 500, "a component with no recipe still uses its dollar constant",
    `got ${legacy.materialCostCents}`);
  ok(legacy.awaitingComponentMaterialCost === false, "…and does not fail closed");

  console.log("\n  A RECIPE REPLACES THE CONSTANT, NEVER ADDS TO IT");
  const converted = applyBranch(base(), {
    components: [component({ addMaterialCostCents: 500, materialRecipe: { cents: 500, resolved: true } })] as any,
  }, {});
  ok(converted.materialCostCents === 500,
    "recipe of 500 alongside a constant of 500 yields 500, not 1000",
    `got ${converted.materialCostCents} — the two are being double counted`);

  const moved = applyBranch(base(), {
    components: [component({ addMaterialCostCents: 500, materialRecipe: { cents: 620, resolved: true } })] as any,
  }, {});
  ok(moved.materialCostCents === 620, "and the recipe is what is used when costs have moved",
    `got ${moved.materialCostCents}`);

  console.log("\n  QUANTITY MULTIPLIES THE RECIPE");
  const two = applyBranch(base(), {
    components: [{ ...component({ materialRecipe: { cents: 250, resolved: true } }), quantity: 2 }] as any,
  }, {});
  ok(two.materialCostCents === 500, "two of a 250 recipe is 500", `got ${two.materialCostCents}`);

  console.log("\n  AN UNCOSTED ROLE FAILS CLOSED");
  const unresolved = applyBranch(base(), {
    components: [component({ addMaterialCostCents: 500, materialRecipe: { cents: 0, resolved: false } })] as any,
  }, {});
  ok(unresolved.awaitingComponentMaterialCost === true,
    "an unresolved recipe flags the configuration");
  ok(unresolved.materialCostCents === 0,
    "…and contributes nothing rather than falling back to the constant",
    `got ${unresolved.materialCostCents} — a stale constant standing in for an unknown cost is the bug this replaces`);

  console.log("\n  THE FLAG SURVIVES LATER ANSWERS");
  const carried = applyBranch(unresolved, { components: [component({ addMaterialCostCents: 100 })] as any }, {});
  ok(carried.awaitingComponentMaterialCost === true,
    "a later clean answer does not clear an earlier unresolved recipe");

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
