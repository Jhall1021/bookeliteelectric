/**
 * Appliance services — handoff §16, §17, §21, plus the Range Hood decision.
 *
 * Run with: npx tsx prisma/seed-appliance-services.ts
 *
 * Four services:
 *   Replace Existing Range Hood      new — full physical replacement
 *   Customer-Supplied Soundbar       new tree, $250 / $125
 *   Dishwasher Electrical            renamed, repriced, electrical-only
 *   Garbage Disposal Electrical      renamed, electrical-only
 *
 * Photo requirements come from the reusable groups (PANEL_PHOTOS,
 * WORK_AREA_PHOTOS, EQUIPMENT_PHOTOS) rather than being written out here, so
 * wording and the panel safety instruction stay consistent site-wide.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CUSTOMER_SUPPLIED =
  "Please have your equipment on hand, complete and undamaged, with any required mounting hardware. If the equipment or the existing conditions turn out to need additional work, we'll explain the options and give you the price before proceeding.";

async function clearTree(serviceId: string) {
  const qs = await prisma.question.findMany({ where: { serviceId } });
  for (const q of qs) await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { serviceId } });
}

/** Attach reusable photo groups to an answer by value. */
async function attachPhotos(questionId: string, value: string, groupKeys: string[]) {
  const opt = await prisma.answerOption.findFirst({ where: { questionId, value } });
  if (!opt) return;
  for (const [i, key] of groupKeys.entries()) {
    const g = await prisma.photoGroup.findUnique({ where: { key } });
    if (!g) continue;
    await prisma.answerOptionPhotoGroup.upsert({
      where: { answerOptionId_photoGroupId: { answerOptionId: opt.id, photoGroupId: g.id } },
      update: { order: i },
      create: { answerOptionId: opt.id, photoGroupId: g.id, order: i },
    });
  }
}

