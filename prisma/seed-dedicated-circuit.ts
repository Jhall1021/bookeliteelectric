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
/**
 * Circuit-size components.
 *
 * The customer never picks an amperage from a category page — they say what
 * the circuit is for, and the answer sets the tier. Anyone who does know can
 * say so and pick directly.
 *
 * WIRE_PORTION_CENTS is the 14/2 share of the service's $68 material
 * allowance for a typical run. 12/2 costs 30% more, per Josh. This is the one
 * number here that's an assumption rather than a measurement — change it and
 * re-run to reprice the 20A upcharge.
 *
 * Kept above $10 deliberately: §4 charges 3.00x under $10 and 1.30x at or
 * above it, so a smaller delta can sell for MORE than a larger one. At
 * $10.50 the upcharge sits safely on the 1.30x side.
 */
const WIRE_PORTION_CENTS = 3500;
const WIRE_20A_DELTA_CENTS = Math.round(WIRE_PORTION_CENTS * 0.30); // 12/2 vs 14/2
const DOUBLE_POLE_DELTA_CENTS = 1100; // $19 double-pole vs $8 single-pole

const CIRCUIT_COMPONENTS = [
  {
    key: "DEDICATED_CIRCUIT_20A",
    name: "20A circuit — 12 AWG conductors",
    customerFacingLabel: "20-amp circuit",
    approvedPriceCents: 1500,
    addFieldLaborHours: 0,
    addMaterialCostCents: WIRE_20A_DELTA_CENTS,
    addScheduleMinutes: 0,
    notes: "12/2 costs 30% more than 14/2. Pulling it takes no meaningful extra time.",
  },
  {
    key: "DEDICATED_CIRCUIT_240V",
    name: "240V circuit — double-pole breaker",
    customerFacingLabel: "240-volt circuit",
    approvedPriceCents: 1500,
    addFieldLaborHours: 0,
    addMaterialCostCents: DOUBLE_POLE_DELTA_CENTS,
    addScheduleMinutes: 0,
    notes: "$19 double-pole vs $8 single-pole.",
  },
];

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

/**
 * The four amperage-specific services are retired rather than deleted. They're
 * reroute targets and may appear on past bookings; deleting them would break
 * that history. Inactive removes them from browsing while the records survive.
 */
const RETIRED = [
  "sump-pump-dedicated-circuit",
  "freezer-fridge-dedicated-circuit",
  "electric-fireplace-circuit",
  "new-240v-appliance-circuit",
];

