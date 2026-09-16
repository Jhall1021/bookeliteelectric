/**
 * Electrical entry-service aliases — sump pump and fridge/freezer dedicated
 * circuits.
 *
 * Creates two NEW, separately-discoverable storefront services that are
 * entry points only. Each has exactly one question with exactly one answer
 * ("the tiny alias question and one customer click" — approved shape,
 * mirroring the live dishwasher-electrical -> dedicated-120v-circuit-outlet
 * precedent) whose REROUTE_SERVICE branch sends the customer into the
 * existing canonical dedicated-120v-circuit-outlet tree.
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
 * Idempotent: skips a slug that already exists for this contractor rather
 * than erroring or duplicating.
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

  for (const alias of ALIASES) {
    const existing = await prisma.service.findFirst({
      where: { contractorId: contractor.id, slug: alias.slug },
      select: {
        id: true, active: true, offered: true, basePrice: true,
        categoryId: true, contractorCategoryId: true,
        questions: { select: { id: true } },
      },
    });

    if (!existing) {
      // No pre-seeded row on this database — create it fresh, same shape as
      // the adopt path below would leave it in.
      const service = await prisma.service.create({
        data: {
          contractorId: contractor.id,
          slug: alias.slug,
          name: alias.slug === "sump-pump-dedicated-circuit"
            ? "Sump Pump Dedicated Circuit" : "Freezer / Refrigerator Dedicated Circuit",
          categoryId: canonical.categoryId,
          contractorCategoryId: canonical.contractorCategoryId,
          bookingType: "REMOTE_QUOTE",
          basePrice: canonical.basePrice,
          publishedPriceApprovedAt: canonical.publishedPriceApprovedAt,
          icon: "circuit",
          requiresTechCount: 1,
          photoState: "NONE",
          active: true,
          offered: true,
          isPrimaryEligible: true,
          depositRule: "USE_COMPANY_POLICY",
          depositCreditsToJob: true,
          installationRequiresPreWorkCompletion: true,
          materialCostResolved: true,
          questions: {
            create: [{
              key: "dedicated_equipment",
              prompt: alias.questionPrompt,
              inputType: "SINGLE_SELECT",
              order: 1,
              options: { create: [{
                label: alias.answerLabel, value: alias.equipmentValue,
                routeAction: "REROUTE_SERVICE", rerouteServiceId: canonical.id, order: 1,
              }] },
            }],
          },
        },
        select: { id: true, slug: true },
      });
      console.log(`  ok    created ${service.slug} (${service.id})`);
      continue;
    }

    // ADOPT the pre-seeded dormant row (same placeholder pattern as
    // electric-fireplace-circuit) rather than creating a duplicate.
    // Everything else already on the row — name, shortDescription,
    // category — is left exactly as it was.
    if (existing.categoryId !== canonical.categoryId || existing.contractorCategoryId !== canonical.contractorCategoryId) {
      throw new Error(`refusing: ${alias.slug}'s existing category does not match the canonical service's category`);
    }

    await prisma.service.update({
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
    console.log(`  ok    adopted ${alias.slug} (${existing.id}): active/offered/basePrice set` +
      (existing.questions.length === 0 ? ", tree added" : " (tree already present, left untouched)"));
  }

  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
