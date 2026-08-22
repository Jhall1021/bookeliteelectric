/**
 * Bathroom exhaust fans — item 6.
 *
 *   npx tsx prisma/seed-bathroom-fans.ts
 *
 * Two services existed: Replace Bathroom Exhaust Fan at $525 and Bathroom
 * Fan/Light Combo at $595. If the customer supplies the unit, a fan and a
 * fan/light are the same job — the $70 differential was pricing a fixture
 * Elite doesn't buy.
 *
 * So they split on who supplies it instead:
 *
 *   OWNER-SUPPLIED   2.0 hours, $520, instantly bookable
 *   ELITE-SUPPLIED   remote quote — the price depends on a fan nobody has
 *                    seen yet, and housing sizes vary enough that guessing
 *                    means either eating the difference or going back.
 *
 * The Elite-supplied version collects a photo and the housing measurements,
 * which is what makes a same-day quote possible rather than a site visit.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findUnreachableQuestions } from "./_moduleHelpers";

const prisma = new PrismaClient();

const OWNER_SLUG = "bathroom-fan-light-combo";
const ELITE_SLUG = "replace-bathroom-exhaust-fan";

/**
 * 2.0 hours at $250 is $500 of labor. The customer supplies the fan, so the
 * only material is Elite's: duct connector, clamp, wire nuts, foil tape —
 * about $15, which brings it to $520 at the 1.30x tier.
 *
 * That lands within $5 of the old $525, which is a good sign: the hours and
 * the hand-set price agree, which they haven't on most services.
 */
const OWNER_MATERIALS: [string, number][] = [
  ["DUCT_CONNECTOR", 1],
  ["CONSUMABLES_SMALL", 1],
];

const FINISH_DISCLAIMER = [
  "Getting an old fan housing out of a finished ceiling usually means opening it up — the housing is nailed to the framing from above, and without attic access there's no way to reach it.",
  "We keep the opening as small as we can and the new fan's trim covers some of it, but not always all.",
  "Patching, spackling, sanding and painting aren't included unless we've put it in writing.",
].join("\n\n");

