/**
 * Three focused, non-browser proofs for lib/disclaimerAuthoring.ts's
 * provenance + reachability contract — synthetic trades and TemplateVersions
 * (never "electrical"), no dev server, no browser. Fast and deterministic.
 *
 *   npx tsx scripts/verify-disclaimer-template-version-fold.ts
 *
 * NOT PART OF `npm run verify`. Needs the owned, stamped local database this
 * run's own DATABASE_URL points at (checked below, same guard every other
 * rehearsal script in this repo uses).
 *
 * SCENARIO 1 — a superseded version's requirement must not leak
 *
 * A contractor installs from whichever TemplateVersion is current at install
 * time. `installedDisclaimerRequirements` (lib/disclaimerAuthoring.ts) reads
 * each of the contractor's OWN services' own recorded `templateVersionId` —
 * never "whatever is current now" — so a requirement that belonged only to
 * an OLDER, no-longer-installed version never surfaces for a contractor who
 * installed the newer one.
 *
 * SCENARIO 2 — real graph reachability, install-time AND authoring targets
 *
 * A question nothing points to (the tree's own stated "rewired out, not
 * deleted" policy for a retired branch — prisma/seed-new-outlet-v2.ts) stays
 * in the catalog as a historical record. A disclaimer required under it must
 * not appear in `Service.unresolvedDisclaimerKeys` (installCatalog), must
 * not appear in `pendingContractorDisclaimers`, and a save must still attach
 * EVERY reachable target (not just one) before clearing the service's
 * blocker.
 *
 * SCENARIO 3 — provenance survives a later publish with no adoption
 *
 * The specific failure case neither the old "any version ever" bug nor
 * scenario 1 alone covers: publish TemplateVersion v1, install a contractor
 * from it, and ONLY THEN publish v2 — a later change to the SAME service key
 * that both drops the requirement the contractor's own rows still carry and
 * adds one they never installed. `installedDisclaimerRequirements` must
 * report exactly what v1 gave this contractor, regardless of what the
 * catalog says today.
 */
import { PrismaClient } from "@prisma/client";
import { preflight, installCatalog, templateVersionSource } from "../lib/templateProvisioning";
import { pendingContractorDisclaimers, authorContractorDisclaimer } from "../lib/disclaimerAuthoring";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";

const prisma = new PrismaClient();
const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function teardownTrade(trade: string, contractorSlug: string, categorySlug: string, disclaimerKeys: string[]) {
  const versions = await prisma.templateVersion.findMany({ where: { trade }, select: { id: true } });
  // Cascades TemplateService -> TemplateQuestion -> TemplateAnswerOption ->
  // TemplateAnswerOptionDisclaimer for every version of this trade.
  await prisma.templateVersion.deleteMany({ where: { id: { in: versions.map((v) => v.id) } } }).catch(() => {});
  await prisma.canonicalDisclaimer.deleteMany({ where: { key: { in: disclaimerKeys } } }).catch(() => {});

  const contractor = await prisma.contractor.findUnique({ where: { slug: contractorSlug }, select: { id: true } });
  if (contractor) {
    const ids = (await prisma.service.findMany({ where: { contractorId: contractor.id }, select: { id: true } })).map((s) => s.id);
    await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } }).catch(() => {});
    await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } }).catch(() => {});
    await prisma.question.deleteMany({ where: { serviceId: { in: ids } } }).catch(() => {});
    await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorCategory.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorDisclaimer.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractorTrade.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
    await prisma.contractor.delete({ where: { id: contractor.id } }).catch(() => {});
  }
  await prisma.canonicalCategory.deleteMany({ where: { slug: categorySlug } }).catch(() => {});
}

