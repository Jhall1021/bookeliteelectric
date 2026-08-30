/**
 * 240V Garage Outlet — one public service, four NEMA outcomes — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-240v-garage-outlet.ts --apply
 *
 * Phase F rescue #4 by build order, and the first that genuinely needs four
 * different material sets from one customer journey.
 *
 * WHY FOUR SERVICES AND NOT FOUR PRICE MODIFIERS
 *
 * A 6-30 and a 14-50 are different receptacles on different cable. Writing one
 * recipe and adding a typed number for the other three would put the real
 * economics of three configurations nowhere — the service's material cache
 * would describe one job while the customer paid for another, and the
 * reconciler could never check three of the four.
 *
 * So each configuration is a service with its own complete recipe, and each
 * price is DERIVED from that recipe. The public one carries the cheapest
 * configuration, which is what a "from" price should mean, and the tree hands
 * the customer to whichever sibling matches their plug. Same pattern as the
 * bathroom fan packages.
 *
 * THE QUESTION THE HOMEOWNER CAN ACTUALLY ANSWER
 *
 * Not "does your equipment need a neutral" — nobody knows that. "How many
 * prongs are on the plug", which is a thing you can see, and which decides the
 * receptacle and the cable together.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";
import { upsertQuestion } from "./_moduleHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { PERMIT_DISCLAIMER } from "../lib/permitPolicy";

const prisma = new PrismaClient();

const PUBLIC_SLUG = "240v-garage-outlet";

// POLICY[garage_240v.standard_labor_hours]: 2.5
// POLICY[garage_240v.included_run_ft]: 25
const STANDARD_HOURS = 2.5;
const WWT_HOURS = 2.25;
const RUN_FT = 25;

/** Shared by every configuration: the box, its cover, and consumables. */
const SHARED: [string, number][] = [
  ["BOX_SURFACE_4S", 1],
  ["COVER_RAISED_4S", 1],
  ["CONSUMABLES_MEDIUM", 1],
];

type Config = {
  slug: string;
  name: string;
  amperage: "30" | "50";
  prongs: "3" | "4";
  receptacle: string;
  cable: string;
  breaker: string;
  /** The public one. Exactly one config may be it. */
  isPublic?: boolean;
};

const CONFIGS: Config[] = [
  {
    slug: PUBLIC_SLUG, name: "240V Garage Outlet",
    amperage: "30", prongs: "3",
    receptacle: "RECEPTACLE_6_30", cable: "WIRE_10_2", breaker: "BREAKER_DOUBLE_POLE_30A",
    isPublic: true,
  },
  {
    slug: "240v-garage-outlet-14-30", name: "240V Garage Outlet — 30A, 4-prong",
    amperage: "30", prongs: "4",
    receptacle: "RECEPTACLE_14_30", cable: "WIRE_10_3", breaker: "BREAKER_DOUBLE_POLE_30A",
  },
  {
    slug: "240v-garage-outlet-6-50", name: "240V Garage Outlet — 50A, 3-prong",
    amperage: "50", prongs: "3",
    receptacle: "RECEPTACLE_6_50", cable: "WIRE_6_2", breaker: "BREAKER_DOUBLE_POLE_50A",
  },
  {
    slug: "240v-garage-outlet-14-50", name: "240V Garage Outlet — 50A, 4-prong",
    amperage: "50", prongs: "4",
    receptacle: "RECEPTACLE_14_50", cable: "WIRE_6_3", breaker: "BREAKER_DOUBLE_POLE_50A",
  },
];

const IDENTIFY = [
  "The plug on your equipment, showing its prongs",
  "Your panel with the OUTER DOOR open, showing the row of breakers",
  "The garage wall where the outlet should go",
];

const DISCLOSURE =
  "Pricing assumes an attached garage with the panel in that same garage, the " +
  "outlet within about " + RUN_FT + " feet on exposed or open framing, and two " +
  "spare breaker spaces together. A finished wall, a longer run, a detached " +
  "garage, or a panel with no room may change the price. Any difference will " +
  "be shown and approved before work begins. " + PERMIT_DISCLAIMER;