async function main() {
  for (const c of CIRCUIT_COMPONENTS) {
    await prisma.jobComponent.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        customerFacingLabel: c.customerFacingLabel,
        approvedPriceCents: c.approvedPriceCents,
        addFieldLaborHours: c.addFieldLaborHours,
        addMaterialCostCents: c.addMaterialCostCents,
        addScheduleMinutes: c.addScheduleMinutes,
        notes: c.notes,
      },
      create: c,
    });
  }
  console.log(`  ✓ ${CIRCUIT_COMPONENTS.length} circuit-size components defined`);

  const dedicatedCat = await prisma.serviceCategory.findUnique({
    where: { slug: "dedicated-circuits" },
  });

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
      // Moved out of New Outlets: a customer browsing "Dedicated Circuits"
      // couldn't find the one service actually called that.
      ...(dedicatedCat ? { categoryId: dedicatedCat.id } : {}),
      // No longer 120V-only now that it covers 240V.
      name: "Dedicated Circuit & Outlet",
      bookingType: "ADJUSTED",
      // Everything about the price used to be written here, and re-running
      // this seed would have undone the whole reconciliation for this
      // service in one go:
      //
      //   basePrice: 79500              -> reverts the approved $685
      //   whileWeThereBasePrice: null   -> deletes the approved $685 add-on
      //   startingPriceLabel "From $795" -> contradicts the real price
      //   materialCostCents: 6800       -> replaces the itemized $46 package
      //   materialMultiplier: 2.5       -> restores the old workbook markup
      //   primaryLaborUnits: 2.5        -> the legacy field, not crew-hours
      //
      // Crew-hours and materials now come from seed-dedicated-circuit-labor
      // and seed-materials; the published price came from the 23 Aug
      // migration. This seed builds the tree.
      estimatedMinutes: 150,
      requiresTechCount: 1,
      permitAdminCents: 0,
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

  // Only reached by "I know the circuit size I need". Everyone else has the
  // tier chosen for them by what the circuit is powering.
  const qAmps = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "dedicated_amperage",
      prompt: "What size circuit do you need?",
      helpText: "If you're not certain, go back and tell us what it's powering instead — we'll work it out.",
      inputType: "SINGLE_SELECT",
      order: 2,
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
      order: 3,
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
      order: 4,
    },
  });

  const q4 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "dedicated_panel_location",
      prompt: "Where is your electrical panel?",
      helpText: "This helps us arrive prepared. It won't change your price.",
      inputType: "SINGLE_SELECT",
      order: 5,
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
      order: 6,
    },
  });

  // ---- Q1: equipment, which sets the circuit size -----------------------
  // The homeowner says what it's for; we determine the amperage. Anyone who
  // already knows can say so and skip to picking it directly.
  await prisma.answerOption.createMany({
    data: [
      { questionId: q1.id, label: "Refrigerator or freezer", value: "fridge_freezer", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "Bidet or smart toilet", value: "bidet", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "Sump pump", value: "sump_pump", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: q1.id, label: "Over-the-range microwave", value: "microwave", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 4, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: q1.id, label: "Window or through-wall air conditioner", value: "window_ac", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 5, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: q1.id, label: "Electric fireplace", value: "electric_fireplace", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 6, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: q1.id, label: "I already know the circuit size I need", value: "knows_size", routeAction: "CONTINUE", nextQuestionId: qAmps.id, order: 7, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "Something else", value: "other_equipment", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 8, requiredPhotoLabels: EQUIPMENT_PHOTOS },
      { questionId: q1.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 9, requiredPhotoLabels: EQUIPMENT_PHOTOS },
    ],
  });

  // Attach the 20A component to everything that needs 12 AWG.
  const twentyAmpComponentId = (
    await prisma.jobComponent.findUniqueOrThrow({ where: { key: "DEDICATED_CIRCUIT_20A" } })
  ).id;
  const twentyAmpAnswers = await prisma.answerOption.findMany({
    where: { questionId: q1.id, value: { in: ["sump_pump", "microwave", "window_ac", "electric_fireplace"] } },
  });
  await prisma.answerOptionComponent.createMany({
    data: twentyAmpAnswers.map((a) => ({ answerOptionId: a.id, componentId: twentyAmpComponentId })),
  });

  // ---- Q1b: for customers who already know -----------------------------
  const doublePoleComponentId = (
    await prisma.jobComponent.findUniqueOrThrow({ where: { key: "DEDICATED_CIRCUIT_240V" } })
  ).id;

  await prisma.answerOption.createMany({
    data: [
      { questionId: qAmps.id, label: "15 amp, 120 volt", value: "15a_120v", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: qAmps.id, label: "20 amp, 120 volt", value: "20a_120v", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: qAmps.id, label: "15 or 20 amp, 240 volt", value: "20a_240v", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      {
        // 30A and above is remote quote: conductor sizing, breaker and
        // receptacle all change, and the equipment varies too much to price
        // sight-unseen. The questions still run so the office gets the same
        // information.
        questionId: qAmps.id,
        label: "30 amp or more",
        value: "30a_plus",
        routeAction: "CONTINUE",
        nextQuestionId: q2.id,
        order: 4,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
        disclaimer:
          "Circuits of 30 amps and above are priced individually. We'll ask the same questions, then send you a fixed price once we've reviewed your photos.",
      },
      { questionId: qAmps.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 5, requiredPhotoLabels: EQUIPMENT_PHOTOS },
    ],
  });

  const amp20 = await prisma.answerOption.findFirstOrThrow({ where: { questionId: qAmps.id, value: "20a_120v" } });
  const amp240 = await prisma.answerOption.findFirstOrThrow({ where: { questionId: qAmps.id, value: "20a_240v" } });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: amp20.id, componentId: twentyAmpComponentId },
      { answerOptionId: amp240.id, componentId: twentyAmpComponentId },
      { answerOptionId: amp240.id, componentId: doublePoleComponentId },
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

  const retired = await prisma.service.updateMany({
    where: { slug: { in: RETIRED } },
    data: { active: false },
  });

  console.log(`  ✓ Dedicated Circuit & Outlet — 6 questions, moved to Dedicated Circuits`);
  console.log(`  ✓ ${retired.count} amperage-specific services retired (inactive, not deleted)`);
  console.log(`  ✓ 20A upcharge $15 · 240V upcharge $15 · 30A+ routes to remote quote`);
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
