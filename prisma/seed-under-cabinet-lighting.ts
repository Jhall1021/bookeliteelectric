/**
 * Under-Cabinet LED Lighting gets a bounded scope — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-under-cabinet-lighting.ts --apply
 *
 * Architecture B, as decided: tape in aluminium channel with a remote driver,
 * not integrated bar fixtures. That choice is why the labour moved from 2.5 to
 * 4.0 crew-hours — cutting tape to length, mounting and cutting channel,
 * concealing a driver and making the low-voltage connections is a different
 * job from screwing three finished fixtures to the underside of a cabinet.
 *
 * THE PROMISE
 *
 *   Up to 12 linear feet, ONE CONTINUOUS RUN, powered from usable existing
 *   120V nearby, one driver, normal wood cabinetry, normal access.
 *
 * "One continuous run" is the load-bearing half. Three separate runs is not
 * three times the tape — it is three channel terminations, three sets of
 * connections, and a driver feeding three legs. Selling that as the same job
 * would lose money on every kitchen that has an island or a window over the
 * sink, which is most of them.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { upsertQuestion } from "./_moduleHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { PERMIT_DISCLAIMER } from "../lib/permitPolicy";

const prisma = new PrismaClient();

const SLUG = "under-cabinet-led-lighting";

// POLICY[under_cabinet.standard_labor_hours]: 4.0  PROVISIONAL
// POLICY[under_cabinet.included_feet]: 12
// POLICY[under_cabinet.runs]: 1
const STANDARD_HOURS = 4.0;
const WWT_HOURS = 3.75;
const INCLUDED_FT = 12;

const IDENTIFY = [
  "The cabinets that need light, and the wall underneath them",
  "The nearest outlet or switch below those cabinets",
];

const DISCLOSURE =
  "Pricing assumes up to " + INCLUDED_FT + " feet of lighting in one " +
  "continuous run under normal wood cabinets, powered from an existing outlet " +
  "or switch on the wall below, with one dimmer. Separate runs, a tiled " +
  "backsplash already in place, no usable power nearby, or colour-changing or " +
  "smart control may change the price. Any difference will be shown and " +
  "approved before work begins. " + PERMIT_DISCLAIMER;

const RECIPE: [string, number][] = [
  ["LED_TAPE", INCLUDED_FT],
  ["LED_CHANNEL_DIFFUSER", INCLUDED_FT],
  ["LED_DRIVER", 1],
  ["DIMMER_LED", 1],
  ["BOX_OLD_WORK", 1],
  ["WALL_PLATE", 1],
  ["WIRE_14_2", 25],
  ["CONSUMABLES_SMALL", 1],
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nUNDER-CABINET LED LIGHTING — BOUNDED SCOPE\n`);

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

  console.log(`  labour ${STANDARD_HOURS}h / ${WWT_HOURS}h same-visit   (PROVISIONAL)`);
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
        "Hardwired LED lighting under your kitchen cabinets — tape in an " +
        "aluminium channel with a diffuser, so you see light rather than dots, " +
        "on a dimmer.",
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

  const qRuns = await upsertQuestion(prisma, service.id, {
    key: "uc_runs", order: 0,
    prompt: "How many separate stretches of cabinet need lighting?",
    helpText: "A stretch broken by a window, a cooker or a corner counts as two.",
  });
  const qLength = await upsertQuestion(prisma, service.id, {
    key: "uc_length", order: 1,
    prompt: "Roughly how many feet of cabinet is that?",
  });
  const qPower = await upsertQuestion(prisma, service.id, {
    key: "uc_power", order: 2,
    prompt: "Is there an outlet or a switch on the wall below those cabinets?",
    helpText: "That's where the power comes from, so it saves opening up the wall.",
  });
  const qBacksplash = await upsertQuestion(prisma, service.id, {
    key: "uc_backsplash", order: 3,
    prompt: "What's the wall behind the counter?",
    helpText: "Tile that's already up has to be drilled through rather than fished behind.",
  });
  const qControl = await upsertQuestion(prisma, service.id, {
    key: "uc_control", order: 4,
    prompt: "How would you like to control them?",
  });

  const groups = await Promise.all(["WORK_AREA_PHOTOS"].map(async (key, i) => {
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
    cont(qRuns.id, "One continuous stretch", "one_run", 1, qLength.id),
    review(qRuns.id, "Two or more separate stretches", "multi_run", 2),

    cont(qLength.id, `Up to about ${INCLUDED_FT} feet`, "standard", 1, qPower.id),
    review(qLength.id, `More than ${INCLUDED_FT} feet`, "long", 2),
    review(qLength.id, "I'm not sure", "unsure_length", 3),

    cont(qPower.id, "Yes — there's an outlet or switch on that wall", "has_power", 1, qBacksplash.id),
    review(qPower.id, "No, nothing on that wall", "no_power", 2),
    review(qPower.id, "I'm not sure", "unsure_power", 3),

    cont(qBacksplash.id, "Painted drywall, or tile not yet installed", "drywall", 1, qControl.id),
    review(qBacksplash.id, "Tile, stone or brick already installed", "tiled", 2),
    review(qBacksplash.id, "Plaster, or something else", "other_wall", 3),

    {
      questionId: qControl.id, label: "A dimmer switch on the wall", value: "dimmer", order: 1,
      routeAction: "PHOTO_REVIEW", nextQuestionId: null,
      requiredPhotoLabels: IDENTIFY, photosBlockBooking: false,
      approvedComponentPriceCents: 0, withGroups: true,
    },
    review(qControl.id, "Colour-changing, or from my phone", "smart", 2),
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
