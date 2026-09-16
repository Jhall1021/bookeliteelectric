/**
 * Electrical entry-service aliases — sump pump and fridge/freezer dedicated
 * circuits.
 *
 * ADOPTS TWO EXISTING, PRE-SEEDED, DORMANT PLACEHOLDER SERVICES. Both
 * sump-pump-dedicated-circuit and freezer-fridge-dedicated-circuit already
 * exist as inactive, tree-less rows — the same "known future work" pattern
 * as the still-dormant electric-fireplace-circuit sibling. This script does
 * NOT create a service from scratch: it refuses if either row is missing.
 * Its only job is to activate the two known rows and give each exactly one
 * question with exactly one answer ("the tiny alias question and one
 * customer click" — approved shape, mirroring the live
 * dishwasher-electrical -> dedicated-120v-circuit-outlet precedent) whose
 * REROUTE_SERVICE branch sends the customer into the existing canonical
 * dedicated-120v-circuit-outlet tree.
 *
 * TWO PHASES: PREFLIGHT BOTH, THEN WRITE BOTH ATOMICALLY.
 *
 * Every check for BOTH aliases — the row exists, its category matches the
 * canonical service's — runs to completion before either alias is written.
 * Interleaving validate-then-write per alias meant a problem with the SECOND
 * alias was discovered only after the FIRST had already been modified, which
 * is a partial write wearing a clean refusal's clothes. The two writes
 * themselves then run inside one `prisma.$transaction`, so a failure on
 * either one rolls both back — there is no state where one alias is adopted
 * and the other is not.
 *
 * THE PRESET FACT IS CARRIED BY VOCABULARY, NOT BY A NEW MECHANISM.
 *
 * The alias's one Question uses the SAME key the canonical tree's own first
 * question uses (`dedicated_equipment`), and its one AnswerOption uses the
 * SAME value one of the canonical question's real answers already uses
 * (`sump_pump` / `fridge_freezer`). GuidedFlowEngine's existing reroute
 * answer-carry (RerouteNotice + sessionStorage handoff) forwards the
 * customer's `answers` map filtered to keys the TARGET tree recognizes —
 * `dedicated_equipment` passes that filter because it is genuinely one of
 * the canonical tree's own question keys. On the target side,
 * GuidedFlowEngine.advanceFrom's existing "auto-skip an already-answered
 * question" walk (handoff §29) then evaluates the preset answer exactly as
 * if the customer had clicked it, and moves straight to that answer's own
 * `nextQuestionId` — which is dedicated_route_access for both sump_pump and
 * fridge_freezer, since neither needs the manual amperage question.
 *
 * No new engine behavior. No new auto-select/auto-answer framework. No
 * duplicate tree, material recipe, pricing logic or service-specific labor
 * logic — every question after the equipment one, and all pricing, stays on
 * dedicated-120v-circuit-outlet's own existing tree.
 *
 * Idempotent on the adoption path: re-running after the tree has already
 * been added is a safe no-op (active/offered/basePrice are simply re-set to
 * the same values, and the existing tree is left untouched rather than
 * duplicated). NOT idempotent on a missing row — that is a refusal, always.
 *
 *   DATABASE_URL="<rehearsal, not production>" npx tsx scripts/apply-dedicated-circuit-entry-aliases.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTRACTOR_SLUG = "elite-electric";
const CANONICAL_SLUG = "dedicated-120v-circuit-outlet";
const CATEGORY_SLUG = "dedicated-circuits";

type AliasSpec = {
  slug: string;
  equipmentValue: string;
  questionPrompt: string;
  answerLabel: string;
};

// NOTE: both slugs already exist as DORMANT seed rows (active=false,
// offered=false, zero questions) — the same "known future work" placeholder
// pattern as the electric-fireplace-circuit sibling this task must NOT touch.
// This script adopts the existing rows rather than creating new ones: it
// activates them and adds the one-question tree, leaving every other
// pre-seeded field (name, shortDescription, ids) exactly as it already was.
const ALIASES: AliasSpec[] = [
  {
    slug: "sump-pump-dedicated-circuit",
    equipmentValue: "sump_pump",
    questionPrompt: "Add a dedicated circuit for your sump pump?",
    answerLabel: "Yes, continue",
  },
  {
    slug: "freezer-fridge-dedicated-circuit",
    equipmentValue: "fridge_freezer",
    questionPrompt: "Add a dedicated circuit for your refrigerator or freezer?",
    answerLabel: "Yes, continue",
  },
];

async function main() {
  console.log("\nDEDICATED CIRCUIT ENTRY ALIASES — apply\n");

  const contractor = await prisma.contractor.findUniqueOrThrow({
    where: { slug: CONTRACTOR_SLUG },
    select: { id: true },
  });
  const canonical = await prisma.service.findFirstOrThrow({
    where: { contractorId: contractor.id, slug: CANONICAL_SLUG },
    select: {
      id: true, categoryId: true, contractorCategoryId: true, startingPriceLabel: true,
      basePrice: true, publishedPriceApprovedAt: true,
    },
  });
  // Confirm the canonical tree's own vocabulary before trusting it — refuse
  // rather than create an alias whose preset value has no home to land on.
  const equipmentQuestion = await prisma.question.findFirstOrThrow({
    where: { serviceId: canonical.id, key: "dedicated_equipment" },
    select: { id: true, options: { select: { value: true } } },
  });
  const canonicalValues = new Set(equipmentQuestion.options.map((o) => o.value));
  for (const a of ALIASES) {
    if (!canonicalValues.has(a.equipmentValue)) {
      throw new Error(
        `refusing: canonical dedicated_equipment question has no answer option with value "${a.equipmentValue}" ` +
          `(has: ${[...canonicalValues].join(", ")})`
      );
    }
  }

  if (!canonical.contractorCategoryId) {
    throw new Error("refusing: canonical service has no contractorCategoryId to mirror");
  }

  // basePrice and publishedPriceApprovedAt are a paired invariant at the
  // database layer (CHECK services_price_requires_approval: one is null iff
  // the other is). Mirroring the canonical service's own already-approved
  // price and approval timestamp — not fabricating a fresh approval — keeps
  // this honest: the number was genuinely approved, just for the service it
  // actually describes.
  //
  // basePrice MUST be non-null for REROUTE_SERVICE to actually fire.
  // GuidedFlowEngine.evaluate() calls lib/pricing.ts's customerPrice(config,
  // Service.basePrice) BEFORE looking at the answer's routeAction at all,
  // and customerPrice() forces `mustReview: true` whenever the published
  // base price is null — which short-circuits evaluate() straight to a
  // photo-review terminal, silently pre-empting REROUTE_SERVICE. This is
  // true for every service, not something specific to an alias; it is why
  // the live dishwasher-electrical precedent has a real basePrice even
  // though its REROUTE_SERVICE branch never uses that number. The alias's
  // own basePrice is otherwise functionally inert — a REROUTE_SERVICE branch
  // never reaches PriceConfirmationCard, so the only place a customer ever
  // sees it is the alias's own intro screen, before any question is asked.
  // Mirroring the canonical service's own live basePrice keeps that preview
  // honest and never stale relative to what the customer will actually see
  // after the reroute.
  if (canonical.basePrice === null) {
    throw new Error("refusing: canonical service has no basePrice to mirror");
  }

  // ── PHASE 1: PREFLIGHT, BOTH ALIASES, NO WRITES YET ─────────────────────
  //
  // Load and validate EVERY alias before touching either one. Interleaving
  // validate-then-write per alias meant a missing or mismatched SECOND alias
  // was discovered only after the FIRST had already been modified — a
  // partial adoption disguised as a clean refusal. Collecting every load
  // into `loaded` first, and throwing out of this loop before phase 2 ever
  // starts, means either alias failing preflight guarantees NEITHER alias
  // has been written.
  type Loaded = {
    alias: AliasSpec;
    existing: { id: string; questions: { id: string }[] };
  };
  const loaded: Loaded[] = [];
  for (const alias of ALIASES) {
    const existing = await prisma.service.findFirst({
      where: { contractorId: contractor.id, slug: alias.slug },
      select: {
        id: true, categoryId: true, contractorCategoryId: true,
        questions: { select: { id: true } },
      },
    });

    // NO CREATE-IF-MISSING FALLBACK. This script adopts a specific,
    // already-known pre-seeded row; it is not a general "make this alias
    // exist somehow" tool. A missing row means the seed data this script was
    // written against has changed — that is a decision for a person, not
    // something to paper over by inventing a fresh Service here.
    if (!existing) {
      throw new Error(
        `refusing: no pre-seeded Service row found for slug "${alias.slug}" on contractor "${CONTRACTOR_SLUG}". ` +
          `This script only adopts the existing dormant placeholder row (same pattern as electric-fireplace-circuit) ` +
          `— it does not create one from scratch. This is phase 1 (preflight): nothing has been written for ` +
          `either alias yet.`
      );
    }
    if (existing.categoryId !== canonical.categoryId || existing.contractorCategoryId !== canonical.contractorCategoryId) {
      throw new Error(
        `refusing: ${alias.slug}'s existing category does not match the canonical service's category. ` +
          `This is phase 1 (preflight): nothing has been written for either alias yet.`
      );
    }

    loaded.push({ alias, existing: { id: existing.id, questions: existing.questions } });
  }

  // ── PHASE 2: ADOPT BOTH ATOMICALLY ──────────────────────────────────────
  //
  // One transaction for both updates. Either both succeed or the database
  // shows neither was touched — a failure partway through (a dropped
  // connection, a constraint violation on the second write) rolls the first
  // one back too, rather than leaving one alias adopted and the other not.
  const summaries: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const { alias, existing } of loaded) {
      await tx.service.update({
        where: { id: existing.id },
        data: {
          active: true,
          offered: true,
          basePrice: canonical.basePrice,
          publishedPriceApprovedAt: canonical.publishedPriceApprovedAt,
          ...(existing.questions.length === 0
            ? { questions: { create: [{
                key: "dedicated_equipment",
                prompt: alias.questionPrompt,
                inputType: "SINGLE_SELECT",
                order: 1,
                options: { create: [{
                  label: alias.answerLabel, value: alias.equipmentValue,
                  routeAction: "REROUTE_SERVICE", rerouteServiceId: canonical.id, order: 1,
                }] },
              }] } }
            : {}),
        },
      });
      summaries.push(`  ok    adopted ${alias.slug} (${existing.id}): active/offered/basePrice set` +
        (existing.questions.length === 0 ? ", tree added" : " (tree already present, left untouched)"));
    }
  });

  // Only printed once the transaction has actually committed — a summary
  // logged from inside the callback would be misleading if a LATER
  // statement in the same transaction then failed and rolled everything back.
  for (const line of summaries) console.log(line);
  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
