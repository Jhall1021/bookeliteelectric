/**
 * A disclaimer requirement retired by a newer template version must not
 * leak into a contractor's pending list — the specific bug an earlier
 * version of lib/disclaimerAuthoring.ts had.
 *
 * THE BUG
 *
 * `pendingContractorDisclaimers`/`authorContractorDisclaimer` used to query
 * `TemplateAnswerOptionDisclaimer` by matching `templateService.key` across
 * EVERY `TemplateVersion` that has ever existed for a trade — never asking
 * whether that version is still the current one. A concept required by an
 * OLD snapshot, since superseded by a newer one that dropped it, would still
 * surface as "pending" for a contractor whose actual installed rows came
 * from the CURRENT catalog and never carried it.
 *
 * THE FIX, PROVEN HERE
 *
 * Both functions now call `templateVersionSource` — the same snapshot+delta
 * fold `installCatalog` itself uses — so "what does this contractor still
 * owe wording for" is always asked against the CURRENT catalog, never
 * against history.
 *
 * A synthetic, throwaway trade and two synthetic TemplateVersions (never
 * "electrical") isolate this from the real catalog entirely: no dependency
 * on Elite's data, no dev server, no browser — just Prisma, fast and
 * deterministic.
 *
 *   npx tsx scripts/verify-disclaimer-template-version-fold.ts
 *
 * NOT PART OF `npm run verify`. Needs the owned, stamped local database this
 * run's own DATABASE_URL points at (checked below, same guard every other
 * rehearsal script in this repo uses).
 */
import { PrismaClient } from "@prisma/client";
import { preflight, installCatalog, templateVersionSource } from "../lib/templateProvisioning";
import { pendingContractorDisclaimers } from "../lib/disclaimerAuthoring";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";

const prisma = new PrismaClient();
const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const TRADE = `test_fold_${RUN}`;
const SERVICE_KEY = `fold_service_${RUN}`;
const QUESTION_KEY = "q1";
const OPTION_VALUE = "yes";
const OLD_CONCEPT_KEY = `TEST_FOLD_RETIRED_${RUN}`;
const CURRENT_CONCEPT_KEY = `TEST_FOLD_CURRENT_${RUN}`;

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function teardown() {
  const versions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { id: true } });
  // Cascades TemplateService -> TemplateQuestion -> TemplateAnswerOption ->
  // TemplateAnswerOptionDisclaimer for both versions.
  await prisma.templateVersion.deleteMany({ where: { id: { in: versions.map((v) => v.id) } } }).catch(() => {});
  await prisma.canonicalDisclaimer.deleteMany({ where: { key: { in: [OLD_CONCEPT_KEY, CURRENT_CONCEPT_KEY] } } }).catch(() => {});

  const contractor = await prisma.contractor.findUnique({ where: { slug: `fold-contractor-${RUN}` }, select: { id: true } });
  if (contractor) {
    const ids = (await prisma.service.findMany({ where: { contractorId: contractor.id }, select: { id: true } })).map((s) => s.id);
    await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } }).catch(() => {});
    await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } }).catch(() => {});
    await prisma.question.deleteMany({ where: { serviceId: { in: ids } } }).catch(() => {});
    await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorCategory.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorTrade.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractor.delete({ where: { id: contractor.id } }).catch(() => {});
  }
  await prisma.canonicalCategory.deleteMany({ where: { slug: `fold-category-${RUN}` } }).catch(() => {});
}

async function main() {
  console.log(`\nDISCLAIMER TEMPLATE-VERSION FOLD — a retired attachment must not leak\n`);
  await assertDisposableLocalDatabase(prisma);
  await teardown();

  const category = await prisma.canonicalCategory.create({
    data: { slug: `fold-category-${RUN}`, name: "Fold Test Category" },
    select: { id: true },
  });
  const oldDisclaimer = await prisma.canonicalDisclaimer.create({
    data: { key: OLD_CONCEPT_KEY, name: "Retired concept" },
    select: { id: true },
  });

  // v1 — an OLD snapshot, since superseded. Carries the RETIRED concept.
  await prisma.templateVersion.create({
    data: {
      trade: TRADE, version: 1, kind: "SNAPSHOT",
      services: {
        create: [{
          key: SERVICE_KEY, slug: SERVICE_KEY, name: "Fold Test Service",
          canonicalCategoryId: category.id, bookingType: "INSTANT", photoState: "NONE",
          questions: {
            create: [{
              key: QUESTION_KEY, prompt: "Fold test question?", inputType: "SINGLE_SELECT", order: 0,
              options: {
                create: [{
                  value: OPTION_VALUE, label: "Yes", routeAction: "RESOLVE_INSTANT", order: 0,
                  disclaimers: { create: [{ canonicalDisclaimerId: oldDisclaimer.id }] },
                }],
              },
            }],
          },
        }],
      },
    },
  });

  // v2 — the CURRENT snapshot for this trade (higher version wins,
  // templateVersionSource picks it by `orderBy: { version: "desc" }`). Same
  // service/question/option keys, but the retired concept is gone; a
  // DIFFERENT, CURRENT concept is required instead — proving the fold
  // excludes the old one without just returning nothing at all.
  const currentDisclaimer = await prisma.canonicalDisclaimer.create({
    data: { key: CURRENT_CONCEPT_KEY, name: "Current concept" },
    select: { id: true },
  });
  await prisma.templateVersion.create({
    data: {
      trade: TRADE, version: 2, kind: "SNAPSHOT",
      services: {
        create: [{
          key: SERVICE_KEY, slug: SERVICE_KEY, name: "Fold Test Service",
          canonicalCategoryId: category.id, bookingType: "INSTANT", photoState: "NONE",
          questions: {
            create: [{
              key: QUESTION_KEY, prompt: "Fold test question?", inputType: "SINGLE_SELECT", order: 0,
              options: {
                create: [{
                  value: OPTION_VALUE, label: "Yes", routeAction: "RESOLVE_INSTANT", order: 0,
                  disclaimers: { create: [{ canonicalDisclaimerId: currentDisclaimer.id }] },
                }],
              },
            }],
          },
        }],
      },
    },
  });

  // A real contractor, installed through the normal path — templateVersionSource
  // picks v2 (the current fold), so this contractor's own rows never carry
  // the retired concept at all, only the current one.
  const contractor = await prisma.contractor.create({
    data: { slug: `fold-contractor-${RUN}`, name: "Fold Test Contractor", active: true, countryCode: "US" },
    select: { id: true },
  });
  await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: TRADE } });
  const source = templateVersionSource(prisma, TRADE);
  const pf = await preflight(prisma, contractor.id, source);
  if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
  const result = await installCatalog(prisma, contractor.id, pf.catalog);
  ok("installed the CURRENT (v2) catalog, one service, one disclaimer to author", result.services === 1 && result.disclaimersToAuthor === 1, JSON.stringify(result));

  const pending = await pendingContractorDisclaimers(prisma, contractor.id);
  ok("the RETIRED concept from the superseded v1 snapshot does not appear at all",
    !pending.some((d) => d.key === OLD_CONCEPT_KEY), JSON.stringify(pending.map((d) => d.key)));
  const current = pending.find((d) => d.key === CURRENT_CONCEPT_KEY);
  ok("the CURRENT concept from v2 DOES appear, unauthored, naming this contractor's real service",
    !!current && !current.authored && current.dependentSlugs.includes(SERVICE_KEY),
    JSON.stringify(current));

  console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`);
  await teardown();
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await teardown().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
