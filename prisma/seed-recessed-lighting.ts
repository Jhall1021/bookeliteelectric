/**
 * Recessed Lighting — rebuilt on handoff §10-§12.
 *
 *   npx tsx prisma/seed-recessed-lighting.ts
 *
 * Replaces the old single-fixture tree, which had three faults:
 *
 *   1. No question asking HOW MANY lights. It priced one can at $375 whether
 *      the customer wanted two or twelve.
 *   2. Its own control questions ("is there an existing switch we could use")
 *      duplicated the Lighting Control module, so a customer answered the
 *      same thing twice in different words.
 *   3. Its +$150 and +$225 switch modifiers stacked on top of the module's
 *      $220-$435 components — charging twice for one switch leg.
 *
 * The new model: a first light carrying the setup cost, then additional
 * lights at an incremental rate, each with an accessible and a finished
 * tier. Control is handled once, by the shared module.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";

const prisma = new PrismaClient();

const SLUG = "recessed-lighting";
const ACCESS_KEY = "ceiling_access";
const COUNT_KEY = "recessed_light_count";

/**
 * §11-§12 labor and material, priced through the standard model. No
 * service-call minimum on the additional-light components — the minimum is
 * charged once on the whole job, not per can.
 *
 * The first light is the service's published base price, so it isn't a
 * component. The finished-space first light is calculated at $520 against a
 * published $375 + $100 = $475, so the existing approved modifier is kept
 * rather than the calculated figure published.
 */
const COMPONENTS = [
  {
    key: "RECESSED_ADDITIONAL_ACCESSIBLE",
    name: "Additional recessed light — accessible attic",
    customerFacingLabel: "Additional recessed light",
    approvedPriceCents: 13500,
    addFieldLaborHours: 0.35,
    addMaterialCostCents: 3500,
    addScheduleMinutes: 20,
    notes: "§11-§12 accessible tier. 0.35 hrs + $35 material.",
  },
  {
    key: "RECESSED_ADDITIONAL_FINISHED",
    name: "Additional recessed light — finished space above",
    customerFacingLabel: "Additional recessed light",
    approvedPriceCents: 20500,
    addFieldLaborHours: 0.6,
    addMaterialCostCents: 4000,
    addScheduleMinutes: 35,
    notes: "§11-§12 finished tier. 0.60 hrs + $40 material.",
  },
];

/** How many extra lights beyond the first each answer represents. */
const COUNTS = [
  { label: "Just one", value: "1", extra: 0 },
  { label: "2 lights", value: "2", extra: 1 },
  { label: "3 lights", value: "3", extra: 2 },
  { label: "4 lights", value: "4", extra: 3 },
  { label: "5 lights", value: "5", extra: 4 },
  { label: "6 lights", value: "6", extra: 5 },
  { label: "7 lights", value: "7", extra: 6 },
  { label: "8 lights", value: "8", extra: 7 },
];

