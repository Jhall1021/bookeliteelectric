/**
 * BookEliteElectric.com — Phase 2 decision-tree seed
 * Question/AnswerOption trees for the two pilot categories: Outlets &
 * Switches and TV & Media. Run AFTER prisma/seed.ts (needs the Service
 * rows to already exist).
 *
 * Run with: npx tsx prisma/seed-questions.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedReplaceStandardOutlet() {
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "replace-standard-outlet" },
  });

  // Simple instant-book flow — one question, no branching complexity.
  // Demonstrates the minimum viable tree: a single qualifying question
  // that resolves straight to a price.
  const q1 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "outlet_condition",
      prompt: "What's happening with the outlet?",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q1.id,
        label: "It just needs to be swapped for a new one",
        value: "standard_swap",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q1.id,
        label: "It's warm, sparking, or smells like burning",
        value: "unsafe_condition",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 2,
        requiredPhotoLabels: [],
      },
      {
        questionId: q1.id,
        label: "It doesn't work at all / no power",
        value: "no_power",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 3,
        requiredPhotoLabels: [],
      },
    ],
  });

  console.log("  ✓ Replace Standard Outlet tree");
}

async function seedNewOutlet() {
  // Redesigned per the general principle: don't ask the customer to
  // self-classify into a pricing tier they can't articulate ("accessible"
  // vs. "finished-wall fishing" means nothing to most homeowners). Instead,
  // ask what they can actually observe about their home, and let the
  // routing logic determine the tier. This collapses what used to be two
  // separate Service catalog entries into one service with an internal
  // ADJUSTED-pricing branch.
  const newOutlet = await prisma.service.findUniqueOrThrow({
    where: { slug: "new-120v-outlet" },
  });
  const dedicatedCircuit = await prisma.service.findUniqueOrThrow({
    where: { slug: "dedicated-120v-circuit-outlet" },
  });

  const q1 = await prisma.question.create({
    data: {
      serviceId: newOutlet.id,
      key: "purpose",
      prompt: "What will this outlet power?",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const q2 = await prisma.question.create({
    data: {
      serviceId: newOutlet.id,
      key: "below_above_access",
      prompt: "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below where the outlet is going?",
      helpText: "This is what determines whether we can run the wire without opening up your walls.",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const q3 = await prisma.question.create({
    data: {
      serviceId: newOutlet.id,
      key: "finished_space_both_sides",
      prompt: "Is there finished living space directly above and below this wall?",
      helpText: "For example, a finished bedroom upstairs and a finished room below, with no open access between them.",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  // Q1 — purpose
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q1.id,
        label: "General use (lamp, charger, small appliance)",
        value: "general_use",
        routeAction: "CONTINUE",
        nextQuestionId: q2.id,
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q1.id,
        label: "A specific large appliance (window AC, freezer, etc.)",
        value: "large_appliance",
        // Genuinely a different job — dedicated circuit sizing/breaker
        // requirements, not just a harder pull. Reroute preserves nothing lost.
        routeAction: "REROUTE_SERVICE",
        rerouteServiceId: dedicatedCircuit.id,
        order: 2,
        requiredPhotoLabels: [],
      },
    ],
  });

  // Q2 — attic/basement access
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q2.id,
        label: "Yes",
        value: "has_access",
        routeAction: "RESOLVE_INSTANT", // uses newOutlet.basePrice: $395
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q2.id,
        label: "No",
        value: "no_access",
        routeAction: "CONTINUE",
        nextQuestionId: q3.id,
        order: 2,
        requiredPhotoLabels: [],
      },
    ],
  });

  // Q3 — finished space both sides (only reached if Q2 was "No")
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q3.id,
        label: "Yes",
        value: "finished_both_sides",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 10000, // $395 -> $495: fishing wire + cutting/patching sheetrock
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q3.id,
        label: "No",
        value: "not_finished_both_sides",
        // No access AND no confirmed finished space (e.g. slab foundation,
        // exterior wall) — genuinely ambiguous, don't guess at a price.
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Wall where the outlet is needed, full height", "Nearest attic or basement access point, if any"],
      },
      {
        questionId: q3.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Wall where the outlet is needed, full height", "Nearest attic or basement access point, if any"],
      },
    ],
  });

  console.log("  ✓ New 120V Outlet tree (diagnostic questions, single service with adjusted-price branch)");
}

async function seedTvInstall() {
  // The full branching example from the original brief: size -> mount ->
  // wall construction -> fireplace/height/unusual-condition photo triggers.
  const up55 = await prisma.service.findUniqueOrThrow({
    where: { slug: "tv-install-up-to-55" },
  });
  const size56to85 = await prisma.service.findUniqueOrThrow({
    where: { slug: "tv-install-56-85" },
  });
  const over85 = await prisma.service.findUniqueOrThrow({
    where: { slug: "tv-install-over-85" },
  });

  const qSize = await prisma.question.create({
    data: {
      serviceId: up55.id,
      key: "tv_size",
      prompt: "What size is your TV?",
      helpText: "Measure corner to corner on the front of your TV.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const qMount = await prisma.question.create({
    data: {
      serviceId: up55.id,
      key: "has_mount",
      prompt: "Do you already have a compatible wall mount?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const qWall = await prisma.question.create({
    data: {
      serviceId: up55.id,
      key: "wall_construction",
      prompt: "What's the wall made of?",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  const qFireplace = await prisma.question.create({
    data: {
      serviceId: up55.id,
      key: "above_fireplace",
      prompt: "Is the TV going above a fireplace?",
      inputType: "SINGLE_SELECT",
      order: 4,
    },
  });

  // Size branches
  await prisma.answerOption.createMany({
    data: [
      { questionId: qSize.id, label: "Up to 55\"", value: "up_to_55", routeAction: "CONTINUE", nextQuestionId: qMount.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qSize.id, label: "56\"–65\"", value: "56_65", routeAction: "REROUTE_SERVICE", rerouteServiceId: size56to85.id, order: 2, requiredPhotoLabels: [] },
      { questionId: qSize.id, label: "66\"–85\"", value: "66_85", routeAction: "REROUTE_SERVICE", rerouteServiceId: size56to85.id, order: 3, requiredPhotoLabels: [] },
      { questionId: qSize.id, label: "Over 85\"", value: "over_85", routeAction: "REROUTE_SERVICE", rerouteServiceId: over85.id, order: 4, requiredPhotoLabels: [] },
    ],
  });

  // Mount branches
  await prisma.answerOption.createMany({
    data: [
      { questionId: qMount.id, label: "Yes, I have a mount", value: "has_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qMount.id, label: "No — add Elite Tilt Mount ($99)", value: "add_tilt_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, priceModifierCents: 9900, order: 2, requiredPhotoLabels: [] },
      { questionId: qMount.id, label: "No — add Elite Full-Motion Mount ($179)", value: "add_articulating_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, priceModifierCents: 17900, order: 3, requiredPhotoLabels: [] },
    ],
  });

  // Wall construction branches
  await prisma.answerOption.createMany({
    data: [
      { questionId: qWall.id, label: "Drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: qFireplace.id, order: 1, requiredPhotoLabels: [] },
      {
        questionId: qWall.id,
        label: "Stone, brick, or masonry",
        value: "masonry",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Full wall where the TV is going", "Close-up of the wall surface/texture"],
      },
    ],
  });

  // Fireplace branch — terminal
  await prisma.answerOption.createMany({
    data: [
      { questionId: qFireplace.id, label: "No", value: "no", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [] },
      {
        questionId: qFireplace.id,
        label: "Yes",
        value: "yes",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Fireplace and surrounding wall, full width", "Distance from mantel to ceiling"],
      },
    ],
  });

  console.log("  ✓ TV Install tree (size → mount → wall → fireplace, matches brief example)");
}

async function main() {
  console.log("Seeding Phase 2 decision trees...");
  await seedReplaceStandardOutlet();
  await seedNewOutlet();
  await seedTvInstall();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