// ---------------------------------------------------------------------------
// Replace Existing Range Hood
// ---------------------------------------------------------------------------
async function seedRangeHood() {
  const category = await prisma.serviceCategory.findFirst({
    where: { slug: { in: ["appliance-install", "appliance-installation"] } },
  });
  if (!category) {
    console.log("  – Appliance category not found; range hood skipped");
    return;
  }

  // Full physical replacement, not electrical-only. No plumbing liability, and
  // a homeowner hiring an electrician to replace a hood expects the hood
  // replaced. Sits alongside the microwave, which is also a full install —
  // while dishwasher and disposal stay electrical-only.
  const service = await prisma.service.upsert({
    where: { slug: "replace-range-hood" },
    update: {},
    create: {
      slug: "replace-range-hood",
      name: "Replace Existing Range Hood",
      categoryId: category.id,
      bookingType: "ADJUSTED",
      icon: "appliance",
      shortDescription:
        "We remove your old range hood, mount the replacement you've bought, reconnect the power and the existing ducting, and test it. For an existing hood in the same spot using the same venting.",
    },
  });

  await prisma.service.update({
    where: { id: service.id },
    data: {
      categoryId: category.id,
      name: "Replace Existing Range Hood",
      bookingType: "ADJUSTED",
      active: true,
      // 1.5 field tech-hours; 2 hours of calendar time. Deliberately
      // different numbers — the schedule carries setup and cleanup that the
      // labor estimate doesn't, and neither is derived from the other.
      fieldLaborHours: 1.5,
      estimatedMinutes: 120,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      // Customer supplies the hood; connectors and fasteners are absorbed.
      materialCostCents: 0,
      basePrice: 37500,
      // No add-on price yet — no field data on doing this alongside other work.
      whileWeThereBasePrice: null,
      wwtLaborHours: null,
      photoState: "NONE",
      publishedPriceApprovedAt: new Date(),
      disclaimer:
        "Covers replacing an existing hood in the same location using the existing venting. Haul-away, new ductwork, cabinet modification, and any cutting of tile, stone or finished surfaces aren't included.",
    },
  });

  await clearTree(service.id);

  const q1 = await prisma.question.create({
    data: { serviceId: service.id, key: "hood_exists", prompt: "Is there a range hood there now?", inputType: "SINGLE_SELECT", order: 0 },
  });
  const q2 = await prisma.question.create({
    data: { serviceId: service.id, key: "hood_has_power", prompt: "Does the current hood work — fan and light?", helpText: "We're checking that the power to it is good, not whether you like it.", inputType: "SINGLE_SELECT", order: 1 },
  });
  const q3 = await prisma.question.create({
    data: { serviceId: service.id, key: "hood_venting", prompt: "How does the current hood vent?", helpText: "If you can't tell, that's fine — say so and we'll take a look.", inputType: "SINGLE_SELECT", order: 2 },
  });
  const q4 = await prisma.question.create({
    data: { serviceId: service.id, key: "hood_same_size", prompt: "Is the new hood about the same size and type, going in the same spot?", inputType: "SINGLE_SELECT", order: 3 },
  });
  const q5 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "hood_backsplash",
      // Deliberately NOT "is there tile behind your hood?" — V4 sent every
      // tiled kitchen to review, which disqualifies a lot of straightforward
      // jobs. Tile being present isn't the risk; cutting it is.
      prompt: "Will the new hood use the same mounting spot, or do we need to drill or cut into the backsplash or wall?",
      inputType: "SINGLE_SELECT",
      order: 4,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: q1.id, label: "Yes, there's one there now", value: "yes", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "No, this would be a new hood location", value: "no", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: [] },

      { questionId: q2.id, label: "Yes, it works", value: "works", routeAction: "CONTINUE", nextQuestionId: q3.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q2.id, label: "No, it has no power", value: "no_power", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: [] },
      { questionId: q2.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },

      { questionId: q3.id, label: "Out through the wall", value: "through_wall", routeAction: "CONTINUE", nextQuestionId: q4.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q3.id, label: "Up through the cabinet or ceiling", value: "through_cabinet", routeAction: "CONTINUE", nextQuestionId: q4.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q3.id, label: "It doesn't vent outside — it recirculates", value: "recirculating", routeAction: "CONTINUE", nextQuestionId: q4.id, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q3.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: [] },

      { questionId: q4.id, label: "Yes, same size and same spot", value: "same", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q4.id, label: "No, it's different", value: "different", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: [] },
      { questionId: q4.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },

      { questionId: q5.id, label: "Same spot — nothing needs cutting", value: "same_mounting", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0, disclaimer: CUSTOMER_SUPPLIED },
      { questionId: q5.id, label: "We'd need to cut or drill the backsplash or wall", value: "needs_cutting", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: [] },
      { questionId: q5.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },
    ],
  });

  await attachPhotos(q1.id, "no", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q2.id, "no_power", ["WORK_AREA_PHOTOS", "PANEL_PHOTOS"]);
  await attachPhotos(q2.id, "unsure", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q3.id, "unsure", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q4.id, "different", ["WORK_AREA_PHOTOS", "EQUIPMENT_PHOTOS"]);
  await attachPhotos(q4.id, "unsure", ["WORK_AREA_PHOTOS", "EQUIPMENT_PHOTOS"]);
  await attachPhotos(q5.id, "needs_cutting", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q5.id, "unsure", ["WORK_AREA_PHOTOS"]);

  console.log("  ✓ Replace Existing Range Hood — $375, 1.5 tech-hrs, 120 min, 5 questions");
}

