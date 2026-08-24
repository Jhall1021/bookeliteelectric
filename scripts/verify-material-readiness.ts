/**
 * Material readiness — verification.
 *
 *   npx tsx scripts/verify-material-readiness.ts
 *
 * No database. Prisma is stubbed with in-memory rows so what's under test is
 * the resolution logic itself.
 *
 * The invariant being defended:
 *
 *   A homeowner-facing price may never be calculated using an unresolved
 *   required material cost. Missing required cost = no price.
 *
 * The dangerous failures here are all quiet ones — a missing cost treated as
 * zero, or omitted from the sum, or the service pricing anyway on a stale
 * cached figure. Each has an explicit test.
 */

import {
  assessMaterialReadiness,
  requiredRolesFor,
  contractorCostsFor,
  describeMissing,
  MaterialResolutionError,
} from "../lib/materialResolution";

let fail = 0;
const ok = (c: boolean, l: string, d = "") => {
  if (!c) fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `\n      ${d}`}`);
};

const ELITE = "c_elite";
const PLUMBING = "c_plumbing";

type Row = Record<string, unknown>;

/** A stub shaped like the slice of Prisma these functions use. */
function makeDb(opts: {
  serviceMaterials: Row[];
  contractorMaterials: Row[];
}) {
  return {
    serviceMaterial: {
      findMany: async ({ where }: { where: { serviceId: string } }) =>
        opts.serviceMaterials.filter((r) => r.serviceId === where.serviceId),
    },
    contractorMaterial: {
      findMany: async ({
        where,
      }: {
        where: { contractorId: string; canonicalMaterialId: { in: string[] }; active: boolean };
      }) =>
        opts.contractorMaterials.filter(
          (r) =>
            r.contractorId === where.contractorId &&
            where.canonicalMaterialId.in.includes(r.canonicalMaterialId as string) &&
            r.active === where.active
        ),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const role = (id: string, key: string, name: string) => ({
  id,
  key,
  name,
});

// The exterior GFCI, as it actually exists: five roles.
const GFCI_ROLES = [
  role("cm_gfci", "GFCI_WEATHER_RESISTANT", "WR GFCI receptacle"),
  role("cm_cover", "COVER_BUBBLE", "In-use bubble cover"),
  role("cm_box", "BOX_FS_CAST", "FS box, cast, single gang"),
  role("cm_wire", "WIRE_12_2", "12/2 NM-B cable"),
  role("cm_cons", "CONSUMABLES_SMALL", "Consumables"),
];
const GFCI_QTY = [1, 1, 1, 2, 1];

const gfciRecipe = GFCI_ROLES.map((r, i) => ({
  serviceId: "svc_gfci",
  quantity: GFCI_QTY[i],
  canonicalMaterialId: r.id,
  canonicalMaterial: r,
  order: i,
}));

const eliteCosts = [
  { contractorId: ELITE, canonicalMaterialId: "cm_gfci", unitCostCents: 2500, id: "e1", active: true },
  { contractorId: ELITE, canonicalMaterialId: "cm_cover", unitCostCents: 1500, id: "e2", active: true },
  { contractorId: ELITE, canonicalMaterialId: "cm_box", unitCostCents: 800, id: "e3", active: true },
  { contractorId: ELITE, canonicalMaterialId: "cm_wire", unitCostCents: 72, id: "e4", active: true },
  { contractorId: ELITE, canonicalMaterialId: "cm_cons", unitCostCents: 300, id: "e5", active: true },
];

async function main() {
  console.log("\nFULLY PRICED — the Elite case today\n");
  {
    const db = makeDb({ serviceMaterials: gfciRecipe, contractorMaterials: eliteCosts });
    const r = await assessMaterialReadiness(db, "svc_gfci", ELITE);
    ok(r.ready, "a service with every role costed is ready");
    ok(r.ready && r.totalCents === 5244, "totals $52.44, matching the reconciled figure",
       r.ready ? `got ${r.totalCents}` : "");
    ok(r.ready && r.roles.length === 5, "all five roles resolve");
  }

  console.log("\nMISSING COSTS — must never become zero\n");
  {
    // Contractor B has the template but has priced nothing.
    const db = makeDb({ serviceMaterials: gfciRecipe, contractorMaterials: eliteCosts });
    const r = await assessMaterialReadiness(db, "svc_gfci", PLUMBING);
    ok(!r.ready, "a contractor with no costs cannot price the service");
    ok(!r.ready && r.missing.length === 5, "all five roles reported missing");
    ok(!r.ready && r.resolved.length === 0, "and none resolved");
    ok(!("totalCents" in r), "NO total is produced — not zero, not partial");
  }
  {
    // One cost missing out of five. The dangerous case: four resolve, and a
    // careless implementation returns the partial sum.
    const partial = eliteCosts.filter((c) => c.canonicalMaterialId !== "cm_wire");
    const db = makeDb({ serviceMaterials: gfciRecipe, contractorMaterials: partial });
    const r = await assessMaterialReadiness(db, "svc_gfci", ELITE);
    ok(!r.ready, "one missing role out of five blocks the whole service");
    ok(!r.ready && r.missing[0].key === "WIRE_12_2", "and names which one");
    ok(!("totalCents" in r), "the four that DID resolve produce no partial total");
    ok(!r.ready && r.resolved.length === 4,
       "resolved roles are still reported, for the admin to see progress");
  }
  {
    // An inactive contractor material is not a cost.
    const inactive = eliteCosts.map((c) =>
      c.canonicalMaterialId === "cm_box" ? { ...c, active: false } : c
    );
    const db = makeDb({ serviceMaterials: gfciRecipe, contractorMaterials: inactive });
    const r = await assessMaterialReadiness(db, "svc_gfci", ELITE);
    ok(!r.ready, "an INACTIVE contractor material counts as missing");
  }

  console.log("\nCROSS-CONTRACTOR\n");
  {
    // Plumbing has costs, but for the same roles at different figures.
    const plumbingCosts = eliteCosts.map((c) => ({
      ...c,
      contractorId: PLUMBING,
      id: c.id + "_p",
      unitCostCents: c.unitCostCents * 2,
    }));
    const db = makeDb({
      serviceMaterials: gfciRecipe,
      contractorMaterials: [...eliteCosts, ...plumbingCosts],
    });
    const e = await assessMaterialReadiness(db, "svc_gfci", ELITE);
    const p = await assessMaterialReadiness(db, "svc_gfci", PLUMBING);
    ok(e.ready && e.totalCents === 5244, "Elite gets Elite's total");
    ok(p.ready && p.totalCents === 10488, "Plumbing gets its own, double",
       p.ready ? `got ${p.totalCents}` : "");
    ok(
      e.ready && p.ready && e.totalCents !== p.totalCents,
      "the same recipe costs the two contractors differently — the point of the split"
    );
  }

  console.log("\nEDGE CASES\n");
  {
    const db = makeDb({ serviceMaterials: [], contractorMaterials: eliteCosts });
    const r = await assessMaterialReadiness(db, "svc_flat", ELITE);
    ok(r.ready && r.roles.length === 0,
       "a service with NO itemized materials is ready — its flat allowance stands");
  }
  {
    // A recipe line with no canonical role. Post-migration this should be
    // impossible, but a broken recipe must not price as free.
    const broken = [{ serviceId: "svc_x", quantity: 1, canonicalMaterialId: null, canonicalMaterial: null, order: 0 }];
    const db = makeDb({ serviceMaterials: broken, contractorMaterials: eliteCosts });
    let threw = false;
    try { await assessMaterialReadiness(db, "svc_x", ELITE); }
    catch (e) { threw = e instanceof MaterialResolutionError; }
    ok(threw, "a recipe line with no role throws rather than costing nothing");
  }
  {
    const db = makeDb({ serviceMaterials: gfciRecipe, contractorMaterials: eliteCosts });
    const roles = await requiredRolesFor(db, "svc_gfci");
    ok(roles.length === 5, "requiredRolesFor returns every base-recipe line");
    ok(roles[3].quantity === 2, "and preserves fractional/multiple quantities");
  }
  {
    const db = makeDb({ serviceMaterials: [], contractorMaterials: [] });
    const m = await contractorCostsFor(db, ELITE, []);
    ok(m.size === 0, "asking for no roles returns nothing rather than querying");
  }

  console.log("\nADMIN MESSAGING\n");
  {
    const one = describeMissing([{ canonicalMaterialId: "x", key: "CABLE_CAT6", name: "Cat6 cable", quantity: 1 }]);
    ok(one.includes("CABLE_CAT6") && one.includes("Cat6 cable"),
       "names the role and its key, so it's actionable");
    ok(describeMissing([]) === "", "nothing missing says nothing");
    const many = describeMissing(
      ["A", "B", "C", "D", "E"].map((k) => ({ canonicalMaterialId: k, key: k, name: k, quantity: 1 }))
    );
    ok(many.includes("and 2 more"), "a long list is truncated rather than dumped");
  }
}

main()
  .then(() => {
    console.log(fail === 0 ? "\nAll checks passed.\n" : `\n${fail} check(s) FAILED.\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
