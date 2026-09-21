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
import { pathToFileURL } from "node:url";
import { findCategory, categoryAttachment } from "./_categoryHelpers";
import { eliteContractorId } from "./_componentHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

// The inline disclaimer this constant used to carry on both answer options
// below is now CUSTOMER_SUPPLIED_EQUIPMENT, a canonical disclaimer attached
// by prisma/seed-conditional-disclaimers.ts (verbatim, same text) — one
// source for one sentence, same reason TAP_EXISTING_FIXTURE_FINISHED
// replaced its own per-answer copies. That step runs AFTER this file in the
// real seed chain (this file's clearTree() would otherwise discard the
// attachment), so nothing here re-creates the inline text on a re-run.

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
  // ADR-006: resolves the contractor's presentation row as well as the
  // canonical one, so the service below gets both pointers.
  const contractorId = await eliteContractorId(prisma);
  const category = await findCategory(prisma, contractorId, [
    "appliance-install",
    "appliance-installation",
  ]);
  if (!category) {
    console.log("  – Appliance category not found; range hood skipped");
    return;
  }

  // Full physical replacement, not electrical-only. No plumbing liability, and
  // a homeowner hiring an electrician to replace a hood expects the hood
  // replaced. Sits alongside the microwave, which is also a full install —
  // while dishwasher and disposal stay electrical-only.
  const service = await prisma.service.upsert({
    where: await serviceSlugKey(prisma, "replace-range-hood"),
    update: {},
    create: {
      // Required as of pass three's contract.
      contractorId,
      slug: "replace-range-hood",
      name: "Replace Existing Range Hood",
      ...categoryAttachment(category),
      bookingType: "ADJUSTED",
      icon: "appliance",
      shortDescription:
        "We remove your old range hood, mount the replacement you've bought, reconnect the power and the existing ducting, and test it. For an existing hood in the same spot using the same venting.",
    },
  });

  await prisma.service.update({
    where: { id: service.id },
    data: {
      ...categoryAttachment(category),
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
      // basePrice/whileWeThereBasePrice moved to
      // prisma/seed-master-price-book-approval.ts — services_price_requires_
      // approval makes "priced, no publishedPriceApprovedAt" impossible to
      // create even here, in an update that only ever touches a row this
      // same file just created. No self-approval: this update establishing
      // the number was already correct not to also stamp approval (a script
      // vouching for its own number); the constraint just means the number
      // itself has to move to the one place that's allowed to do both
      // together.
      wwtLaborHours: null,
      photoState: "NONE",
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

      { questionId: q5.id, label: "Same spot — nothing needs cutting", value: "same_mounting", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
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

  console.log("  ✓ Replace Existing Range Hood — 1.5 tech-hrs, 120 min, 5 questions ($375 pending approval)");
}

// ---------------------------------------------------------------------------
// Customer-Supplied Soundbar Installation — §21
// ---------------------------------------------------------------------------
export async function seedSoundbar() {
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, "soundbar-installation") });
  if (!service) {
    console.log("  – soundbar-installation not in the catalog, skipped");
    return;
  }
  const tv = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, "tv-installation") });
  const outlet = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, "new-120v-outlet") });

  await prisma.service.update({
    where: { id: service.id },
    data: {
      name: "Customer-Supplied Soundbar Installation",
      bookingType: "ADJUSTED",
      shortDescription:
        "Mount and connect your soundbar below an already-mounted TV when power is nearby and visible cable is acceptable. In-wall cable concealment requires review.",
      // §21: 0.75 primary is under an hour with no Elite material, so the
      // $250 service-call minimum is the price. WWT is 0.50 x $250 = $125,
      // with no minimum — the technician is already on site.
      fieldLaborHours: 0.75,
      wwtLaborHours: 0.5,
      estimatedMinutes: 45,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      materialCostCents: 0,
      // basePrice and whileWeThereBasePrice removed.
      //
      // This is an unconditional update — it rewrote the published price on
      // every run, so it would have silently reverted the 23 Aug
      // reconciliation the next time anyone seeded. Labor, materials and
      // routing are this seed's business; the customer's price isn't.
      photoState: "NONE",
    },
  });

  await clearTree(service.id);

  const q = async (key: string, prompt: string, order: number, helpText?: string) =>
    prisma.question.create({ data: { serviceId: service.id, key, prompt, helpText, inputType: "SINGLE_SELECT", order } });

  const q1 = await q("soundbar_tv_mounted", "Is your TV already mounted on the wall?", 0);
  const q2 = await q("soundbar_location", "Where should the soundbar go?", 1);
  const q3 = await q("soundbar_wall", "What's the wall made of?", 2, "If you're not certain, say so — we'd rather look than guess.");
  const q4 = await q("soundbar_power", "Is there an outlet near where the soundbar will go?", 3);
  // Concealment is price-relevant now that the bounded prepared package is
  // projected from atomic labor. Visible cable needs no route measurement;
  // in-wall concealment needs measured physical scope and therefore review.
  const q5 = await q(
    "soundbar_concealment",
    "Is visible cable between the TV, soundbar and nearby outlet acceptable?",
    4,
    "Choose in-wall concealment only if you want the cable hidden inside the wall. We’ll review that route before confirming a price.",
  );

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

      { questionId: q5.id, label: "Yes — visible cable is fine", value: "visible_ok", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q5.id, label: "No — I want the cable concealed inside the wall", value: "conceal_in_wall", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: [] },
      { questionId: q5.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },
    ],
  });

  await attachPhotos(q1.id, "on_furniture", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q2.id, "on_tv_mount", ["WORK_AREA_PHOTOS", "EQUIPMENT_PHOTOS"]);
  await attachPhotos(q2.id, "other", ["WORK_AREA_PHOTOS"]);
  for (const v of ["plaster", "masonry", "tile_stone", "other"]) {
    await attachPhotos(q3.id, v, ["WORK_AREA_PHOTOS"]);
  }
  await attachPhotos(q4.id, "unsure", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q5.id, "conceal_in_wall", ["WORK_AREA_PHOTOS"]);
  await attachPhotos(q5.id, "unsure", ["WORK_AREA_PHOTOS"]);

  console.log("  ✓ Customer-Supplied Soundbar — prepared visible-cable package; in-wall concealment requires review");
}

