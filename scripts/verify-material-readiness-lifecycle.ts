/**
 * A missing cost blocks, and stops blocking when it arrives — B1.
 *
 *   npx tsx scripts/verify-material-readiness-lifecycle.ts
 *
 * The defect this exists for: provisioning discarded the ServiceMaterial link
 * when the contractor had not costed the role, while persisting the role's key
 * as a blocker. Structure was thrown away and state was captured — exactly
 * backwards. With no link there was nothing to recompute from, so entering the
 * cost could never clear the blocker and the service was unlaunchable forever.
 *
 * The distinction this locks:
 *
 *   PERSISTED   provisioning facts — which roles a service consumes, in what
 *               quantity, from which template version. History.
 *   DERIVED     readiness — whether the CURRENT contractor state can make the
 *               pricing promise. Recomputed, never captured.
 *
 * Runs against a proven branch of production, and tears down after itself.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { classifyRehearsalTarget } from "./_lineage";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { activationRefusal } from "../lib/serviceActivation";
import { recomputeServicesUsingRole } from "../lib/materialCost";
import { activationMaterialRoles } from "../lib/materialResolution";
import { resolvePolicy } from "../lib/policyResolution";

loadEnv();
const A = "zz-b1-alpha", B = "zz-b1-beta";
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** The three Plumbing starter services the pilot found permanently blocked. */
const AFFECTED = ["toilet-replacement", "toilet-internals-repair", "kitchen-faucet-replacement"];
const ROLE = "supply_line_flex";

async function setup(db: PrismaClient, slug: string) {
  const c = await db.contractor.upsert({
    where: { slug }, update: {}, create: { slug, name: slug, countryCode: "US" } });
  await db.contractorTrade.upsert({
    where: { contractorId_tradeKey: { contractorId: c.id, tradeKey: "plumbing" } },
    update: {}, create: { contractorId: c.id, tradeKey: "plumbing" } });
  const pre = await preflight(db, c.id, templateVersionSource(db, "plumbing", undefined, 1));
  if (!pre.ok) throw new Error(`preflight: ${pre.code}`);
  await installCatalog(db, c.id, pre.catalog);
  // Policies answered so the material blocker is the only one left.
  for (const p of await db.contractorPolicyValue.findMany({ where: { contractorId: c.id }, select: { key: true, boundaryCount: true } }))
    await resolvePolicy(db, c.id, p.key, p.boundaryCount === 0 ? { choice: "contractor-supplied" } : { boundaries: [25, 75].slice(0, p.boundaryCount) });

  /**
   * Every OTHER reachable role costed, so ROLE is the only blocker left.
   *
   * Same isolation as the policies above, and newly needed for the same kind
   * of reason. Provisioning now preserves the component structure a branch
   * selects, so these services carry their stop-valve components and the
   * recipe material behind them is reachable through a priceable path.
   * Activation asks for it — a requirement that was always logically there and
   * was invisible only because the structural link had been dropped.
   *
   * Cleared here, never excluded there: activationMaterialRoles decides what a
   * service needs, and a test that disagreed with it would be testing itself.
   */
  for (const slug of AFFECTED) {
    const svc = await db.service.findFirstOrThrow({ where: { contractorId: c.id, slug }, select: { id: true } });
    for (const role of await activationMaterialRoles(db as never, svc.id)) {
      if (role.key === ROLE) continue;
      await db.contractorMaterial.upsert({
        where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: role.canonicalMaterialId } },
        update: { unitCostCents: 1_000 },
        create: { contractorId: c.id, canonicalMaterialId: role.canonicalMaterialId, unitCostCents: 1_000 },
      });
    }
  }
  return c.id;
}

async function teardown(db: PrismaClient, slug: string) {
  const c = await db.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  const ids = (await db.service.findMany({ where: { contractorId: c.id }, select: { id: true } })).map((s) => s.id);
  await db.answerOptionMaterial.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
  await db.answerOptionComponent.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
  await db.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } });
  await db.question.deleteMany({ where: { serviceId: { in: ids } } });
  await db.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } });
  await db.service.deleteMany({ where: { contractorId: c.id } });
  await db.contractor.delete({ where: { id: c.id } });
}

