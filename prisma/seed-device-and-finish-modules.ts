/**
 * Two reusable modules.
 *
 *   npx tsx prisma/seed-device-and-finish-modules.ts
 *
 * 1. DEVICE REPLACEMENT — replaces "does it currently have power?" across
 *    every outlet, GFCI and switch service.
 *
 *    A failed device and an upstream fault look identical to a homeowner.
 *    Asking whether power is present behind a receptacle is asking them to
 *    diagnose the problem before we arrive — and getting it wrong sends a
 *    working device to Troubleshooting or a dead circuit to a $295 swap.
 *
 *    So the question becomes what they can actually observe: why are you
 *    replacing it?
 *
 * 2. FINISH-ACCESS ACKNOWLEDGEMENT — attached wherever a route lands on
 *    wiring through finished construction.
 *
 *    Two strengths. The softer one covers an accessible route where a small
 *    opening near the panel may still be needed. The stronger one is for a
 *    route with no open path at all, where cutting finished surfaces is a
 *    foreseeable part of the job rather than a possibility.
 *
 *    Both explain WHY the access question was asked — an open route is
 *    cheaper — so it reads as being on the customer's side rather than as
 *    groundwork for a surcharge.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion } from "./_moduleHelpers";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// 1. Device replacement
// ---------------------------------------------------------------------------

const DEVICE_KEY = "device_replacement_reason";

/**
 * Shown on the answers that continue to a replacement. Sets the expectation
 * that the visit can convert, and that the customer won't be charged twice
 * for the electrician pulling out a device to see whether it's the problem.
 */
const DIAGNOSTIC_CONVERSION = [
  "Not sure whether the device itself has failed? That's fine — that's our job.",
  "Your electrician will remove it and test the wiring behind it. If the device is the problem, you pay the replacement price you booked and nothing more.",
  "If the power reaching it isn't right and the fault is somewhere else, we'll stop, explain what we've found, and confirm the price with you before going any further.",
].join(" ");

/** Every service where a device is being swapped at an existing location. */
const DEVICE_SERVICES = [
  "replace-standard-outlet",
  "replace-gfci-outlet",
  "replace-standard-switch",
  "replace-3-way-switch",
  "replace-led-dimmer",
  "usb-outlet-upgrade",
  "smart-outlet-upgrade",
  "occupancy-motion-switch",
  "timer-switch-install",
  "customer-supplied-smart-switch",
  "smart-switch-upgrade",
  "customer-supplied-non-smart-outlet",
  "swap-out-customer-supplied-non-smart-switch",
];

/** Keys this module supersedes — the old "has power" gatekeepers. */
const SUPERSEDED_KEYS = [
  "outlet_has_power",
  "switch_operates_normally",
  "switch_working_now",
];

