/**
 * BookEliteElectric.com — Dedicated 120V Circuit & Outlet
 *
 * Replaces the service's generic REMOTE_QUOTE fallback with a real decision
 * tree that can instant-price the standardized installation, per the revised
 * spec. Also fills in the pricing-composition fields, which were empty — the
 * $795 was a hand-set number that "Recalculate All Prices" skipped entirely.
 *
 * Run with: npx tsx prisma/seed-dedicated-circuit.ts
 *
 * Idempotent: clears this service's tree before rebuilding, so re-running
 * never duplicates questions. Touches ONLY this one service.
 *
 * Once this is settled, fold seedDedicatedCircuit() into seed-questions.ts so
 * there stays a single canonical source for trees.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearServiceTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId } });
  for (const q of questions) {
    await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  }
  await prisma.question.deleteMany({ where: { serviceId } });
}

// Photos requested when the customer accepts the standard scope and books.
// photosBlockBooking is false on that branch, so these are preparation for
// the technician rather than a pricing gate — the customer schedules
// immediately. The office can still review them before dispatch.
const PREP_PHOTOS = [
  "Electrical panel with the door open and breakers visible — leave the panel cover on",
  "Wide photo of the whole wall and area around the electrical panel",
  "Wall or location where the new dedicated outlet will go",
  "The attic, unfinished basement, or drop-ceiling route the wire will travel",
];

// Photos requested when we can't price it from the answers alone.
const REVIEW_PHOTOS = [
  "Electrical panel with the door open and breakers visible — leave the panel cover on",
  "Wall or location where the new dedicated outlet will go",
  "Wide photo of the room or area",
  "Nearest attic or basement access, if any",
];

const EQUIPMENT_PHOTOS = [
  "The equipment or appliance, including the model or label if it's safely visible",
  "Wall or location where the new dedicated outlet will go",
  "Electrical panel with the door open and breakers visible — leave the panel cover on",
];

async function main() {
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "dedicated-120v-circuit-outlet" },
  });

  // ---- service record --------------------------------------------------
  // bookingType moves REMOTE_QUOTE -> ADJUSTED: the tree can now settle on a
  // price for the standard case, so the service is no longer quote-only.
  // Branches that can't be priced still route to PHOTO_REVIEW individually.
  //
  // Pricing composition at $250/hr: 2.5 x 25000 = 62500 labor, plus
  // 6800 x 2.5 = 17000 material, = 79500 = $795.00 — the price already
  // published, now with a derivation behind it. Recalculate will reproduce
  // it rather than skipping this service.
  //
  // whileWeThereBasePrice and addOnLaborUnits stay null on purpose: no field
  // data yet to support an add-on price for this job.
  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      basePrice: 79500,
      startingPriceLabel: "From $795",
      estimatedMinutes: 150,
      requiresTechCount: 1,
      primaryLaborUnits: 2.5,
      addOnLaborUnits: null,
      materialCostCents: 6800,
      materialMultiplier: 2.5,
      permitAdminCents: 0,
      whileWeThereBasePrice: null,
    },
  });

  await clearServiceTree(service.id);

  // ---- questions -------------------------------------------------------
  // Created first so CONTINUE answers below have real ids to point at.
  const q1 = await prisma.question.create({
    data: {
      serviceId: service.id,
      // Deliberately NOT reusing "purpose" from the New 120V Outlet tree.
      // That key holds a broad general-use/large-appliance split; this one
      // holds specific equipment. Same key, different meaning would corrupt
      // answersSnapshot comparisons across the two services.
      key: "dedicated_equipment",
      prompt: "What will this dedicated circuit power?",
      helpText:
        "Choose the closest match. You don't need to know the breaker or wire size — we'll work that out.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const q2 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "dedicated_route_access",
      prompt:
        "Can we reach the wiring path through an unfinished basement, a basement with a removable drop ceiling, or an accessible attic?",
      helpText:
        "We're asking about the path between your electrical panel and the new outlet location — this is what decides whether we can give you a price right now.",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const q3 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "dedicated_distance",
      prompt:
        "About how far will the wire travel from the electrical panel to the new outlet?",
      helpText:
        "Estimate the path the wire actually takes through the basement or attic — not the straight-line distance between the two rooms.",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  const q4 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "dedicated_panel_location",
      prompt: "Where is your electrical panel?",
      helpText: "This helps us arrive prepared. It won't change your price.",
      inputType: "SINGLE_SELECT",
      order: 4,
    },
  });

  const q5 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "dedicated_finish_ack",
      prompt: "One quick note about access openings",
      helpText:
        "Even with an accessible basement or attic path, we may need to make a small opening in drywall or plaster directly above, below, or beside your electrical panel and/or at the new outlet, so the cable can enter the finished wall. Patching, spackling, sanding, painting, wallpaper and trim are not included unless we've put it in writing.",
      inputType: "SINGLE_SELECT",
      order: 5,
    },
  });

  // ---- Q1: equipment ---------------------------------------------------
  await prisma.answerOption.createMany({
    data: [
      { questionId: q1.id, label: "Refrigerator or freezer", value: "fridge_freezer", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [] },
      { questionId: q1.id, label: "Sump pump", value: "sump_pump", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 2, requiredPhotoLabels: [] },
      { questionId: q1.id, label: "Window or through-wall air conditioner", value: "window_ac", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 3, requiredPhotoLabels: [] },
      { questionId: q1.id, label: "Bidet or smart toilet", value: "bidet", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 4, requiredPhotoLabels: [] },
      { questionId: q1.id, label: "Microwave or another 120V appliance", value: "other_120v_appliance", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 5, requiredPhotoLabels: [] },
      // Anything outside the standard 120V workflow — unusual amperage, 240V,
      // special receptacles, disconnects, manufacturer requirements.
      { questionId: q1.id, label: "Something else", value: "other_equipment", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 6, requiredPhotoLabels: EQUIPMENT_PHOTOS },
      { questionId: q1.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 7, requiredPhotoLabels: EQUIPMENT_PHOTOS },
    ],
  });

  // ---- Q2: route access ------------------------------------------------
  await prisma.answerOption.createMany({
    data: [
      { questionId: q2.id, label: "Yes — unfinished basement", value: "unfinished_basement", routeAction: "CONTINUE", nextQuestionId: q3.id, order: 1, requiredPhotoLabels: [] },
      { questionId: q2.id, label: "Yes — basement with a removable drop ceiling", value: "drop_ceiling", routeAction: "CONTINUE", nextQuestionId: q3.id, order: 2, requiredPhotoLabels: [] },
      { questionId: q2.id, label: "Yes — accessible attic", value: "accessible_attic", routeAction: "CONTINUE", nextQuestionId: q3.id, order: 3, requiredPhotoLabels: [] },
      { questionId: q2.id, label: "Yes — a combination of these", value: "combination", routeAction: "CONTINUE", nextQuestionId: q3.id, order: 4, requiredPhotoLabels: [] },
      { questionId: q2.id, label: "No — the route runs through finished walls or ceilings", value: "finished_route", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 5, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: q2.id, label: "No — slab foundation, or no accessible attic or basement", value: "no_accessible_route", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 6, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: q2.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 7, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  // ---- Q3: distance ----------------------------------------------------
  // The two qualifying answers are kept separate even though they price the
  // same today, so a future tier can be added without changing the question
  // key or invalidating historical answers.
  await prisma.answerOption.createMany({
    data: [
      { questionId: q3.id, label: "25 feet or less", value: "under_25", routeAction: "CONTINUE", nextQuestionId: q4.id, order: 1, requiredPhotoLabels: [] },
      { questionId: q3.id, label: "26 to 50 feet", value: "25_to_50", routeAction: "CONTINUE", nextQuestionId: q4.id, order: 2, requiredPhotoLabels: [] },
      { questionId: q3.id, label: "More than 50 feet", value: "over_50", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: q3.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  // ---- Q4: panel location ----------------------------------------------
  // Preparation information only — none of these disqualify the instant
  // price, per the spec.
  await prisma.answerOption.createMany({
    data: [
      { questionId: q4.id, label: "Unfinished basement", value: "unfinished_basement", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 1, requiredPhotoLabels: [] },
      { questionId: q4.id, label: "Finished basement or utility room", value: "finished_basement", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 2, requiredPhotoLabels: [] },
      { questionId: q4.id, label: "Garage", value: "garage", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 3, requiredPhotoLabels: [] },
      { questionId: q4.id, label: "On a finished interior wall", value: "interior_finished_wall", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 4, requiredPhotoLabels: [] },
      { questionId: q4.id, label: "Outside the house", value: "exterior", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 5, requiredPhotoLabels: [] },
      { questionId: q4.id, label: "Somewhere else, or I'm not sure", value: "other_unsure", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 6, requiredPhotoLabels: [] },
    ],
  });

  // ---- Q5: finish acknowledgement --------------------------------------
  // An affirmative answer rather than a passive disclaimer, so the customer's
  // acceptance is written into answersSnapshot on the line item and survives
  // as a record of what they agreed to.
  //
  // Both answers are PHOTO_REVIEW; the only difference is photosBlockBooking.
  // "I understand" locks the $795 and books after uploading prep photos;
  // "review first" holds the booking for the office to price.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q5.id,
        label: "I understand — give me my price",
        value: "accepted",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: false,
        order: 1,
        requiredPhotoLabels: PREP_PHOTOS,
        disclaimer:
          "Your price assumes your existing panel can take the new circuit without a panel replacement, service upgrade, or other corrective work. If your photos or what we find on site show something outside what you booked, we'll explain it and give you a price before doing any additional work. Finish repair — patching, sanding, painting — isn't included.",
      },
      {
        questionId: q5.id,
        label: "I'd rather Elite review my situation first",
        value: "review_first",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: PREP_PHOTOS,
      },
    ],
  });

  console.log("  ✓ Dedicated 120V Circuit & Outlet — 5 questions, 26 answers");
  console.log("  ✓ bookingType REMOTE_QUOTE -> ADJUSTED");
  console.log("  ✓ pricing composition set: 2.5 units + $68 material @ 2.5x = $795.00");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
