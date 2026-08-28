/**
 * Smart Switch + Customer-Supplied Device services — handoff §18-§20.
 *
 * Run with: npx tsx prisma/seed-customer-supplied.ts
 *
 * Three services, all following the same shape: a working existing device
 * books instantly; anything that smells like an electrical fault goes to
 * Troubleshooting rather than selling a part swap that won't fix it.
 *
 * Idempotent. Only touches these three services.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

/**
 * §18 — deliberately NOT a question about neutrals.
 *
 * Asking a homeowner whether a neutral conductor is present, or asking them to
 * pull the plate off and look, is both unsafe and unanswerable for most
 * people. Instead the job books, and the disclaimer sets the expectation that
 * if the wiring turns out not to suit the device, they get a price before any
 * extra work happens.
 */
const SMART_SWITCH_DISCLAIMER =
  "Most smart switches work with the wiring already at your switch. Some models need a neutral wire or other specific wiring that may not be there, particularly in older homes. If your electrician finds that additional wiring or other work is needed, we'll explain the options and give you the price before doing any of it.";

/** §19-§20 — shared across both customer-supplied device services. */
const CUSTOMER_SUPPLIED_DISCLAIMER =
  "Please have your device on hand, complete and undamaged, and suitable for where it's going. If the device or the existing wiring turns out to need additional work, we'll explain the options and give you the price before proceeding.";

async function clearTree(serviceId: string) {
  const qs = await prisma.question.findMany({ where: { serviceId } });
  for (const q of qs) await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { serviceId } });
}

/** §18 — smart switch at an existing, working switch location. */
async function seedSmartSwitch(slug: string) {
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }
  await clearTree(service.id);

  // §18: a customer-supplied smart switch is <=1 hour with essentially no
  // Elite material, so the $250 service-call minimum IS the primary price.
  // fieldLaborHours is left alone — the handoff says "<=1 hour" without
  // giving a figure, and inventing one is exactly what §3.1 prohibits.
  await prisma.service.update({
    where: { id: service.id },
    data: { bookingType: "ADJUSTED", photoState: "NONE" },
  });

  const q = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "switch_working_now",
      prompt: "Does the switch you're replacing work normally right now?",
      helpText: "We just want to be sure we're replacing a working switch rather than chasing an electrical problem.",
      inputType: "SINGLE_SELECT",
      order: 0,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q.id,
        label: "Yes, it works — I just want to upgrade it",
        value: "works_normally",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
        disclaimer: SMART_SWITCH_DISCLAIMER,
      },
      {
        // §18: loss of power, intermittent behaviour, or an unknown fault is
        // a diagnostic job. Selling a smart switch wouldn't fix it.
        questionId: q.id,
        label: "No — it doesn't work, or works only sometimes",
        value: "not_working",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 2,
        requiredPhotoLabels: [],
      },
      {
        questionId: q.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 3,
        requiredPhotoLabels: [],
      },
    ],
  });

  console.log(`  ✓ ${slug} — 1 question, compatibility disclaimer, faults route to Troubleshooting`);
}

