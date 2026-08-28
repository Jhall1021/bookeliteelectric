/**
 * New Exterior Flood / Camera Location.
 *
 *   npx tsx prisma/seed-flood-camera.ts
 *
 * Replaces the quote-only version created on 23 Aug.
 *
 * THE IDEA WORTH KEEPING
 *
 * This isn't really a new electrical service. A plug-in camera needs a
 * receptacle where there isn't one, and then something screwed to the wall —
 * so the job is Elite's existing exterior receptacle work plus a mount.
 *
 * Building it that way rather than as a standalone "flood camera" price means
 * the receptacle half stays correct on its own. When the cost of a
 * weather-resistant GFCI moves, this moves with it, because it's the same
 * component. A flat price would have quietly gone stale.
 *
 * It also means the hard cases were already solved: no back-to-back source
 * and no attic is the same routing problem as any other exterior outlet, and
 * the height bands already exist for working off a ladder.
 *
 *   exterior receptacle    1.5 crew-hours, $52.44   (existing, reconciled)
 *   mount / aim / cord     1.0 crew-hours,  $8.00   (new)
 *                          ----------------------
 *                          2.5 crew-hours, $60.44   ->  $705
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";

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


const SLUG = "new-exterior-flood-camera";

// POLICY[flood_camera.mount_labor_hours]: 1.0
// POLICY[flood_camera.max_height_ft]: 12
// POLICY[flood_camera.equipment_supply]: CUSTOMER_SUPPLIED
// POLICY[flood_camera.network_setup]: EXCLUDED
//
// The mount hour covers fixing it, aiming it and running the cord — not
// getting it onto a network. That boundary is stated to the customer below,
// because a crew standing in a driveway will be asked.
const RECEPTACLE_HOURS = 1.5;
const MOUNT_HOURS = 1.0;

const LOCATION_KEY = "flood_camera_location";
const SOURCE_KEY = "flood_camera_power_source";
const HEIGHT_KEY = "flood_camera_height";

/**
 * Both photos, every time, on every path.
 *
 * The close-up shows where it goes. The wide shot is the one that actually
 * earns its place: it shows the storey, the soffit, what the wall is made of,
 * whether a ladder can stand anywhere useful, and what's growing in front of
 * it. Half the things that turn this into a difficult job are visible in the
 * wide shot and in none of the answers.
 */
const CAMERA_PHOTOS = [
  "Close up of exactly where you'd like the camera",
  "The whole side of the house, standing well back",
];

const SETUP_SCOPE =
  "We'll run the power, mount the camera and make sure it comes on. Getting it onto your wifi and set up in the app is yours to do — we're glad to wait while you check it works, but we can't troubleshoot a home network.";

