/**
 * Generator Inlet + Interlock becomes a bounded, bookable service — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-generator-inlet.ts          report
 *   npx tsx prisma/seed-generator-inlet.ts --apply  build
 *
 * Phase F rescue #2. No price, no tree, and a description that covered every
 * way a house can be connected to a generator.
 *
 * THE PROMISE
 *
 *   A 30A portable-generator inlet on an exterior wall at or very near an
 *   existing main-breaker residential panel, a listed interlock kit for that
 *   panel, a 2-pole 30A backfeed breaker, normal siding, ordinary access. The
 *   customer supplies the generator.
 *
 * THE ONE THING THE HOMEOWNER IS NOT ASKED TO CERTIFY
 *
 * Interlock compatibility. A listed kit is specific to a panel's make and
 * model, and "is there a kit for your panel?" is not a question anybody should
 * answer from their kitchen. So the tree asks what a person CAN see — a main
 * breaker, two free spaces next to each other, where the inlet goes, what the
 * wall is made of — and the panel's identity comes from a photograph.
 *
 * The priced route therefore ends in a NON-BLOCKING photo review: the price is
 * settled and the customer can book, and the photographs are preparation that
 * confirms the kit before anyone drives out. A blocking review would hide the
 * price this whole exercise exists to show; no photos at all would promise a
 * price against a panel nobody had looked at.
 *
 * PHOTOGRAPHS STOP AT THE OUTER DOOR
 *
 * Every photo asks for the door with the handle, never the metal deadfront
 * behind it. A homeowner should not be taking the cover off a live panel to
 * get a price, and the labels and safety notes say so in words rather than
 * assuming it is obvious.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { upsertQuestion } from "./_moduleHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";

const prisma = new PrismaClient();

const SLUG = "generator-inlet-interlock";

// POLICY[generator_inlet.standard_labor_hours]: 3.0
// POLICY[generator_inlet.included_run_ft]: 10
// POLICY[generator_inlet.standard_amperage]: 30
// POLICY[generator_inlet.customer_supplies_generator]: true
const STANDARD_HOURS = 3.0;
const WWT_HOURS = 2.75;
const INCLUDED_RUN_FT = 10;

/**
 * Reused, not reinvented. PANEL_PHOTOS already carries the warning this
 * service needs — "Open the panel door only. Do not remove the panel cover or
 * dead front" — and a second copy of that sentence is a second place for it to
 * drift out of date.
 */
const SHARED_GROUPS = ["PANEL_PHOTOS", "EXTERIOR_PHOTOS"];

/**
 * The one photo the shared group does not ask for, and the only one that
 * settles interlock compatibility. A kit is listed for a specific make and
 * model, and that is printed on a label inside the door the customer is
 * already opening.
 */
const IDENTIFY_PANEL = [
  "The label inside the panel door, showing its brand and model",
];

const DISCLOSURE =
  "Pricing assumes a standard 30A portable-generator inlet installed near an " +
  "existing compatible main-breaker panel with available breaker space and a " +
  "listed interlock kit. Different generator sizes, panel configurations, " +
  "longer wiring routes, masonry, or additional electrical work may change " +
  "the price. Any difference will be shown and approved before work begins.";

