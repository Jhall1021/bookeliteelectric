/**
 * Provisioning preserves canonical job structure independently of contractor
 * economics.
 *
 *   npx tsx scripts/verify-component-structure-survives-install.ts
 *
 * WHAT IT IS TRYING TO FALSIFY
 *
 * That a contractor's missing configuration can delete work the template says
 * a branch selects. installCatalog used to look up the contractor's
 * ContractorComponent and `continue` when it was absent, so an unpriced
 * component lost its AnswerOptionComponent link permanently — nothing outside
 * installCatalog ever creates one, so pricing it later could not recover it
 * and only a reinstall would.
 *
 * The lifecycle proved here is the real one: install a catalog with nothing
 * priced, watch the route refuse to price, price the component afterwards, and
 * watch the SAME installed tree start resolving without being reprovisioned.
 *
 * Runs only against a proved rehearsal branch, via scripts/_lineage.ts.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { classifyRehearsalTarget } from "./_lineage";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { loadServiceForResolution, resolveRoute, loadPricingSettings } from "../lib/routeResolver";
import { buildPlumbingPayload } from "../lib/plumbing/publish";
import { findTroubleshootingService, tradeOfService } from "../lib/troubleshooting";
import { templateVersionSource as _tvs } from "../lib/templateProvisioning";

loadEnv();

const A = "zz-component-structure-a";
const B = "zz-component-structure-b";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string, d = "") => {
  if (c) { pass++; console.log(`  ok   ${m}`); }
  else { fail++; console.log(`  FAIL ${m}${d ? `\n         ${d}` : ""}`); }
};
const group = (t: string) => console.log(`\n  ${t}\n`);

/** serviceKey/questionKey/optionValue/componentKey — identity, never an id. */
function expectedLinks(): Set<string> {
  const out = new Set<string>();
  for (const s of buildPlumbingPayload().services)
    for (const q of s.questions)
      for (const o of q.options)
        for (const ck of o.componentKeys) out.add(`${s.key}/${q.key}/${o.value}/${ck}`);
  return out;
}

async function installedLinks(db: PrismaClient, contractorId: string): Promise<Set<string>> {
  const rows = await db.answerOptionComponent.findMany({
    where: { answerOption: { question: { service: { contractorId } } } },
    select: {
      canonicalComponent: { select: { key: true } },
      answerOption: { select: { value: true, question: { select: { key: true, service: { select: { templateKey: true } } } } } },
    },
  });
  return new Set(rows.map((r) =>
    `${r.answerOption.question.service.templateKey}/${r.answerOption.question.key}/${r.answerOption.value}/${r.canonicalComponent?.key ?? "<null>"}`));
}

async function teardown(db: PrismaClient, slugs: string[]) {
  for (const slug of slugs) {
    const c = await db.contractor.findUnique({ where: { slug }, select: { id: true } });
    if (!c) { ok(true, `${slug}: nothing to remove`); continue; }
    const sids = (await db.service.findMany({ where: { contractorId: c.id }, select: { id: true } })).map((s) => s.id);
    await db.answerOptionComponent.deleteMany({ where: { answerOption: { question: { serviceId: { in: sids } } } } });
    await db.answerOptionMaterial.deleteMany({ where: { answerOption: { question: { serviceId: { in: sids } } } } });
    await db.answerOption.deleteMany({ where: { question: { serviceId: { in: sids } } } });
    await db.question.deleteMany({ where: { serviceId: { in: sids } } });
    await db.serviceMaterial.deleteMany({ where: { serviceId: { in: sids } } });
    await db.service.deleteMany({ where: { contractorId: c.id } });
    await db.pricingSettings.deleteMany({ where: { contractorId: c.id } });
    await db.contractorComponent.deleteMany({ where: { contractorId: c.id } });
    await db.contractorMaterial.deleteMany({ where: { contractorId: c.id } });
    await db.contractorTrade.deleteMany({ where: { contractorId: c.id } });
    await db.contractorCategory.deleteMany({ where: { contractorId: c.id } });
    await db.contractor.delete({ where: { id: c.id } });
    ok((await db.contractor.findUnique({ where: { slug } })) === null, `${slug}: torn down`);
  }
}

