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
import { withTenantGuard, NotYetTenantScopedError } from "../lib/tenantGuard";
import { loadOwnComponents } from "../lib/contractorComponents";
import {
  withTenant,
  asPlatform,
  NoTenantContextError,
  CrossTenantError,
} from "../lib/tenantContext";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;

const DUMMY_SLUG = "test-isolation-dummy";
const DUMMY_SERVICE_SLUG = "test-isolation-dummy-service";
/** Deliberately unlike any real figure, so a leak is unmistakable. */
const DUMMY_COMPONENT_PRICE = 777777;

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

/**
 * Remove everything the dummy contractor owns, in dependency order.
 *
 * Question -> Service has no `onDelete`, so Prisma restricts: deleting the
 * service while questions hang off it fails. Answer options restrict against
 * questions the same way. Hence the explicit order rather than a cascade.
 */
async function purgeDummy(contractorId: string) {
  const services = await raw.service.findMany({
    where: { contractorId },
    select: { id: true },
  });
  const serviceIds = services.map((s) => s.id);
  if (serviceIds.length) {
    const questions = await raw.question.findMany({
      where: { serviceId: { in: serviceIds } },
      select: { id: true },
    });
    const questionIds = questions.map((q) => q.id);
    if (questionIds.length) {
      await raw.answerOptionPhotoGroup.deleteMany({
        where: { answerOption: { questionId: { in: questionIds } } },
      });
      await raw.answerOptionDisclaimer.deleteMany({
        where: { answerOption: { questionId: { in: questionIds } } },
      });
      await raw.answerOptionComponent.deleteMany({
        where: { answerOption: { questionId: { in: questionIds } } },
      });
      await raw.answerOption.deleteMany({ where: { questionId: { in: questionIds } } });
      await raw.questionDisclaimer.deleteMany({ where: { questionId: { in: questionIds } } });
      await raw.question.deleteMany({ where: { id: { in: questionIds } } });
    }
    await raw.pricingRule.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await raw.serviceMaterial.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await raw.service.deleteMany({ where: { id: { in: serviceIds } } });
  }
  const materials = await raw.contractorMaterial.deleteMany({ where: { contractorId } });
  await raw.contractorComponent.deleteMany({ where: { contractorId } });
  return { materials: materials.count, services: serviceIds.length };
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
    // The nested-read section writes questions and answer options, so those
    // counts are now part of what "Elite untouched" has to mean.
    questions: await raw.question.count({ where: { service: { contractorId: elite.id } } }),
    options: await raw.answerOption.count({
      where: { question: { service: { contractorId: elite.id } } },
    }),
    components: await raw.contractorComponent.count({ where: { contractorId: elite.id } }),
  };
  console.log(
    `  Elite baseline: ${before.materials} materials, ${before.services} services, ` +
      `${before.questions} questions, ${before.options} answer options\n`
  );

  // Clear residue from an aborted run first. A previous failure left the
  // dummy holding two materials, and the test read that as a leak — a test
  // that cannot distinguish its own leftovers from a real finding is worse
  // than no test.
  const stale = await raw.contractor.findUnique({ where: { slug: DUMMY_SLUG } });
  if (stale) {
    const n = await purgeDummy(stale.id);
    await raw.contractor.delete({ where: { id: stale.id } });
    console.log(
      `  Cleared residue from a previous run: ${n.materials} material(s), ` +
        `${n.services} service(s)\n`
    );
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

  // ---- nested reads ------------------------------------------------------
  //
  // WHERE DOES THE GUARD ACTUALLY EXECUTE?
  //
  // The pass-two scope narrowing found nine files that reach a
  // PENDING_TENANT_SCOPE model only through `include`/`select` from a Service
  // or Quote root — they never name the model. Whether those are genuine
  // scoping sites depends on something not yet established against this
  // database: does a Prisma query extension fire for a nested relation read,
  // or only for the top-level operation?
  //
  // The answer decides the file count, and it decides whether the guard's
  // "not yet tenant scoped" throw is a real backstop or one with a hole in
  // it. It does NOT decide whether these models need contractorId — who owns
  // the data is a separate question from where the guard runs.
  //
  // This section reports observed behaviour rather than asserting an
  // expectation, because the point is to find out.
  console.log(`\nNESTED READS — where does the guard execute?\n`);

  // The dummy needs a Service of its own to traverse from. Categories are
  // still global today, so it borrows one; that is exactly the duplication
  // the canonical/contractor split is meant to end.
  const anyCategory = await raw.serviceCategory.findFirstOrThrow({ orderBy: { slug: "asc" } });
  const dummyService = await raw.service.upsert({
    where: { slug: DUMMY_SERVICE_SLUG },
    update: {},
    // No basePrice, deliberately. Nothing here may publish a price — see
    // scripts/audit-price-writers.ts. REMOTE_QUOTE with a null base is a
    // legitimate row.
    create: {
      slug: DUMMY_SERVICE_SLUG,
      name: "Isolation Test Service",
      categoryId: anyCategory.id,
      bookingType: "REMOTE_QUOTE",
      contractorId: dummy.id,
      active: false,
    },
  });
  const dummyQuestion = await raw.question.create({
    data: {
      serviceId: dummyService.id,
      key: "isolation_probe",
      prompt: "Does the guard see this?",
      inputType: "SINGLE_SELECT",
      order: 0,
    },
  });
  await raw.answerOption.create({
    data: {
      questionId: dummyQuestion.id,
      label: "probe",
      value: "probe",
      routeAction: "REMOTE_QUOTE",
      order: 0,
    },
  });

  // Elite's equivalents, so a leak has something recognisable to leak.
  const eliteQuestions = await raw.question.count({
    where: { service: { contractorId: elite.id } },
  });
  const eliteOwnComponents = await raw.contractorComponent.findMany({
    where: { contractorId: elite.id },
    select: { canonicalComponentId: true, approvedPriceCents: true },
    orderBy: { canonicalComponentId: "asc" },
  });
  const eliteContractorComponents = eliteOwnComponents.length;
  if (eliteContractorComponents === 0) {
    console.error(`\n  Elite has priced no components. The nested-read section proves nothing.\n`);
    process.exit(1);
    return;
  }
  const eliteCanonicalIds = eliteOwnComponents.map((c) => c.canonicalComponentId);
  const eliteComponent = eliteOwnComponents[0];

  // The dummy prices the SAME canonical role at a wildly different figure.
  // That is what makes "returns only its own" a real claim rather than an
  // empty-set tautology: both contractors have a row for this role.
  const sharedCanonicalId = eliteComponent.canonicalComponentId;
  await raw.contractorComponent.upsert({
    where: {
      contractorId_canonicalComponentId: {
        contractorId: dummy.id,
        canonicalComponentId: sharedCanonicalId,
      },
    },
    update: { approvedPriceCents: DUMMY_COMPONENT_PRICE },
    create: {
      contractorId: dummy.id,
      canonicalComponentId: sharedCanonicalId,
      approvedPriceCents: DUMMY_COMPONENT_PRICE,
    },
  });
  console.log(
    `  Dummy owns 1 service, 1 question, 1 answer option, 1 contractor component.\n` +
      `  Elite owns ${eliteQuestions} questions and ${eliteContractorComponents} contractor components.\n` +
      `  Shared role priced at ${DUMMY_COMPONENT_PRICE}c by the dummy, ` +
      `${eliteComponent.approvedPriceCents}c by Elite.\n`
  );

  await withTenant({ contractorId: dummy.id, source: "test" }, async () => {
    // --- the control. A direct query must still throw. -------------------
    {
      const r = await attempt(() => guarded.question.findMany());
      ok(
        r.error instanceof NotYetTenantScopedError,
        "CONTROL — a direct query of Question (pending) throws",
        r.error ? r.error.name : `returned ${(r.value as unknown[])?.length} rows`
      );
    }

    // --- include, one level, from a tenant-scoped parent ------------------
    {
      const r = await attempt(() =>
        guarded.service.findUnique({
          where: { id: dummyService.id },
          include: { questions: true },
        })
      );
      const threw = r.error instanceof NotYetTenantScopedError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = (r.value as any)?.questions?.length;
      console.log(
        `    include { questions: true } from a scoped Service:\n` +
          `      ${threw ? "THREW NotYetTenantScopedError — the guard fires on nested reads" : r.error ? `threw ${r.error.name}: ${r.error.message.slice(0, 90)}` : `returned ${n} question(s) — the guard did NOT fire`}`
      );
      ok(
        threw || n === 1,
        "nested include either throws or returns only the dummy's own question",
        threw ? "" : `got ${n}`
      );
    }

    // --- nested select, same relation ------------------------------------
    {
      const r = await attempt(() =>
        guarded.service.findUnique({
          where: { id: dummyService.id },
          select: { id: true, questions: { select: { id: true, key: true } } },
        })
      );
      const threw = r.error instanceof NotYetTenantScopedError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = (r.value as any)?.questions?.length;
      console.log(
        `    select { questions: {...} } from a scoped Service:\n` +
          `      ${threw ? "THREW" : r.error ? `threw ${r.error.name}` : `returned ${n} question(s)`}`
      );
      ok(threw || n === 1, "nested select behaves the same as nested include");
    }

    // --- two levels deep, and a pending model on the OTHER side ----------
    {
      const r = await attempt(() =>
        guarded.service.findUnique({
          where: { id: dummyService.id },
          include: {
            category: true,
            questions: { include: { options: true } },
          },
        })
      );
      const threw = r.error instanceof NotYetTenantScopedError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = r.value as any;
      console.log(
        `    include { category, questions: { options } } — three pending models:\n` +
          `      ${threw ? "THREW" : r.error ? `threw ${r.error.name}` : `returned category=${v?.category ? "yes" : "no"}, options=${v?.questions?.[0]?.options?.length}`}`
      );
      ok(
        threw || (v?.questions?.[0]?.options?.length === 1),
        "a two-level traversal reaches only the dummy's own rows"
      );
    }

    // --- THE PRISMA BLIND SPOT, ASSERTED RATHER THAN FEARED ---------------
    //
    // This asserts that the bypass EXISTS. That reads backwards until you see
    // what it is for: the architecture rule in the ADR — tenant data is never
    // loaded through a platform-owned top-level query — is only worth
    // following while this is true. Writing it as a passing check means the
    // day Prisma starts intercepting nested reads, this fails and says so,
    // rather than the rule quietly becoming folklore nobody can justify.
    //
    // CanonicalComponent is a PLATFORM model, so the guard waves it through.
    // Its contractorComponents relation is tenant-owned. Nothing filters it.
    {
      const r = await attempt(() =>
        guarded.canonicalComponent.findMany({
          take: 5,
          orderBy: { key: "asc" },
          include: { contractorComponents: true },
        })
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (r.value as any[]) ?? [];
      const foreign = rows
        .flatMap((c) => c.contractorComponents ?? [])
        .filter((cc: { contractorId: string }) => cc.contractorId !== dummy.id);
      ok(
        r.error === undefined && foreign.length > 0,
        "DOCUMENTED BLIND SPOT — a platform-rooted nested read still bypasses the guard",
        r.error
          ? `threw ${r.error.name} — the blind spot may have closed; re-read the ADR rule`
          : `returned 0 foreign rows — either Elite has no components or Prisma now ` +
            `intercepts nested reads. Either way, verify before trusting this.`
      );
      console.log(
        `      (read ${foreign.length} of another contractor's component rows ` +
          `through a PLATFORM root — this is why operational code must not do it)`
      );
    }

    // --- THE REPLACEMENT: tenant-rooted, and therefore guarded -------------
    //
    // lib/contractorComponents.ts roots at ContractorComponent and includes
    // the canonical role from there. Same data, opposite direction, guard in
    // control. These three checks are the regression test for the refactor of
    // lib/routeResolver.ts and app/api/services/[slug]/route.ts.
    {
      // Ask for EVERY canonical role Elite has priced. If the tenant-rooted
      // loader can be talked into returning someone else's economics, this is
      // where it happens.
      const r = await attempt(() =>
        loadOwnComponents(
          guarded as unknown as PrismaClient,
          dummy.id,
          eliteCanonicalIds
        )
      );
      ok(r.error === undefined, "tenant-rooted loader runs under the guard", r.error?.message);

      const map = r.value;
      ok(
        map !== undefined && map.size === 1,
        `asking for all ${eliteCanonicalIds.length} of Elite's priced roles returns ` +
          `only the dummy's own 1`,
        `got ${map?.size}`
      );
      ok(
        map?.get(sharedCanonicalId)?.approvedPriceCents === DUMMY_COMPONENT_PRICE,
        "and the shared role resolves to the DUMMY's figure, not Elite's",
        `dummy should be ${DUMMY_COMPONENT_PRICE}, Elite is ` +
          `${eliteComponent.approvedPriceCents}, got ` +
          `${map?.get(sharedCanonicalId)?.approvedPriceCents}`
      );
      const leaked = [...(map?.values() ?? [])].filter(
        (v) =>
          v.approvedPriceCents !== null &&
          v.approvedPriceCents === eliteComponent.approvedPriceCents &&
          eliteComponent.approvedPriceCents !== DUMMY_COMPONENT_PRICE
      );
      ok(
        leaked.length === 0,
        "no value in the map matches Elite's economics",
        `${leaked.length} row(s) carry Elite's figure`
      );
    }

    // --- nested WRITE into a pending model --------------------------------
    {
      const r = await attempt(() =>
        guarded.service.update({
          where: { id: dummyService.id },
          data: {
            questions: {
              create: {
                key: "isolation_probe_nested_write",
                prompt: "Written through a nested create",
                inputType: "SINGLE_SELECT",
                order: 99,
              },
            },
          },
        })
      );
      const threw = r.error instanceof NotYetTenantScopedError;
      const written = await raw.question.count({
        where: { serviceId: dummyService.id, key: "isolation_probe_nested_write" },
      });
      console.log(
        `    nested create of a Question through Service.update:\n` +
          `      ${threw ? "THREW" : r.error ? `threw ${r.error.name}` : `succeeded — ${written} row written`}`
      );
      ok(
        threw || written === 1,
        "a nested write either throws or lands under the dummy's own service"
      );
    }
  });

  // ---- Elite untouched ---------------------------------------------------
  console.log(`\nELITE'S DATA\n`);
  const after = {
    materials: await raw.contractorMaterial.count({ where: { contractorId: elite.id } }),
    services: await raw.service.count({ where: { contractorId: elite.id } }),
    questions: await raw.question.count({ where: { service: { contractorId: elite.id } } }),
    options: await raw.answerOption.count({
      where: { question: { service: { contractorId: elite.id } } },
    }),
    components: await raw.contractorComponent.count({ where: { contractorId: elite.id } }),
  };
  const untouched =
    after.materials === before.materials &&
    after.services === before.services &&
    after.questions === before.questions &&
    after.options === before.options &&
    after.components === before.components;
  ok(untouched, "not one row of Elite's data changed",
     `materials ${before.materials}->${after.materials}, ` +
       `services ${before.services}->${after.services}, ` +
       `questions ${before.questions}->${after.questions}, ` +
       `options ${before.options}->${after.options}, ` +
       `components ${before.components}->${after.components}`);

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

  await purgeDummy(dummy.id);
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
