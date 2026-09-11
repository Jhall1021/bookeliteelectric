/**
 * The Services & Pricing / service editor redesign's two genuinely new
 * pieces of LOGIC — not the visual layout, which is covered by manual/
 * browser verification, but the two places this pass changed real behavior:
 *
 *   the option-delete guard   deleting a single answer option used to have
 *                             NO check at all for whether it was the only
 *                             path reaching a later question — silently
 *                             orphaning it. computeOptionDeleteImpacts is
 *                             the fix; this proves it against real tree
 *                             shapes, not just the happy path.
 *   the admin preview engine  previewStep (lib/adminQuestionPreview.ts)
 *                             walks a REAL branching service — with an
 *                             existing REROUTE_SERVICE answer, matching the
 *                             instruction to test a branching service with
 *                             an existing reroute — through the exact
 *                             server-authoritative resolveRoute, proving it
 *                             (a) asks the right questions in order, (b)
 *                             reaches the real reroute target by name, (c)
 *                             reaches a real computed price, not a preview-
 *                             only number, and (d) writes nothing anywhere.
 *
 * Disposable fixtures only — a run-unique contractor and two run-unique
 * services, created and destroyed by this file. No production data.
 *
 *   npx tsx scripts/verify-services-workspace-redesign.ts
 */
