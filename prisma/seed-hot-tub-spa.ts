/**
 * Hot Tub / Spa Electrical gets a bounded scope — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-hot-tub-spa.ts --apply
 *
 * Phase F rescue #3 by build order.
 *
 * THE PROMISE
 *
 *   A tub already sitting on its pad. A 50A GFCI spa disconnect on the
 *   exterior wall, in sight of the tub and at least five feet from it, fed
 *   from the main panel within 25 ft in surface conduit on that wall. Two
 *   adjacent breaker spaces free.
 *
 * WHAT LEAVES IT
 *
 *   Any trenching or underground run · a tub not yet placed · a run over
 *   25 ft · routing through finished interior walls · a full panel · 60A tubs.
 *
 * WHY THE BREAKER IS A PLAIN ONE
 *
 * The ground-fault protection lives in the spa disconnect, which is the
 * expensive part and the reason this package exists. The breaker feeding it is
 * an ordinary 2-pole 50A. A GFCI breaker upstream of a GFCI panel is a second
 * device doing the first one's job, and pricing one in would inflate every
 * quote for protection nobody asked for.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { upsertQuestion } from "./_moduleHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { PERMIT_DISCLAIMER } from "../lib/permitPolicy";

const prisma = new PrismaClient();

const SLUG = "hot-tub-spa-electrical";

// POLICY[spa.standard_labor_hours]: 4.0
// POLICY[spa.included_run_ft]: 25
// POLICY[spa.standard_amperage]: 50
// POLICY[spa.trenching]: false
const STANDARD_HOURS = 4.0;
const WWT_HOURS = 3.75;
const INCLUDED_RUN_FT = 25;

const IDENTIFY = [
  "The label inside the panel door, showing its brand and model",
  "Where the tub sits, and the wall between it and the panel",
];

const DISCLOSURE =
  "Pricing assumes the tub is already in place, a 50A circuit run within " +
  INCLUDED_RUN_FT + " feet of your panel in surface conduit on an outside " +
  "wall, and two spare breaker spaces. Any digging, a longer run, routing " +
  "through finished walls, or a 60A tub may change the price. Any difference " +
  "will be shown and approved before work begins. " + PERMIT_DISCLAIMER;

const RECIPE: [string, number][] = [
  ["SPA_PANEL_GFCI_50A", 1],
  ["BREAKER_DOUBLE_POLE_50A", 1],
  ["WIRE_6_3", INCLUDED_RUN_FT],
  ["CONDUIT_PVC_1", INCLUDED_RUN_FT],
  ["CONDUIT_FITTINGS_1", 1],
  ["CONSUMABLES_MEDIUM", 1],
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nHOT TUB / SPA ELECTRICAL — BOUNDED SCOPE\n`);

  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: { id: true, contractorId: true },
  });
  if (!service) { console.error(`  ${SLUG} not in the catalogue.\n`); process.exit(1); }

  for (const [key] of RECIPE) {
    const role = await prisma.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    if (!role) { console.error(`  ${key} is not a canonical role.\n`); process.exit(1); }
    const cost = await prisma.contractorMaterial.findFirst({
      where: { contractorId: service.contractorId, canonicalMaterialId: role.id, active: true },
      select: { id: true },
    });
    if (!cost) { console.error(`  ${key} has no cost.\n`); process.exit(1); }
  }

  console.log(`  labor ${STANDARD_HOURS}h / ${WWT_HOURS}h same-visit`);
  console.log(`  recipe ${RECIPE.map(([k, q]) => `${k}x${q}`).join(", ")}`);
  if (!apply) { console.log(`\n  Report only.\n`); return; }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      fieldLaborHours: STANDARD_HOURS, wwtLaborHours: WWT_HOURS,
      estimatedMinutes: 300, requiresTechCount: 1,
      isPrimaryEligible: true, startingPriceLabel: null,
      photoState: "PREPARATION", disclaimer: DISCLOSURE,
      permitAdminCents: 0,
      shortDescription:
        "The dedicated 50A circuit and outdoor GFCI disconnect a hot tub needs, " +
        "run from your panel to the tub.",
    },
  });

  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  let order = 0;
  for (const [key, quantity] of RECIPE) {
    const role = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key }, select: { id: true } });
    await prisma.serviceMaterial.create({
      data: { serviceId: service.id, canonicalMaterialId: role.id, quantity, order: order++ },
    });
  }
  await recomputeServiceMaterialCost(prisma as any, service.id);
  const cached = await prisma.service.findUniqueOrThrow({
    where: { id: service.id }, select: { materialCostCents: true, materialCostResolved: true },
  });
  console.log(`  material cache -> $${((cached.materialCostCents ?? 0) / 100).toFixed(2)}  (${cached.materialCostResolved ? "resolved" : "UNRESOLVED"})`);

  const old = await prisma.question.findMany({ where: { serviceId: service.id }, select: { id: true } });
  for (const q of old) await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { serviceId: service.id } });

  const qPlaced = await upsertQuestion(prisma, service.id, {
    key: "spa_placed", order: 0,
    prompt: "Is the tub already in place?",
    helpText: "We need it where it's going to live before we can put the disconnect within sight of it.",
  });
  const qAmps = await upsertQuestion(prisma, service.id, {
    key: "spa_amperage", order: 1,
    prompt: "What does the tub's plate say it needs?",
    helpText: "There's a label on the tub, usually near the equipment door.",
  });
  const qDistance = await upsertQuestion(prisma, service.id, {
    key: "spa_distance", order: 2,
    prompt: `How far is the tub from your electrical panel?`,
    helpText: `Our standard price includes about ${INCLUDED_RUN_FT} feet of wiring.`,
  });
  const qRoute = await upsertQuestion(prisma, service.id, {
    key: "spa_route", order: 3,
    prompt: "What's between the panel and the tub?",
    helpText: "We run the circuit along the outside of the house. Anything the wiring would have to cross changes the job.",
  });
  const qSpaces = await upsertQuestion(prisma, service.id, {
    key: "spa_spaces", order: 4,
    prompt: "Are there two empty breaker slots next to each other in your panel?",
  });

  const groups = await Promise.all(["PANEL_PHOTOS", "EXTERIOR_PHOTOS"].map(async (key, i) => {
    const g = await prisma.photoGroup.findUnique({ where: { key }, select: { id: true } });
    if (!g) throw new Error(`Photo group ${key} missing.`);
    return { photoGroupId: g.id, order: i };
  }));

  type Opt = {
    questionId: string; label: string; value: string; order: number;
    routeAction: "CONTINUE" | "PHOTO_REVIEW"; nextQuestionId: string | null;
    requiredPhotoLabels: string[]; photosBlockBooking?: boolean;
    approvedComponentPriceCents: number | null; withGroups: boolean;
  };
  const review = (questionId: string, label: string, value: string, order: number): Opt => ({
    questionId, label, value, order, routeAction: "PHOTO_REVIEW", nextQuestionId: null,
    requiredPhotoLabels: IDENTIFY, photosBlockBooking: true,
    approvedComponentPriceCents: null, withGroups: true,
  });
  const cont = (questionId: string, label: string, value: string, order: number, next: string): Opt => ({
    questionId, label, value, order, routeAction: "CONTINUE", nextQuestionId: next,
    requiredPhotoLabels: [], approvedComponentPriceCents: 0, withGroups: false,
  });

  const OPTIONS: Opt[] = [
    cont(qPlaced.id, "Yes — it's on its pad where it'll stay", "placed", 1, qAmps.id),
    review(qPlaced.id, "Not yet", "not_placed", 2),

    cont(qAmps.id, "50 amps", "fifty", 1, qDistance.id),
    review(qAmps.id, "60 amps", "sixty", 2),
    review(qAmps.id, "I'm not sure", "unsure_amps", 3),

    cont(qDistance.id, `Within about ${INCLUDED_RUN_FT} feet`, "near", 1, qRoute.id),
    review(qDistance.id, `Further than ${INCLUDED_RUN_FT} feet`, "far", 2),
    review(qDistance.id, "I'm not sure", "unsure_distance", 3),

    cont(qRoute.id, "Just the outside wall — the tub's against the house or close to it", "wall_run", 1, qSpaces.id),
    review(qRoute.id, "Lawn, patio, driveway or decking the wiring would have to cross", "needs_digging", 2),
    review(qRoute.id, "The wiring would have to go through finished rooms", "interior", 3),
    review(qRoute.id, "I'm not sure", "unsure_route", 4),

    {
      questionId: qSpaces.id, label: "Yes — two empty slots together", value: "two_free", order: 1,
      routeAction: "PHOTO_REVIEW", nextQuestionId: null,
      requiredPhotoLabels: IDENTIFY, photosBlockBooking: false,
      approvedComponentPriceCents: 0, withGroups: true,
    },
    review(qSpaces.id, "No — the panel is full", "full", 2),
    review(qSpaces.id, "I'm not sure", "unsure_spaces", 3),
  ];

  for (const o of OPTIONS) {
    const { withGroups, ...data } = o;
    await prisma.answerOption.create({
      data: { ...data, ...(withGroups ? { photoGroups: { create: groups } } : {}) },
    });
  }
  console.log(`  ✓ tree built — 5 questions, ${OPTIONS.length} options\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
