/**
 * Electrical Panel Replacement gets a bounded scope — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-panel-replacement.ts          report
 *   npx tsx prisma/seed-panel-replacement.ts --apply  build
 *
 * Phase F rescue #3. Built to DERIVE, not to publish: the 6.0 crew-hours are
 * provisional and the whole point of assembling the economics is to see what
 * they produce before anyone decides whether they are right.
 *
 * THE PROMISE
 *
 *   A like-for-like main-breaker panel, at the SAME service size, in the SAME
 *   place, reusing the existing service conductors and meter. Up to 30 branch
 *   circuits relanded and labelled, grounding and bonding brought to current
 *   code.
 *
 * TWO ANSWERS LEAVE THIS SERVICE ENTIRELY
 *
 * "I need more capacity" is a service upgrade, not a panel replacement, and
 * gets rerouted to it. "Something isn't working" is a diagnostic — selling
 * somebody a panel to fix a fault nobody has found yet is the worst thing this
 * catalogue could do, so it routes to the $249 troubleshooting visit.
 *
 * Neither is a dead end and neither is a guess. Both are the honest answer to
 * what the customer actually said.
 *
 * WHAT THE HOMEOWNER IS NOT ASKED
 *
 * Whether their branch wiring is aluminium. Whether the panel is a Zinsco or a
 * Federal Pacific. Whether the service conductors are long enough to reland.
 * Those decide the price and none of them is knowable from a kitchen — so the
 * priced route ends in a non-blocking photo review and the photographs answer
 * them before anyone drives out.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { upsertQuestion } from "./_moduleHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { PERMIT_DISCLAIMER } from "../lib/permitPolicy";

const prisma = new PrismaClient();

const SLUG = "electrical-panel-replacement";

// POLICY[panel_replacement.standard_labor_hours]: 6.0  PROVISIONAL
// POLICY[panel_replacement.max_circuits]: 30
// POLICY[panel_replacement.same_location]: true
// POLICY[panel_replacement.same_amperage]: true
// POLICY[panel_replacement.permit_allowance_cents]: 0  — excluded, disclaimed
const STANDARD_HOURS = 6.0;
const WWT_HOURS = 5.75;
const MAX_CIRCUITS = 30;

const IDENTIFY_PANEL = [
  "The label inside the panel door, showing its brand and model",
  "A close photo of the breakers, so we can read the numbers on them",
];

const DISCLOSURE =
  "Pricing assumes a like-for-like replacement at the same service size, in " +
  "the same location, reusing your existing service conductors and meter, " +
  "with up to " + MAX_CIRCUITS + " circuits relanded. A larger service, a new " +
  "location, aluminium branch wiring, or conductors too short to reland may " +
  "change the price. Any difference will be shown and approved before work " +
  "begins. " +
  // Elite's default, and settled: the fee belongs to a jurisdiction, not to
  // the work. A $250 allowance was tried here and withdrawn — the base price
  // describes what Elite controls, and the fee is named separately.
  PERMIT_DISCLAIMER;

/**
 * Twenty circuits is the standard allowance, and it is deliberately a MIX.
 *
 * Old breakers do not go back into a new panel — different listing, often a
 * different brand — so every circuit gets a new one. A house with a range, a
 * dryer and an air conditioner has three 2-pole breakers among its twenty, and
 * pricing all twenty as single-pole would understate the job by $30 on every
 * one of them.
 *
 * The 2-pole here is the GENERIC role, on purpose. This service relands
 * whatever the house already has, so "a 2-pole breaker of some amperage" is
 * the honest description — the same reason double-pole-breaker-replacement
 * kept it when the amperage-specific roles were introduced.
 */
