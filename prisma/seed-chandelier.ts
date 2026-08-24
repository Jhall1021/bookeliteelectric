/**
 * Chandelier Replacement — bookable, with a deliberately narrow envelope.
 *
 *   npx tsx prisma/seed-chandelier.ts
 *
 * Replaces the quote-only version created on 23 Aug. That was the right call
 * at the time — there was no scope model, and inventing crew-hours to clear a
 * report would have been guessing. This is the scope model.
 *
 * THE SHAPE OF THE PROBLEM
 *
 * "Chandelier" covers a five-arm fixture someone lifts alone and a three-tier
 * crystal piece that takes six hours to hang. Those cannot share a price, and
 * no surcharge bridges them honestly — a premium implies we know how much
 * more, and we don't.
 *
 * So this doesn't try to price the category. It defines a narrow standard job
 * and sends everything else to review. The instant price covers the ordinary
 * case; the unusual one gets looked at. That's a smaller promise than "we
 * price chandeliers instantly", and it's one that can actually be kept.
 *
 * WHY THE QUESTIONS AVOID THE OBVIOUS ONES
 *
 * Not weight, not dimensions, not crystal count. A homeowner standing under
 * their dining room fixture cannot answer those, and a number they guess is
 * worse than no number because it looks like data.
 *
 * Three questions they CAN answer — where it goes, roughly what it looks
 * like, is it replacing something — plus photos. The photos settle what the
 * questions can't.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";
import { publishIfUnset } from "./_priceGuard";

const prisma = new PrismaClient();

/**
 * Remove whatever tree this service had.
 *
 * Both of today's scope services were quote-only, which means they carry a
 * "we'll need a couple of photos" question sitting at order 1. Building new
 * questions alongside it leaves that one as the entry point — it answers
 * everything before the new tree is reached, and the new questions are
 * unreachable.
 *
 * Idempotency isn't enough on its own: upserting the questions I want doesn't
 * remove the ones I don't.
 */
async function clearServiceTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId } });
  for (const q of questions) {
    await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  }
  await prisma.question.deleteMany({ where: { serviceId } });
}


const SLUG = "remove-and-replace-existing-chandelier";

// POLICY[chandelier.standard_labor_hours]: 2.0
// POLICY[chandelier.standard_max_height_ft]: 12
// POLICY[chandelier.standard_max_weight_lb]: 35
// POLICY[chandelier.standard_max_width_in]: 36
// POLICY[chandelier.large_crystal]: QUOTE_ONLY
// POLICY[chandelier.multi_tier]: QUOTE_ONLY
// POLICY[chandelier.significant_assembly]: QUOTE_ONLY
// POLICY[chandelier.open_to_below]: QUOTE_ONLY
// POLICY[chandelier.new_location]: REVIEW
//
// Thresholds are Elite's, not facts about chandeliers. Another contractor
// with a lift and two helpers would draw them somewhere else entirely.
const STANDARD_HOURS = 2.0;

// Same figure for same-visit, deliberately.
//
// Most services save the quarter hour of arrival overhead. This one doesn't
// meaningfully: the ladder still goes up, the old fixture still comes down
// piece by piece, the new one still gets assembled and levelled. Being here
// for something else doesn't shorten any of that.
const STANDARD_WWT_HOURS = 2.0;

const LOCATION_KEY = "chandelier_location";
const ACCESS_KEY = "chandelier_access";
const COMPLEXITY_KEY = "chandelier_complexity";

/** Photos on the qualifying path. Price already locked; these are for the crew. */
const PREP_PHOTOS = [
  "The existing fixture, from below",
  "The new chandelier — a photo, or a screenshot of the product page",
];

/** Photos when the office needs to price it. */
const REVIEW_PHOTOS = [
  "The existing fixture, from below",
  "The new chandelier — a photo, or a screenshot of the product page",
  "The room from a distance, showing the ceiling and the floor beneath it",
];

