/**
 * Tenant isolation — LIVE test against the real database.
 *
 *   npx tsx scripts/verify-tenant-isolation-live.ts
 *
 * WHY THIS EXISTS RATHER THAN MORE UNIT TESTS
 *
 * The previous attempt at this guard was verified by tests that called its
 * own decision function. They passed. The mechanism was broken anyway,
 * because the part that was wrong lived in how Prisma's extension API was
 * used, not in the decision. A test that mirrors its subject cannot see that.
 *
 * So this runs the real extension, against a real client, against the real
 * database, and reports what actually comes back.
 *
 * SAFETY
 *
 * It creates a throwaway contractor and writes ONLY under that contractor.
 *
 * Elite's row counts are recorded before and after and compared. If a single
 * row of Elite's data changes, the run stops and says so — because a broken
 * guard is exactly the condition under which a cleanup could delete the wrong
 * thing.
 *
 * Cleanup runs at the end. If the run dies partway, the dummy contractor is
 * left behind on purpose; scripts/cleanup-isolation-test.ts removes it.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "../lib/tenantGuard";
import {
  withTenant,
  asPlatform,
  NoTenantContextError,
  CrossTenantError,
} from "../lib/tenantContext";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;

const DUMMY_SLUG = "test-isolation-dummy";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `\n      ${detail}`}`);
}

/** Run something and report which error came back, if any. */
async function attempt<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: Error }> {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: e as Error };
  }
}