async function seedDeviceModule(slug: string) {
  const service = await prisma.service.findUnique({
    where: { slug },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  // The old gatekeeper questions are removed, but only after re-pointing
  // anything that referenced them. Deleting a question other answers point at
  // is what produced the dangling references in the lighting trees.
  const superseded = service.questions.filter((q) => SUPERSEDED_KEYS.includes(q.key));
  const survivors = service.questions.filter(
    (q) => !SUPERSEDED_KEYS.includes(q.key) && q.key !== DEVICE_KEY
  );

  const q = await upsertQuestion(prisma, service.id, {
    key: DEVICE_KEY,
    prompt: "Why are you replacing this?",
    helpText: "You don't need to know what's wrong electrically — just tell us what you're seeing.",
    order: 0,
  });

  // Whatever came after the old gatekeeper is where a qualifying answer now
  // hands off. If there's nothing else, it resolves at the published price.
  const handoff = survivors[0];
  const proceed = handoff
    ? { routeAction: "CONTINUE" as const, nextQuestionId: handoff.id }
    : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

  for (let i = 0; i < survivors.length; i++) {
    await prisma.question.update({ where: { id: survivors[i].id }, data: { order: i + 1 } });
  }

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q.id,
        label: "It works — I just want it replaced or upgraded",
        value: "works_upgrading",
        ...proceed,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        // Booked as a diagnostic, not a replacement. If it turns out to be
        // just a dead device, the visit costs less — not more.
        questionId: q.id,
        label: "It stopped working",
        value: "stopped_working",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: DIAGNOSTIC_CONVERSION,
      },
      {
        questionId: q.id,
        label: "It works on and off",
        value: "intermittent",
        ...proceed,
        order: 3,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
        disclaimer: DIAGNOSTIC_CONVERSION,
      },
      {
        questionId: q.id,
        label: "It's damaged, loose, cracked or worn",
        value: "damaged",
        ...proceed,
        order: 4,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        // The one case where sending an electrician expecting a five-minute
        // swap is the wrong dispatch.
        questionId: q.id,
        label: "Something's wrong beyond this one device — a burning smell, sparks, or several things dead",
        value: "broader_problem",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 5,
        requiredPhotoLabels: [],
      },
      {
        questionId: q.id,
        label: "I'm not sure what's wrong",
        value: "unsure",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 6,
        requiredPhotoLabels: [],
        disclaimer: DIAGNOSTIC_CONVERSION,
      },
    ],
  });

  // Smart switches only: an optional make/model capture. Doesn't affect the
  // price — it means the technician can look up whether that model needs a
  // neutral before arriving rather than discovering it in the wall.
  //
  // Deferred until now because TEXT had no renderer; QuestionStep handles it
  // as of this batch.
  if (slug.includes("smart-switch")) {
    const existingModel = service.questions.find((q) => q.key === "smart_switch_model");
    const qModel =
      existingModel ??
      (await prisma.question.create({
        data: {
          serviceId: service.id,
          key: "smart_switch_model",
          prompt: "Which smart switch are you installing?",
          helpText:
            "Make and model if you have it — it's on the box. Skip this if you'd rather; it won't change your price, it just means we can check what it needs before we come out.",
          inputType: "TEXT",
          order: 1,
        },
      }));
    if (existingModel) {
      await prisma.answerOption.deleteMany({ where: { questionId: qModel.id } });
    }

    // "optional" prefix tells the TEXT renderer to offer a skip.
    await prisma.answerOption.create({
      data: {
        questionId: qModel.id,
        label: "Continue",
        value: "optional_not_given",
        routeAction: handoff ? "CONTINUE" : "RESOLVE_INSTANT",
        nextQuestionId: handoff?.id ?? null,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
    });

    // The qualifying answers route through it on the way to whatever came
    // next, so it sits between the reason question and the price.
    await prisma.answerOption.updateMany({
      where: {
        questionId: q.id,
        value: { in: ["works_upgrading", "intermittent", "damaged"] },
      },
      data: { routeAction: "CONTINUE", nextQuestionId: qModel.id },
    });
  }

  // Now safe to remove the superseded questions — nothing routes to them any
  // more, since this module is the entry point.
  for (const old of superseded) {
    await prisma.answerOption.deleteMany({ where: { questionId: old.id } });
    await prisma.question.delete({ where: { id: old.id } });
  }

  console.log(
    `  ✓ ${slug} — device module at Q1` +
      (superseded.length ? `, ${superseded.length} old "has power" question(s) removed` : "")
  );
}

// ---------------------------------------------------------------------------
// 2. Finish-access acknowledgement
// ---------------------------------------------------------------------------

const FINISH_ACK_KEY = "finish_access_ack";

const STRONG_ACK = [
  "This one means running wiring through finished walls or ceilings.",
  "Because there's no attic, unfinished basement, drop ceiling or other open path to work through, your electrician may need to make one or more small openings in drywall or plaster to get the wiring where it needs to go.",
  "Patching, spackling, sanding, painting, wallpaper and trim aren't included in the price unless we've put it in writing.",
  "That's why we asked about attic and basement access — an open route usually avoids these openings and takes less time.",
].join("\n\n");

const SOFT_ACK = [
  "Even with an open path to work through, we may still need to make a small opening in drywall or plaster right above, below or beside your panel — or at the new location — so the cable can get into the finished wall.",
  "Patching, sanding and painting aren't included unless we've put it in writing.",
].join("\n\n");

/**
 * Attach a finish-access acknowledgement to a service, between a qualifying
 * answer and the price.
 *
 * Two answers, not one: agreeing is a real choice, so someone who'd rather
 * have it looked at first needs somewhere to go. A checkbox with only one
 * outcome isn't consent.
 */
export async function attachFinishAck(
  serviceId: string,
  opts: { key?: string; strong: boolean; order: number; nextQuestionId: string | null }
) {
  const q = await upsertQuestion(prisma, serviceId, {
    key: opts.key ?? FINISH_ACK_KEY,
    prompt: "Before we price this — one thing about access",
    helpText: opts.strong ? STRONG_ACK : SOFT_ACK,
    order: opts.order,
  });

  const proceed = opts.nextQuestionId
    ? { routeAction: "CONTINUE" as const, nextQuestionId: opts.nextQuestionId }
    : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q.id,
        label: "I understand — go ahead",
        value: "accepted",
        ...proceed,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: q.id,
        label: "I'd rather Elite take a look first",
        value: "review_first",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: [],
      },
    ],
  });

  return q;
}

async function main() {
  console.log("Device replacement module...\n");
  for (const slug of DEVICE_SERVICES) await seedDeviceModule(slug);

  console.log(`
The "does it have power?" question is gone from all of these. A homeowner
can't be expected to know whether voltage is present behind a device, and
guessing wrong sent working devices to diagnostics and dead circuits to
a $295 swap.

attachFinishAck() is exported for the trees that need it; the acknowledgement
wording lives here so it can't drift between services.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
