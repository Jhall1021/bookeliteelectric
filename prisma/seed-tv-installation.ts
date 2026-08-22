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
 * WHAT 3.0 TECH-HOURS MEANS
 *
 * It is the TOTAL: two technicians for 90 minutes. It must not be multiplied
 * by technician count again — that yields 6.0 and doubles the price. The base
 * hours are stored per-tier as totals and the override sets crew size for
 * dispatch, so the two never compound. There's an assertion at the end of this
 * seed for exactly that.
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
 * The two-technician premium, as a component so the labor is visible rather
 * than buried in a flat modifier.
 *
 * 1.5 extra tech-hours over the base — the whole of the second technician's
 * 90 minutes. Approved at $375, which is that labor at the current rate; the
 * published route total of $875 is a separate decision recorded below.
 */
const TWO_TECH = {
  key: "TV_SECOND_TECHNICIAN",
  name: "TV installation — second technician, 56 to 85 inch",
  customerFacingLabel: "Two-technician installation",
  approvedPriceCents: 37500,
  // ZERO labor hours, deliberately.
  //
  // The pricing engine already computes actualTechHours as hours x techCount.
  // The answer overrides techCount to 2, so the base 1.5 becomes 3.0 on its
  // own. Adding 1.5 here as well would make it (1.5 + 1.5) x 2 = 6.0 and
  // double the price — the exact double-multiplication this tier invites.
  //
  // This component exists to carry the approved customer price and to name
  // the second technician on the job sheet, not to add labor.
  addFieldLaborHours: 0,
  addMaterialCostCents: 0,
  // Clock time is unchanged: the second technician works alongside, not
  // afterwards. Crew size comes from the answer's override, not from here —
  // setting it in both places would give three technicians.
  addScheduleMinutes: 0,
  addTechCount: 0,
  notes: "Tier total is 3.0 tech-hours = base 1.5 x 2 technicians. Labor is NOT added here.",
};

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

  await prisma.jobComponent.upsert({
    where: { key: TWO_TECH.key },
    update: { ...TWO_TECH },
    create: TWO_TECH,
  });

  await prisma.service.update({
    where: { id: service.id },
    data: {
      // 1.5 is the up-to-55 tier: one technician, 90 minutes. The second
      // technician arrives as a component, not as a bigger base figure.
      fieldLaborHours: 1.5,
      wwtLaborHours: 1.25,
      estimatedMinutes: 90,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      basePrice: 50000,
      whileWeThereBasePrice: 37500,
      // No publishedPriceApprovedAt here.
      //
      // This seed sets a price you approved in conversation, which is
      // allowed — but stamping the approval field would be the script
      // recording consent it was never given. Once that's in the data
      // there's no way to tell an owner-approved price from one a
      // calculation invented, which is how the recessed base moved
      // without anyone deciding it should.
      //
      // Approval happens in the admin, or in one explicit reconciliation
      // migration. Not here.
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
        approvedComponentPriceCents: 37500,
        disclaimer:
          "A TV this size takes two of us to hang safely, so there are two electricians on site for this one.",
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
    data: { overrideTechCount: 2, overrideEstimatedMinutes: 90 },
  });
  await prisma.answerOptionComponent.create({
    data: {
      answerOptionId: bigTv.id,
      componentId: (await prisma.jobComponent.findUniqueOrThrow({ where: { key: TWO_TECH.key } })).id,
    },
  });
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

  // ---- the double-multiplication check ----------------------------------
  //
  // 3.0 tech-hours for the two-technician tier is the TOTAL. If anything
  // multiplies the base hours by crew size on top of the component, it
  // becomes 6.0 and the price doubles. Asserted here rather than trusted.
  const svc = await prisma.service.findUniqueOrThrow({ where: { slug: SLUG } });
  const comp = await prisma.jobComponent.findUniqueOrThrow({ where: { key: TWO_TECH.key } });

  // Mirrors what lib/pricing.ts does: hours x crew, plus any component hours.
  const base = svc.fieldLaborHours ?? 0;
  const crew = 2;
  const resolved = base * crew + comp.addFieldLaborHours;
  const ok = Math.abs(resolved - 3.0) < 0.001;

  console.log(`\n  56-85" tier`);
  console.log(`    base ${base} hr x ${crew} technicians  = ${base * crew} tech-hours`);
  console.log(`    component adds                = ${comp.addFieldLaborHours} tech-hours`);
  console.log(`    total                         = ${resolved} tech-hours  ${ok ? "✓" : "✗ EXPECTED 3.0"}`);
  console.log(`    clock time stays ${svc.estimatedMinutes} minutes, crew size 2`);
  if (!ok) {
    throw new Error(
      `TV tier resolves to ${resolved} tech-hours, expected 3.0. If it's 6.0 the ` +
        `component is adding labor that the crew multiplication already covers.`
    );
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
  up to 55"   $500 standalone / $375 add-on    (labor suggests $375)
  56-85"      $875 standalone / $750 add-on    (labor suggests $750)
  over 85"    quote

  Published prices are launch decisions, not formulas — they don't move when
  the tech-hour rate does. The suggested figures will, and the editor shows
  the variance.

  NOTE: the $750 add-on for the two-tech tier is set on the size answer, not
  the service. A second technician doesn't disappear because you're already on
  site for something else, so there's very little add-on discount here.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