async function main() {
  console.log(`\nTENANT ISOLATION — live\n`);

  // ---- setup -------------------------------------------------------------
  const elite = await raw.contractor.findUnique({ where: { slug: "elite-electric" } });
  if (!elite) {
    console.error(`No elite-electric contractor. Nothing to isolate against.\n`);
    process.exit(1);
    return;
  }

  const before = {
    materials: await raw.contractorMaterial.count({ where: { contractorId: elite.id } }),
    services: await raw.service.count({ where: { contractorId: elite.id } }),
  };
  console.log(`  Elite baseline: ${before.materials} materials, ${before.services} services\n`);

  // Clear residue from an aborted run first. A previous failure left the
  // dummy holding two materials, and the test read that as a leak — a test
  // that cannot distinguish its own leftovers from a real finding is worse
  // than no test.
  const stale = await raw.contractor.findUnique({ where: { slug: DUMMY_SLUG } });
  if (stale) {
    const n = await raw.contractorMaterial.deleteMany({ where: { contractorId: stale.id } });
    await raw.contractor.delete({ where: { id: stale.id } });
    console.log(`  Cleared residue from a previous run: ${n.count} material(s)\n`);
  }

  const dummy = await raw.contractor.upsert({
    where: { slug: DUMMY_SLUG },
    update: {},
    create: {
      slug: DUMMY_SLUG,
      name: "Demo Plumbing (isolation test)",
      trade: "residential plumber",
      active: false,
    },
  });

  // A role is platform knowledge, so the dummy reuses an existing one and
  // gives it a completely different cost.
  const role = await raw.canonicalMaterial.findFirstOrThrow({ orderBy: { key: "asc" } });
  const dummyMaterial = await raw.contractorMaterial.upsert({
    where: {
      contractorId_canonicalMaterialId: {
        contractorId: dummy.id,
        canonicalMaterialId: role.id,
      },
    },
    update: { unitCostCents: 99999 },
    create: {
      contractorId: dummy.id,
      canonicalMaterialId: role.id,
      unitCostCents: 99999,
    },
  });

  const eliteMaterial = await raw.contractorMaterial.findFirstOrThrow({
    where: { contractorId: elite.id },
  });

  console.log(`  Dummy contractor: ${dummy.name}`);
  console.log(`  Shared role: ${role.key} — Elite pays ${eliteMaterial.unitCostCents}c, dummy pays 99999c\n`);

  // ---- no context --------------------------------------------------------
  console.log(`NO CONTEXT — every tenant query must refuse\n`);
  {
    const r = await attempt(() => guarded.contractorMaterial.findMany());
    ok(r.error instanceof NoTenantContextError, "findMany outside a context throws",
       r.error ? r.error.name : `returned ${JSON.stringify(r.value).slice(0, 60)}`);
  }
  {
    const r = await attempt(() => guarded.service.count());
    ok(r.error instanceof NoTenantContextError, "count outside a context throws");
  }
  {
    // Platform models are readable without a context, by design.
    const r = await attempt(() => guarded.canonicalMaterial.count());
    ok(r.error === undefined && typeof r.value === "number",
       "platform models still readable with no context", r.error?.message);
  }

  // ---- inside the dummy's context ---------------------------------------
  console.log(`\nAS THE DUMMY CONTRACTOR — Elite's data must be invisible\n`);

  await withTenant({ contractorId: dummy.id, source: "test" }, async () => {
    {
      const r = await attempt(() => guarded.contractorMaterial.findMany());
      const rows = r.value ?? [];
      ok(r.error === undefined, "findMany succeeds", r.error?.message);
      ok(rows.length === 1, `returns only the dummy's 1 material, not Elite's ${before.materials}`,
         `got ${rows.length}`);
      ok(rows.every((m) => m.contractorId === dummy.id), "every row belongs to the dummy");
    }
    {
      // THE test. Fetching Elite's row by its primary key.
      const r = await attempt(() =>
        guarded.contractorMaterial.findUnique({ where: { id: eliteMaterial.id } })
      );
      ok(r.error === undefined, "findUnique with an injected filter is accepted by Prisma 5",
         r.error?.message);
      ok(r.value === null, "and returns NULL for Elite's row — the id is not enough",
         r.value ? `LEAKED: ${JSON.stringify(r.value).slice(0, 80)}` : "");
    }
    {
      const r = await attempt(() =>
        guarded.contractorMaterial.findFirst({ where: { id: eliteMaterial.id } })
      );
      ok(r.value === null, "findFirst cannot reach Elite's row either");
    }
    {
      const r = await attempt(() =>
        guarded.contractorMaterial.update({
          where: { id: eliteMaterial.id },
          data: { unitCostCents: 1 },
        })
      );
      ok(r.error !== undefined || r.value === null,
         "updating Elite's row fails rather than succeeding",
         r.value ? "IT UPDATED — LEAK" : r.error?.name);
    }
    {
      const r = await attempt(() =>
        guarded.contractorMaterial.deleteMany({ where: { contractorId: elite.id } })
      );
      ok(r.error instanceof CrossTenantError,
         "naming Elite's id explicitly is refused outright",
         r.error ? r.error.name : `deleted ${JSON.stringify(r.value)}`);
    }
    {
      const r = await attempt(() => guarded.contractorMaterial.count());
      ok(r.value === 1, "count sees only the dummy's row", `got ${r.value}`);
    }
    {
      const r = await attempt(() => guarded.service.findMany());
      ok((r.value ?? []).length === 0,
         `services: dummy has none, Elite's ${before.services} are invisible`,
         `got ${(r.value ?? []).length}`);
    }
    {
      // A create must be stamped with the dummy, even if it says otherwise.
      const r = await attempt(() =>
        guarded.canonicalMaterial.findFirst({
          where: { key: { not: role.key } },
          orderBy: { key: "asc" },
        })
      );
      const other = r.value;
      if (other) {
        const c = await attempt(() =>
          guarded.contractorMaterial.create({
            data: { canonicalMaterialId: other.id, unitCostCents: 4242 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
        );
        ok(c.error === undefined, "create without a contractorId succeeds", c.error?.message);
        ok(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c.value as any)?.contractorId === dummy.id,
          "and is stamped with the dummy automatically"
        );
      }
    }
    {
      // Concurrency — the reported extendedWhereUnique bug on models with a
      // compound unique constraint, which ContractorMaterial has.
      const results = await Promise.all([
        guarded.contractorMaterial.findUnique({ where: { id: dummyMaterial.id } }),
        guarded.contractorMaterial.findUnique({ where: { id: dummyMaterial.id } }),
        guarded.contractorMaterial.findUnique({ where: { id: dummyMaterial.id } }),
      ]);
      ok(
        results.every((r) => r !== null),
        "concurrent findUnique on a compound-unique model returns the row every time",
        `got ${results.map((r) => (r ? "row" : "NULL")).join(", ")}`
      );
    }
  });

  // ---- context isolation -------------------------------------------------
  console.log(`\nCONTEXT\n`);
  {
    // Read the true counts first rather than assuming them. An earlier
    // version asserted the dummy had exactly one material and failed when
    // the create-stamping test above legitimately added a second — a test
    // asserting a stale constant, not a guard fault.
    const expectDummy = await raw.contractorMaterial.count({
      where: { contractorId: dummy.id },
    });
    const expectElite = await raw.contractorMaterial.count({
      where: { contractorId: elite.id },
    });

    const seen = new Map<string, number>();
    await Promise.all([
      withTenant({ contractorId: elite.id, source: "test" }, async () => {
        await new Promise((r) => setTimeout(r, 25));
        seen.set("elite", await guarded.contractorMaterial.count());
      }),
      withTenant({ contractorId: dummy.id, source: "test" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.set("dummy", await guarded.contractorMaterial.count());
      }),
    ]);

    ok(
      seen.get("elite") === expectElite && seen.get("dummy") === expectDummy,
      "interleaved requests each see only their own contractor",
      `elite saw ${seen.get("elite")} (own ${expectElite}), ` +
        `dummy saw ${seen.get("dummy")} (own ${expectDummy})`
    );
    // The property that actually matters: neither saw the other's rows.
    ok(
      seen.get("elite") !== seen.get("dummy") || expectElite === expectDummy,
      "and the two counts are genuinely different, so neither read the other's"
    );
  }
  {
    await asPlatform(async () => {
      const r = await attempt(() => guarded.contractorMaterial.count());
      ok(r.error instanceof NoTenantContextError,
         "asPlatform does not grant cross-tenant reads — it removes context");
    });
  }

  // ---- Elite untouched ---------------------------------------------------
  console.log(`\nELITE'S DATA\n`);
  const after = {
    materials: await raw.contractorMaterial.count({ where: { contractorId: elite.id } }),
    services: await raw.service.count({ where: { contractorId: elite.id } }),
  };
  const untouched = after.materials === before.materials && after.services === before.services;
  ok(untouched, "not one row of Elite's data changed",
     `materials ${before.materials}->${after.materials}, services ${before.services}->${after.services}`);

  const costNow = await raw.contractorMaterial.findUnique({ where: { id: eliteMaterial.id } });
  ok(costNow?.unitCostCents === eliteMaterial.unitCostCents,
     "and Elite's cost is unchanged",
     `${eliteMaterial.unitCostCents} -> ${costNow?.unitCostCents}`);

  // ---- cleanup -----------------------------------------------------------
  if (!untouched) {
    console.error(`\n  REFUSING TO CLEAN UP — Elite's data moved. Investigate first.\n`);
    process.exitCode = 1;
    return;
  }

  await raw.contractorMaterial.deleteMany({ where: { contractorId: dummy.id } });
  await raw.contractor.delete({ where: { id: dummy.id } });
  console.log(`\n  Dummy contractor removed.`);

  console.log(
    fail === 0
      ? `\n${pass} checks passed.\n`
      : `\n${fail} of ${pass + fail} checks FAILED.\n`
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      console.error(
        `\nRun scripts/cleanup-isolation-test.ts to remove the dummy contractor.\n`
      );
      process.exit(1);
    })
    .finally(async () => {
      await raw.$disconnect();
      await (guarded as unknown as PrismaClient).$disconnect();
    });
}
