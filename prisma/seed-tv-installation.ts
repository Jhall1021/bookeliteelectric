/**
 * Professional TV Installation — corrected tiers.
 *
 *   npx tsx prisma/seed-tv-installation.ts
 *
 * The tree ran a single "55-100 inch" tier at +$100 with one technician, so a
 * 96-inch TV booked at $600 and one person turned up to hang it. V4 and the
 * handoff both specify three tiers, with 56-85 needing two technicians and
 * anything over 85 going to quote.
 *
 * ONE VAN, BOTH TIERS
 *
 * An earlier version modelled 56-85 in as a second technician — overriding
 * crew count to 2 and doubling the labor to 3.0 hours. That was wrong twice
 * over: every Elite van already carries a lead and a helper, so the second
 * person was being charged for although they were always coming; and it
 * would have blocked a second technician's Jobber calendar for a job that
 * needs one van.
 *
 * Both tiers are 1.50 crew-hours, one van, 90 minutes. The larger tier costs
 * more because it IS more — a bigger, heavier, more awkward television — and
 * that is a published scope premium, not a labor derivation.
 *
 * Published prices here are explicit launch decisions, not formulas:
 *
 *   up to 55"    $500 standalone / $375 add-on   (labor suggests $375)
 *   56-85"       $875 standalone / $750 add-on   (labor suggests $750)
 *   over 85"     quote
 *
 * The $500 is held deliberately even though the labor computes to $375, on the
 * same principle as New Ceiling Light: actual labor, suggested price and
 * published price are separate, and only the first is a measurement.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import {
  addNumericUnknownOption,
  upsertQuestion,
  findDanglingReferences,
  findUnreachableQuestions,
} from "./_moduleHelpers";
import {
  componentIdByKey,
  eliteContractorId,
  retireComponents,
  upsertComponent,
} from "./_componentHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

const SLUG = "tv-installation";
const TV_OUTLET_DISTANCE_KEY = "tv_outlet_run_distance";

const TV_OUTLET_ROUTE_COMPONENTS = [
  {
    key: "TV_OUTLET_RUN_ACCESSIBLE_UNDER_10",
    name: "TV power outlet — open route, up to 10 ft",
    customerFacingLabel: "Add the power outlet behind the TV",
    approvedPriceCents: 13750,
    addFieldLaborHours: 0.5,
    addMaterialCostCents: 0,
    addScheduleMinutes: 30,
    notes: "The original short, accessible TV-outlet allowance, now selected only after distance is measured.",
  },
  {
    key: "TV_OUTLET_RUN_ACCESSIBLE_10_20",
    name: "TV power outlet — open route, 10 to 20 ft",
    customerFacingLabel: "Add the power outlet behind the TV — longer wiring run",
    approvedPriceCents: 20750,
    addFieldLaborHours: 0.75,
    addMaterialCostCents: 500,
    addScheduleMinutes: 45,
    notes: "The short accessible allowance plus the established 10-to-20-ft outlet-run increment.",
  },
  {
    key: "TV_OUTLET_RUN_FINISHED_UNDER_10",
    name: "TV power outlet — finished wall, up to 10 ft",
    customerFacingLabel: "Add the power outlet behind the TV through finished walls",
    approvedPriceCents: 18750,
    addFieldLaborHours: 0.75,
    addMaterialCostCents: 0,
    addScheduleMinutes: 45,
    notes: "The original short, finished-wall TV-outlet allowance, now selected only after distance is measured.",
  },
  {
    key: "TV_OUTLET_RUN_FINISHED_10_20",
    name: "TV power outlet — finished wall, 10 to 20 ft",
    customerFacingLabel: "Add the power outlet behind the TV through finished walls — longer wiring run",
    approvedPriceCents: 32250,
    addFieldLaborHours: 1.25,
    addMaterialCostCents: 500,
    addScheduleMinutes: 75,
    notes: "The short finished-wall allowance plus the established 10-to-20-ft fishing increment.",
  },
] as const;

/**
 * There is no size premium any more.
 *
 * TV_LARGE_SIZE_PREMIUM_56_85 charged $375 for the larger tier while carrying
 * no hours, no materials and no extra crew — a dollar figure with nothing
 * behind it, which the pricing rule forbids. Before that it was
 * TV_SECOND_TECHNICIAN, billing for a helper who rides in every van as
 * standard.
 *
 * Both attempts were reaching for the same wrong idea: that a bigger
 * television must cost more. It doesn't take longer, and the person who helps
 * lift it is already on site and already in the rate. So both tiers are the
 * same job at the same price, and the size question survives only to route
 * anything over 85 inches to a quote.
 */