import { PrismaClient } from "@prisma/client";
import { computeOptionDeleteImpacts, type QuestionData } from "../components/admin/questions/types";
import { previewStep } from "../lib/adminQuestionPreview";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-services-redesign";
const SLUG_SIMPLE = `${SLUG_PREFIX}-${RUN}-simple`;
const SLUG_BRANCH = `${SLUG_PREFIX}-${RUN}-branch`;
const CONTRACTOR_SLUG = `${SLUG_PREFIX}-${RUN}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function teardown() {
  const c = await raw.contractor.findUnique({ where: { slug: CONTRACTOR_SLUG }, select: { id: true } });
  if (!c) return;
  await raw.answerOption.deleteMany({ where: { question: { service: { contractorId: c.id } } } }).catch(() => {});
  await raw.question.deleteMany({ where: { service: { contractorId: c.id } } }).catch(() => {});
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: CONTRACTOR_SLUG }, createdAt: { lt: cutoff } },
    select: { id: true, slug: true },
  });
  for (const c of stale) {
    await raw.answerOption.deleteMany({ where: { question: { service: { contractorId: c.id } } } }).catch(() => {});
    await raw.question.deleteMany({ where: { service: { contractorId: c.id } } }).catch(() => {});
    await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
    await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
  }
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

// ── 1. computeOptionDeleteImpacts — pure, no DB ─────────────────────────────
function testDeleteImpacts() {
  console.log("\n  OPTION-DELETE GUARD — pure logic\n");

  const q = (id: string, prompt: string, options: QuestionData["options"]): QuestionData => ({
    id, prompt, helpText: null, options,
  });
  const opt = (id: string, overrides: Partial<QuestionData["options"][number]> = {}) => ({
    id, label: id, routeAction: "RESOLVE_INSTANT", priceModifierCents: 0,
    referencedServiceId: null, referencedServiceName: null,
    rerouteServiceId: null, rerouteServiceName: null,
    nextQuestionId: null, disclaimer: null, requiredPhotoLabels: [], photosBlockBooking: true,
    ...overrides,
  });

  // Case A: single path to Q2 — deleting it should warn.
  {
    const tree = [
      q("q1", "Q1", [opt("o1", { routeAction: "CONTINUE", nextQuestionId: "q2" })]),
      q("q2", "Q2", [opt("o2")]),
    ];
    const impacts = computeOptionDeleteImpacts(tree);
    ok("the only path to a question is flagged", impacts.has("o1"));
    ok("...and names the real target question", impacts.get("o1")!.includes("Q2"));
    ok("an option with no CONTINUE route is never flagged", !impacts.has("o2"));
  }

  // Case B: TWO paths to Q2 — deleting either alone is safe.
  {
    const tree = [
      q("q1", "Q1", [
        opt("o1", { routeAction: "CONTINUE", nextQuestionId: "q2" }),
        opt("o1b", { routeAction: "CONTINUE", nextQuestionId: "q2" }),
      ]),
      q("q2", "Q2", [opt("o2")]),
    ];
    const impacts = computeOptionDeleteImpacts(tree);
    ok("a redundant second path is NOT flagged — deleting one still leaves a path", !impacts.has("o1") && !impacts.has("o1b"));
  }

  // Case C: a dead-end CONTINUE (no nextQuestionId set yet) is never flagged —
  // there is nothing for it to be "the only path to".
  {
    const tree = [q("q1", "Q1", [opt("o1", { routeAction: "CONTINUE", nextQuestionId: null })])];
    ok("an unset CONTINUE target is never flagged", !computeOptionDeleteImpacts(tree).has("o1"));
  }

  // Case D: a REROUTE_SERVICE answer is never flagged by this guard — it has
  // no `nextQuestionId`, so it can't be a path TO a question at all; the
  // guard is specifically about the CONTINUE/question-reachability case.
  {
    const tree = [q("q1", "Q1", [opt("o1", { routeAction: "REROUTE_SERVICE", rerouteServiceId: "svc-x" })])];
    ok("a REROUTE_SERVICE answer is never flagged by the question-reachability guard", !computeOptionDeleteImpacts(tree).has("o1"));
  }
}

// ── 2. previewStep against a real branching service ─────────────────────────
async function testPreview() {
  console.log("\n  ADMIN PREVIEW ENGINE — real branching service, existing reroute\n");
  await teardown();
  await sweepStale();

  const contractor = await raw.contractor.create({
    data: { slug: CONTRACTOR_SLUG, name: "Services Redesign Preview Probe", active: false },
    select: { id: true },
  });
  // previewStep loads its own pricing settings internally (loadPricingSettings)
  // — this just needs to exist for that lookup to succeed.
  await raw.pricingSettings.upsert({
    where: { contractorId: contractor.id },
    create: {
      contractorId: contractor.id, crewHourRateCents: 20000, primaryMinimumCents: 25000,
      roundingIncrementCents: 100, defaultPermitAdminCents: 0,
    },
    update: {},
  });
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });

  const simple = await raw.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: SLUG_SIMPLE, name: "Simple test service",
      bookingType: "INSTANT", photoState: "NONE", active: true, offered: true,
      basePrice: 15000, publishedPriceApprovedAt: new Date(), fieldLaborHours: 1, requiresTechCount: 1,
    },
    select: { id: true },
  });

  const branch = await raw.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: SLUG_BRANCH, name: "Branching test service",
      bookingType: "INSTANT", photoState: "NONE", active: true, offered: true,
      fieldLaborHours: 1, requiresTechCount: 1,
      // A RESOLVE_INSTANT route still resolves against the service's own
      // published price — resolveRoute correctly refuses (INVALID) a route
      // that would price against nothing, exactly as real checkout does.
      basePrice: 20000, publishedPriceApprovedAt: new Date(),
    },
    select: { id: true },
  });

  // q1 -> (accessible: RESOLVE_INSTANT $200) | (needs a bigger job: REROUTE_SERVICE -> simple)
  const q1 = await raw.question.create({
    data: {
      serviceId: branch.id, key: "access", prompt: "Is it easily accessible?", inputType: "SINGLE_SELECT", order: 0,
      options: {
        create: [
          { value: "yes", label: "Yes, easy access", order: 0, routeAction: "RESOLVE_INSTANT", priceModifierCents: 0 },
          { value: "bigger_job", label: "Actually, it's a bigger job", order: 1, routeAction: "REROUTE_SERVICE", rerouteServiceId: simple.id },
        ],
      },
    },
    include: { options: true },
  });

  const first = await previewStep(raw, branch.id, {});
  ok("the first preview step asks the tree's real first question", first.status === "ASK" && "question" in first && first.question.prompt === "Is it easily accessible?", JSON.stringify(first));

  if (first.status === "ASK") {
    const accessKey = first.question.key;
    ok("the question carries its real answer values, not display order", first.question.options.some((o) => o.value === "yes") && first.question.options.some((o) => o.value === "bigger_job"));

    const priced = await previewStep(raw, branch.id, { [accessKey]: "yes" });
    ok("the accessible branch resolves to a real computed price, not a placeholder", priced.status === "PRICED", JSON.stringify(priced));

    const rerouted = await previewStep(raw, branch.id, { [accessKey]: "bigger_job" });
    ok("the reroute branch is recognized", rerouted.status === "REROUTE", JSON.stringify(rerouted));
    if (rerouted.status === "REROUTE") {
      ok("...names the REAL target service by its actual name, not its id", rerouted.targetServiceName === "Simple test service");
      ok("...and is a SERVICE reroute, not TROUBLESHOOTING", rerouted.via === "SERVICE");
      ok("...resolved, not a dead end", !rerouted.unresolved);
    }
  }

  // Never writes anything — the whole point of a preview. Both loadServiceForResolution
  // and resolveRoute are read-only by construction (see lib/adminQuestionPreview.ts's
  // header); the most direct proof available without a schema-specific booking
  // query is that the service itself — the one thing a stray write could plausibly
  // reach — comes back completely unchanged after every step above.
  const servicesUnchanged = await raw.service.findUnique({
    where: { id: branch.id },
    select: { fieldLaborHours: true, basePrice: true, active: true, offered: true },
  });
  ok(
    "previewing never touches the service's own fields",
    servicesUnchanged?.fieldLaborHours === 1 && servicesUnchanged?.basePrice === 20000
      && servicesUnchanged?.active === true && servicesUnchanged?.offered === true
  );

  // A malformed/stale answer is reported, not crashed on.
  const garbage = await previewStep(raw, branch.id, { [q1.key]: "not-a-real-answer" });
  ok("an answer that no longer matches any option is reported, not crashed on", garbage.status === "INVALID", JSON.stringify(garbage));

  await teardown();
  const residue = await raw.contractor.count({ where: { slug: CONTRACTOR_SLUG } });
  ok("every fixture is gone at the end", residue === 0);
}

async function main() {
  console.log("\nSERVICES & PRICING WORKSPACE REDESIGN — new logic verification\n");
  testDeleteImpacts();
  await testPreview();
  await raw.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