// ---------------------------------------------------------------------------
// Customer-Supplied Soundbar Installation — §21
// ---------------------------------------------------------------------------
async function seedSoundbar() {
  const service = await prisma.service.findUnique({ where: { slug: "soundbar-installation" } });
  if (!service) {
    console.log("  – soundbar-installation not in the catalog, skipped");
    return;
  }
  const tv = await prisma.service.findUnique({ where: { slug: "tv-installation" } });
  const outlet = await prisma.service.findUnique({ where: { slug: "new-120v-outlet" } });

  await prisma.service.update({
    where: { id: service.id },
    data: {
      name: "Customer-Supplied Soundbar Installation",
      bookingType: "ADJUSTED",
      // §21: 0.75 primary is under an hour with no Elite material, so the
      // $250 service-call minimum is the price. WWT is 0.50 x $250 = $125,
      // with no minimum — the technician is already on site.
      fieldLaborHours: 0.75,
      wwtLaborHours: 0.5,
      estimatedMinutes: 45,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      materialCostCents: 0,
      basePrice: 25000,
      whileWeThereBasePrice: 12500,
      photoState: "NONE",
      publishedPriceApprovedAt: new Date(),
    },
  });

  await clearTree(service.id);

  const q = async (key: string, prompt: string, order: number, helpText?: string) =>
    prisma.question.create({ data: { serviceId: service.id, key, prompt, helpText, inputType: "SINGLE_SELECT", order } });

  const q1 = await q("soundbar_tv_mounted", "Is your TV already mounted on the wall?", 0);
  const q2 = await q("soundbar_location", "Where should the soundbar go?", 1);
  const q3 = await q("soundbar_wall", "What's the wall made of?", 2, "If you're not certain, say so — we'd rather look than guess.");
  const q4 = await q("soundbar_power", "Is there an outlet near where the soundbar will go?", 3);
  const q5 = await q("soundbar_cable", "Do you have the cable to connect it to the TV?", 4, "HDMI or optical, whichever your soundbar uses.");
  const q6 = await q("soundbar_conceal", "Would you like the cable hidden inside the wall?", 5, "Included either way — we just need to know before we start.");

  await prisma.answerOption.createMany({
    data: [
      { questionId: q1.id, label: "Yes, it's already on the wall", value: "mounted", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "No — I need the TV mounted too", value: "needs_tv_mount", routeAction: "REROUTE_SERVICE", rerouteServiceId: tv?.id ?? null, order: 2, requiredPhotoLabels: [] },
      { questionId: q1.id, label: "The TV sits on furniture", value: "on_furniture", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },

      { questionId: q2.id, label: "On the wall below the TV", value: "wall_below_tv", routeAction: "CONTINUE", nextQuestionId: q3.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      // Too many proprietary bracket designs to price sight-unseen.
      { questionId: q2.id, label: "Attached to the TV or its mount", value: "on_tv_mount", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: [] },
      { questionId: q2.id, label: "Somewhere else, or I'm not sure", value: "other", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },

      { questionId: q3.id, label: "Drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: q4.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q3.id, label: "Plaster", value: "plaster", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: [] },
      { questionId: q3.id, label: "Brick or concrete", value: "masonry", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },
      { questionId: q3.id, label: "Tile or stone", value: "tile_stone", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: [] },
      { questionId: q3.id, label: "Something else, or I'm not sure", value: "other", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 5, requiredPhotoLabels: [] },

      { questionId: q4.id, label: "Yes", value: "yes", routeAction: "CONTINUE", nextQuestionId: q5.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q4.id, label: "No", value: "no", routeAction: "REROUTE_SERVICE", rerouteServiceId: outlet?.id ?? null, order: 2, requiredPhotoLabels: [] },
      { questionId: q4.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },

      // No price effect. Recorded so the technician brings the right cable —
      // and so an Elite-supplied cable can become a material add-on later.
      { questionId: q5.id, label: "Yes, HDMI", value: "hdmi", routeAction: "CONTINUE", nextQuestionId: q6.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q5.id, label: "Yes, optical", value: "optical", routeAction: "CONTINUE", nextQuestionId: q6.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q5.id, label: "I have one but I'm not sure which", value: "unsure_type", routeAction: "CONTINUE", nextQuestionId: q6.id, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q5.id, label: "No, I don't have one", value: "none", routeAction: "CONTINUE", nextQuestionId: q6.id, order: 4, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },

      // Concealment is included at no charge. Asked anyway so the technician
      // arrives expecting to do it.
      { questionId: q6.id, label: "Yes, hide it in the wall", value: "conceal", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0, disclaimer: CUSTOMER_SUPPLIED },
      { questionId: q6.id, label: "No, leave it outside the wall", value: "surface", routeAction: "RESOLVE_INSTANT", order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0, disclaimer: CUSTOMER_SUPPLIED },
    ],
  });

  await attachPhotos(q1.id, "on_furniture", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q2.id, "on_tv_mount", ["WORK_AREA_PHOTOS", "EQUIPMENT_PHOTOS"]);
  await attachPhotos(q2.id, "other", ["WORK_AREA_PHOTOS"]);
  for (const v of ["plaster", "masonry", "tile_stone", "other"]) {
    await attachPhotos(q3.id, v, ["WORK_AREA_PHOTOS"]);
  }
  await attachPhotos(q4.id, "unsure", ["WORK_AREA_PHOTOS"]);

  console.log("  ✓ Customer-Supplied Soundbar — $250 / $125, 6 questions, concealment included");
}

// ---------------------------------------------------------------------------
// Dishwasher + Garbage Disposal — §16, §17. Electrical only.
// ---------------------------------------------------------------------------
async function seedApplianceElectrical() {
  const dedicated = await prisma.service.findUnique({ where: { slug: "dedicated-120v-circuit-outlet" } });

  const jobs = [
    {
      slug: "dishwasher-electrical",
      // "Replacement" implied Elite installs the appliance. It doesn't — this
      // is the electrical connection only, and the name has to say so.
      name: "Dishwasher Electrical Connection / Reconnection",
      shortDescription:
        "Having a dishwasher swapped out? We'll disconnect the old one electrically and connect the new one. Electrical work only — no water lines, drain hose, or fitting the appliance itself.",
      disclaimer:
        "Electrical connection only. Water supply, drain hose, cabinet work, levelling and the physical installation aren't included, and we don't take responsibility for plumbing leaks.",
      prompt: "Is there already suitable power at the dishwasher?",
      yes: "Yes, the old one is plugged in or wired in",
    },
    {
      slug: "garbage-disposal-install",
      name: "Garbage Disposal Electrical Disconnect / Reconnect",
      shortDescription:
        "Having a disposal replaced? We'll handle the electrical disconnect and reconnect. Electrical work only — no sink flange, drain piping, or plumbing.",
      disclaimer:
        "Electrical connection only. Sink flange, drain piping, the dishwasher drain connection and plumbing aren't included, and we don't take responsibility for leaks.",
      prompt: "Is there already a disposal there with a switch that works?",
      yes: "Yes, there's one there now and the switch works",
    },
  ];

  for (const j of jobs) {
    const service = await prisma.service.findUnique({ where: { slug: j.slug } });
    if (!service) {
      console.log(`  – ${j.slug} not in the catalog, skipped`);
      continue;
    }

    await prisma.service.update({
      where: { id: service.id },
      data: {
        name: j.name,
        shortDescription: j.shortDescription,
        disclaimer: j.disclaimer,
        bookingType: "ADJUSTED",
        // Both priced the same: same scope, same work, same time on site.
        basePrice: 25000,
        whileWeThereBasePrice: 17500,
        photoState: "NONE",
        publishedPriceApprovedAt: new Date(),
      },
    });

    await clearTree(service.id);

    const q1 = await prisma.question.create({
      data: { serviceId: service.id, key: "appliance_power_present", prompt: j.prompt, inputType: "SINGLE_SELECT", order: 0 },
    });

    await prisma.answerOption.createMany({
      data: [
        { questionId: q1.id, label: j.yes, value: "has_power", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
        // §16/§17: missing power isn't a dead end — it becomes a dedicated
        // circuit job, quoted together with this one.
        { questionId: q1.id, label: "No, there's no power there", value: "no_power", routeAction: "REROUTE_SERVICE", rerouteServiceId: dedicated?.id ?? null, order: 2, requiredPhotoLabels: [] },
        { questionId: q1.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },
      ],
    });

    await attachPhotos(q1.id, "unsure", ["WORK_AREA_PHOTOS"]);
    console.log(`  ✓ ${j.name} — $250 / $175, electrical only`);
  }
}

async function main() {
  console.log("Seeding appliance services...\n");
  await seedRangeHood();
  await seedSoundbar();
  await seedApplianceElectrical();
  console.log(`
Photo requirements come from the reusable groups, so the panel safety
instruction is applied automatically wherever a panel photo is requested.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