// ── Scenario 1 — a superseded version's requirement must not leak ─────────
async function scenarioSupersededVersion() {
  const TRADE = `test_fold_${RUN}`;
  const SERVICE_KEY = `fold_service_${RUN}`;
  const CATEGORY_SLUG = `fold-category-${RUN}`;
  const CONTRACTOR_SLUG = `fold-contractor-${RUN}`;
  const OLD_CONCEPT_KEY = `TEST_FOLD_RETIRED_${RUN}`;
  const CURRENT_CONCEPT_KEY = `TEST_FOLD_CURRENT_${RUN}`;

  await teardownTrade(TRADE, CONTRACTOR_SLUG, CATEGORY_SLUG, [OLD_CONCEPT_KEY, CURRENT_CONCEPT_KEY]);

  const category = await prisma.canonicalCategory.create({ data: { slug: CATEGORY_SLUG, name: "Fold Test Category" }, select: { id: true } });
  const oldDisclaimer = await prisma.canonicalDisclaimer.create({ data: { key: OLD_CONCEPT_KEY, name: "Retired concept" }, select: { id: true } });

  const serviceShape = (disclaimerId: string) => ({
    key: SERVICE_KEY, slug: SERVICE_KEY, name: "Fold Test Service",
    canonicalCategoryId: category.id, bookingType: "INSTANT" as const, photoState: "NONE" as const,
    questions: {
      create: [{
        key: "q1", prompt: "Fold test question?", inputType: "SINGLE_SELECT" as const, order: 0,
        options: { create: [{ value: "yes", label: "Yes", routeAction: "RESOLVE_INSTANT" as const, order: 0, disclaimers: { create: [{ canonicalDisclaimerId: disclaimerId }] } }] },
      }],
    },
  });

  // v1 — an OLD snapshot, since superseded. Carries the RETIRED concept.
  await prisma.templateVersion.create({ data: { trade: TRADE, version: 1, kind: "SNAPSHOT", services: { create: [serviceShape(oldDisclaimer.id)] } } });

  // v2 — the CURRENT snapshot (higher version wins templateVersionSource's
  // `orderBy: { version: "desc" }`, so this is what a FRESH install reads).
  // Same service/question/option keys, but the retired concept is gone,
  // replaced by a different, current one.
  const currentDisclaimer = await prisma.canonicalDisclaimer.create({ data: { key: CURRENT_CONCEPT_KEY, name: "Current concept" }, select: { id: true } });
  await prisma.templateVersion.create({ data: { trade: TRADE, version: 2, kind: "SNAPSHOT", services: { create: [serviceShape(currentDisclaimer.id)] } } });

  const contractor = await prisma.contractor.create({ data: { slug: CONTRACTOR_SLUG, name: "Fold Test Contractor", active: true, countryCode: "US" }, select: { id: true } });
  await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: TRADE } });
  const pf = await preflight(prisma, contractor.id, templateVersionSource(prisma, TRADE));
  if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
  const result = await installCatalog(prisma, contractor.id, pf.catalog);
  ok("1a. installed the CURRENT (v2) catalog, one service, one disclaimer to author", result.services === 1 && result.disclaimersToAuthor === 1, JSON.stringify(result));

  const pending = await pendingContractorDisclaimers(prisma, contractor.id);
  ok("1b. the RETIRED concept from the superseded v1 snapshot does not appear at all",
    !pending.some((d) => d.key === OLD_CONCEPT_KEY), JSON.stringify(pending.map((d) => d.key)));
  const current = pending.find((d) => d.key === CURRENT_CONCEPT_KEY);
  ok("1c. the CURRENT concept from v2 DOES appear, unauthored, naming this contractor's real service",
    !!current && !current.authored && current.dependentSlugs.includes(SERVICE_KEY), JSON.stringify(current));

  await teardownTrade(TRADE, CONTRACTOR_SLUG, CATEGORY_SLUG, [OLD_CONCEPT_KEY, CURRENT_CONCEPT_KEY]);
}

