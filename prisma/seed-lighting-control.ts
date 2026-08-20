/**
 * Reusable Lighting Control / Switch-Leg module — handoff §13-§15.
 *
 * Run with: npx tsx prisma/seed-lighting-control.ts
 *
 * Two parts:
 *   1. Named JobComponents carrying the §13-§14 labor and material figures.
 *      Defined once; every service that needs a switch leg references them, so
 *      revising the labor is one edit rather than ten.
 *   2. The module questions, attached after the Height/Access module on every
 *      service where a new lighting or fan load might need a switch leg.
 *
 * Idempotent. Safe to re-run.
 *
 * KEY DESIGN POINT — the access answer is never asked twice.
 *
 * §13.2 and §13.3 each have an accessible and a finished variant. Rather than
 * asking about attic access inside this module, one answer carries BOTH
 * variants, each conditioned on `ceiling_access`. Whichever value the customer
 * already gave selects the right component. If it was never established, the
 * route goes to review rather than booking the wrong variant (§29).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Schedule minutes are stored explicitly, never derived from labor hours at
 * runtime — a second technician changes the hours without changing the clock.
 * The launch values below assume one technician working the stated hours, and
 * are editable per component once real job data exists.
 */
const COMPONENTS = [
  {
    key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE",
    name: "Convert switched outlet control to ceiling lighting — accessible",
    customerFacingLabel: "Convert existing switched outlet to control your new light",
    addFieldLaborHours: 0.75,
    addMaterialCostCents: 2500,
    addScheduleMinutes: 45,
    notes: "Handoff §13.2, accessible attic route.",
  },
  {
    key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED",
    name: "Convert switched outlet control to ceiling lighting — finished space",
    customerFacingLabel: "Convert existing switched outlet to control your new light",
    addFieldLaborHours: 1.25,
    addMaterialCostCents: 3500,
    addScheduleMinutes: 75,
    notes: "Handoff §13.2, finished-space route.",
  },
  {
    key: "NEW_SWITCH_AND_SWITCH_LEG_ACCESSIBLE",
    name: "New wall switch and switch leg — accessible",
    customerFacingLabel: "New wall switch and control wiring",
    addFieldLaborHours: 1.0,
    addMaterialCostCents: 3500,
    addScheduleMinutes: 60,
    notes: "Handoff §13.3, accessible attic route with suitable nearby power.",
  },
  {
    key: "NEW_SWITCH_AND_SWITCH_LEG_FINISHED",
    name: "New wall switch and switch leg — finished space",
    customerFacingLabel: "New wall switch and control wiring",
    addFieldLaborHours: 1.5,
    addMaterialCostCents: 4500,
    addScheduleMinutes: 90,
    notes: "Handoff §13.3, finished-space route with suitable nearby power.",
  },
  {
    key: "LED_DIMMER_UPGRADE",
    name: "LED dimmer upgrade",
    customerFacingLabel: "LED dimmer upgrade",
    // §14: a material upgrade, not another labor service, unless actual labor
    // materially changes. The §4 markup tier applies to the assembled total.
    addFieldLaborHours: 0,
    addMaterialCostCents: 3000,
    addScheduleMinutes: 0,
    notes: "Handoff §14. Only offered when Elite is already installing a new control.",
  },
];

/** §13 and §15 — anywhere a new lighting or fan load may need a switch leg. */
const SERVICES = [
  "new-ceiling-light",
  "new-ceiling-fan",
  "fan-replacing-light",
  "recessed-lighting",
];

const CONTROL_KEY = "lighting_control";
const NEAR_POWER_KEY = "switch_near_power";
const DIMMER_KEY = "lighting_dimmer_upgrade";
const ACCESS_KEY = "ceiling_access";

const REVIEW_PHOTOS = [
  "The wall switch in question, plate on — please don't remove it",
  "The ceiling location where the new light or fan will go",
  "A wider photo of the room",
];

async function seedComponents() {
  for (const c of COMPONENTS) {
    await prisma.jobComponent.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        customerFacingLabel: c.customerFacingLabel,
        addFieldLaborHours: c.addFieldLaborHours,
        addMaterialCostCents: c.addMaterialCostCents,
        addScheduleMinutes: c.addScheduleMinutes,
        notes: c.notes,
      },
      create: c,
    });
  }
  console.log(`  ✓ ${COMPONENTS.length} job components defined`);
}

