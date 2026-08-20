/**
 * Single-Pole and Double-Pole Breaker Replacement — V4 §6, handoff §27.
 *
 *   npx tsx prisma/seed-breakers.ts
 *
 * Both had no tree at all, which meant a homeowner with a breaker that trips
 * every evening could book a $280 swap that wouldn't fix it. V4 is explicit:
 * ask why it's being replaced, and route repeated tripping or an unknown
 * cause to Troubleshooting rather than selling a part.
 *
 * The panel photo is PREPARATION, not review. The price is genuinely fixed,
 * so making the customer wait for a quote would be theatre — but arriving
 * with the wrong breaker means a second trip. Photos ride along with the
 * booking; the customer schedules immediately.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences } from "./_moduleHelpers";

const prisma = new PrismaClient();

const SERVICES = ["single-pole-breaker-replacement", "double-pole-breaker-replacement"];

async function seedBreaker(slug: string) {
  const service = await prisma.service.findUnique({
    where: { slug },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  // PREPARATION: photos required, booking not blocked (handoff §6).
  await prisma.service.update({
    where: { id: service.id },
    data: { photoState: "PREPARATION" },
  });

  const q = await upsertQuestion(prisma, service.id, {
    key: "breaker_reason",
    prompt: "Why does the breaker need replacing?",
    helpText: "If it keeps tripping, the breaker usually isn't the problem — something on the circuit is.",
    order: 0,
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q.id,
        label: "It's damaged, or I'm upgrading it",
        value: "damaged_or_upgrade",
        // Non-blocking photo review: the price is locked, the photos are for
        // the technician's van stock.
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: false,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
        disclaimer:
          "We'll check your panel photo before we come out so we bring a breaker that fits. If your panel turns out to need something we don't carry, we'll tell you before we start.",
      },
      {
        // V4: do not simply replace a breaker that keeps tripping.
        questionId: q.id,
        label: "It keeps tripping",
        value: "keeps_tripping",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 2,
        requiredPhotoLabels: [],
        disclaimer:
          "A breaker that trips repeatedly is usually doing its job — something on that circuit is drawing too much or has a fault. Swapping it would hide the problem rather than fix it, so we'll find the cause first.",
      },
      {
        questionId: q.id,
        label: "Something on that circuit stopped working",
        value: "circuit_dead",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 3,
        requiredPhotoLabels: [],
      },
      {
        questionId: q.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 4,
        requiredPhotoLabels: [],
      },
    ],
  });

  // Panel photos come from the shared group, so the safety instruction —
  // open the door only, never the dead front — is applied automatically.
  const opt = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: q.id, value: "damaged_or_upgrade" },
  });
  const group = await prisma.photoGroup.findUnique({ where: { key: "PANEL_PHOTOS" } });
  if (group) {
    await prisma.answerOptionPhotoGroup.upsert({
      where: { answerOptionId_photoGroupId: { answerOptionId: opt.id, photoGroupId: group.id } },
      update: { order: 0 },
      create: { answerOptionId: opt.id, photoGroupId: group.id, order: 0 },
    });
  }

  const broken = await findDanglingReferences(prisma, service.id);
  console.log(
    `  ✓ ${slug} — 1 question, panel photos as preparation` +
      (broken.length ? `  [WARNING: ${broken.length} dangling reference(s)]` : "")
  );
}

async function main() {
  console.log("Breaker replacement trees...\n");
  for (const slug of SERVICES) await seedBreaker(slug);
  console.log(`
Tripping breakers and dead circuits route to Troubleshooting rather than
selling a swap that won't fix them. The qualifying answer books at the
published price with panel photos attached for preparation.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