// ── Scenario 2 — real graph reachability, both install-time and authoring ──
async function scenarioReachability() {
  const TRADE = `test_reach_${RUN}`;
  const SERVICE_KEY = `reach_service_${RUN}`;
  const CATEGORY_SLUG = `reach-category-${RUN}`;
  const CONTRACTOR_SLUG = `reach-contractor-${RUN}`;
  const REACH_KEY = `TEST_REACH_${RUN}`;
  const UNREACH_KEY = `TEST_UNREACH_${RUN}`;

  await teardownTrade(TRADE, CONTRACTOR_SLUG, CATEGORY_SLUG, [REACH_KEY, UNREACH_KEY]);

  const category = await prisma.canonicalCategory.create({ data: { slug: CATEGORY_SLUG, name: "Reach Test Category" }, select: { id: true } });
  const reachConcept = await prisma.canonicalDisclaimer.create({ data: { key: REACH_KEY, name: "Reachable concept" }, select: { id: true } });
  const unreachConcept = await prisma.canonicalDisclaimer.create({ data: { key: UNREACH_KEY, name: "Unreachable concept" }, select: { id: true } });

  await prisma.templateVersion.create({
    data: {
      trade: TRADE, version: 1, kind: "SNAPSHOT",
      services: {
        create: [{
          key: SERVICE_KEY, slug: SERVICE_KEY, name: "Reach Test Service",
          canonicalCategoryId: category.id, bookingType: "INSTANT", photoState: "NONE",
          questions: {
            create: [
              // Entry point (lowest order) — the only path a homeowner can
              // actually take, and it leads to "reachable_q", never to
              // "unreachable_q".
              {
                key: "entry", prompt: "Start?", inputType: "SINGLE_SELECT", order: 0,
                options: { create: [{ value: "go", label: "Go", routeAction: "CONTINUE", order: 0, nextQuestionKey: "reachable_q" }] },
              },
              // TWO options here both need REACH_KEY — proves a save attaches
              // EVERY reachable target, not just the first one found.
              {
                key: "reachable_q", prompt: "Reachable question?", inputType: "SINGLE_SELECT", order: 1,
                options: {
                  create: [
                    { value: "a", label: "A", routeAction: "RESOLVE_INSTANT", order: 0, disclaimers: { create: [{ canonicalDisclaimerId: reachConcept.id }] } },
                    { value: "b", label: "B", routeAction: "RESOLVE_INSTANT", order: 1, disclaimers: { create: [{ canonicalDisclaimerId: reachConcept.id }] } },
                  ],
                },
              },
              // Nothing anywhere in this tree sets nextQuestionKey to
              // "unreachable_q" — a retained, "rewired out" question, exactly
              // like device_on_exterior_wall on new-120v-outlet.
              {
                key: "unreachable_q", prompt: "Unreachable question?", inputType: "SINGLE_SELECT", order: 2,
                options: { create: [{ value: "c", label: "C", routeAction: "RESOLVE_INSTANT", order: 0, disclaimers: { create: [{ canonicalDisclaimerId: unreachConcept.id }] } }] },
              },
            ],
          },
        }],
      },
    },
  });

  const contractor = await prisma.contractor.create({ data: { slug: CONTRACTOR_SLUG, name: "Reach Test Contractor", active: true, countryCode: "US" }, select: { id: true } });
  await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: TRADE } });
  const pf = await preflight(prisma, contractor.id, templateVersionSource(prisma, TRADE));
  if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
  await installCatalog(prisma, contractor.id, pf.catalog);

  const svc = await prisma.service.findFirstOrThrow({ where: { slug: SERVICE_KEY, contractorId: contractor.id }, select: { id: true, unresolvedDisclaimerKeys: true } });
  ok("2a. install-time unresolvedDisclaimerKeys names the REACHABLE concept but not the unreachable one",
    svc.unresolvedDisclaimerKeys.includes(REACH_KEY) && !svc.unresolvedDisclaimerKeys.includes(UNREACH_KEY),
    JSON.stringify(svc.unresolvedDisclaimerKeys));

  const pendingBefore = await pendingContractorDisclaimers(prisma, contractor.id);
  ok("2b. pendingContractorDisclaimers lists the reachable concept, never the unreachable one",
    pendingBefore.some((d) => d.key === REACH_KEY) && !pendingBefore.some((d) => d.key === UNREACH_KEY),
    JSON.stringify(pendingBefore.map((d) => d.key)));

  const authored = await authorContractorDisclaimer(prisma, contractor.id, REACH_KEY, "Real wording for the reachable concept.");
  ok("2c. saving attaches BOTH reachable targets (a and b), not just one",
    authored.ok && authored.attached === 2, JSON.stringify(authored));

  const svcAfter = await prisma.service.findUniqueOrThrow({ where: { id: svc.id }, select: { unresolvedDisclaimerKeys: true } });
  ok("2d. the reachable concept's blocker clears after the save satisfies every one of its targets",
    !svcAfter.unresolvedDisclaimerKeys.includes(REACH_KEY), JSON.stringify(svcAfter.unresolvedDisclaimerKeys));

  await teardownTrade(TRADE, CONTRACTOR_SLUG, CATEGORY_SLUG, [REACH_KEY, UNREACH_KEY]);
}