const FINISH_ACK = [
  "Getting power up to the TV means running a wire inside the finished wall.",
  "Your electrician will need to make one or more openings in the drywall or plaster to fish it through. We keep them small and put them where the TV or a plate will cover them where we can, but on a finished wall they can't always be avoided.",
  "Patching, spackling, sanding, painting, wallpaper and trim aren't included unless we've put it in writing.",
  "That's why we asked about attic and basement access — an open route usually means no openings at all.",
].join("\n\n");

const REVIEW_PHOTOS = [
  "The wall where the TV is going, full height",
  "The nearest outlet on that wall",
  "A wider photo of the room",
];

async function main() {
  const contractorId = await eliteContractorId(prisma);
  for (const component of TV_OUTLET_ROUTE_COMPONENTS) {
    await upsertComponent(prisma, contractorId, component);
  }

  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log(`  – ${SLUG} not in the catalog`);
    return;
  }

  // Both retired rather than deleted — either may appear on bookings already
  // taken, and a booked job's record shouldn't lose the component it was
  // priced with.
  const retired = await retireComponents(prisma, ["TV_SECOND_TECHNICIAN", "TV_LARGE_SIZE_PREMIUM_56_85"]);
  if (retired) console.log(`  ✓ ${retired} superseded TV component(s) retired`);

  await prisma.service.update({
    where: { id: service.id },
    data: {
      // 1.5 crew-hours — one van, 90 minutes. Both tiers are the same: the
      // larger one is priced higher, not staffed differently.
      fieldLaborHours: 1.5,
      wwtLaborHours: 1.25,
      estimatedMinutes: 90,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      // basePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
      // whileWeThereBasePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
      // No publishedPriceApprovedAt.
      //
      // This came back when I restored the file from a stale working copy
      // while fixing the crew-hour regression — the governance strip had
      // already removed it once, and the restore undid that silently.
      //
      // A seed recording approval it was never given is how a calculated
      // number becomes indistinguishable from a decision. Approval happens
      // in the admin or in a named reconciliation migration.
    },
  });

  // ---- size tiers -------------------------------------------------------
  const sizeQ = service.questions.find((q) => q.key === "tv_size");
  const next = service.questions.find((q) => q.key === "has_mount");
  if (!sizeQ || !next) {
    console.log(`  ! ${SLUG} — expected tv_size and has_mount questions; found neither`);
    return;
  }

  await prisma.answerOptionComponent.deleteMany({
    where: { answerOption: { questionId: sizeQ.id } },
  });
  await prisma.answerOption.deleteMany({ where: { questionId: sizeQ.id } });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: sizeQ.id,
        label: 'Up to 55"',
        value: "up_to_55",
        routeAction: "CONTINUE",
        nextQuestionId: next.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: sizeQ.id,
        label: '56" to 85"',
        value: "56_to_85",
        routeAction: "CONTINUE",
        nextQuestionId: next.id,
        order: 2,
        requiredPhotoLabels: [],
        // The published route total is $875 against a $500 base — an explicit
        // launch decision, not the component's $375 labor figure.
        // Same price as the smaller tier. It's the same work.
        approvedComponentPriceCents: 0,
      },
      {
        // Was falling through to an ordinary installation at $600 with one
        // technician. Anything this size is a quote.
        questionId: sizeQ.id,
        label: 'Larger than 85"',
        value: "over_85",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: [
          "The TV, or its model number if it's still boxed",
          "The wall where it's going, full height",
          "A wider photo of the room",
        ],
      },
    ],
  });

  const bigTv = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: sizeQ.id, value: "56_to_85" },
  });
  await prisma.answerOption.update({
    where: { id: bigTv.id },
    // No crew override and no component. One van, same duration, same price.
    data: { overrideTechCount: null, overrideEstimatedMinutes: null },
  });
  await prisma.answerOptionComponent.deleteMany({ where: { answerOptionId: bigTv.id } });

  console.log(`  ✓ three size tiers — over 85" now routes to quote`);

  // ---- access questions join the shared contract ------------------------
  const access = service.questions.find((q) => q.key === "outlet_access");
  // Ignore this module's own questions when choosing their slots. Otherwise
  // every idempotent re-run sees yesterday's highest order and moves both
  // questions farther down the tree again.
  const lastOrder = Math.max(
    ...service.questions
      .filter((question) => !["tv_finish_ack", TV_OUTLET_DISTANCE_KEY].includes(question.key))
      .map((question) => question.order)
  );
  const qDistance = await upsertQuestion(prisma, service.id, {
    key: TV_OUTLET_DISTANCE_KEY,
    prompt: "About how far is the nearest outlet from where the new outlet will go behind the TV?",
    helpText:
      "Measure the path the wire would follow along the walls, basement, attic, or ceiling—not a straight line across the room.",
    inputType: "NUMBER",
    numberAllowsDecimal: true,
    numberMin: 1,
    numberMax: 200,
    order: lastOrder + 2,
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qDistance.id,
        label: "Up to 10 feet",
        value: "under_10",
        routeAction: "RESOLVE_ADJUSTED",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
        numberAtLeast: 1,
        numberAtMost: 10,
      },
      {
        questionId: qDistance.id,
        label: "More than 10 feet, up to 20 feet",
        value: "10_to_20",
        routeAction: "RESOLVE_ADJUSTED",
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
        numberAtLeast: 10,
        numberAtLeastExclusive: true,
        numberAtMost: 20,
      },
      {
        questionId: qDistance.id,
        label: "More than 20 feet",
        value: "over_20",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
        numberAtLeast: 20,
        numberAtLeastExclusive: true,
        numberAtMost: 200,
      },
    ],
  });
  await addNumericUnknownOption(prisma, qDistance.id);

  const componentId = (key: string) => componentIdByKey(prisma, key);
  const under10 = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDistance.id, value: "under_10" },
    select: { id: true },
  });
  const tenTo20 = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDistance.id, value: "10_to_20" },
    select: { id: true },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: under10.id, canonicalComponentId: await componentId("TV_OUTLET_RUN_ACCESSIBLE_UNDER_10"), conditionAccessClass: "ACCESSIBLE" },
      { answerOptionId: under10.id, canonicalComponentId: await componentId("TV_OUTLET_RUN_FINISHED_UNDER_10"), conditionAccessClass: "FINISHED" },
      { answerOptionId: tenTo20.id, canonicalComponentId: await componentId("TV_OUTLET_RUN_ACCESSIBLE_10_20"), conditionAccessClass: "ACCESSIBLE" },
      { answerOptionId: tenTo20.id, canonicalComponentId: await componentId("TV_OUTLET_RUN_FINISHED_10_20"), conditionAccessClass: "FINISHED" },
    ],
  });

  if (access) {
    // The real values are has_access / no_access — matching on "yes"/"no"
    // silently updated nothing, which is why the classification and the
    // acknowledgement routing both missed.
    for (const [value, cls] of [["has_access", "ACCESSIBLE"], ["no_access", "FINISHED"]] as const) {
      await prisma.answerOption.updateMany({
        where: { questionId: access.id, value },
        // Raw values are untouched — only what they MEAN is recorded, so
        // shared components can match without knowing this tree's wording.
        data: { accessClassification: cls },
      });
    }
    // The +$137.50 was a flat figure with no labor behind it. Cleared so the
    // route components price it instead of stacking on top.
    await prisma.answerOption.updateMany({
      where: { questionId: access.id },
      data: { priceModifierCents: 0 },
    });
    await prisma.question.update({
      where: { id: access.id },
      data: {
        prompt:
          "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below where the TV outlet is going?",
        helpText: "This determines whether we can run the wire without opening the finished wall.",
      },
    });
    await prisma.answerOption.updateMany({
      where: { questionId: access.id, value: "has_access" },
      data: {
        routeAction: "CONTINUE",
        nextQuestionId: qDistance.id,
        approvedComponentPriceCents: 0,
      },
    });
    console.log(`  ✓ outlet_access classified; flat +$137.50 removed`);
  }

  const finished = service.questions.find((q) => q.key === "outlet_finished_space");
  if (finished) {
    const qAck = await upsertQuestion(prisma, service.id, {
      key: "tv_finish_ack",
      prompt: "Before we price this — one thing about your wall",
      helpText: FINISH_ACK,
      order: lastOrder + 1,
    });

    // Where the finished answer used to resolve. Preserved so the
    // acknowledgement slots in front of it rather than replacing it.
    const priorNext = finished.options.find((o) => o.value === "finished_both_sides");
    if (!priorNext) {
      // Loud rather than silent: without this answer the acknowledgement has
      // nothing routing to it and sits unreachable.
      throw new Error(
        `outlet_finished_space has no "finished_both_sides" answer — found: ` +
          finished.options.map((o) => o.value).join(", ")
      );
    }
    await prisma.answerOption.createMany({
      data: [
        {
          questionId: qAck.id,
          label: "I understand — go ahead",
          value: "accepted",
          routeAction: "CONTINUE",
          nextQuestionId: qDistance.id,
          order: 1,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: 0,
        },
        {
          questionId: qAck.id,
          label: "I'd rather Elite take a look first",
          value: "review_first",
          routeAction: "PHOTO_REVIEW",
          photosBlockBooking: true,
          order: 2,
          requiredPhotoLabels: REVIEW_PHOTOS,
        },
      ],
    });

    {
      await prisma.answerOption.update({
        where: { id: priorNext.id },
        data: {
          label: "Yes — finished space above or below, or the room's on a slab",
          accessClassification: "FINISHED",
          routeAction: "CONTINUE",
          nextQuestionId: qAck.id,
          // The flat +$225 goes. Finished routing is priced by components
          // now, and leaving the modifier would charge for it twice.
          priceModifierCents: 0,
          approvedComponentPriceCents: 0,
          // Replaced by the acknowledgement, which the customer answers
          // rather than merely reads.
          disclaimer: null,
        },
      });
    }

    await prisma.answerOption.updateMany({
      where: { questionId: finished.id, value: { in: ["not_finished_both_sides", "unsure"] } },
      data: { accessClassification: "UNKNOWN" },
    });

    await prisma.question.update({
      where: { id: finished.id },
      data: {
        prompt:
          "Is there finished living space directly above and/or below this wall, or is the room on a slab?",
        helpText:
          "Either way we'd be running the wire inside the finished wall. We're checking that there isn't an open route above or below it.",
      },
    });
    const reaches = await prisma.answerOption.count({
      where: { nextQuestionId: qAck.id },
    });
    if (reaches === 0) {
      throw new Error("Nothing routes to the acknowledgement — it would be unreachable.");
    }
    console.log(
      `  ✓ finished-space branch: acknowledgement added (${reaches} answer routes to it), flat +$225 removed`
    );
  }

  // ---- assert both tiers are identical --------------------------------
  //
  // Two different wrong models have been built here — a second technician,
  // then a dollar-only premium — so this checks the thing both got wrong:
  // that the larger tier is somehow a different job.
  const svc = await prisma.service.findUniqueOrThrow({ where: await serviceSlugKey(prisma, SLUG) });
  const bigTvNow = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: sizeQ.id, value: "56_to_85" },
    include: { components: true },
  });

  const problems: string[] = [];
  if (svc.requiresTechCount !== 1) problems.push(`service dispatches ${svc.requiresTechCount} crews`);
  if (bigTvNow.overrideTechCount !== null) problems.push(`56-85 overrides crew count`);
  if (bigTvNow.overrideEstimatedMinutes !== null) problems.push(`56-85 overrides duration`);
  if (bigTvNow.components.length > 0) problems.push(`56-85 carries ${bigTvNow.components.length} component(s)`);
  if (bigTvNow.approvedComponentPriceCents !== 0) {
    problems.push(`56-85 adds $${(bigTvNow.approvedComponentPriceCents ?? 0) / 100}`);
  }

  console.log(`\n  both tiers: ${svc.fieldLaborHours} crew-hours, one van, ${svc.estimatedMinutes} minutes, same price`);
  if (problems.length) {
    throw new Error(`The size tiers have diverged again: ${problems.join("; ")}`);
  }

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  if (dangling.length || unreachable.length) {
    console.log(
      `  !` +
        (dangling.length ? `  DANGLING: ${dangling.join(", ")}` : "") +
        (unreachable.length ? `  UNREACHABLE: ${unreachable.join(", ")}` : "")
    );
  }

  console.log(`
  up to 55"   $500 standalone / $375 add-on
  56-85"      the same — it isn't a different job
  over 85"    quote

  Published prices are launch decisions, not formulas — they don't move when
  the tech-hour rate does. The suggested figures will, and the editor shows
  the variance.

  Both size tiers are one van at the same price. There is no two-technician
  tier and no size premium — a bigger television doesn't take longer, and the
  person who helps lift it is already in the van and already in the rate.`);

  console.log(`  TV outlet routes now require a measured distance before a fixed price resolves.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