async function attach(slug: string) {
  const service = await prisma.service.findUnique({
    where: { slug },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  const moduleKeys = [CONTROL_KEY, NEAR_POWER_KEY, DIMMER_KEY];
  const stale = service.questions.filter((q) => moduleKeys.includes(q.key));
  for (const q of stale) {
    await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  }
  if (stale.length) {
    await prisma.question.deleteMany({ where: { id: { in: stale.map((q) => q.id) } } });
  }

  const kept = service.questions.filter((q) => !moduleKeys.includes(q.key));
  const nextOrder = kept.length;

  const comp = async (key: string) =>
    (await prisma.jobComponent.findUniqueOrThrow({ where: { key } })).id;

  const qControl = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: CONTROL_KEY,
      prompt: "How is this room controlled right now?",
      helpText:
        "We're working out whether we need to add switch wiring. You don't need to look inside anything.",
      inputType: "SINGLE_SELECT",
      order: nextOrder,
    },
  });

  const qNearPower = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: NEAR_POWER_KEY,
      prompt:
        "Is there an existing outlet directly below, or very close to, where you'd like the new switch?",
      helpText: "This is usually how we get power to a new switch without opening up the wall.",
      inputType: "SINGLE_SELECT",
      order: nextOrder + 1,
    },
  });

  const qDimmer = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: DIMMER_KEY,
      prompt: "Would you like a dimmer on the new switch?",
      inputType: "SINGLE_SELECT",
      order: nextOrder + 2,
    },
  });

  // §13.1 — an existing switched ceiling light is already the condition we
  // need. No component, no add-on: "Existing wall-switch control — Included".
  // §13.4 — a switch that controls something else, nothing, or the customer
  // doesn't know: do NOT assume it can be used.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qControl.id,
        label: "A wall switch already controls a ceiling light here",
        value: "existing_switched_light",
        routeAction: "CONTINUE",
        nextQuestionId: qDimmer.id,
        order: 1,
        requiredPhotoLabels: [],
        // §13.1 — nothing to add, and nothing to approve.
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qControl.id,
        label: "A wall switch controls an outlet in the room",
        value: "switched_outlet",
        routeAction: "CONTINUE",
        nextQuestionId: qDimmer.id,
        order: 2,
        requiredPhotoLabels: [],
        // Left NULL deliberately: no customer-facing price for this work has
        // been approved yet, so this route goes to review until one is. The
        // components below still accumulate the real labor and material.
        approvedComponentPriceCents: null,
      },
      {
        questionId: qControl.id,
        label: "There's no wall switch where I want one",
        value: "no_switch",
        routeAction: "CONTINUE",
        nextQuestionId: qNearPower.id,
        order: 3,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qControl.id,
        label: "There's a switch, but it controls something else or nothing",
        value: "switch_unclear",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 4,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
      {
        questionId: qControl.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 5,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  // §13.2 — the switched-outlet conversion, in both access variants.
  const switchedOutlet = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qControl.id, value: "switched_outlet" },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      {
        answerOptionId: switchedOutlet.id,
        componentId: await comp("CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE"),
        conditionAnswerKey: ACCESS_KEY,
        conditionAnswerValue: "accessible",
      },
      {
        answerOptionId: switchedOutlet.id,
        componentId: await comp("CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED"),
        conditionAnswerKey: ACCESS_KEY,
        conditionAnswerValue: "finished",
      },
    ],
  });

  // §13.3 — new switch plus switch leg, needing suitable nearby power.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qNearPower.id,
        label: "Yes, there's an outlet right there",
        value: "yes",
        routeAction: "CONTINUE",
        nextQuestionId: qDimmer.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
      },
      {
        questionId: qNearPower.id,
        label: "No, there's no outlet nearby",
        value: "no",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
      {
        questionId: qNearPower.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  const nearPowerYes = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qNearPower.id, value: "yes" },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      {
        answerOptionId: nearPowerYes.id,
        componentId: await comp("NEW_SWITCH_AND_SWITCH_LEG_ACCESSIBLE"),
        conditionAnswerKey: ACCESS_KEY,
        conditionAnswerValue: "accessible",
      },
      {
        answerOptionId: nearPowerYes.id,
        componentId: await comp("NEW_SWITCH_AND_SWITCH_LEG_FINISHED"),
        conditionAnswerKey: ACCESS_KEY,
        conditionAnswerValue: "finished",
      },
    ],
  });

  // §14 — dimmer is a material upgrade on a control we're already installing.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qDimmer.id,
        label: "No, a standard switch is fine",
        value: "standard",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qDimmer.id,
        label: "Yes, add an LED dimmer",
        value: "dimmer",
        routeAction: "RESOLVE_INSTANT",
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
      },
    ],
  });

  const dimmerYes = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDimmer.id, value: "dimmer" },
  });
  await prisma.answerOptionComponent.create({
    data: { answerOptionId: dimmerYes.id, componentId: await comp("LED_DIMMER_UPGRADE") },
  });

  // --- wire the module INTO the tree -----------------------------------
  // Appending questions doesn't make them reachable. Routing follows
  // nextQuestionId, not `order`, so every answer that currently ENDS the flow
  // has to hand off to the control question instead — otherwise the customer
  // gets their price at the end of the service's own questions and never sees
  // the module at all.
  //
  // Only terminal resolving answers are rewired. Photo-review, reroute and
  // troubleshooting branches are left exactly as they are: those are
  // deliberate exits, and a customer heading to review doesn't need to be
  // asked about switch wiring first.
  //
  // priceModifierCents on a rewired answer still accumulates — switching
  // RESOLVE_ADJUSTED to CONTINUE changes where the customer goes next, not
  // what the answer contributes.
  const rewired = await prisma.answerOption.updateMany({
    where: {
      question: { serviceId: service.id, key: { notIn: moduleKeys } },
      routeAction: { in: ["RESOLVE_INSTANT", "RESOLVE_ADJUSTED"] },
    },
    data: { routeAction: "CONTINUE", nextQuestionId: qControl.id },
  });

  console.log(
    `  ✓ ${slug} — module attached after ${kept.length} existing question(s), ` +
      `${rewired.count} previously-terminal answer(s) now continue into it`
  );
}

async function main() {
  console.log("Seeding the Lighting Control / Switch-Leg module...\n");
  await seedComponents();
  console.log();
  for (const slug of SERVICES) await attach(slug);
  console.log(`
Components carry real labor, material and schedule time — not dollar amounts —
so they reprice when the tech-hour rate changes and they contribute to the
technician-hours the job actually consumes.

Routes selecting components have NO approved customer price yet, so they go to
review rather than booking a calculated figure. Approve prices per answer in
the admin editor to make them instantly bookable.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