// ── Scenario 3 — provenance survives a later publish with no adoption ─────
async function scenarioProvenanceAfterLaterPublish() {
  const TRADE = `test_pub_${RUN}`;
  const SERVICE_KEY = `pub_service_${RUN}`;
  const CATEGORY_SLUG = `pub-category-${RUN}`;
  const CONTRACTOR_SLUG = `pub-contractor-${RUN}`;
  const ORIGINAL_KEY = `TEST_PUB_ORIGINAL_${RUN}`;
  const NEW_KEY = `TEST_PUB_NEW_${RUN}`;

  await teardownTrade(TRADE, CONTRACTOR_SLUG, CATEGORY_SLUG, [ORIGINAL_KEY, NEW_KEY]);

  const category = await prisma.canonicalCategory.create({ data: { slug: CATEGORY_SLUG, name: "Publish Test Category" }, select: { id: true } });
  const originalDisclaimer = await prisma.canonicalDisclaimer.create({ data: { key: ORIGINAL_KEY, name: "Original concept" }, select: { id: true } });

  const serviceShape = (disclaimerId: string) => ({
    key: SERVICE_KEY, slug: SERVICE_KEY, name: "Publish Test Service",
    canonicalCategoryId: category.id, bookingType: "INSTANT" as const, photoState: "NONE" as const,
    questions: {
      create: [{
        key: "q1", prompt: "Publish test question?", inputType: "SINGLE_SELECT" as const, order: 0,
        options: { create: [{ value: "yes", label: "Yes", routeAction: "RESOLVE_INSTANT" as const, order: 0, disclaimers: { create: [{ canonicalDisclaimerId: disclaimerId }] } }] },
      }],
    },
  });

  // v1 — published FIRST. The contractor installs from this and only this.
  await prisma.templateVersion.create({ data: { trade: TRADE, version: 1, kind: "SNAPSHOT", services: { create: [serviceShape(originalDisclaimer.id)] } } });

  const contractor = await prisma.contractor.create({ data: { slug: CONTRACTOR_SLUG, name: "Publish Test Contractor", active: true, countryCode: "US" }, select: { id: true } });
  await prisma.contractorTrade.create({ data: { contractorId: contractor.id, tradeKey: TRADE } });
  const pf = await preflight(prisma, contractor.id, templateVersionSource(prisma, TRADE));
  if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
  await installCatalog(prisma, contractor.id, pf.catalog);

  // v2 — published AFTER install, with no adoption run for this contractor.
  // Drops ORIGINAL_KEY (this contractor's own installed rows still need it)
  // and introduces NEW_KEY (this contractor never installed it).
  const newDisclaimer = await prisma.canonicalDisclaimer.create({ data: { key: NEW_KEY, name: "New concept" }, select: { id: true } });
  await prisma.templateVersion.create({ data: { trade: TRADE, version: 2, kind: "SNAPSHOT", services: { create: [serviceShape(newDisclaimer.id)] } } });

  const pending = await pendingContractorDisclaimers(prisma, contractor.id);
  ok("3a. the ORIGINAL concept this contractor actually installed still shows pending, after a later publish",
    pending.some((d) => d.key === ORIGINAL_KEY), JSON.stringify(pending.map((d) => d.key)));
  ok("3b. the NEW concept from the later publish does NOT show — this contractor never installed it",
    !pending.some((d) => d.key === NEW_KEY), JSON.stringify(pending.map((d) => d.key)));

  await teardownTrade(TRADE, CONTRACTOR_SLUG, CATEGORY_SLUG, [ORIGINAL_KEY, NEW_KEY]);
}

async function main() {
  console.log(`\nDISCLAIMER AUTHORING — PROVENANCE + REACHABILITY FOCUSED PROOFS\n`);
  await assertDisposableLocalDatabase(prisma);

  await scenarioSupersededVersion();
  await scenarioReachability();
  await scenarioProvenanceAfterLaterPublish();

  console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  // Best-effort: whichever scenario's data is still standing gets swept by
  // the NEXT run's own leading teardownTrade calls either way, but try now
  // too rather than leaving it for later on a run that never returns.
  await teardownTrade(`test_fold_${RUN}`, `fold-contractor-${RUN}`, `fold-category-${RUN}`, [`TEST_FOLD_RETIRED_${RUN}`, `TEST_FOLD_CURRENT_${RUN}`]).catch(() => {});
  await teardownTrade(`test_reach_${RUN}`, `reach-contractor-${RUN}`, `reach-category-${RUN}`, [`TEST_REACH_${RUN}`, `TEST_UNREACH_${RUN}`]).catch(() => {});
  await teardownTrade(`test_pub_${RUN}`, `pub-contractor-${RUN}`, `pub-category-${RUN}`, [`TEST_PUB_ORIGINAL_${RUN}`, `TEST_PUB_NEW_${RUN}`]).catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
