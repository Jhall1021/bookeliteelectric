/**
 * Universal Height / Access module — handoff §7.
 *
 * Two questions, fixed answers, fixed routing, attached to every service where
 * elevated or awkward access changes the job. Built once here rather than
 * copied into ten trees, so a change to the routing is a change in one place.
 *
 * Run with: npx tsx prisma/seed-height-access.ts
 *
 * Idempotent — re-running replaces the module cleanly rather than duplicating
 * it. Only ever touches its own two questions; the rest of each tree is left
 * alone and simply renumbered to sit after them.
 *
 * The keys are deliberately STABLE and SHARED across services:
 *
 *   fixture_height    how high the work is
 *   work_area_below   what's underneath it
 *
 * The flow engine reuses answers by key (§29), so once a customer has told us
 * the ceiling is 10 ft or lower with a normal floor below, any later module in the
 * same flow — the Lighting Control module especially — skips straight past
 * these rather than asking again.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

/**
 * Every service where §7 applies AND an instant price is possible.
 *
 * Remote-quote-only services are excluded on purpose: their whole flow already
 * ends in office review, so asking about height would add two questions
 * without changing any outcome.
 */
export const ELEVATED_WORK_SERVICE_SLUGS = [
  "garage-door-opener-outlet",
  "garage-door-opener-outlet-ev",
  "replace-interior-light-fixture",
  "remove-and-replace-existing-chandelier",
  "new-ceiling-light",
  "replace-exterior-light-fixture",
  "replace-motion-flood-light",
  "replace-ceiling-fan",
  "fan-replacing-light",
  "new-ceiling-fan",
  "recessed-lighting",
  "replace-bathroom-exhaust-fan",
  "replace-bathroom-exhaust-fan-with-light",
  "bathroom-fan-light-combo",
  "hardwired-smoke-detector",
  "smoke-co-detector",
  "floodlight-camera-existing",
  "new-exterior-flood-camera",
  "new-exterior-lighting-locations",
] as const;

const HEIGHT_KEY = "fixture_height";
const BELOW_KEY = "work_area_below";

// Ordinary level-floor work through 14 ft remains priceable under the
// contractor's stored height multipliers. Taller or uncertain work is a
// remote quote and requires a wide room/work-area photo.
const HEIGHT_PHOTOS = [
  "A wide photo of the whole room or exterior work area, including the ceiling or fixture and the floor or ground below",
];

const ACCESS_PHOTOS = [
  "The area directly below the fixture — stairs, railing, or whatever is in the way",
  "A wider photo of the whole room including the floor below",
];

async function attach(slug: string) {
  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, slug),
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  // Questions are updated in place, never deleted and recreated — their ids
  // are referenced by other answers, and churning them is what broke the
  // lighting trees.
  const remaining = service.questions.filter(
    (q) => q.key !== HEIGHT_KEY && q.key !== BELOW_KEY
  );
  // fan-replacing-light's content-fix seed creates ceiling_access as a new
  // entry module before this shared module exists. Nothing can point to it
  // yet, so choosing the first row by order would leave it unreachable.
  // Put the shared height/access questions in front of that intended entry;
  // its own answers already hand off to the lighting-control tree.
  const handoffQuestionId = (
    slug === "fan-replacing-light"
      ? remaining.find((q) => q.key === "ceiling_access")
      : remaining[0]
  )?.id ?? null;

  for (let i = 0; i < remaining.length; i++) {
    await prisma.question.update({
      where: { id: remaining[i].id },
      data: { order: i + 2 },
    });
  }

  const qHeight = await upsertQuestion(prisma, service.id, {
    key: HEIGHT_KEY,
    prompt: "About how high is the fixture or work area?",
    helpText: "A rough estimate is fine — we're checking whether we need more than a standard ladder.",
    order: 0,
  });

  const qBelow = await upsertQuestion(prisma, service.id, {
    key: BELOW_KEY,
    prompt: "What's directly below the work area?",
    helpText: "We're asking whether there's somewhere normal to stand a ladder.",
    order: 1,
  });

  // Ten feet and under is base labor; 11–12 ft and 13–14 ft continue with
  // the contractor's stored 12-ft and 14-ft labor adjustments respectively.
  // Taller and uncertain work becomes a remote quote with a required photo.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qHeight.id, label: "10 feet or under", value: "under_10", routeAction: "CONTINUE", nextQuestionId: qBelow.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "11 to 12 feet", value: "11_12", routeAction: "CONTINUE", nextQuestionId: qBelow.id, order: 2, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "13 to 14 feet", value: "13_14", routeAction: "CONTINUE", nextQuestionId: qBelow.id, order: 3, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "Over 14 feet, or I don't know", value: "over_14_or_unsure", routeAction: "REMOTE_QUOTE", photosBlockBooking: true, order: 4, requiredPhotoLabels: HEIGHT_PHOTOS },
    ],
  });

  // §7: only a normal level floor continues. Everything else is a ladder
  // problem we'd rather see before quoting.
  const continueOption = handoffQuestionId
    ? { routeAction: "CONTINUE" as const, nextQuestionId: handoffQuestionId }
    : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

  // An open room isn't a ladder problem. V4 lumped "open foyer / two-story
  // space" into one option, which sent every open-plan entryway to review
  // even at 8 ft with a flat floor. What matters is whether there's somewhere
  // normal to stand a ladder — not what the room is called.
  //
  // Height is tested separately, so an open foyer at 18 ft still goes to
  // review, on height rather than on being a foyer.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qBelow.id, label: "A normal level floor", value: "level_floor", ...continueOption, order: 1, requiredPhotoLabels: [] },
      { questionId: qBelow.id, label: "An open room or entryway, with a level floor underneath", value: "open_room_level", ...continueOption, order: 2, requiredPhotoLabels: [] },
      { questionId: qBelow.id, label: "A staircase", value: "staircase", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: ACCESS_PHOTOS },
      { questionId: qBelow.id, label: "Open to the floor below — it hangs over a stairwell or a drop", value: "open_to_below", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: ACCESS_PHOTOS },
      { questionId: qBelow.id, label: "A loft or balcony edge", value: "loft_balcony", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 5, requiredPhotoLabels: ACCESS_PHOTOS },
      { questionId: qBelow.id, label: "Furniture or built-ins that can't easily be moved", value: "immovable_furniture", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 6, requiredPhotoLabels: ACCESS_PHOTOS },
      { questionId: qBelow.id, label: "Something else, or I'm not sure", value: "other_unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 7, requiredPhotoLabels: ACCESS_PHOTOS },
    ],
  });

  console.log(
    `  ✓ ${slug} — module attached, ${remaining.length} existing question(s) moved after it` +
      (handoffQuestionId ? "" : " (no further questions; qualifying answer resolves)")
  );
}

async function main() {
  console.log(`Attaching the Height / Access module to ${ELEVATED_WORK_SERVICE_SLUGS.length} services...\n`);
  for (const slug of ELEVATED_WORK_SERVICE_SLUGS) await attach(slug);
  console.log(
    `\nKeys "${HEIGHT_KEY}" and "${BELOW_KEY}" are shared across all of them, so a` +
      `\ncustomer who answers once won't be asked again by a later module.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