async function main() {
  // ---- owner-supplied: merged and bookable -----------------------------
  const owner = await prisma.service.findUnique({
    where: { slug: OWNER_SLUG },
    include: { questions: true },
  });
  if (!owner) {
    console.log(`  – ${OWNER_SLUG} not in the catalog`);
    return;
  }

  await prisma.service.update({
    where: { id: owner.id },
    data: {
      name: "Remove and Replace Owner-Supplied Bathroom Exhaust Fan",
      shortDescription:
        "You buy the fan — or fan and light combo — and we swap it out. Same job either way, so it's one price.",
      bookingType: "ADJUSTED",
      fieldLaborHours: 2.0,
      wwtLaborHours: 1.5,
      estimatedMinutes: 120,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      basePrice: 52000,
      whileWeThereBasePrice: 37500,
      materialMultiplier: null,
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
      photoState: "NONE",
      disclaimer:
        "Please have the fan on hand, complete and undamaged. If the housing or ducting turns out to need work beyond a straight swap, we'll explain the options and give you the price before proceeding.",
    },
  });

  // Itemized materials, so a price change on connectors reprices this too.
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: owner.id } });
  let total = 0;
  for (const [i, [key, qty]] of OWNER_MATERIALS.entries()) {
    const m = await prisma.material.findUnique({ where: { key } });
    if (!m) continue;
    await prisma.serviceMaterial.create({
      data: { serviceId: owner.id, materialId: m.id, quantity: qty, order: i },
    });
    total += Math.round(m.unitCostCents * qty);
  }
  await prisma.service.update({
    where: { id: owner.id },
    data: { materialCostCents: total },
  });

  const qAccess = await upsertQuestion(prisma, owner.id, {
    key: "ceiling_access",
    prompt: "Is there attic space above that bathroom?",
    helpText:
      "It decides whether we can reach the fan housing from above or have to open the ceiling to get it out.",
    order: 0,
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qAccess.id,
        label: "Yes, there's an attic above",
        value: "accessible",
        accessClassification: "ACCESSIBLE",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qAccess.id,
        label: "No — there's another floor or a finished ceiling above",
        value: "finished",
        accessClassification: "FINISHED",
        routeAction: "RESOLVE_INSTANT",
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
        // Same price either way — the extra work is getting the old housing
        // out, which is real but not another hour. What changes is the
        // ceiling, and the customer should know before booking.
        disclaimer: FINISH_DISCLAIMER,
      },
      {
        questionId: qAccess.id,
        label: "I'm not sure",
        value: "unsure",
        accessClassification: "UNKNOWN",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: [
          "The existing fan, cover on, from below",
          "A wider photo of the bathroom ceiling",
        ],
      },
    ],
  });

  console.log(`  ✓ ${OWNER_SLUG} — owner-supplied, $520 / $375, material $${(total / 100).toFixed(2)}`);

  // ---- Elite-supplied: remote quote -------------------------------------
  const elite = await prisma.service.findUnique({
    where: { slug: ELITE_SLUG },
    include: { questions: true },
  });
  if (!elite) {
    console.log(`  – ${ELITE_SLUG} not in the catalog`);
    return;
  }

  await prisma.service.update({
    where: { id: elite.id },
    data: {
      name: "Replace Bathroom Exhaust Fan — We Supply the Fan",
      shortDescription:
        "Don't want to pick one out? Send us a photo and the size of your existing housing and we'll quote the fan and the work together.",
      bookingType: "REMOTE_QUOTE",
      basePrice: null,
      whileWeThereBasePrice: null,
      startingPriceLabel: "Get a quote",
      photoState: "REVIEW_REQUIRED",
      disclaimer:
        "We'll price the fan and the installation together once we've seen what's there. Nothing is booked until you've agreed the price.",
    },
  });

  for (const q of elite.questions) {
    await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  }
  await prisma.question.deleteMany({ where: { serviceId: elite.id } });

  const qPhoto = await upsertQuestion(prisma, elite.id, {
    key: "elite_fan_photo",
    prompt: "First, a photo of the fan you have now",
    helpText: "Cover still on — just so we can see what's there.",
    order: 0,
  });

  const qMeasure = await prisma.question.create({
    data: {
      serviceId: elite.id,
      key: "elite_fan_housing_size",
      prompt: "Now the size of the metal housing behind the cover",
      helpText:
        "Switch the fan off at the wall switch first. The cover pulls straight down — it's held by two spring clips. Measure the metal box behind it, width and length, and put the cover back. Common sizes are around 7x7 up to 10x10 inches.",
      inputType: "TEXT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qPhoto.id,
        label: "Continue",
        value: "continue",
        routeAction: "CONTINUE",
        nextQuestionId: qMeasure.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        // The TEXT renderer replaces this option's value with whatever the
        // customer types, so the measurement lands in answersSnapshot under
        // elite_fan_housing_size.
        questionId: qMeasure.id,
        label: "Continue",
        value: "measurement",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 1,
        requiredPhotoLabels: [
          "The existing fan with the cover on, from below",
          "The bathroom ceiling around it",
        ],
      },
    ],
  });

  const unreachable = await findUnreachableQuestions(prisma, elite.id);
  console.log(
    `  ✓ ${ELITE_SLUG} — Elite-supplied, remote quote with photo and measurements` +
      (unreachable.length ? `  [UNREACHABLE: ${unreachable.join(", ")}]` : "")
  );

  console.log(`
  Owner-supplied   $520 / $375, books instantly, fan or fan-light alike
  Elite-supplied   quote, after a photo and the housing measurements

  The old $70 gap between fan and fan-light priced a fixture Elite doesn't
  buy. It only ever made sense on the version where Elite supplies it — and
  that one can't be priced from a catalog page at all.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
