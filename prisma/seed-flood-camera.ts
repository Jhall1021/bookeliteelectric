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
// The mount hour covers fixing and aiming the hardwired fixture — not
// getting it onto a network. That boundary is stated to the customer below,
// because a crew standing in a driveway will be asked.
const POWER_AND_BOX_HOURS = 1.5;
const MOUNT_HOURS = 1.0;

const DEVICE_KEY = "flood_camera_connection";
const LOCATION_KEY = "flood_camera_location";
const SOURCE_KEY = "flood_camera_power_source";

/**
 * Both photos, every time, on every path.
 *
 * The close-up shows where it goes. The wide shot is the one that actually
 * earns its place: it shows the story, the soffit, what the wall is made of,
 * whether a ladder can stand anywhere useful, and what's growing in front of
 * it. Half the things that turn this into a difficult job are visible in the
 * wide shot and in none of the answers.
 */
const CAMERA_PHOTOS = [
  "Close up of exactly where you'd like the camera",
  "The whole side of the house, standing well back",
];

const SETUP_SCOPE =
  "This package is for a customer-supplied hardwired floodlight camera. We'll run power to an exterior fixture box, mount the camera and make sure it comes on. Plug-in cameras require a different reviewed power package. Getting the camera onto your wifi and set up in the app is yours to do — we're glad to wait while you check it works, but we can't troubleshoot a home network.";

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
      name: "New Hardwired Floodlight Camera Location",
      shortDescription:
        "Power and an exterior fixture box for a new hardwired floodlight camera. You supply the camera; we install and aim it.",
      bookingType: "ADJUSTED",
      fieldLaborHours: POWER_AND_BOX_HOURS + MOUNT_HOURS,
      // Only the power/box package's quarter hour is saved on a second visit. The
      // mount is discrete work — the ladder goes up either way.
      wwtLaborHours: POWER_AND_BOX_HOURS - 0.25 + MOUNT_HOURS,
      estimatedMinutes: 180,
      requiresTechCount: 1,
      photoState: "PREPARATION",
      isPrimaryEligible: true,
      disclaimer: SETUP_SCOPE,
      startingPriceLabel: null,
    },
  });

  await clearServiceTree(service.id);

  const qDevice = await upsertQuestion(prisma, service.id, {
    key: DEVICE_KEY,
    prompt: "How does the new camera receive power?",
    helpText: "A hardwired floodlight camera mounts directly to an electrical fixture box. A plug-in camera needs a receptacle package instead.",
    order: 1,
  });

  const qLocation = await upsertQuestion(prisma, service.id, {
    key: LOCATION_KEY,
    prompt: "Is there a powered light or camera there now?",
    helpText: "Swapping one out is a much smaller job than starting from nothing.",
    order: 2,
  });

  const qSource = await upsertQuestion(prisma, service.id, {
    key: SOURCE_KEY,
    prompt: "What's on the other side of that wall, or above it?",
    helpText:
      "We need to bring power to the spot. Where it comes from is most of what decides the work.",
    order: 3,
  });

  // ---- Q1: equipment connection -----------------------------------------
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qDevice.id,
        label: "Hardwired floodlight camera — wires connect behind it",
        value: "hardwired",
        routeAction: "CONTINUE",
        nextQuestionId: qLocation.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qDevice.id,
        label: "Plug-in camera — it has a power cord",
        value: "plug_in",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 2,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
      {
        questionId: qDevice.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 3,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: true,
        approvedComponentPriceCents: null,
      },
    ],
  });

  // ---- Q2 ---------------------------------------------------------------
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

  // ---- Q3: where the power comes from -----------------------------------
  await prisma.answerOption.createMany({
    data: [
      {
        // This is the bounded hardwired package: an established suitable
        // source directly behind the new exterior fixture box.
        questionId: qSource.id,
        label: "There's an outlet on the inside wall, more or less behind it",
        value: "back_to_back",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 1,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: true,
        accessClassification: "ACCESSIBLE",
        approvedComponentPriceCents: null,
      },
      {
        questionId: qSource.id,
        label: "There's an attic or crawl space above it we can get into",
        value: "attic_access",
        routeAction: "PHOTO_REVIEW",
        nextQuestionId: null,
        order: 2,
        requiredPhotoLabels: CAMERA_PHOTOS,
        photosBlockBooking: true,
        accessClassification: "ACCESSIBLE",
        approvedComponentPriceCents: null,
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

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);

  console.log(`\n  ${service.name.trim()}`);
  console.log(`      ${POWER_AND_BOX_HOURS} power/fixture box + ${MOUNT_HOURS} mount = ${POWER_AND_BOX_HOURS + MOUNT_HOURS} crew-hours`);
  console.log(`      existing fixture -> reroutes to the swap service`);
  console.log(`      all new-location paths -> review until the hardwired back-to-back atomic package is connected`);
  console.log(`      plug-in and accessible-route variants remain separate review scope\n`);
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