/** §19 — Customer-Supplied Standard Outlet. */
async function seedSuppliedOutlet() {
  const slug = "customer-supplied-non-smart-outlet";
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }
  const gfci = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, "replace-gfci-outlet") });
  await clearTree(service.id);

  // §19: 20 minutes, one technician, 0.33 actual tech-hours. Primary is the
  // $250 minimum because it's under an hour with no meaningful Elite
  // material; WWT is 0.33 x $250 = $82.50, rounded up to $85.
  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      // basePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
      // whileWeThereBasePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
      estimatedMinutes: 20,
      requiresTechCount: 1,
      fieldLaborHours: 0.33,
      wwtLaborHours: 0.33,
      materialCostCents: 0,
      photoState: "NONE",
      // No publishedPriceApprovedAt here.
      //
      // This seed sets a price you approved in conversation, which is
      // allowed — but stamping the approval field would be the script
      // recording consent it was never given. Once that's in the data
      // there's no way to tell an owner-approved price from one a
      // calculation invented.
      //
      // Approval happens in the admin, or in one explicit reconciliation
      // migration. Not here.
    },
  });

  const q1 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "outlet_has_power",
      prompt: "Does the outlet you're replacing currently have power?",
      inputType: "SINGLE_SELECT",
      order: 0,
    },
  });
  const q2 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "outlet_test_reset",
      prompt: "Does that outlet have TEST and RESET buttons on it?",
      helpText: "If it does, it's a GFCI outlet — a different part and a different job.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: q1.id, label: "Yes", value: "has_power", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "No", value: "no_power", routeAction: "REROUTE_TROUBLESHOOTING", order: 2, requiredPhotoLabels: [] },
      { questionId: q1.id, label: "I'm not sure", value: "unsure", routeAction: "REROUTE_TROUBLESHOOTING", order: 3, requiredPhotoLabels: [] },
      {
        questionId: q2.id,
        label: "No, it's a regular outlet",
        value: "standard",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
        disclaimer: CUSTOMER_SUPPLIED_DISCLAIMER,
      },
      {
        // §19 — send them to the right product rather than letting them book
        // a standard outlet swap for a GFCI.
        questionId: q2.id,
        label: "Yes, it has TEST and RESET buttons",
        value: "gfci",
        routeAction: "REROUTE_SERVICE",
        rerouteServiceId: gfci?.id ?? null,
        order: 2,
        requiredPhotoLabels: [],
      },
    ],
  });

  console.log(`  ✓ ${slug} — $250 primary / $85 while-we're-there, GFCI reroute wired`);
}

/** §20 — Customer-Supplied Standard Switch. */
async function seedSuppliedSwitch() {
  const slug = "swap-out-customer-supplied-non-smart-switch";
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }
  const threeWay = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, "replace-3-way-switch") });
  await clearTree(service.id);

  await prisma.service.update({
    where: { id: service.id },
    data: {
      bookingType: "ADJUSTED",
      // basePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
      // whileWeThereBasePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
      estimatedMinutes: 20,
      requiresTechCount: 1,
      fieldLaborHours: 0.33,
      wwtLaborHours: 0.33,
      materialCostCents: 0,
      photoState: "NONE",
      // No self-approval — see the note above.
    },
  });

  const q1 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "switch_operates_normally",
      prompt: "Does the switch work normally — you're just replacing or upgrading it?",
      inputType: "SINGLE_SELECT",
      order: 0,
    },
  });
  const q2 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "switch_multi_location",
      // §20: homeowner language, not electrician language. "Is this a 3-way?"
      // means nothing to most people; "can you turn it off from the other end
      // of the room" is something anyone can answer.
      prompt: "Can this light be turned on and off from more than one wall switch?",
      helpText: "For example, one switch at the top of the stairs and another at the bottom.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: q1.id, label: "Yes, it works fine", value: "works_normally", routeAction: "CONTINUE", nextQuestionId: q2.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: q1.id, label: "No — it doesn't work, or works only sometimes", value: "not_working", routeAction: "REROUTE_TROUBLESHOOTING", order: 2, requiredPhotoLabels: [] },
      { questionId: q1.id, label: "I'm not sure", value: "unsure", routeAction: "REROUTE_TROUBLESHOOTING", order: 3, requiredPhotoLabels: [] },
      {
        questionId: q2.id,
        label: "No, just this one switch",
        value: "single_location",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
        disclaimer: CUSTOMER_SUPPLIED_DISCLAIMER,
      },
      {
        questionId: q2.id,
        label: "Yes, there's another switch for the same light",
        value: "multi_location",
        routeAction: "REROUTE_SERVICE",
        rerouteServiceId: threeWay?.id ?? null,
        order: 2,
        requiredPhotoLabels: [],
      },
      {
        // §20 says "quick qualification / review as needed" — a photo of the
        // room's switches settles it without asking them to open anything.
        questionId: q2.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: [
          "The switch you want replaced, plate on — please don't remove it",
          "Any other switches in the room that might control the same light",
        ],
      },
    ],
  });

  console.log(`  ✓ ${slug} — $250 primary / $85 while-we're-there, 3-way reroute wired`);
}

async function main() {
  console.log("Seeding smart-switch and customer-supplied device services...\n");
  await seedSmartSwitch("customer-supplied-smart-switch");
  await seedSmartSwitch("smart-switch-upgrade");
  await seedSuppliedOutlet();
  await seedSuppliedSwitch();
  console.log(`
No photos are required on any normal path (§6 NONE). Faults route to
Troubleshooting rather than selling a part swap that won't fix the problem.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