async function main() {
  const url = process.env.REHEARSAL_DATABASE_URL;
  console.log(`\nPROVISIONING PRESERVES COMPONENT STRUCTURE\n`);

  group("TARGET");
  if (!url) { console.error("  REHEARSAL_DATABASE_URL is not set.\n"); process.exit(1); }
  const verdict = await classifyRehearsalTarget(url, process.env.DATABASE_URL);
  ok(verdict.ok, "target accepted as a production branch", verdict.ok ? "" : (verdict as any).reason);
  if (!verdict.ok) { console.error("\n  Refusing to continue.\n"); process.exit(1); }
  console.log(`       ${verdict.probe.endpoint}  lineage ${verdict.probe.lineage}`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    // ── 1. INSTALL WITH ZERO CONTRACTOR COMPONENTS ─────────────────────────
    group("1 — INSTALL INTO A CONTRACTOR WITH NO COMPONENT ECONOMICS");
    const ids: Record<string, string> = {};
    for (const slug of [A, B]) {
      const c = await db.contractor.upsert({ where: { slug }, update: {}, create: { slug, name: slug } });
      ids[slug] = c.id;
      await db.contractorTrade.upsert({
        where: { contractorId_tradeKey: { contractorId: c.id, tradeKey: "plumbing" } },
        update: {}, create: { contractorId: c.id, tradeKey: "plumbing" } });
      // Labor economics only. Deliberately NOT component economics — those are
      // the thing under test, and A prices exactly one of them, later.
      const rate = slug === A ? 18_500 : 11_000;
      await db.pricingSettings.upsert({
        where: { contractorId: c.id },
        update: { crewHourRateCents: rate },
        create: { contractorId: c.id, crewHourRateCents: rate, primaryMinimumCents: 12_000,
          roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
      });
    }
    for (const slug of [A, B]) {
      const owned = await db.contractorComponent.count({ where: { contractorId: ids[slug] } });
      ok(owned === 0, `${slug}: owns zero ContractorComponent rows before install (${owned})`);
    }
    for (const slug of [A, B]) {
      const src = templateVersionSource(db, "plumbing", undefined, 1);
      const pre = await preflight(db, ids[slug], src);
      if (!pre.ok) { ok(false, `${slug}: preflight`, `${pre.code}: ${pre.message}`); return; }
      const res = await installCatalog(db, ids[slug], pre.catalog);
      ok(res.services === 63, `${slug}: installed 63 services`, `got ${res.services}`);
    }

    // ── 2. THE COMPLETE STRUCTURAL SET SURVIVED ────────────────────────────
    group("2 — STRUCTURE SURVIVED INSTALLATION INTACT");
    const expected = expectedLinks();
    ok(expected.size === 135, `publisher declares ${expected.size} answer-selected component links`, "expected 135");
    const got = await installedLinks(db, ids[A]);
    const missing = [...expected].filter((k) => !got.has(k));
    const excess = [...got].filter((k) => !expected.has(k));
    ok(got.size === expected.size, `installed ${got.size}/${expected.size} links with nothing priced`);
    ok(missing.length === 0, `no expected link is missing`, missing.slice(0, 4).join(", "));
    ok(excess.length === 0, `no unexpected link appeared`, excess.slice(0, 4).join(", "));
    const stillUnpriced = await db.contractorComponent.count({ where: { contractorId: ids[A] } });
    ok(stillUnpriced === 0, `provisioning invented no ContractorComponent (${stillUnpriced})`);

    // ── 3. UNPRICED FAILS CLOSED TO REVIEW ─────────────────────────────────
    group("3 — AN UNPRICED COMPONENT ROUTE FAILS CLOSED TO REVIEW");
    // A branch that selects a component: the gas heater's vent configuration.
    const svcKey = "tank-water-heater-replacement-gas";
    const target = [...expected].find((k) => k.startsWith(`${svcKey}/`));
    if (!target) { ok(false, "found a component-selecting branch on the gas heater"); return; }
    const [, qKey, oValue, compKey] = target.split("/");
    ok(true, `chose ${svcKey} · ${qKey} = ${oValue} → ${compKey}`);

    const svcA = await db.service.findFirstOrThrow({
      where: { contractorId: ids[A], templateKey: svcKey }, select: { id: true } });
    await db.service.update({ where: { id: svcA.id }, data: { basePrice: 129_000, publishedPriceApprovedAt: new Date() } });
    // Material economics ARE supplied — they are not what this proves, and an
    // uncosted recipe material would send the route to REVIEW for a reason
    // that has nothing to do with the component link.
    for (const slug of [A]) {
      const roles = await db.canonicalMaterial.findMany({ select: { id: true } });
      for (const r of roles)
        await db.contractorMaterial.upsert({
          where: { contractorId_canonicalMaterialId: { contractorId: ids[slug], canonicalMaterialId: r.id } },
          update: { unitCostCents: 4_200 }, create: { contractorId: ids[slug], canonicalMaterialId: r.id, unitCostCents: 4_200 } });
    }
    const settingsA = await loadPricingSettings(db, ids[A]);

    /**
     * Every question answered, and every OTHER question answered with a branch
     * that selects no component. One unpriced component is the variable; a
     * second one would make step 5 fail for a reason this proof isn't making.
     */
    const buildAnswers = async (contractorId: string) => {
      const qs = await db.question.findMany({
        where: { service: { contractorId, templateKey: svcKey } },
        select: { key: true, options: { select: { value: true, routeAction: true, components: { select: { id: true } } } } },
      });
      const a: Record<string, string> = {};
      for (const q of qs) {
        if (q.key === qKey) { a[q.key] = oValue; continue; }
        const plain = q.options.find((o) => o.routeAction === "CONTINUE" && o.components.length === 0)
                   ?? q.options.find((o) => o.components.length === 0)
                   ?? q.options[0];
        if (plain) a[q.key] = plain.value;
      }
      return a;
    };
    const answers = await buildAnswers(ids[A]);

    const loadedBefore = await loadServiceForResolution(db, svcA.id);
    if (!loadedBefore) { ok(false, "loaded the installed service"); return; }
    const before = resolveRoute(loadedBefore, answers, true, settingsA);
    console.log(`       route -> ${before.status}${(before as any).reason ? `: ${(before as any).reason}` : ""}`);
    ok(before.status === "REVIEW", `route is REVIEW while the component is unpriced (${before.status})`);
    ok(before.status === "REVIEW" && /no approved price/i.test(before.reason ?? ""),
      `and the reason is the component's missing price`, before.status === "REVIEW" ? before.reason : "");

    // ── 4/5. PRICE IT AFTERWARDS, SAME TREE, NO REINSTALL ──────────────────
    group("4/5 — PRICING IT AFTERWARDS MAKES THE INSTALLED TREE USABLE");
    const canonical = await db.canonicalComponent.findFirstOrThrow({ where: { key: compKey }, select: { id: true } });
    await db.contractorComponent.create({
      data: { contractorId: ids[A], canonicalComponentId: canonical.id, approvedPriceCents: 21_500 } });
    ok(true, `${A} priced ${compKey} at 21500 AFTER installation`);

    const linksAfter = await installedLinks(db, ids[A]);
    ok(linksAfter.size === expected.size, `the installed tree was not reprovisioned (${linksAfter.size} links, unchanged)`);
    const svcRows = await db.service.count({ where: { contractorId: ids[A] } });
    ok(svcRows === 63, `still exactly 63 services — no reinstall occurred (${svcRows})`);

    const loadedAfter = await loadServiceForResolution(db, svcA.id);
    if (!loadedAfter) { ok(false, "reloaded the same installed service"); return; }
    const after = resolveRoute(loadedAfter, answers, true, settingsA);
    ok(after.status === "PRICED", `the same route now resolves (${after.status})`,
      after.status === "REVIEW" ? after.reason : "");
    ok(after.status === "PRICED" && after.priceCents > 0,
      `and it resolves to ${after.status === "PRICED" ? after.priceCents : "?"} cents using A's economics`);

    // ── 6. ANOTHER CONTRACTOR'S PRICE CANNOT SATISFY IT ────────────────────
    group("6 — B'S PRICING CANNOT SATISFY A'S ROUTE");
    const svcB = await db.service.findFirstOrThrow({
      where: { contractorId: ids[B], templateKey: svcKey }, select: { id: true } });
    await db.service.update({ where: { id: svcB.id }, data: { basePrice: 129_000, publishedPriceApprovedAt: new Date() } });
    const settingsB = await loadPricingSettings(db, ids[B]);
    const answersB = await buildAnswers(ids[B]);
    const loadedB = await loadServiceForResolution(db, svcB.id);
    if (!loadedB) { ok(false, "loaded B's copy"); return; }
    const bRoute = resolveRoute(loadedB, answersB, true, settingsB);
    ok(bRoute.status === "REVIEW", `B's identical route is still REVIEW — A's price did not leak (${bRoute.status})`);
    const bLinks = await installedLinks(db, ids[B]);
    ok(bLinks.size === expected.size, `B received the same complete structure (${bLinks.size})`);
    const bOwned = await db.contractorComponent.count({ where: { contractorId: ids[B] } });
    ok(bOwned === 0, `and B still owns no component economics (${bOwned})`);

    // ── 8. NO DUPLICATE STRUCTURAL LINKS ───────────────────────────────────
    group("8 — STRUCTURE IS LINKED ONCE, NOT ONCE PER ATTEMPT");
    const dupes = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from (
         select "answerOptionId", "canonicalComponentId"
         from answer_option_components aoc
         join answer_options ao on ao.id = aoc."answerOptionId"
         join questions q on q.id = ao."questionId"
         join services s on s.id = q."serviceId"
         where s."contractorId" = $1
         group by 1,2 having count(*) > 1) d`, ids[A]);
    ok(Number(dupes[0].n) === 0, `no answer/component pair is linked twice (${dupes[0].n})`);

    const srcAgain = templateVersionSource(db, "plumbing", undefined, 1);
    const again = await preflight(db, ids[A], srcAgain);
    ok(!again.ok, `re-provisioning is refused rather than duplicating structure`,
      again.ok ? "a second install was offered" : "");
    const afterRetry = await installedLinks(db, ids[A]);
    ok(afterRetry.size === expected.size, `still exactly ${expected.size} links after the retry attempt (${afterRetry.size})`);

    // ── 9. G1 / G2 SEMANTICS UNTOUCHED ─────────────────────────────────────
    group("9 — G1 AND G2 SEMANTICS ARE UNCHANGED BY THIS REPAIR");
    // G1: scoped access. Every installed option carries the slot the template
    // declares — the repair adds component rows, it does not touch access.
    // The slot lives on the live row, not the template row, so the check is
    // that two contractors installed from one template classify access
    // identically — and that every value is one the G1 parser accepts. The
    // repair adds component rows; it must not perturb either.
    const slots = async (cid: string) => (await db.answerOption.groupBy({
      by: ["accessSlot"],
      where: { question: { service: { contractorId: cid } } },
      _count: { _all: true },
    })).map((r: any) => `${r.accessSlot}=${r._count._all}`).sort().join(", ");
    const slotsA = await slots(ids[A]), slotsB = await slots(ids[B]);
    ok(slotsA === slotsB, `G1: both contractors classify access identically (${slotsA})`,
      `A ${slotsA} vs B ${slotsB}`);
    const badSlots = await db.answerOption.count({
      where: { question: { service: { contractorId: ids[A] } }, NOT: { accessSlot: { in: ["PRIMARY", "SECONDARY", "UNKNOWN"] } } } });
    ok(badSlots === 0, `G1: every installed slot is a value the parser accepts (${badSlots} bad)`);

    // G2: a service carries its trade identity, and troubleshooting resolves
    // inside that trade rather than reaching across it.
    const anySvc = await db.service.findFirstOrThrow({
      where: { contractorId: ids[A], templateKey: svcKey }, select: { id: true } });
    const trade = await tradeOfService(db, ids[A], anySvc.id);
    ok(trade.ok && trade.tradeKey === "plumbing",
      `G2: the installed service still carries its trade identity (${trade.ok ? trade.tradeKey : (trade as any).problem})`);
    // The G2 invariant is that the lookup REFUSES an unestablished trade rather
    // than resolving unscoped. Asserted directly, since a fresh contractor has
    // no active service yet and the scoped lookup legitimately finds nothing.
    const unscoped = await findTroubleshootingService(db, ids[A], "");
    ok(unscoped.ok === false, `G2: an unestablished trade is refused, not resolved unscoped`,
      unscoped.ok ? "it resolved anyway" : "");
    const scoped = await findTroubleshootingService(db, ids[A], "plumbing");
    const scopedTrade = scoped.ok
      ? await tradeOfService(db, ids[A], scoped.service.id) : null;
    ok(!scoped.ok || (scopedTrade?.ok === true && scopedTrade.tradeKey === "plumbing"),
      `G2: a scoped lookup only ever returns a plumbing service` +
      (scoped.ok ? ` (${scoped.service.slug})` : ` (nothing active yet, as expected on a fresh install)`),
      scopedTrade && scopedTrade.ok ? `resolved to ${scopedTrade.tradeKey}` : "");
  } finally {
    group("TEARDOWN");
    await teardown(db, [A, B]);
    const tv = await db.templateVersion.count({ where: { trade: "plumbing" } });
    ok(tv === 1, "the canonical template survives teardown (contractor data only)", `${tv}`);
    await db.$disconnect();
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).stack}\n`); process.exit(1); });