async function main() {
  const service = await prisma.service.findUnique({
    where: { slug: SLUG },
    include: { questions: true },
  });
  if (!service) {
    console.error(`No service with slug "${SLUG}".`);
    process.exit(1);
  }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      name: "Replace an Existing Chandelier",
      shortDescription:
        "Swapping a chandelier for a new one in the same spot. Standard sizes on a normal ceiling get a price straight away; larger or more elaborate fixtures we'll look at first.",
      bookingType: "ADJUSTED",
      fieldLaborHours: STANDARD_HOURS,
      wwtLaborHours: STANDARD_WWT_HOURS,
      // Four hours of calendar for a two-hour job. The spread on these is
      // wide even inside the standard envelope, and a crew held up on a
      // fixture that fought them shouldn't make the next appointment late.
      //
      // This is why schedule duration and pricing labor are separate fields:
      // the customer pays for the work, the calendar plans for the variance.
      estimatedMinutes: 240,
      requiresTechCount: 1,
      photoState: "PREPARATION",
      isPrimaryEligible: true,
      startingPriceLabel: null,
    },
  });

  await clearServiceTree(service.id);

  // ---- Q1: is this a swap, or somewhere new? ----------------------------
  const qLocation = await upsertQuestion(prisma, service.id, {
    key: LOCATION_KEY,
    prompt: "Is the new chandelier going where the old one is now?",
    helpText:
      "Using the existing box and wiring is a different job from running power to a new spot.",
    order: 1,
  });

  const qAccess = await upsertQuestion(prisma, service.id, {
    key: ACCESS_KEY,
    prompt: "What's the ceiling like where it hangs?",
    helpText: null,
    order: 2,
  });

  const qComplexity = await upsertQuestion(prisma, service.id, {
    key: COMPLEXITY_KEY,
    prompt: "Which sounds more like your new chandelier?",
    helpText:
      "If you're between the two, pick the second one — we'll take a look and come back with a price.",
    order: 3,
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qLocation.id,
        label: "Yes — replacing one that's already there",
        value: "existing_location",
        routeAction: "CONTINUE",
        nextQuestionId: qAccess.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        // A new location needs a box, a run and possibly a switch leg —
        // none of which this service's two hours covers.
        questionId: qLocation.id,
        label: "No — it's going somewhere there isn't a light now",
        value: "new_location",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
    ],
  });

  // ---- Q2: access -------------------------------------------------------
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qAccess.id,
        label: "A normal ceiling, 12 feet or lower, with floor underneath",
        value: "standard",
        routeAction: "CONTINUE",
        nextQuestionId: qComplexity.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qAccess.id,
        label: "Higher than 12 feet",
        value: "over_12ft",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
      {
        // The one height alone misses. A twelve-foot foyer over a stairwell
        // is a stepladder problem on paper and a scaffolding problem in
        // reality, because there's nothing level to stand on.
        questionId: qAccess.id,
        label: "Over a staircase, an open foyer, or open to the floor below",
        value: "open_to_below",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
    ],
  });

  // ---- Q3: what kind of fixture ----------------------------------------
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qComplexity.id,
        label: "A standard chandelier",
        value: "standard",
        disclaimer:
          "Moderate size, arrives mostly put together, hangs on a chain or rod without much assembly.",
        routeAction: "RESOLVE_INSTANT",
        nextQuestionId: null,
        order: 1,
        // One example, deliberately: an eight-arm fixture with modest drops
        // is the middle of this category, and showing three variations of
        // "ordinary" invites someone to hunt for an exact match.
        illustrationUrls: ["/images/fixtures/chandelier-standard.jpg"],
        // The photos don't hold up the booking. The price is settled by the
        // answers; these are so the crew knows what they're collecting and
        // what's coming down. That's the whole difference between a
        // preparation photo and a review one.
        photosBlockBooking: false,
        // PREPARATION, not review: the price is settled, the customer books,
        // and the crew sees what they're walking into. Photos don't have to
        // block a booking to be useful.
        requiredPhotoLabels: PREP_PHOTOS,
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qComplexity.id,
        label: "Large, or elaborate",
        value: "large_elaborate",
        // Two, because they fail the standard for different reasons. The
        // crystal piece is dozens of individually-hung drops; the wagon
        // wheel is multi-tier and not especially ornate. Showing both stops
        // this reading as "only if it's covered in crystals".
        illustrationUrls: [
          "/images/fixtures/chandelier-crystal.jpg",
          "/images/fixtures/chandelier-multi-tier.jpg",
        ],
        disclaimer:
          "Multiple tiers, a lot of crystals or glass pieces to hang individually, or a big piece that takes real assembly. We'll price this one after a look.",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
      {
        // "Not sure" goes to review rather than being nudged toward the
        // cheaper answer. Someone uncertain in a form is exactly the case
        // where a photo is worth thirty seconds of the office's time.
        questionId: qComplexity.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
    ],
  });

  await publishIfUnset(prisma, service.id, {
    basePrice: null,
    whileWeThereBasePrice: null,
    reason:
      "2.0 crew-hours plus a rated box and consumables. Left for the admin to publish rather than set here.",
  });

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);

  console.log(`\n  ${service.name.trim()}`);
  console.log(`      ${STANDARD_HOURS} crew-hours, 240 minutes of calendar`);
  console.log(`      3 questions, then either an instant price or a review\n`);
  console.log(`      instant path: existing location -> normal ceiling -> standard fixture`);
  console.log(`      everything else -> photos -> office prices it\n`);
  console.log(`      dangling: ${dangling.length}   unreachable: ${unreachable.length}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