async function ensureService(cfg: Config, contractorId: string, templateId: string) {
  const existing = await prisma.service.findFirst({
    where: { contractorId, slug: cfg.slug }, select: { id: true },
  });
  if (existing) return existing.id;

  // Siblings are cloned from the public service's own categorisation so they
  // cannot drift into a different part of the catalogue.
  const base = await prisma.service.findUniqueOrThrow({
    where: { id: templateId },
    select: { categoryId: true, contractorCategoryId: true, icon: true },
  });
  const created = await prisma.service.create({
    data: {
      contractorId, slug: cfg.slug, name: cfg.name,
      categoryId: base.categoryId, contractorCategoryId: base.contractorCategoryId,
      icon: base.icon, bookingType: "ADJUSTED",
      // Hidden: reached only by reroute from the public service's tree.
      active: false,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * The qualifying questions, identical on every configuration.
 *
 * They must share KEYS across all four, because a reroute carries the
 * customer's answers into the sibling and the sibling re-walks its own tree
 * with them. Different keys would mean the sibling asking again.
 */
async function buildTree(serviceId: string, cfg: Config, targets: Map<string, string>) {
  const old = await prisma.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const q of old) await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { serviceId } });

  const qPanel = await upsertQuestion(prisma, serviceId, {
    key: "garage_panel", order: 0,
    prompt: "Is your electrical panel in the same garage?",
    helpText: "If it is, the run is short and stays inside the garage — that's what this price covers.",
  });
  const qWall = await upsertQuestion(prisma, serviceId, {
    key: "garage_wall", order: 1,
    prompt: "What's the wall like where the outlet goes?",
    helpText: "Open framing means we can see the studs. Finished means drywall or panelling over them.",
  });
  const qSpaces = await upsertQuestion(prisma, serviceId, {
    key: "garage_spaces", order: 2,
    prompt: "Are there two empty breaker slots next to each other?",
  });
  const qAmps = await upsertQuestion(prisma, serviceId, {
    key: "garage_amperage", order: 3,
    prompt: "What does your equipment need?",
    helpText: "It's on the equipment's plate, and usually on the plug too.",
  });
  const qProngs30 = await upsertQuestion(prisma, serviceId, {
    key: "garage_prongs_30", order: 4,
    prompt: "How many prongs are on the plug?",
    helpText: "Count them on the plug itself. Three or four — it decides which outlet and which cable you need.",
  });
  const qProngs50 = await upsertQuestion(prisma, serviceId, {
    key: "garage_prongs_50", order: 5,
    prompt: "How many prongs are on the plug?",
    helpText: "Count them on the plug itself. Three or four — it decides which outlet and which cable you need.",
  });

  const groups = await Promise.all(["PANEL_PHOTOS", "EQUIPMENT_PHOTOS"].map(async (key, i) => {
    const g = await prisma.photoGroup.findUnique({ where: { key }, select: { id: true } });
    if (!g) throw new Error(`Photo group ${key} missing.`);
    return { photoGroupId: g.id, order: i };
  }));

  type Opt = {
    questionId: string; label: string; value: string; order: number;
    routeAction: "CONTINUE" | "PHOTO_REVIEW" | "RESOLVE_INSTANT" | "REROUTE_SERVICE";
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

  /**
   * The fork. On each service, the configuration it IS resolves instantly and
   * the other three hand off. That is what makes one tree serve four
   * outcomes without any of them pricing somebody else's job.
   */
  const terminal = (questionId: string, amperage: "30" | "50", prongs: "3" | "4", order: number): Opt => {
    const target = CONFIGS.find((c) => c.amperage === amperage && c.prongs === prongs)!;
    const label = `${prongs} prongs`;
    const value = `p${prongs}`;
    if (target.slug === cfg.slug) {
      return {
        questionId, label, value, order, routeAction: "RESOLVE_INSTANT", nextQuestionId: null,
        requiredPhotoLabels: [], approvedComponentPriceCents: 0, withGroups: false,
      };
    }
    return {
      questionId, label, value, order, routeAction: "REROUTE_SERVICE",
      rerouteServiceId: targets.get(target.slug)!, nextQuestionId: null,
      requiredPhotoLabels: [], approvedComponentPriceCents: null, withGroups: false,
    };
  };

  const OPTIONS: Opt[] = [
    cont(qPanel.id, "Yes — the panel is in this garage", "in_garage", 1, qWall.id),
    review(qPanel.id, "No — it's elsewhere in the house", "elsewhere", 2),
    review(qPanel.id, "I'm not sure", "unsure_panel", 3),

    cont(qWall.id, "Open framing — I can see the studs", "open", 1, qSpaces.id),
    review(qWall.id, "Finished — drywall or panelling", "finished", 2),
    review(qWall.id, "Masonry or block", "masonry", 3),

    cont(qSpaces.id, "Yes — two empty slots together", "two_free", 1, qAmps.id),
    review(qSpaces.id, "No — the panel is full", "full", 2),
    review(qSpaces.id, "I'm not sure", "unsure_spaces", 3),

    cont(qAmps.id, "30 amps", "a30", 1, qProngs30.id),
    cont(qAmps.id, "50 amps", "a50", 2, qProngs50.id),
    review(qAmps.id, "I'm not sure", "unsure_amps", 3),

    terminal(qProngs30.id, "30", "3", 1),
    terminal(qProngs30.id, "30", "4", 2),
    review(qProngs30.id, "I'm not sure", "unsure_prongs", 3),

    terminal(qProngs50.id, "50", "3", 1),
    terminal(qProngs50.id, "50", "4", 2),
    review(qProngs50.id, "I'm not sure", "unsure_prongs", 3),
  ];

  for (const o of OPTIONS) {
    const { withGroups, ...data } = o;
    await prisma.answerOption.create({
      data: { ...data, ...(withGroups ? { photoGroups: { create: groups } } : {}) },
    });
  }
  return OPTIONS.length;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\n240V GARAGE OUTLET — FOUR NEMA OUTCOMES\n`);

  const pub = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, PUBLIC_SLUG),
    select: { id: true, contractorId: true },
  });
  if (!pub) { console.error(`  ${PUBLIC_SLUG} not in the catalogue.\n`); process.exit(1); }

  for (const cfg of CONFIGS) {
    for (const key of [cfg.receptacle, cfg.cable, cfg.breaker, ...SHARED.map(([k]) => k)]) {
      const role = await prisma.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
      if (!role) { console.error(`  ${key} is not a canonical role.\n`); process.exit(1); }
      const cost = await prisma.contractorMaterial.findFirst({
        where: { contractorId: pub.contractorId, canonicalMaterialId: role.id, active: true },
        select: { id: true },
      });
      if (!cost) { console.error(`  ${key} has no cost for this contractor.\n`); process.exit(1); }
    }
  }

  if (!apply) {
    for (const c of CONFIGS) console.log(`  ${c.slug.padEnd(28)}${c.receptacle.padEnd(20)}${c.cable}`);
    console.log(`\n  Report only.\n`); return;
  }

  const targets = new Map<string, string>();
  for (const cfg of CONFIGS) {
    targets.set(cfg.slug, await ensureService(cfg, pub.contractorId, pub.id));
  }

  for (const cfg of CONFIGS) {
    const id = targets.get(cfg.slug)!;
    await prisma.service.update({
      where: { id },
      data: {
        name: cfg.name,
        bookingType: "ADJUSTED",
        fieldLaborHours: STANDARD_HOURS, wwtLaborHours: WWT_HOURS,
        estimatedMinutes: 210, requiresTechCount: 1,
        isPrimaryEligible: true, startingPriceLabel: null,
        active: Boolean(cfg.isPublic),
        photoState: "PREPARATION", disclaimer: DISCLOSURE, permitAdminCents: 0,
        shortDescription:
          `A ${cfg.amperage}-amp 240V outlet in your garage for a welder, ` +
          `compressor or similar shop equipment. Not for EV charging — that's ` +
          `its own service.`,
      },
    });

    await prisma.serviceMaterial.deleteMany({ where: { serviceId: id } });
    let order = 0;
    for (const [key, qty] of [
      [cfg.receptacle, 1], [cfg.cable, RUN_FT], [cfg.breaker, 1], ...SHARED,
    ] as [string, number][]) {
      const role = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key }, select: { id: true } });
      await prisma.serviceMaterial.create({
        data: { serviceId: id, canonicalMaterialId: role.id, quantity: qty, order: order++ },
      });
    }
    await recomputeServiceMaterialCost(prisma as any, id);
    const n = await buildTree(id, cfg, targets);
    const s = await prisma.service.findUniqueOrThrow({
      where: { id }, select: { materialCostCents: true, materialCostResolved: true, active: true },
    });
    console.log(
      `  ${cfg.slug.padEnd(28)}${(s.active ? "PUBLIC" : "hidden").padEnd(8)}` +
        `material $${((s.materialCostCents ?? 0) / 100).toFixed(2).padStart(7)}  ` +
        `${s.materialCostResolved ? "resolved" : "UNRESOLVED"}  ${n} options`
    );
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
