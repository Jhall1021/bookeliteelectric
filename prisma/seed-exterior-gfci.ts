/**
 * Exterior GFCI — Back-to-Back Power. V4 §6.
 *
 *   npx tsx prisma/seed-exterior-gfci.ts
 *
 * This service had NO tree at all: INSTANT at $500 with zero questions, so
 * anyone could book it regardless of what was behind the wall or what the
 * wall was made of. V4 specifies the qualification and it was never built.
 *
 * Photos are PREPARATION, not review — V4 asks for two even on standard jobs,
 * and the price is genuinely fixed, so making the customer wait for a quote
 * would be theatre. They book immediately; the photos mean the technician
 * arrives with the right box knowing what siding he's cutting.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

const SLUG = "exterior-gfci-standard";

/**
 * Real materials rather than a round allowance:
 *
 *   weather-resistant GFCI        $25.00
 *   in-use bubble cover           $15.00
 *   FS box, cast single gang       $8.00
 *   2 ft of 12/2 at $0.72/ft       $1.44
 *   consumables                    $3.00
 *                                 ------
 *                                 $52.44
 *
 * The old $50 allowance turned out to be close. At the §4 tier of 1.30x that
 * sells for $68.17, and with 1.5 hours of labor the model computes $445
 * against the published $500 — a $55 gap, left alone since published prices
 * don't move on a calculation.
 */
const MATERIAL_CENTS = 5244;

const PREP_PHOTOS = [
  "Where you'd like the outdoor outlet, with enough of the wall around it to see the siding",
  "The indoor outlet on the other side of that wall",
];

const REVIEW_PHOTOS = [
  "Where you'd like the outdoor outlet, with enough of the wall around it to see the siding",
  "A wider photo of that exterior wall",
  "The inside of that same wall, wherever the nearest outlet is",
];

async function main() {
  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!service) {
    console.log(`  – ${SLUG} not in the catalog`);
    return;
  }

  const otherRouting = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, "exterior-gfci-other-routing"),
  });

  await prisma.service.update({
    where: { id: service.id },
    data: {
      // Was INSTANT with no questions — now it qualifies before pricing.
      bookingType: "ADJUSTED",
      fieldLaborHours: 1.5,
      wwtLaborHours: 1.0,
      estimatedMinutes: 90,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      materialCostCents: MATERIAL_CENTS,
      // Null so the §4 tier derives it from the material cost.
      materialMultiplier: null,
      photoState: "PREPARATION",
    },
  });

  const qBehind = await upsertQuestion(prisma, service.id, {
    key: "gfci_receptacle_behind",
    prompt: "Is there an indoor outlet on the other side of that wall?",
    helpText:
      "Directly behind where you want the outdoor one, or very close to it. That's what lets us go straight through the wall instead of running new wiring.",
    order: 0,
  });

  const qWall = await upsertQuestion(prisma, service.id, {
    key: "gfci_wall_finish",
    prompt: "What's the outside of that wall made of?",
    order: 1,
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qBehind.id,
        label: "Yes, there's one right behind there",
        value: "yes",
        routeAction: "CONTINUE",
        nextQuestionId: qWall.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        // Not a dead end — running power out to a new exterior location is a
        // real job, just not this one. The quote-only service already exists.
        questionId: qBehind.id,
        label: "No — the nearest outlet is somewhere else",
        value: "no",
        routeAction: otherRouting ? "REROUTE_SERVICE" : "PHOTO_REVIEW",
        rerouteServiceId: otherRouting?.id ?? null,
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: otherRouting ? [] : REVIEW_PHOTOS,
      },
      {
        questionId: qBehind.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  // Siding we can cut and seal predictably books; masonry doesn't. The
  // qualifying answers resolve at the published price and collect the two
  // photos WITHOUT blocking — that's the whole point of PREPARATION.
  const bookable = (label: string, value: string, order: number) => ({
    questionId: qWall.id,
    label,
    value,
    routeAction: "PHOTO_REVIEW" as const,
    photosBlockBooking: false,
    order,
    requiredPhotoLabels: PREP_PHOTOS,
    approvedComponentPriceCents: 0,
    disclaimer:
      "Your price is set — the photos just mean we arrive with the right box and know what we're cutting into.",
  });

  const review = (label: string, value: string, order: number) => ({
    questionId: qWall.id,
    label,
    value,
    routeAction: "PHOTO_REVIEW" as const,
    photosBlockBooking: true,
    order,
    requiredPhotoLabels: REVIEW_PHOTOS,
  });

  await prisma.answerOption.createMany({
    data: [
      bookable("Vinyl siding", "vinyl", 1),
      bookable("Wood siding", "wood", 2),
      // Fiber cement and stucco default to review pending a decision — both
      // are cuttable but neither behaves like vinyl, and guessing wrong on a
      // fixed price is the expensive direction. One line each to make
      // bookable if that's the call.
      review("Fiber cement", "fiber_cement", 3),
      review("Stucco", "stucco", 4),
      review("Brick", "brick", 5),
      review("Stone", "stone", 6),
      review("Something else, or I'm not sure", "other_unsure", 7),
    ],
  });

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  console.log(
    `  ✓ ${SLUG} — 2 questions, preparation photos on the bookable path` +
      (dangling.length ? `  [DANGLING: ${dangling.join(", ")}]` : "") +
      (unreachable.length ? `  [UNREACHABLE: ${unreachable.join(", ")}]` : "")
  );
  console.log(`
  vinyl or wood siding, outlet behind   $500, books with 2 prep photos
  fiber cement, stucco, brick, stone     photo review
  no outlet behind                       reroutes to the quote-only service
  not sure                               photo review

  Material now itemized at $52.44 rather than a $50 allowance. Model computes
  $445 against the published $500 — left alone.

  NOT built yet, deliberately: V4's intended-use question routing pool and
  hot-tub work to Pool/Spa and EV charging to the EV workflow.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