const RECIPE: [string, number][] = [
  ["PANEL_MAIN_BREAKER", 1],
  ["BREAKER_SINGLE_POLE", 17],
  ["BREAKER_DOUBLE_POLE", 3],
  ["GROUND_ROD", 2],
  ["GROUND_CLAMP", 2],
  ["WIRE_GROUND_6", 15],
  ["CONSUMABLES_MEDIUM", 1],
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nELECTRICAL PANEL REPLACEMENT — BOUNDED SCOPE\n`);

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

  const upgrade = await prisma.service.findFirst({
    where: { contractorId: service.contractorId, slug: "200a-service-upgrade" },
    select: { id: true, active: true },
  });
  if (!upgrade?.active) {
    console.error(`  200a-service-upgrade is missing or inactive — the "more capacity"`);
    console.error(`  branch would dead-end. Refusing.\n`);
    process.exit(1);
  }

  console.log(`  labor ${STANDARD_HOURS}h / ${WWT_HOURS}h same-visit   (PROVISIONAL)`);
  console.log(`  recipe ${RECIPE.map(([k, q]) => `${k}x${q}`).join(", ")}`);
  console.log(`  permit allowance currently $${((service.permitAdminCents ?? 0) / 100).toFixed(2)}`);
  console.log();
  if (!apply) { console.log(`  Report only. Re-run with --apply to build.\n`); return; }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      fieldLaborHours: STANDARD_HOURS,
      wwtLaborHours: WWT_HOURS,
      // A full day of calendar for six hours of work. A panel replacement is
      // the job most likely to find something behind it.
      estimatedMinutes: 480,
      requiresTechCount: 1,
      isPrimaryEligible: true,
      startingPriceLabel: null,
      photoState: "PREPARATION",
      disclaimer: DISCLOSURE,
      // Explicitly zero. Not "unset" — the disclaimer promises the fee is
      // outside the price, and the two must agree.
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

  const qReason = await upsertQuestion(prisma, service.id, {
    key: "panel_reason", order: 0,
    prompt: "What's prompting the panel replacement?",
  });
  const qLocation = await upsertQuestion(prisma, service.id, {
    key: "panel_location", order: 1,
    prompt: "Would the new panel go in exactly the same spot?",
    helpText: "Moving it means new wiring to every circuit, which is a much bigger job.",
  });
  const qCircuits = await upsertQuestion(prisma, service.id, {
    key: "panel_circuits", order: 2,
    prompt: "Roughly how many breakers are in the panel now?",
    helpText: "Count the switches in the rows — an estimate is fine.",
  });

  const groups = await Promise.all(
    ["PANEL_PHOTOS"].map(async (key, i) => {
      const g = await prisma.photoGroup.findUnique({ where: { key }, select: { id: true } });
      if (!g) throw new Error(`Photo group ${key} missing — refusing to ask for panel photos with no safety note.`);
      return { photoGroupId: g.id, order: i };
    })
  );

  type Opt = {
    questionId: string; label: string; value: string; order: number;
    routeAction: "CONTINUE" | "PHOTO_REVIEW" | "REROUTE_SERVICE" | "REROUTE_TROUBLESHOOTING";
    nextQuestionId: string | null; rerouteServiceId?: string;
    requiredPhotoLabels: string[]; photosBlockBooking?: boolean;
    approvedComponentPriceCents: number | null; withGroups: boolean;
  };
  const review = (questionId: string, label: string, value: string, order: number): Opt => ({
    questionId, label, value, order, routeAction: "PHOTO_REVIEW", nextQuestionId: null,
    requiredPhotoLabels: IDENTIFY_PANEL, photosBlockBooking: true,
    approvedComponentPriceCents: null, withGroups: true,
  });
  const cont = (questionId: string, label: string, value: string, order: number, next: string): Opt => ({
    questionId, label, value, order, routeAction: "CONTINUE", nextQuestionId: next,
    requiredPhotoLabels: [], approvedComponentPriceCents: 0, withGroups: false,
  });

  const OPTIONS: Opt[] = [
    cont(qReason.id, "It's old, damaged, or my insurer has asked me to replace it", "condition", 1, qLocation.id),
    {
      questionId: qReason.id, label: "I need more capacity — more circuits, or a bigger service",
      value: "capacity", order: 2, routeAction: "REROUTE_SERVICE", rerouteServiceId: upgrade.id,
      nextQuestionId: null, requiredPhotoLabels: [], approvedComponentPriceCents: null, withGroups: false,
    },
    {
      // Selling a panel to fix a fault nobody has diagnosed is the worst thing
      // this catalogue could do. Find the fault first.
      questionId: qReason.id, label: "Something isn't working right — breakers tripping, lights flickering",
      value: "fault", order: 3, routeAction: "REROUTE_TROUBLESHOOTING",
      nextQuestionId: null, requiredPhotoLabels: [], approvedComponentPriceCents: null, withGroups: false,
    },
    review(qReason.id, "I'm not sure", "unsure_reason", 4),

    cont(qLocation.id, "Yes — same wall, same spot", "same_spot", 1, qCircuits.id),
    review(qLocation.id, "No — I'd like it moved", "relocating", 2),
    review(qLocation.id, "I'm not sure", "unsure_location", 3),

    {
      questionId: qCircuits.id, label: `Up to about ${MAX_CIRCUITS}`, value: "standard", order: 1,
      routeAction: "PHOTO_REVIEW", nextQuestionId: null,
      requiredPhotoLabels: IDENTIFY_PANEL, photosBlockBooking: false,
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

  console.log(`  ✓ tree built — 3 questions, ${OPTIONS.length} options\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