async function main() {
  for (const c of COMPONENTS) {
    await prisma.jobComponent.upsert({
      where: { key: c.key },
      update: { ...c },
      create: c,
    });
  }
  console.log(`  ✓ ${COMPONENTS.length} recessed-light components defined`);

  const service = await prisma.service.findUnique({
    where: { slug: SLUG },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log("  – recessed-lighting not in the catalog");
    return;
  }

  // The old control questions are superseded by the shared module. Removed
  // AFTER the new tree is wired, so nothing is left pointing at them.
  const supersededKeys = ["existing_light_source", "switched_source", "attic_access"];
  const superseded = service.questions.filter((q) => supersededKeys.includes(q.key));

  // Height/access stays at 0 and 1; the lighting-control module keeps its
  // own questions. Ours sit between.
  const heightKeys = ["fixture_height", "work_area_below"];
  const moduleKeys = ["lighting_control", "switch_near_power", "lighting_dimmer_upgrade", "below_above_access", "finished_space_both_sides"];
  const controlQuestion = service.questions.find((q) => q.key === "lighting_control");

  // Access FIRST. The per-light components are conditioned on the access
  // classification, and a component whose condition can't be evaluated yet
  // matches nothing — which correctly, but uselessly, sends every count
  // straight to review. Establish the class, then price the count against it.
  const qAccess = await upsertQuestion(prisma, service.id, {
    key: ACCESS_KEY,
    // Same key the Lighting Control module conditions its switch-leg variants
    // on, so answering here selects the right one later without asking twice.
    prompt: "What's directly above that ceiling?",
    helpText: "An open attic lets us run wiring without opening the ceiling up. Finished space above means more work.",
    order: 2,
  });

  const qCount = await upsertQuestion(prisma, service.id, {
    key: COUNT_KEY,
    prompt: "How many recessed lights would you like?",
    helpText: "The first one covers the setup; the rest cost less because we're already up there.",
    order: 3,
  });

  const handoff = controlQuestion?.id ?? null;
  const countProceed = handoff
    ? { routeAction: "CONTINUE" as const, nextQuestionId: handoff }
    : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

  await prisma.answerOption.createMany({
    data: COUNTS.map((c, i) => ({
      questionId: qCount.id,
      label: c.label,
      value: c.value,
      ...countProceed,
      order: i + 1,
      requiredPhotoLabels: [],
      // Null, not zero: the price comes from the per-light components. An
      // explicit 0 here would override them and make six lights free.
      // "Just one" carries no components, so it resolves to 0 on its own.
      approvedComponentPriceCents: c.extra === 0 ? 0 : null,
    })),
  });

  const proceed = { routeAction: "CONTINUE" as const, nextQuestionId: qCount.id };

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qAccess.id,
        label: "An attic or open space we can get into",
        value: "accessible",
        accessClassification: "ACCESSIBLE",
        ...proceed,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qAccess.id,
        label: "Finished space — another floor or a finished room",
        value: "finished",
        accessClassification: "FINISHED",
        ...proceed,
        order: 2,
        requiredPhotoLabels: [],
        // The existing approved modifier, kept rather than the calculated
        // $520 first-light figure. Published prices don't move on a
        // calculation alone.
        priceModifierCents: 10000,
        approvedComponentPriceCents: 0,
        disclaimer:
          "Running wiring above a finished ceiling means we may need to make small openings in the drywall. Patching, sanding and painting aren't included unless we've put it in writing.",
      },
      {
        questionId: qAccess.id,
        label: "I'm not sure",
        value: "unsure",
        accessClassification: "UNKNOWN",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: [],
      },
    ],
  });

  // Attach the per-light component to each count answer, quantity = extras.
  // Both tiers are attached and conditioned on the access answer, so the
  // right one applies without asking again.
  const accId = (await prisma.jobComponent.findUniqueOrThrow({ where: { key: "RECESSED_ADDITIONAL_ACCESSIBLE" } })).id;
  const finId = (await prisma.jobComponent.findUniqueOrThrow({ where: { key: "RECESSED_ADDITIONAL_FINISHED" } })).id;

  for (const c of COUNTS) {
    if (c.extra === 0) continue;
    const opt = await prisma.answerOption.findFirstOrThrow({
      where: { questionId: qCount.id, value: c.value },
    });
    await prisma.answerOptionComponent.createMany({
      data: [
        // Conditioned on classification rather than raw value, so the tier
        // resolves whichever access question established it.
        { answerOptionId: opt.id, componentId: accId, quantity: c.extra, conditionAccessClass: "ACCESSIBLE" },
        { answerOptionId: opt.id, componentId: finId, quantity: c.extra, conditionAccessClass: "FINISHED" },
      ],
    });
  }

  // Point the height/access handoff at the count question.
  const below = service.questions.find((q) => q.key === "work_area_below");
  if (below) {
    await prisma.answerOption.updateMany({
      where: { questionId: below.id, routeAction: "CONTINUE" },
      data: { nextQuestionId: qAccess.id },
    });
  }

  // Now safe to remove the superseded questions and their stacked modifiers.
  for (const old of superseded) {
    await prisma.answerOption.deleteMany({ where: { questionId: old.id } });
    await prisma.question.delete({ where: { id: old.id } });
  }

  // Renumber what's left so the module sits after ours.
  const finalQs = await prisma.question.findMany({
    where: { serviceId: service.id },
    orderBy: { order: "asc" },
  });
  const orderKeys = [...heightKeys, ACCESS_KEY, COUNT_KEY, ...moduleKeys];
  for (const q of finalQs) {
    const idx = orderKeys.indexOf(q.key);
    if (idx >= 0) await prisma.question.update({ where: { id: q.id }, data: { order: idx } });
  }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      fieldLaborHours: 1.25,
      materialCostCents: 5500,
      estimatedMinutes: 75,
      estimatedMinutesReviewed: true,
      shortDescription:
        "New recessed lights in an existing ceiling. The first covers the setup, and each one after that costs less because we're already up there.",
    },
  });

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  console.log(`  ✓ recessed-lighting rebuilt — count + access, control handled by the shared module`);
  console.log(`     dangling: ${dangling.length ? dangling.join(", ") : "none"}`);
  console.log(`     unreachable: ${unreachable.length ? unreachable.join(", ") : "none"}`);
  console.log(`
  Additional lights: $135 each with attic access, $205 through finished space.
  First light stays at the published $375, +$100 for finished — the existing
  approved figures, not the $385/$520 the new model calculates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