// ---------------------------------------------------------------------------
// Dishwasher + Garbage Disposal — §16, §17. Electrical only.
// ---------------------------------------------------------------------------
/**
 * @param onlySlug Restrict to one job's slug (e.g. "dishwasher-electrical"
 *   for B.19) instead of rebuilding both. Without it this rewrites
 *   garbage-disposal-install too, unchanged but not what a narrow fix
 *   should touch.
 */
export async function seedApplianceElectrical(onlySlug?: string) {
  const dedicated = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, "dedicated-120v-circuit-outlet") });

  const allJobs = [
    {
      slug: "dishwasher-electrical",
      // "Replacement" implied Elite installs the appliance. It doesn't — this
      // is the electrical connection only, and the name has to say so.
      name: "Dishwasher Electrical Connection / Reconnection",
      shortDescription:
        "Having a dishwasher swapped out? We'll disconnect the old one electrically and connect the new one. Electrical work only — no water lines, drain hose, or fitting the appliance itself.",
      disclaimer:
        "Electrical connection only. Water supply, drain hose, cabinet work, levelling and the physical installation aren't included, and we don't take responsibility for plumbing leaks.",
      // B.19 — "suitable power" asked the homeowner to certify electrical
      // adequacy, a trade judgment, and not the same fact as the "yes" answer
      // actually promises: an old dishwasher being plugged in doesn't mean
      // the connection is suitable for a different one. Reworded to the same
      // observable-presence question garbage-disposal already asks below —
      // is one there now, plugged in or wired in. The unsure and no-power
      // branches (photo review / dedicated-circuit reroute) are exactly
      // where a genuine adequacy judgment belongs — the technician, on site
      // — so nothing about the routing needed to change.
      prompt: "Is there a dishwasher there now that's plugged in or wired in?",
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

  const jobs = onlySlug ? allJobs.filter((j) => j.slug === onlySlug) : allJobs;

  for (const j of jobs) {
    const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, j.slug) });
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
        // Removed — see the soundbar note above. An unconditional update
        // that writes a price will silently undo any reconciliation.
        photoState: "NONE",
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

// Guarded: importing this file for seedSoundbar or seedApplianceElectrical
// alone must not also run main()'s full sweep (which includes
// seedRangeHood, untouched by and unrelated to those two fixes). Only
// running it directly still does, unchanged.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
