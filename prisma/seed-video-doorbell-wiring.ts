/**
 * New Video Doorbell Wiring becomes a bounded, bookable service — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-video-doorbell-wiring.ts          report
 *   npx tsx prisma/seed-video-doorbell-wiring.ts --apply  build
 *
 * Phase F rescue #1. It had a price of nothing and a tree of one step that
 * said "send us photos", which is a quote wearing a form.
 *
 * THE SCOPE, STATED AS A PROMISE
 *
 *   A doorbell at a ground-floor door, on wood, vinyl or fibre-cement, with a
 *   reachable attic, basement or crawlspace to run 18/2 through, a transformer
 *   landed at an existing junction box or a panel knockout, the customer's own
 *   doorbell, and no indoor chime.
 *
 * Everything outside that envelope routes to review — not because review is a
 * fallback, but because those are the conditions that actually move the work:
 * masonry changes the mounting, no access changes the route, an indoor chime
 * is a second device on a second run.
 *
 * WHY A DOORBELL THAT ALREADY WORKS REROUTES
 *
 * This service exists for a door with NO doorbell wiring. A working chime
 * means wiring is already there, and the customer wants a service we already
 * sell for $250. Sending them to it is the only honest answer; charging them
 * $530 for work half of which is already done is not.
 *
 * LABOR — 2.0 crew-hours
 *
 * Reasoned, not assigned. video-doorbell-existing-wiring is 0.75 h to mount
 * and connect. doorbell-transformer-replacement is 1.0 h for the transformer.
 * This job is both, plus a fish neither of them includes. The two published
 * services sum to $520 against this one's derived $530 — two routes to the
 * same number, from different directions.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { upsertQuestion } from "./_moduleHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";

const prisma = new PrismaClient();

const SLUG = "new-video-doorbell-wiring";

// POLICY[video_doorbell_new.standard_labor_hours]: 2.0
// POLICY[video_doorbell_new.included_wire_ft]: 25
// POLICY[video_doorbell_new.customer_supplies_device]: true
const STANDARD_HOURS = 2.0;
const WWT_HOURS = 1.75;
const INCLUDED_WIRE_FT = 25;

const REVIEW_PHOTOS = [
  "The doorway from outside, showing the door frame and the surrounding wall",
  "Where your electrical panel is, with the cover on",
  "The attic hatch, basement stairs or crawlspace opening, if you have one",
];

const DISCLOSURE =
  "This covers a doorbell at a ground-floor door with a reachable attic, " +
  "basement or crawlspace to run the wire through, up to " + INCLUDED_WIRE_FT +
  " feet of low-voltage wire, and a transformer landed at an existing " +
  "junction box or your panel. You supply the doorbell itself. Masonry " +
  "drilling, an added indoor chime, or a run we can't reach are quoted after " +
  "we've seen photos.";

const RECIPE: [string, number][] = [
  ["DOORBELL_TRANSFORMER", 1],
  ["WIRE_BELL_18_2", INCLUDED_WIRE_FT],
  ["CONSUMABLES_SMALL", 1],
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nNEW VIDEO DOORBELL WIRING — BOUNDED SCOPE\n`);

  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: { id: true, contractorId: true, name: true, basePrice: true, bookingType: true },
  });
  if (!service) { console.error(`  ${SLUG} not in the catalogue.\n`); process.exit(1); }

  // The reroute target has to exist before a tree points at it. A reroute with
  // no destination is the defect this codebase spent a whole pass removing.
  const existingWiring = await prisma.service.findFirst({
    where: { contractorId: service.contractorId, slug: "video-doorbell-existing-wiring" },
    select: { id: true, active: true, basePrice: true },
  });
  if (!existingWiring || !existingWiring.active) {
    console.error(`  video-doorbell-existing-wiring is missing or inactive — the`);
    console.error(`  "you already have a doorbell" branch would dead-end. Refusing.\n`);
    process.exit(1);
  }

  console.log(`  reroute target: video-doorbell-existing-wiring @ $${((existingWiring.basePrice ?? 0) / 100).toFixed(0)}`);
  console.log(`  labor ${STANDARD_HOURS}h standalone / ${WWT_HOURS}h same-visit`);
  console.log(`  recipe ${RECIPE.map(([k, q]) => `${k}x${q}`).join(", ")}`);
  console.log();

  if (!apply) { console.log(`  Report only. Re-run with --apply to build.\n`); return; }

  // ── service ────────────────────────────────────────────────────────────
  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      fieldLaborHours: STANDARD_HOURS,
      wwtLaborHours: WWT_HOURS,
      // Two hours of work, three of calendar. Fishing wire is the step that
      // surprises you, and a crew held up behind a stubborn wall cavity
      // should not make the next appointment late.
      estimatedMinutes: 180,
      requiresTechCount: 1,
      isPrimaryEligible: true,
      startingPriceLabel: null,
      disclaimer: DISCLOSURE,
      shortDescription:
        "Installing a video doorbell where there's no doorbell wiring or " +
        "transformer today. We run the low-voltage wire, land a transformer " +
        "and mount your doorbell.",
    },
  });

  // ── recipe ─────────────────────────────────────────────────────────────
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  let order = 0;
  for (const [key, quantity] of RECIPE) {
    const role = await prisma.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    if (!role) throw new Error(`${key} is not a canonical role`);
    await prisma.serviceMaterial.create({
      data: { serviceId: service.id, canonicalMaterialId: role.id, quantity, order: order++ },
    });
  }
  await recomputeServiceMaterialCost(prisma as any, service.id);
  // Read the row back rather than trusting the helper's return shape — the
  // first draft of this line logged $0.00 for a cache that was correctly $20.
  const cached = await prisma.service.findUniqueOrThrow({
    where: { id: service.id },
    select: { materialCostCents: true, materialCostResolved: true },
  });
  console.log(
    `  material cache -> $${((cached.materialCostCents ?? 0) / 100).toFixed(2)}` +
      `  (${cached.materialCostResolved ? "resolved" : "UNRESOLVED"})`
  );

  // ── tree ───────────────────────────────────────────────────────────────
  const old = await prisma.question.findMany({ where: { serviceId: service.id }, select: { id: true } });
  for (const q of old) await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { serviceId: service.id } });

  const qExisting = await upsertQuestion(prisma, service.id, {
    key: "doorbell_existing", order: 0,
    prompt: "Is there a doorbell at this door now?",
    helpText: "We're asking because a doorbell that rings inside already has wiring we can reuse — that's a different, cheaper job.",
  });
  const qAccess = await upsertQuestion(prisma, service.id, {
    key: "doorbell_access", order: 1,
    prompt: "Can we get above or below the door to run the wire?",
    helpText: "An attic, basement or crawlspace we can reach is how the wire gets from your panel to the door without opening walls.",
  });
  const qSurface = await upsertQuestion(prisma, service.id, {
    key: "doorbell_surface", order: 2,
    prompt: "What's the door surrounded by?",
    helpText: "Masonry needs different tools and takes longer, so we price it after seeing it.",
  });
  const qSupply = await upsertQuestion(prisma, service.id, {
    key: "doorbell_supply", order: 3,
    prompt: "Who's supplying the doorbell itself?",
  });
  const qChime = await upsertQuestion(prisma, service.id, {
    key: "doorbell_chime", order: 4,
    prompt: "Do you want an indoor chime as well?",
    helpText: "Most video doorbells ring on your phone. An indoor chime is a second device on its own run.",
  });

  const review = (questionId: string, label: string, value: string, order: number) => ({
    questionId, label, value, order,
    routeAction: "PHOTO_REVIEW" as const,
    nextQuestionId: null,
    requiredPhotoLabels: REVIEW_PHOTOS,
    photosBlockBooking: true,
    approvedComponentPriceCents: null,
  });
  const cont = (questionId: string, label: string, value: string, order: number, next: string) => ({
    questionId, label, value, order,
    routeAction: "CONTINUE" as const,
    nextQuestionId: next,
    requiredPhotoLabels: [],
    approvedComponentPriceCents: 0,
  });

  await prisma.answerOption.createMany({
    data: [
      // Q1 — is this even the right service?
      cont(qExisting.id, "No — there's no doorbell, or nothing that works and no wiring", "none", 1, qAccess.id),
      {
        questionId: qExisting.id,
        label: "Yes — I have a doorbell that rings inside",
        value: "has_working",
        routeAction: "REROUTE_SERVICE",
        rerouteServiceId: existingWiring.id,
        nextQuestionId: null,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
      },
      review(qExisting.id, "There's a button, but I don't know if it works", "unknown", 3),

      // Q2 — access, and the storey, in one answerable question
      cont(qAccess.id, "Yes — the door's on the ground floor and there's an attic, basement or crawlspace we can get into", "accessible", 1, qSurface.id),
      review(qAccess.id, "The door's upstairs, or there's no way in above or below it", "no_access", 2),
      review(qAccess.id, "I'm not sure", "unsure_access", 3),

      // Q3 — what we're drilling
      cont(qSurface.id, "Wood, vinyl or fibre-cement siding, or a wood door frame", "standard", 1, qSupply.id),
      review(qSurface.id, "Brick, stucco or stone", "masonry", 2),
      review(qSurface.id, "Something else, or I'm not sure", "unsure_surface", 3),

      // Q4 — equipment
      cont(qSupply.id, "I have the doorbell", "customer", 1, qChime.id),
      review(qSupply.id, "I'd like you to supply one", "elite", 2),

      // Q5 — the only path that prices
      {
        questionId: qChime.id,
        label: "No — it rings on my phone, that's fine",
        value: "no_chime",
        routeAction: "RESOLVE_INSTANT",
        nextQuestionId: null,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      review(qChime.id, "Yes, I'd like a chime inside too", "wants_chime", 2),
    ],
  });

  console.log(`  ✓ tree built — 5 questions, 1 priced route, 8 to review, 1 reroute\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