const RECIPE: [string, number][] = [
  ["GENERATOR_INLET_BOX_30A", 1],
  ["INTERLOCK_KIT", 1],
  ["BREAKER_DOUBLE_POLE_30A", 1],
  ["WIRE_10_3", INCLUDED_RUN_FT],
  ["CONSUMABLES_MEDIUM", 1],
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nGENERATOR INLET + INTERLOCK — BOUNDED SCOPE\n`);

  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: { id: true, contractorId: true, name: true, basePrice: true },
  });
  if (!service) { console.error(`  ${SLUG} not in the catalogue.\n`); process.exit(1); }

  // Every role must be costed before a recipe is written against it, or the
  // service becomes unresolvable and silently stops pricing.
  for (const [key] of RECIPE) {
    const role = await prisma.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    if (!role) { console.error(`  ${key} is not a canonical role.\n`); process.exit(1); }
    const cost = await prisma.contractorMaterial.findFirst({
      where: { contractorId: service.contractorId, canonicalMaterialId: role.id, active: true },
      select: { unitCostCents: true },
    });
    if (!cost) { console.error(`  ${key} has no cost for this contractor. Refusing.\n`); process.exit(1); }
  }

  console.log(`  labor ${STANDARD_HOURS}h standalone / ${WWT_HOURS}h same-visit`);
  console.log(`  recipe ${RECIPE.map(([k, q]) => `${k}x${q}`).join(", ")}`);
  console.log();
  if (!apply) { console.log(`  Report only. Re-run with --apply to build.\n`); return; }

  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      fieldLaborHours: STANDARD_HOURS,
      wwtLaborHours: WWT_HOURS,
      // Four hours of calendar for three of work. Panel work is where the
      // surprises live, and a crew held up in one should not make the next
      // appointment late.
      estimatedMinutes: 240,
      requiresTechCount: 1,
      isPrimaryEligible: true,
      startingPriceLabel: null,
      photoState: "PREPARATION",
      disclaimer: DISCLOSURE,
      shortDescription:
        "A weatherproof 30A inlet outside and a listed interlock at your " +
        "panel, so a portable generator can safely power your house during " +
        "an outage. You supply the generator.",
    },
  });

  // ── recipe ─────────────────────────────────────────────────────────────
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

  const qKind = await upsertQuestion(prisma, service.id, {
    key: "generator_kind", order: 0,
    prompt: "What are you connecting?",
    helpText: "A portable generator is one you wheel out and start by hand. A standby unit is bolted in place and starts itself.",
  });
  const qSize = await upsertQuestion(prisma, service.id, {
    key: "generator_outlet", order: 1,
    prompt: "What outlet does your generator have?",
    helpText: "It's printed next to the socket on the generator — the big round one, not the household ones.",
  });
  const qMain = await upsertQuestion(prisma, service.id, {
    key: "panel_main_breaker", order: 2,
    prompt: "Does your electrical panel have one big breaker at the top?",
    helpText: "That's the main breaker — usually marked 100, 150 or 200. The interlock slides under it, so the panel needs one.",
  });
  const qSpaces = await upsertQuestion(prisma, service.id, {
    key: "panel_spaces", order: 3,
    prompt: "Are there two empty breaker slots next to each other?",
    helpText: "Empty slots usually show as blank plastic fillers, or a gap in the row.",
  });
  const qLocation = await upsertQuestion(prisma, service.id, {
    key: "inlet_location", order: 4,
    prompt: "Where would the inlet go, compared with the panel?",
    helpText: `Our standard price includes about ${INCLUDED_RUN_FT} feet of wiring between the two.`,
  });
  const qSurface = await upsertQuestion(prisma, service.id, {
    key: "inlet_surface", order: 5,
    prompt: "What's that outside wall made of?",
  });

  const groupIds = await Promise.all(
    SHARED_GROUPS.map(async (key, i) => {
      const g = await prisma.photoGroup.findUnique({ where: { key }, select: { id: true } });
      if (!g) throw new Error(`Photo group ${key} is missing — refusing to ask for photos with no safety note behind them.`);
      return { photoGroupId: g.id, order: i };
    })
  );

  type Opt = {
    questionId: string; label: string; value: string; order: number;
    routeAction: "CONTINUE" | "PHOTO_REVIEW";
    nextQuestionId: string | null;
    requiredPhotoLabels: string[];
    photosBlockBooking?: boolean;
    approvedComponentPriceCents: number | null;
    withGroups: boolean;
  };

  const review = (questionId: string, label: string, value: string, order: number): Opt => ({
    questionId, label, value, order,
    routeAction: "PHOTO_REVIEW", nextQuestionId: null,
    requiredPhotoLabels: IDENTIFY_PANEL,
    photosBlockBooking: true,
    approvedComponentPriceCents: null,
    withGroups: true,
  });
  const cont = (questionId: string, label: string, value: string, order: number, next: string): Opt => ({
    questionId, label, value, order,
    routeAction: "CONTINUE", nextQuestionId: next,
    requiredPhotoLabels: [],
    approvedComponentPriceCents: 0,
    withGroups: false,
  });

  const OPTIONS: Opt[] = [
    cont(qKind.id, "A portable generator I'll wheel out and start myself", "portable", 1, qSize.id),
    review(qKind.id, "A standby generator that's bolted in place", "standby", 2),
    review(qKind.id, "I'm not sure", "unsure_kind", 3),

    cont(qSize.id, "30 amp — a round 4-prong twist-lock outlet", "l14_30", 1, qMain.id),
    review(qSize.id, "50 amp", "fifty_amp", 2),
    review(qSize.id, "I'm not sure", "unsure_outlet", 3),

    cont(qMain.id, "Yes — there's one big breaker above the rest", "has_main", 1, qSpaces.id),
    review(qMain.id, "No — the breakers are all the same size", "no_main", 2),
    review(qMain.id, "I'm not sure", "unsure_main", 3),

    cont(qSpaces.id, "Yes — two empty slots together", "two_free", 1, qLocation.id),
    review(qSpaces.id, "No — the panel is full", "panel_full", 2),
    review(qSpaces.id, "I'm not sure", "unsure_spaces", 3),

    cont(qLocation.id, "On the same wall as the panel, or just outside it", "near", 1, qSurface.id),
    review(qLocation.id, "Somewhere further around the house", "far", 2),
    review(qLocation.id, "I'm not sure yet", "unsure_location", 3),

    // The priced route. Photos are required but do NOT block booking: the
    // price is settled, and the panel photograph is what confirms a listed
    // interlock exists before anyone drives out.
    {
      questionId: qSurface.id,
      label: "Wood, vinyl or fibre-cement siding",
      value: "standard_siding",
      routeAction: "PHOTO_REVIEW",
      nextQuestionId: null,
      order: 1,
      requiredPhotoLabels: IDENTIFY_PANEL,
      photosBlockBooking: false,
      approvedComponentPriceCents: 0,
      withGroups: true,
    },
    review(qSurface.id, "Brick, stone or stucco", "masonry", 2),
    review(qSurface.id, "Something else, or I'm not sure", "unsure_surface", 3),
  ];

  for (const o of OPTIONS) {
    const { withGroups, ...data } = o;
    await prisma.answerOption.create({
      data: { ...data, ...(withGroups ? { photoGroups: { create: groupIds } } : {}) },
    });
  }

  console.log(`  ✓ tree built — 6 questions, ${OPTIONS.length} options\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