async function main() {
  const url = process.env.REHEARSAL_DATABASE_URL;
  console.log(`\nMATERIAL READINESS LIFECYCLE — B1\n`);
  if (!url) { console.error("  REHEARSAL_DATABASE_URL is not set.\n"); process.exit(1); }
  const v = await classifyRehearsalTarget(url, process.env.DATABASE_URL);
  if (!v.ok) { console.error(`  REFUSING (${(v as any).code})\n`); process.exit(1); }
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    await teardown(db, A); await teardown(db, B);
    const roleId = (await db.canonicalMaterial.findFirstOrThrow({ where: { key: ROLE }, select: { id: true } })).id;
    const aId = await setup(db, A);
    const bId = await setup(db, B);

    const svcOf = async (cid: string, slug: string) =>
      db.service.findFirstOrThrow({ where: { contractorId: cid, slug }, select: { id: true, slug: true } });
    const state = async (id: string) =>
      db.service.findUniqueOrThrow({ where: { id }, select: { unresolvedMaterialKeys: true, materialCostResolved: true, materialCostCents: true } });

    // ── 1. provisioned with the cost missing → blocked ────────────────────
    console.log(`\n  1. PROVISIONED WITH THE COST MISSING\n`);
    // ISOLATED, per the Amendment C discipline. activationRefusal reports one
    // blocker at a time and checks §1.4 price approval BEFORE materials, so a
    // freshly provisioned service answers PRICE_NOT_APPROVED and the material
    // blocker never gets a word in. Approving the price first is what makes
    // this test measure the blocker it is aiming at.
    for (const slug of AFFECTED) {
      const s = await svcOf(aId, slug);
      await db.service.update({ where: { id: s.id }, data: { basePrice: 22_900, publishedPriceApprovedAt: new Date() } });
      const st = await state(s.id);
      const r = await activationRefusal(db, aId, s.id);
      ok(st.unresolvedMaterialKeys.includes(ROLE) && r?.code === "MATERIALS_UNRESOLVED",
        `${slug}: blocked on ${ROLE} once the price is out of the way`,
        `keys=${JSON.stringify(st.unresolvedMaterialKeys)} refusal=${r?.code}`);
    }
    // The structure survived — the thing the old code discarded.
    const links = await db.serviceMaterial.count({ where: { service: { contractorId: aId }, canonicalMaterialId: roleId } });
    ok(links > 0, `the requirement persisted as ServiceMaterial links (${links})`,
      "structure was discarded, which is what made the blocker permanent");

    // ── 2. enter the cost through the sanctioned path → clears ────────────
    console.log(`\n  2. CONTRACTOR ENTERS THE COST\n`);
    await db.contractorMaterial.create({ data: { contractorId: aId, canonicalMaterialId: roleId, unitCostCents: 2_500 } });
    await recomputeServicesUsingRole({ db, canonicalMaterialId: roleId, contractorId: aId });
    for (const slug of AFFECTED) {
      const s = await svcOf(aId, slug);
      const st = await state(s.id);
      ok(!st.unresolvedMaterialKeys.includes(ROLE) && st.materialCostResolved,
        `${slug}: blocker cleared`, `keys=${JSON.stringify(st.unresolvedMaterialKeys)} resolved=${st.materialCostResolved}`);
    }
    const priced = await state((await svcOf(aId, AFFECTED[0])).id);
    ok(priced.materialCostCents !== null && priced.materialCostCents > 0,
      `3. price derivation available (materialCostCents = ${priced.materialCostCents})`);
    ok(priced.materialCostCents !== 0, "   and it is not a $0 stand-in");

    // ── 4/5. price approval still required, then activation ───────────────
    console.log(`\n  4-5. PRICE APPROVAL STILL GATES ACTIVATION\n`);
    const one = await svcOf(aId, AFFECTED[0]);
    // Withdraw the approval so the price gate can be seen alone. BOTH fields,
    // because the services_price_requires_approval CHECK constraint refuses a
    // priced-but-unapproved row — the guard doing exactly its job.
    await db.service.update({ where: { id: one.id }, data: { basePrice: null, publishedPriceApprovedAt: null } });
    const beforeApproval = await activationRefusal(db, aId, one.id);
    ok(beforeApproval?.code === "PRICE_NOT_APPROVED",
      `${one.slug}: still refuses without an approved price`, `got ${beforeApproval?.code ?? "ALLOWED"}`);
    await db.service.update({ where: { id: one.id }, data: { basePrice: 22_900, publishedPriceApprovedAt: new Date() } });
    const svcCall = await svcOf(aId, "plumbing-service-call");
    await db.service.update({ where: { id: svcCall.id }, data: { basePrice: 9_900, publishedPriceApprovedAt: new Date(), active: true } });
    const afterApproval = await activationRefusal(db, aId, one.id);
    ok(afterApproval === null, `${one.slug}: activates once approved`, `blocked by ${afterApproval?.code}`);

    // ── 6. remove the cost → blocks again ─────────────────────────────────
    console.log(`\n  6. THE COST IS REMOVED AGAIN\n`);
    await db.contractorMaterial.deleteMany({ where: { contractorId: aId, canonicalMaterialId: roleId } });
    await recomputeServicesUsingRole({ db, canonicalMaterialId: roleId, contractorId: aId });
    const reblocked = await state(one.id);
    ok(reblocked.unresolvedMaterialKeys.includes(ROLE) && !reblocked.materialCostResolved,
      `${one.slug}: readiness blocks again`, `keys=${JSON.stringify(reblocked.unresolvedMaterialKeys)}`);
    ok(reblocked.materialCostCents !== 0, "   and the cost did not fall back to $0",
      `materialCostCents=${reblocked.materialCostCents}`);

    // ── 7. two-contractor isolation ───────────────────────────────────────
    console.log(`\n  7. ISOLATION\n`);
    await db.contractorMaterial.create({ data: { contractorId: aId, canonicalMaterialId: roleId, unitCostCents: 2_500 } });
    await recomputeServicesUsingRole({ db, canonicalMaterialId: roleId, contractorId: aId });
    const aState = await state((await svcOf(aId, AFFECTED[0])).id);
    const bState = await state((await svcOf(bId, AFFECTED[0])).id);
    ok(!aState.unresolvedMaterialKeys.includes(ROLE), "A is resolved after entering its own cost");
    ok(bState.unresolvedMaterialKeys.includes(ROLE), "B is still blocked — A's cost did not satisfy it",
      `B keys=${JSON.stringify(bState.unresolvedMaterialKeys)}`);

    // ── 9. re-provisioning does not recreate a stale blocker ──────────────
    console.log(`\n  9. RE-PROVISIONING\n`);
    const again = await preflight(db, aId, templateVersionSource(db, "plumbing", undefined, 1));
    ok(!again.ok && again.code === "CATALOG_ALREADY_INSTALLED",
      "a second install is refused rather than recreating state", again.ok ? "allowed" : again.code);
    const dupes = await db.serviceMaterial.count({ where: { service: { contractorId: aId }, canonicalMaterialId: roleId } });
    ok(dupes === links, `no duplicate links after the retry (${dupes})`);
  } finally {
    await teardown(db, A); await teardown(db, B);
    await db.$disconnect();
  }
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).stack}\n`); process.exit(1); });