async function main() {
  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    include: { questions: true },
  });
  if (!service) {
    console.error(`No service with slug "${SLUG}".`);
    process.exit(1);
  }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      name: "New Exterior Flood or Camera Location",
      shortDescription:
        "Power and a mount for a camera or floodlight where there isn't one today. You supply the camera; we put a receptacle where it needs one and get it up.",
      bookingType: "ADJUSTED",
      fieldLaborHours: RECEPTACLE_HOURS + MOUNT_HOURS,
      // Only the receptacle's quarter hour is saved on a second visit. The
      // mount is discrete work — the ladder goes up either way.
      wwtLaborHours: RECEPTACLE_HOURS - 0.25 + MOUNT_HOURS,
      estimatedMinutes: 180,
      requiresTechCount: 1,
      photoState: "PREPARATION",
      isPrimaryEligible: true,
      disclaimer: SETUP_SCOPE,
      startingPriceLabel: null,
    },
  });

  await clearServiceTree(service.id);

  const qLocation = await upsertQuestion(prisma, service.id, {
    key: LOCATION_KEY,
    prompt: "Is there a powered light or camera there now?",
    helpText: "Swapping one out is a much smaller job than starting from nothing.",
    order: 1,
  });

  const qSource = await upsertQuestion(prisma, service.id, {
    key: SOURCE_KEY,
    prompt: "What's on the other side of that wall, or above it?",
    helpText:
      "We need to bring power to the spot. Where it comes from is most of what decides the work.",
    order: 2,
  });

  const qHeight = await upsertQuestion(prisma, service.id, {
    key: HEIGHT_KEY,
    prompt: "Roughly how high off the ground?",
    helpText: null,
    order: 3,
  });

  // ---- Q1 ---------------------------------------------------------------
  const swapTarget = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, "floodlight-camera-existing"),
    select: { id: true },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qLocation.id,
        // Already a priced service at 1.0/0.75 hours. Sending them there is
        // the "no dead ends" rule doing something useful rather than
        // apologetic — they came to the wrong page and leave with a price.
        label: "Yes — there's one there now that works",
        value: "existing_powered",
        routeAction: swapTarget ? "REROUTE_SERVICE" : "PHOTO_REVIEW",
        rerouteServiceId: swapTarget?.id ?? null,
        nextQuestionId: null,
        order: 1,
        requiredPhotoLabels: swapTarget ? [] : CAMERA_PHOTOS,
        approvedComponentPriceCents: swapTarget ? 0 : null,
      },
      {
        questionId: qLocation.id,
        label: "No — there's nothing there",
        value: "new_location",
        routeAction: "CONTINUE",
        nextQuestionId: qSource.id,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
    ],
  });

  // ---- Q2: where the power comes from -----------------------------------
  await prisma.answerOption.createMany({
    data: [
      {
        // Back-to-back. The same job as the exterior GFCI that already
        // exists, so it carries the same hours and the same parts.
        questionId: qSource.id,
        label: "There's an outlet on the inside wall, more or less behind it",
        value: "back_to_back",
        routeAction: "CONTINUE",
        nextQuestionId: qHeight.id,
        order: 1,
        requiredPhotoLabels: [],
        accessClassification: "ACCESSIBLE",
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qSource.id,
        label: "There's an attic or crawl space above it we can get into",
        value: "attic_access",
        routeAction: "CONTINUE",
        nextQuestionId: qHeight.id,
        order: 2,
        requiredPhotoLabels: [],
        accessClassification: "ACCESSIBLE",
        approvedComponentPriceCents: 0,
      },
      {
        // Neither, or unsure. This is the ordinary new-outlet routing
        // problem — how far, through what, past what — and it isn't
        // answerable from a form. The wide photo usually settles it.
        questionId: qSource.id,
        label: "Neither, or I'm not sure",
        value: "no_simple_source",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 3,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
    ],
  });

  // ---- Q3: height -------------------------------------------------------
  // Same bands as everywhere else. A camera at nine feet is a stepladder; at
  // fourteen it's an extension ladder against a soffit, and that's a
  // different afternoon.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qHeight.id,
        label: "8 feet or less",
        value: "under_8",
        routeAction: "RESOLVE_INSTANT",
        nextQuestionId: null,
        order: 1,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: false,
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qHeight.id,
        label: "9 to 12 feet — normal single storey",
        value: "9_12",
        routeAction: "RESOLVE_INSTANT",
        nextQuestionId: null,
        order: 2,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: false,
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qHeight.id,
        label: "Higher than 12 feet, or a second storey",
        value: "over_12",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 3,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
      {
        questionId: qHeight.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 4,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
    ],
  });

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);

  console.log(`\n  ${service.name.trim()}`);
  console.log(`      ${RECEPTACLE_HOURS} receptacle + ${MOUNT_HOURS} mount = ${RECEPTACLE_HOURS + MOUNT_HOURS} crew-hours`);
  console.log(`      existing fixture -> reroutes to the swap service`);
  console.log(`      back-to-back or attic, 12 ft or under -> instant`);
  console.log(`      no simple source, or over 12 ft -> review\n`);
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
