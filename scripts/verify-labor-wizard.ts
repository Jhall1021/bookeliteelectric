/**
 * The labor wizard's shared mechanism — server-side, against the real
 * database with run-unique fixtures it creates and destroys itself, the
 * same discipline as verify-material-baseline-pricing.ts.
 *
 * What this proves:
 *
 *   canonical eligibility  a service is eligible for a task ONLY when its
 *                       templateKey names that task's real canonical
 *                       outcome AND its current recipe is still the exact
 *                       set the TemplateService was provisioned with — not
 *                       "carries the role", not "contractor checked it"
 *   customized, not silently either way  a templated service whose recipe
 *                       OR a fixed quantity has since diverged is excluded
 *                       from eligible and surfaced separately, never
 *                       offered and never dropped without a trace — the
 *                       SAME set of materials at a DIFFERENT quantity
 *                       (one outlet vs. three) is exactly as disqualifying
 *                       as a different material entirely
 *   hand-authored is absent  a service with no templateKey at all (every
 *                       catalog that predates templating, Elite's
 *                       included) appears in neither list — there is no
 *                       backfill and no special case
 *   per-task scoping   a service tagged for one task never appears as
 *                       eligible for another
 *   tenant isolation    one contractor's eligible services never include
 *                       another's
 *   partial-write safety  the shared pricing-input authority
 *                       (lib/servicePricingInputs.ts) changes ONLY the keys
 *                       named in its override — an existing wwtLaborHours,
 *                       requiresTechCount and materialCostCents survive a
 *                       fieldLaborHours-only call untouched
 *   full-write parity   the SAME function, called with every key explicit
 *                       (the admin Pricing Composition panel's own shape),
 *                       still overwrites all of them
 *   never the published price  basePrice, whileWeThereBasePrice and
 *                       publishedPriceApprovedAt are untouched by either
 *                       call shape
 *   a fresh install is eligible, not customized  a service installed
 *                       through the REAL catalog installer (not this file's
 *                       own hand-rolled fixture, which links every template
 *                       material and so never exercises the actual
 *                       install-time shape) and never touched afterward is
 *                       ELIGIBLE for its task, end to end through the same
 *                       write path the accept route uses — even though its
 *                       template includes a policy-driven material
 *                       (CONSUMABLES_SMALL) installCatalog deliberately
 *                       leaves unlinked until the contractor resolves it.
 *                       That expected, install-time absence is not a
 *                       recipe change; a genuine edit on the SAME installed
 *                       service still is, and is still excluded
 *   no lost update      two concurrent saveServicePricingInputs calls
 *                       naming DIFFERENT fields on the SAME service both
 *                       land — neither call reads the row first, so
 *                       neither can write back a stale snapshot of the
 *                       field the other one just changed
 *   the race itself, proven, not asserted  a SEPARATE, genuinely
 *                       concurrent connection tries to change a candidate
 *                       service's recipe WHILE the accept transaction's
 *                       own locks are held (resolveTaskEligibilityForWrite's
 *                       injectDuringLock seam) and is shown to actually
 *                       block — a short lock_timeout makes it fail fast
 *                       and loud instead of silently racing through. The
 *                       accept transaction's own write still lands
 *                       correctly; the blocked edit never applied; once
 *                       the lock releases the same edit succeeds normally
 *                       (a temporary block, not a deadlock); and a fresh
 *                       eligibility read afterward correctly demotes the
 *                       now-actually-changed service
 *
 * The browser-driven conversation itself (the Q&A flow, the eligibility-
 * scoped picker, crew-mismatch flagging, and the direct-API refusal of an
 * ineligible id) is covered separately by
 * verify-labor-wizard-browser-flow.ts, which needs a live dev server and is
 * not part of this chain.
 *
 *   npx tsx scripts/verify-labor-wizard.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { ELECTRICAL_LABOR_TASKS, resolveTaskEligibility, resolveTaskEligibilityForWrite } from "../lib/laborWizard";
import { saveServicePricingInputs } from "../lib/servicePricingInputs";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { withThrowaway } from "./_throwaway";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-labor-wizard";
const SLUG_A = `${SLUG_PREFIX}-${RUN}-a`;
const SLUG_B = `${SLUG_PREFIX}-${RUN}-b`;
// Provisioned through the real installer, not this file's hand-rolled
// `service()` helper — see withThrowaway's own cleanup below, which follows
// the full FK graph a real install actually creates.
const SLUG_C = `${SLUG_PREFIX}-${RUN}-install`;
const STALE_AFTER_MS = 60 * 60 * 1000;
const TRADE = "electrical";
const VERSION = 1;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function removeContractor(slug: string) {
  const c = await raw.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}
async function teardown() {
  for (const s of [SLUG_A, SLUG_B]) await removeContractor(s);
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: { in: [SLUG_A, SLUG_B] } }, createdAt: { lt: cutoff } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

async function service(
  contractorId: string, slug: string, materialIds: string[], extra: Record<string, unknown> = {},
  quantityOverrides: Record<string, number> = {}
) {
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });
  return raw.service.create({
    data: {
      contractorId, categoryId: cat.id, slug, name: slug, bookingType: "INSTANT", photoState: "NONE",
      materials: {
        create: materialIds.map((id, order) => ({ canonicalMaterialId: id, quantity: quantityOverrides[id] ?? 1, order })),
      },
      ...extra,
    },
    select: { id: true },
  });
}

async function main() {
  console.log(`\nLABOR WIZARD — shared mechanism: canonical eligibility, customized divergence, tenant isolation, safe partial writes\n`);
  await teardown();
  await sweepStale();

  const tv = await raw.templateVersion.findUniqueOrThrow({ where: { trade_version: { trade: TRADE, version: VERSION } } });
  const [outletTemplate, switchTemplate] = await Promise.all([
    raw.templateService.findUniqueOrThrow({
      where: { templateVersionId_key: { templateVersionId: tv.id, key: "replace-standard-outlet" } },
      select: { materials: { select: { canonicalMaterialId: true } } },
    }),
    raw.templateService.findUniqueOrThrow({
      where: { templateVersionId_key: { templateVersionId: tv.id, key: "replace-standard-switch" } },
      select: { materials: { select: { canonicalMaterialId: true } } },
    }),
  ]);
  const outletRecipe = outletTemplate.materials.map((m) => m.canonicalMaterialId);
  const switchRecipe = switchTemplate.materials.map((m) => m.canonicalMaterialId);
  const [receptacle, boxOldWork] = await Promise.all([
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "RECEPTACLE_STANDARD" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_OLD_WORK" }, select: { id: true } }),
  ]);

  const a = await raw.contractor.create({ data: { slug: SLUG_A, name: "Labor Wizard Probe A", active: false }, select: { id: true } });
  const b = await raw.contractor.create({ data: { slug: SLUG_B, name: "Labor Wizard Probe B", active: false }, select: { id: true } });

  // ── fixtures ─────────────────────────────────────────────────────────────
  const eligibleOutlet = await service(a.id, "a-eligible-outlet", outletRecipe, {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  });
  const customizedOutlet = await service(a.id, "a-customized-outlet", [...outletRecipe, boxOldWork.id], {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  });
  // SAME material set as the template — nothing added, nothing removed —
  // but the receptacle's own quantity moved from the template's fixed 1 to
  // 3: this service now replaces three outlets, not one. The reviewer's
  // exact scenario: a set-only comparison would have called this eligible.
  const differentQuantityOutlet = await service(a.id, "a-different-quantity-outlet", outletRecipe, {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  }, { [receptacle.id]: 3 });
  const handAuthoredOutlet = await service(a.id, "a-hand-authored-outlet", [receptacle.id]);
  const unrelatedSwitch = await service(a.id, "a-tagged-switch", switchRecipe, {
    templateKey: "replace-standard-switch", templateVersionId: tv.id,
  });
  const bEligibleOutlet = await service(b.id, "b-eligible-outlet", outletRecipe, {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  });

  const outletTask = ELECTRICAL_LABOR_TASKS.find((t) => t.key === "outlet_replacement")!;
  const switchTask = ELECTRICAL_LABOR_TASKS.find((t) => t.key === "switch_replacement")!;

  const resolvedA = await resolveTaskEligibility(raw, a.id, [outletTask, switchTask]);
  const outletResult = resolvedA.find((r) => r.task.key === "outlet_replacement")!;
  const switchResult = resolvedA.find((r) => r.task.key === "switch_replacement")!;

  ok(`0. the unmodified, correctly-tagged service is eligible`,
    outletResult.eligible.some((s) => s.id === eligibleOutlet.id));
  ok(`1. the same-tagged service whose recipe has since diverged is EXCLUDED from eligible`,
    !outletResult.eligible.some((s) => s.id === customizedOutlet.id));
  ok(`   ...and appears in customized instead, not silently dropped`,
    outletResult.customized.some((s) => s.id === customizedOutlet.id));
  ok(`1b. same materials, different FIXED quantity (1 outlet -> 3) is ALSO excluded from eligible`,
    !outletResult.eligible.some((s) => s.id === differentQuantityOutlet.id));
  ok(`    ...and appears in customized too — a quantity change is not silently accepted`,
    outletResult.customized.some((s) => s.id === differentQuantityOutlet.id));
  ok(`2. the hand-authored service (no templateKey) appears in NEITHER list`,
    !outletResult.eligible.some((s) => s.id === handAuthoredOutlet.id) &&
    !outletResult.customized.some((s) => s.id === handAuthoredOutlet.id));
  ok(`3. a service tagged for a DIFFERENT task never appears as eligible for this one`,
    !outletResult.eligible.some((s) => s.id === unrelatedSwitch.id));
  ok(`   ...and IS eligible for its own task`,
    switchResult.eligible.some((s) => s.id === unrelatedSwitch.id));
  ok(`4. exactly one eligible outlet service for A, no more`, outletResult.eligible.length === 1);

  ok(`5. B's eligible service never appears in A's eligible list`,
    !outletResult.eligible.some((s) => s.id === bEligibleOutlet.id));
  const resolvedB = await resolveTaskEligibility(raw, b.id, [outletTask]);
  ok(`   ...and B's own resolution finds ONLY its own service`,
    resolvedB[0].eligible.length === 1 && resolvedB[0].eligible[0].id === bEligibleOutlet.id);

  // ── real installer — reproduces the exact reported defect. wizard-demo-
  // electric installed the Electrical catalog through Guided Setup, selected
  // outlet/switch/GFCI replacement with no manual recipe edits, and the
  // labor review flagged all three "customized since" with nothing eligible.
  // This file's own `service()` helper above links EVERY template material,
  // including policy-driven ones — it never exercises what the real
  // installer actually leaves behind, which is why the defect shipped. Only
  // going through templateVersionSource -> preflight -> installCatalog, the
  // same path Guided Setup and the CLI both use, reproduces it. ────────────
  await withThrowaway(raw, SLUG_C, "Labor Wizard Install Probe", async (installedContractorId) => {
    const source = templateVersionSource(raw, TRADE);
    const pf = await preflight(raw, installedContractorId, source);
    if (!pf.ok) throw new Error(`preflight failed unexpectedly: ${pf.code} ${pf.message}`);
    await installCatalog(raw, installedContractorId, pf.catalog);

    const installedTasks = [
      ELECTRICAL_LABOR_TASKS.find((t) => t.key === "outlet_replacement")!,
      ELECTRICAL_LABOR_TASKS.find((t) => t.key === "switch_replacement")!,
      ELECTRICAL_LABOR_TASKS.find((t) => t.key === "gfci_replacement")!,
    ];
    const resolvedInstalled = await resolveTaskEligibility(raw, installedContractorId, installedTasks);
    const installedOutlet = resolvedInstalled.find((r) => r.task.key === "outlet_replacement")!;
    const installedSwitch = resolvedInstalled.find((r) => r.task.key === "switch_replacement")!;
    const installedGfci = resolvedInstalled.find((r) => r.task.key === "gfci_replacement")!;

    ok(`6. a freshly installed, UNTOUCHED outlet service is ELIGIBLE — not flagged customized`,
      installedOutlet.eligible.length === 1 && installedOutlet.customized.length === 0,
      `eligible=${installedOutlet.eligible.length} customized=${installedOutlet.customized.length}`);
    ok(`   ...same for the freshly installed switch service`,
      installedSwitch.eligible.length === 1 && installedSwitch.customized.length === 0,
      `eligible=${installedSwitch.eligible.length} customized=${installedSwitch.customized.length}`);
    ok(`   ...same for the freshly installed GFCI service`,
      installedGfci.eligible.length === 1 && installedGfci.customized.length === 0,
      `eligible=${installedGfci.eligible.length} customized=${installedGfci.customized.length}`);

    // ── install → select → labor review → save, end to end, through the
    // SAME locked write path app/api/portal/labor-tasks/route.ts uses ──
    const acceptances = [
      { taskKey: "outlet_replacement", minutes: 20, serviceId: installedOutlet.eligible[0]?.id },
      { taskKey: "switch_replacement", minutes: 18, serviceId: installedSwitch.eligible[0]?.id },
      { taskKey: "gfci_replacement", minutes: 22, serviceId: installedGfci.eligible[0]?.id },
    ];
    await raw.$transaction(
      async (tx) => {
        const eligibility = await resolveTaskEligibilityForWrite(tx, installedContractorId, installedTasks);
        const eligibleIdsByTask = new Map(eligibility.map((e) => [e.task.key, new Set(e.eligible.map((s) => s.id))]));
        for (const acc of acceptances) {
          if (!acc.serviceId || !eligibleIdsByTask.get(acc.taskKey)?.has(acc.serviceId)) {
            throw new Error(`${acc.taskKey}'s installed service was not eligible at write time`);
          }
          await saveServicePricingInputs(tx, acc.serviceId, { fieldLaborHours: acc.minutes / 60 });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    const savedServices = await raw.service.findMany({
      where: { id: { in: acceptances.map((acc) => acc.serviceId!) } },
      select: { id: true, fieldLaborHours: true },
    });
    ok(`7. the accept write actually lands for all three freshly installed services`,
      acceptances.every((acc) => {
        const s = savedServices.find((x) => x.id === acc.serviceId);
        return !!s && Math.abs((s.fieldLaborHours ?? 0) - acc.minutes / 60) < 1e-9;
      }));

    // ── the safeguard still holds on this SAME real install: a genuine
    // recipe edit — not a policy role's expected, unresolved absence — is
    // still excluded. The fix corrects a false positive; it does not stop
    // detecting a real one. ──
    const installedOutletId = installedOutlet.eligible[0]!.id;
    await raw.serviceMaterial.updateMany({
      where: { serviceId: installedOutletId, canonicalMaterial: { key: "RECEPTACLE_STANDARD" } },
      data: { quantity: 2 },
    });
    const afterEdit = await resolveTaskEligibility(raw, installedContractorId, [installedTasks[0]]);
    ok(`8. a genuine quantity edit on the SAME installed service is still correctly excluded`,
      !afterEdit[0].eligible.some((s) => s.id === installedOutletId) &&
      afterEdit[0].customized.some((s) => s.id === installedOutletId));
  });

  // ── partial-write safety — the reviewer's exact concern from the prior round ─
  const probe = await raw.service.create({
    data: {
      contractorId: a.id, categoryId: (await raw.serviceCategory.findFirstOrThrow({ select: { id: true } })).id,
      slug: "a-partial-write-probe", name: "a-partial-write-probe", bookingType: "INSTANT", photoState: "NONE",
      fieldLaborHours: 1, wwtLaborHours: 0.5, requiresTechCount: 2, materialCostCents: 500,
      basePrice: 12345, whileWeThereBasePrice: 6789, publishedPriceApprovedAt: new Date(),
    },
    select: { id: true },
  });
  await saveServicePricingInputs(raw, probe.id, { fieldLaborHours: 2 });
  const afterPartial = await raw.service.findUniqueOrThrow({
    where: { id: probe.id },
    select: {
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true, materialCostCents: true,
      basePrice: true, whileWeThereBasePrice: true, publishedPriceApprovedAt: true,
    },
  });
  ok(`9. a fieldLaborHours-only call changes ONLY fieldLaborHours`, afterPartial.fieldLaborHours === 2);
  ok(`   ...wwtLaborHours survives untouched`, afterPartial.wwtLaborHours === 0.5);
  ok(`   ...requiresTechCount survives untouched`, afterPartial.requiresTechCount === 2);
  ok(`   ...materialCostCents survives untouched`, afterPartial.materialCostCents === 500);
  ok(`   ...basePrice is never touched — this is not a publish`, afterPartial.basePrice === 12345);
  ok(`   ...whileWeThereBasePrice is never touched`, afterPartial.whileWeThereBasePrice === 6789);
  ok(`   ...publishedPriceApprovedAt is never touched`, afterPartial.publishedPriceApprovedAt !== null);

  // ── full-write parity — the admin Pricing Composition panel's own shape ─
  await saveServicePricingInputs(raw, probe.id, {
    fieldLaborHours: 3, wwtLaborHours: null, materialCostCents: null, materialMultiplier: null,
    permitAdminCents: null, otherDirectCostCents: null, estimatedMinutes: null,
    requiresTechCount: 1, isPrimaryEligible: true, estimatedMinutesReviewed: false,
  });
  const afterFull = await raw.service.findUniqueOrThrow({
    where: { id: probe.id },
    select: { fieldLaborHours: true, wwtLaborHours: true, materialCostCents: true, requiresTechCount: true, basePrice: true },
  });
  ok(`10. a fully-specified call (the admin panel's own shape) still overwrites every key it names`,
    afterFull.fieldLaborHours === 3 && afterFull.wwtLaborHours === null && afterFull.materialCostCents === null
      && afterFull.requiresTechCount === 1);
  ok(`   ...and still never touches the published price`, afterFull.basePrice === 12345);

  // ── no lost update — the reviewer's exact concern about reading current
  // values back into the write. Two calls naming DIFFERENT fields, fired
  // concurrently: a read-modify-write implementation can lose one of them
  // depending on interleaving; a build-from-overrides-only implementation
  // cannot, because neither call's SQL ever mentions the other's column. ──
  const concurrencyProbe = await raw.service.create({
    data: {
      contractorId: a.id, categoryId: (await raw.serviceCategory.findFirstOrThrow({ select: { id: true } })).id,
      slug: "a-concurrency-probe", name: "a-concurrency-probe", bookingType: "INSTANT", photoState: "NONE",
      fieldLaborHours: 1, wwtLaborHours: 1,
    },
    select: { id: true },
  });
  await Promise.all([
    saveServicePricingInputs(raw, concurrencyProbe.id, { fieldLaborHours: 10 }),
    saveServicePricingInputs(raw, concurrencyProbe.id, { wwtLaborHours: 20 }),
  ]);
  const afterConcurrent = await raw.service.findUniqueOrThrow({
    where: { id: concurrencyProbe.id }, select: { fieldLaborHours: true, wwtLaborHours: true },
  });
  ok(`11. two concurrent calls naming different fields BOTH land — no lost update`,
    afterConcurrent.fieldLaborHours === 10 && afterConcurrent.wwtLaborHours === 20,
    `got fieldLaborHours=${afterConcurrent.fieldLaborHours}, wwtLaborHours=${afterConcurrent.wwtLaborHours}`);

  // ── the race itself — a GENUINELY separate connection, not just a second
  // async call on this same one, trying to change a candidate's recipe
  // WHILE the accept transaction's own locks are held. Proves the lock is
  // real by making the concurrent attempt fail fast (a short lock_timeout)
  // rather than either hanging or silently succeeding. ────────────────────
  const concurrent = new PrismaClient();
  const raceService = await service(a.id, "a-race-outlet", outletRecipe, {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  });

  let concurrentEditBlocked = false;
  let concurrentEditDetail = "";
  let raceServiceStillEligible = false;

  await raw.$transaction(
    async (tx) => {
      const eligibility = await resolveTaskEligibilityForWrite(
        tx, a.id, [outletTask],
        async () => {
          // The locks above are held by `tx` right now. A fully separate
          // connection attempting to change the SAME service's recipe
          // must block on them — proven, not assumed, with a short
          // lock_timeout so a missing lock fails this check fast instead
          // of the test hanging or (worse) passing by accident.
          try {
            await concurrent.$transaction(async (ctx) => {
              await ctx.$executeRaw`SET LOCAL lock_timeout = '500ms'`;
              await ctx.serviceMaterial.updateMany({
                where: { serviceId: raceService.id, canonicalMaterialId: receptacle.id },
                data: { quantity: 5 },
              });
            });
          } catch (e) {
            concurrentEditBlocked = true;
            concurrentEditDetail = (e as Error).message;
          }
        }
      );
      raceServiceStillEligible = eligibility[0].eligible.some((s) => s.id === raceService.id);
      await saveServicePricingInputs(tx, raceService.id, { fieldLaborHours: 30 / 60 });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  ok(`12. a genuinely concurrent recipe edit is BLOCKED while the accept transaction holds its locks`,
    concurrentEditBlocked, concurrentEditDetail || "the concurrent update did not throw — the lock was not actually held");
  ok(`   ...the accept transaction saw the fixture as eligible throughout — the block, not a false rejection, is what protected it`,
    raceServiceStillEligible);

  const afterRace = await raw.service.findUniqueOrThrow({ where: { id: raceService.id }, select: { fieldLaborHours: true } });
  ok(`   ...and the accept transaction's own write still landed correctly (30 min)`,
    Math.abs((afterRace.fieldLaborHours ?? 0) - 30 / 60) < 1e-9);

  const raceMaterialAfterBlock = await raw.serviceMaterial.findFirstOrThrow({
    where: { serviceId: raceService.id, canonicalMaterialId: receptacle.id }, select: { quantity: true },
  });
  ok(`   ...and the blocked edit never actually applied — quantity is still the original 1`,
    raceMaterialAfterBlock.quantity === 1);

  // Once the lock releases (the transaction above committed), the exact
  // same edit must succeed normally — a temporary block, never a deadlock.
  await concurrent.serviceMaterial.updateMany({
    where: { serviceId: raceService.id, canonicalMaterialId: receptacle.id }, data: { quantity: 5 },
  });
  const raceMaterialAfterRelease = await raw.serviceMaterial.findFirstOrThrow({
    where: { serviceId: raceService.id, canonicalMaterialId: receptacle.id }, select: { quantity: true },
  });
  ok(`13. once the transaction releases its locks, the SAME edit succeeds normally — a temporary block, not a deadlock`,
    raceMaterialAfterRelease.quantity === 5);

  // And with that later, legitimate change now in place, a FRESH
  // eligibility read correctly demotes it — the exact property the locked
  // transaction above was protecting against seeing prematurely.
  const afterReleaseEligibility = await resolveTaskEligibility(raw, a.id, [outletTask]);
  ok(`    ...and a fresh eligibility check now correctly excludes it — the change is real once it's actually committed`,
    !afterReleaseEligibility[0].eligible.some((s) => s.id === raceService.id));

  await concurrent.$disconnect();

  console.log(`\n  cleanup, then done\n`);
  await teardown();
  // withThrowaway already removed SLUG_C's contractor on the way out of its
  // own block above; checked again here for the same end-to-end guarantee
  // the other two fixtures get.
  const residue = await raw.contractor.count({ where: { slug: { in: [SLUG_A, SLUG_B, SLUG_C] } } });
  ok(`14. every fixture is gone at the end`, residue === 0);
  await raw.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
