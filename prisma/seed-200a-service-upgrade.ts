/**
 * 200-Amp Service Upgrade gets a bounded scope — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-200a-service-upgrade.ts          report
 *   npx tsx prisma/seed-200a-service-upgrade.ts --apply  build
 *
 * Phase F rescue #4. Built to DERIVE, not to publish. The 8.0 crew-hours are
 * provisional, and $4,995 is a comparison point, never a target: the whole
 * value of assembling the economics is finding out what they say on their own.
 *
 * THE PROMISE
 *
 *   Overhead service. Exterior meter, with the panel directly behind it or
 *   very near. A new riser and weatherhead up the same wall — no roof
 *   penetration. Same general service location. Standard grounding and
 *   bonding. Normal residential access.
 *
 * WHAT LEAVES THE ENVELOPE
 *
 *   Underground service · meter or panel relocation · a long feeder between
 *   the two · any roof penetration · masonry or difficult access ·
 *   utility-specific requirements outside the standard package · specialty
 *   breakers · unusual grounding or bonding conditions.
 *
 * Each of those is a different job, and most are several. A service upgrade
 * that quietly absorbed them is how this service came to carry $4,995 with no
 * crew-hours behind it in the first place.
 *
 * PERMITS ARE NOT IN THE PRICE
 *
 * Elite's default and the strongest case for it: a service upgrade always
 * needs a permit, the fee is set by the town, and it varies between towns for
 * identical work. Folding an estimate into labour would make the base price
 * wrong in both directions and untraceable in both.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { upsertQuestion } from "./_moduleHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { PERMIT_DISCLAIMER } from "../lib/permitPolicy";

const prisma = new PrismaClient();

const SLUG = "200a-service-upgrade";

// POLICY[service_upgrade.standard_labor_hours]: 8.0  PROVISIONAL
// POLICY[service_upgrade.service_type]: OVERHEAD
// POLICY[service_upgrade.roof_penetration]: false
// POLICY[service_upgrade.max_circuits]: 30
const STANDARD_HOURS = 8.0;
const WWT_HOURS = 8.0; // nothing about this job gets shorter for being second
const MAX_CIRCUITS = 30;
const FEEDER_FT = 20;

const IDENTIFY = [
  "The label inside the panel door, showing its brand and model",
  "The meter from outside, and the wires coming down to it",
  "Where the wires from the street attach to the house",
];

const DISCLOSURE =
  "Pricing assumes an overhead service with the meter outside and the panel " +
  "directly behind or very near it, a new riser up the same wall with no roof " +
  "penetration, the service staying in its current location, and up to " +
  MAX_CIRCUITS + " circuits relanded. Underground service, moving the meter " +
  "or panel, a long run between them, roof work, masonry, or requirements " +
  "specific to your utility may change the price. Any difference will be " +
  "shown and approved before work begins. " + PERMIT_DISCLAIMER;

const RECIPE: [string, number][] = [
  ["PANEL_200A_MAIN_BREAKER", 1],
  ["METER_SOCKET_200A", 1],
  ["SERVICE_ENTRANCE_CABLE_200A", FEEDER_FT],
  ["BREAKER_SINGLE_POLE", 17],
  ["BREAKER_DOUBLE_POLE", 3],
  ["GROUND_ROD", 2],
  ["GROUND_CLAMP", 3],
  ["WIRE_GROUND_6", 25],
  ["CONSUMABLES_MEDIUM", 1],
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\n200-AMP SERVICE UPGRADE — BOUNDED SCOPE\n`);

  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: { id: true, contractorId: true, permitAdminCents: true },
  });
  if (!service) { console.error(`  ${SLUG} not in the catalogue.\n`); process.exit(1); }

  for (const [key] of RECIPE) {
    const role = await prisma.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    if (!role) { console.error(`  ${key} is not a canonical role.\n`); process.exit(1); }
    const cost = await prisma.contractorMaterial.findFirst({
      where: { contractorId: service.contractorId, canonicalMaterialId: role.id, active: true },
      select: { id: true },
    });
    if (!cost) { console.error(`  ${key} has no cost for this contractor.\n`); process.exit(1); }
  }

  const panelSwap = await prisma.service.findFirst({
    where: { contractorId: service.contractorId, slug: "electrical-panel-replacement" },
    select: { id: true, active: true },
  });
  if (!panelSwap?.active) {
    console.error(`  electrical-panel-replacement is missing or inactive — the "same`);
    console.error(`  size, just a new panel" branch would dead-end. Refusing.\n`);
    process.exit(1);
  }

  console.log(`  labour ${STANDARD_HOURS}h / ${WWT_HOURS}h same-visit   (PROVISIONAL)`);
  console.log(`  recipe ${RECIPE.map(([k, q]) => `${k}x${q}`).join(", ")}`);
  console.log(`  permit allowance $${((service.permitAdminCents ?? 0) / 100).toFixed(2)} — excluded by policy`);
  console.log();
  if (!apply) { console.log(`  Report only. Re-run with --apply to build.\n`); return; }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      fieldLaborHours: STANDARD_HOURS,
      wwtLaborHours: WWT_HOURS,
      // A full day, and the calendar says so. There is no version of this job
      // that fits around something else.
      estimatedMinutes: 540,
      requiresTechCount: 1,
      isPrimaryEligible: true,
      startingPriceLabel: null,
      photoState: "PREPARATION",
      disclaimer: DISCLOSURE,
      // Explicitly zero rather than left unset. A null here inherits
      // PricingSettings.defaultPermitAdminCents, so an unset field would
      // silently start carrying a permit the moment that default moved —
      // while this disclaimer went on promising the fee was outside the price.
      permitAdminCents: 0,
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
    where: { id: service.id },
    select: { materialCostCents: true, materialCostResolved: true },
  });
  console.log(`  material cache -> $${((cached.materialCostCents ?? 0) / 100).toFixed(2)}  (${cached.materialCostResolved ? "resolved" : "UNRESOLVED"})`);

  // ── tree ───────────────────────────────────────────────────────────────
  const old = await prisma.question.findMany({ where: { serviceId: service.id }, select: { id: true } });
  for (const q of old) await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { serviceId: service.id } });

  const qService = await upsertQuestion(prisma, service.id, {
    key: "service_overhead", order: 0,
    prompt: "How does the power reach your house?",
    helpText: "Overhead means wires from a pole to the house. Underground means they come up out of the ground.",
  });
  const qNeed = await upsertQuestion(prisma, service.id, {
    key: "upgrade_need", order: 1,
    prompt: "What are you trying to achieve?",
  });
  const qMeter = await upsertQuestion(prisma, service.id, {
    key: "meter_panel_distance", order: 2,
    prompt: "Where is your panel compared with the meter outside?",
    helpText: "Directly behind it, or a few feet away, is the usual arrangement.",
  });
  const qMove = await upsertQuestion(prisma, service.id, {
    key: "service_relocating", order: 3,
    prompt: "Would everything stay where it is now?",
    helpText: "Moving the meter or the panel means new routing and usually the utility's involvement.",
  });
  const qAccess = await upsertQuestion(prisma, service.id, {
    key: "riser_wall", order: 4,
    prompt: "What's the wall the meter is mounted on?",
  });
  const qCircuits = await upsertQuestion(prisma, service.id, {
    key: "upgrade_circuits", order: 5,
    prompt: "Roughly how many breakers are in the panel now?",
    helpText: "Count the switches in the rows — an estimate is fine.",
  });

  const groups = await Promise.all(
    ["PANEL_PHOTOS", "EXTERIOR_PHOTOS"].map(async (key, i) => {
      const g = await prisma.photoGroup.findUnique({ where: { key }, select: { id: true } });
      if (!g) throw new Error(`Photo group ${key} missing.`);
      return { photoGroupId: g.id, order: i };
    })
  );

  type Opt = {
    questionId: string; label: string; value: string; order: number;
    routeAction: "CONTINUE" | "PHOTO_REVIEW" | "REROUTE_SERVICE";
    nextQuestionId: string | null; rerouteServiceId?: string;
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
    cont(qService.id, "Overhead — wires come from a pole", "overhead", 1, qNeed.id),
    review(qService.id, "Underground — they come up out of the ground", "underground", 2),
    review(qService.id, "I'm not sure", "unsure_service", 3),

    cont(qNeed.id, "More capacity — I'm adding load, or 200 amps has been asked for", "capacity", 1, qMeter.id),
    {
      // Same size, just a failing panel. That is the cheaper service, and
      // sending them there is the only honest answer.
      questionId: qNeed.id, label: "Same size — my panel is just old or unsafe",
      value: "same_size", order: 2, routeAction: "REROUTE_SERVICE", rerouteServiceId: panelSwap.id,
      nextQuestionId: null, requiredPhotoLabels: [], approvedComponentPriceCents: null, withGroups: false,
    },
    review(qNeed.id, "I'm not sure what I need", "unsure_need", 3),

    cont(qMeter.id, "Directly behind the meter, or within a few feet", "adjacent", 1, qMove.id),
    review(qMeter.id, "A good distance away — a different room or floor", "long_feeder", 2),
    review(qMeter.id, "I'm not sure", "unsure_distance", 3),

    cont(qMove.id, "Yes — meter and panel both stay put", "same_place", 1, qAccess.id),
    review(qMove.id, "No — I'd like the meter or panel moved", "relocating", 2),
    review(qMove.id, "I'm not sure", "unsure_move", 3),

    cont(qAccess.id, "Wood, vinyl or fibre-cement siding, with clear access to it", "standard_wall", 1, qCircuits.id),
    review(qAccess.id, "Brick, stone or stucco", "masonry", 2),
    review(qAccess.id, "The riser would have to go through the roof overhang", "roof", 3),
    review(qAccess.id, "Something else, or hard to get to", "unsure_wall", 4),

    {
      questionId: qCircuits.id, label: `Up to about ${MAX_CIRCUITS}`, value: "standard", order: 1,
      routeAction: "PHOTO_REVIEW", nextQuestionId: null,
      requiredPhotoLabels: IDENTIFY, photosBlockBooking: false,
      approvedComponentPriceCents: 0, withGroups: true,
    },
    review(qCircuits.id, `More than ${MAX_CIRCUITS}`, "many_circuits", 2),
    review(qCircuits.id, "I'm not sure", "unsure_circuits", 3),
  ];

  for (const o of OPTIONS) {
    const { withGroups, ...data } = o;
    await prisma.answerOption.create({
      data: { ...data, ...(withGroups ? { photoGroups: { create: groups } } : {}) },
    });
  }

  console.log(`  ✓ tree built — 6 questions, ${OPTIONS.length} options\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
