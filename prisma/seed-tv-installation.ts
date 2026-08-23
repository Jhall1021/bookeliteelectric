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
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";

const prisma = new PrismaClient();

const SLUG = "tv-installation";

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
  const service = await prisma.service.findUnique({
    where: { slug: SLUG },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log(`  – ${SLUG} not in the catalog`);
    return;
  }

  // Both retired rather than deleted — either may appear on bookings already
  // taken, and a booked job's record shouldn't lose the component it was
  // priced with.
  const retired = await prisma.jobComponent.updateMany({
    where: { key: { in: ["TV_SECOND_TECHNICIAN", "TV_LARGE_SIZE_PREMIUM_56_85"] } },
    data: { active: false },
  });
  if (retired.count) console.log(`  ✓ ${retired.count} superseded TV component(s) retired`);

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
    console.log(`  ✓ outlet_access classified; flat +$137.50 removed`);
  }

  const finished = service.questions.find((q) => q.key === "outlet_finished_space");
  if (finished) {
    const qAck = await upsertQuestion(prisma, service.id, {
      key: "tv_finish_ack",
      prompt: "Before we price this — one thing about your wall",
      helpText: FINISH_ACK,
      order: finished.order + 1,
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
          routeAction: "RESOLVE_ADJUSTED",
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
  const svc = await prisma.service.findUniqueOrThrow({ where: { slug: SLUG } });
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
