/**
 * Content fixes — items 1, 2, 5, 6, 8, 9, 10, 11.
 *
 *   npx tsx prisma/seed-content-fixes.ts
 *
 * Run AFTER seed-access-normalization.ts and seed-materials.ts.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";

const prisma = new PrismaClient();

/**
 * Disclaimers that must survive a tree rebuild.
 *
 * These lived on answers, and answers are what modules delete and recreate.
 * The device-replacement module superseded three question keys across four
 * services and took their disclaimers with them — including the smart-switch
 * neutral warning and the customer-supplied-device terms, which is the text
 * promising to quote before doing extra work.
 *
 * On the service record they render on the confirmation screen and can't be
 * dropped by a module that doesn't know about them.
 */
const SERVICE_DESCRIPTIONS: { slug: string; text: string }[] = [
  {
    // The menu should draw the same line the flow does. Someone browsing
    // sees these two next to each other with no idea why one costs $240
    // more, picks the cheaper, and finds out on the day that their freezer
    // needed the other one.
    slug: "new-120v-outlet",
    text:
      "A new outlet where you need one, powered from the nearest circuit. Right for everyday things — lamps, a TV, chargers, a computer. If it's for a fridge, freezer, air conditioner or anything that heats, that needs its own circuit: see Dedicated Circuit & Outlet.",
  },
  {
    slug: "dedicated-120v-circuit-outlet",
    text:
      "An outlet with its own circuit run from the panel, so nothing else can trip it. Needed for a fridge, freezer, window air conditioner, microwave, space heater or shop equipment — and worth choosing anyway if the outlets nearby already give you trouble.",
  },
  {
    // POLICY[pendant_classification]: STANDARD_FIXTURE
    //
    // Pendants belong here, and saying so matters. A homeowner with a
    // hanging pendant may reasonably think "chandelier" — it hangs, it's
    // decorative — and end up in a service costing twice as much for work
    // that's the same as a flush mount.
    //
    // The route is still decided by the fixture's characteristics rather
    // than its name. This just stops the word sending people the wrong way
    // before any question gets asked.
    slug: "replace-interior-light-fixture",
    text:
      "Taking down your existing ceiling light and putting up a new one you've bought, in the same spot. Flush mounts, semi-flush, and pendants all belong here. For something larger or more decorative — multiple tiers, a lot of crystals — use Replace an Existing Chandelier instead.",
  },
];

const SERVICE_DISCLAIMERS: { slug: string; text: string }[] = [
  {
    // The price includes the switch, and saying so is the difference between
    // $330 reading as expensive and reading as fair. It also distinguishes
    // this from the customer-supplied version, which is a different service
    // at a different price.
    slug: "smart-switch-upgrade",
    text:
      "This price includes the smart switch — we supply and install it. If you'd rather use one you've already bought, book the customer-supplied version instead and we'll fit yours.",
  },
  {
    slug: "customer-supplied-smart-switch",
    text:
      "Most smart switches work with the wiring already at your switch. Some models need a neutral wire or other specific wiring that may not be there, particularly in older homes. If your electrician finds that additional wiring or other work is needed, we'll explain the options and give you the price before doing any of it.",
  },
  {
    slug: "smart-switch-upgrade",
    text:
      "Most smart switches work with the wiring already at your switch. Some models need a neutral wire or other specific wiring that may not be there, particularly in older homes. If your electrician finds that additional wiring or other work is needed, we'll explain the options and give you the price before doing any of it.",
  },
  {
    slug: "customer-supplied-non-smart-outlet",
    text:
      "Please have your device on hand, complete and undamaged, and suitable for where it's going. If the device or the existing wiring turns out to need additional work, we'll explain the options and give you the price before proceeding.",
  },
  {
    slug: "swap-out-customer-supplied-non-smart-switch",
    text:
      "Please have your device on hand, complete and undamaged, and suitable for where it's going. If the device or the existing wiring turns out to need additional work, we'll explain the options and give you the price before proceeding.",
  },
];

/** Ceiling-location labor. Excludes switch/switch-leg work — that's a separate component. */
const CEILING = [
  // 1.25 accessible -> 1.75 finished, so the premium is half an hour. The
  // accessible base is set by seed-labor-hours.ts; this only carries the
  // difference.
  { key: "NEW_CEILING_LIGHT_FINISHED", name: "New ceiling light — finished ceiling premium", label: "Finished-ceiling installation", hrs: 0.5, mins: 30, price: 12500, slug: "new-ceiling-light", accHrs: 1.25, accMins: 75 },
  { key: "NEW_CEILING_FAN_FINISHED", name: "New ceiling fan — finished ceiling premium", label: "Finished-ceiling installation", hrs: 0.5, mins: 30, price: 12500, slug: "new-ceiling-fan", accHrs: 1.75, accMins: 105 },
];

const CEILING_REVIEW_PHOTOS = [
  "The ceiling where the light or fan is going",
  "A wider photo of the whole room",
];

async function main() {
  // ---- 5. disclaimers onto the service record --------------------------
  for (const d of SERVICE_DESCRIPTIONS) {
    const svc = await prisma.service.findUnique({ where: { slug: d.slug } });
    if (!svc) {
      console.log(`  ! ${d.slug} not found`);
      continue;
    }
    await prisma.service.update({
      where: { id: svc.id },
      data: { shortDescription: d.text },
    });
    console.log(`  ✓ ${d.slug} — description mentions pendants`);
  }

  for (const d of SERVICE_DISCLAIMERS) {
    const svc = await prisma.service.findUnique({ where: { slug: d.slug } });
    if (!svc) {
      console.log(`  – ${d.slug} not in the catalog`);
      continue;
    }
    await prisma.service.update({ where: { id: svc.id }, data: { disclaimer: d.text } });
  }
  console.log(`  ✓ ${SERVICE_DISCLAIMERS.length} disclaimers restored to service records`);

  // ---- 1. exterior GFCI: fiber cement and stucco book ------------------
  const gfciWall = await prisma.question.findFirst({
    where: { key: "gfci_wall_finish", service: { slug: "exterior-gfci-standard" } },
  });
  if (gfciWall) {
    const prep = [
      "Where you'd like the outdoor outlet, with enough of the wall around it to see the siding",
      "The indoor outlet on the other side of that wall",
    ];
    await prisma.answerOption.updateMany({
      where: { questionId: gfciWall.id, value: { in: ["fiber_cement", "stucco"] } },
      data: {
        photosBlockBooking: false,
        requiredPhotoLabels: prep,
        approvedComponentPriceCents: 0,
        disclaimer:
          "Your price is set — the photos just mean we arrive with the right box and know what we're cutting into.",
      },
    });
    console.log(`  ✓ exterior GFCI — fiber cement and stucco now book instantly`);
  }

  // ---- 2. New 120V Outlet: drop "No", add slab -------------------------
  const finishedBoth = await prisma.question.findFirst({
    where: { key: "finished_space_both_sides", service: { slug: "new-120v-outlet" } },
    include: { options: true, service: { select: { id: true } } },
  });
  if (finishedBoth) {
    await prisma.question.update({
      where: { id: finishedBoth.id },
      data: {
        // "No" made no sense here — the only way to reach this question is
        // having already said there's no attic or basement. Slab folded into
        // the prompt because it's the same job: no path below, fish the wall.
        prompt:
          "Is there finished living space directly above and/or below this wall, or is the room on a slab?",
        helpText:
          "Either way we'd be running the wire inside the finished wall. We're checking there's nothing unusual behind it.",
      },
    });

    const ack = await prisma.question.findFirst({
      where: { key: "outlet_finish_ack", serviceId: finishedBoth.service.id },
    });
    const onward = ack
      ? { routeAction: "CONTINUE" as const, nextQuestionId: ack.id }
      : { routeAction: "RESOLVE_ADJUSTED" as const, nextQuestionId: null };

    await prisma.answerOption.deleteMany({ where: { questionId: finishedBoth.id } });
    await prisma.answerOption.createMany({
      data: [
        {
          questionId: finishedBoth.id,
          label: "Yes — finished space above or below, or the room's on a slab",
          value: "finished_both_sides",
          accessClassification: "FINISHED",
          ...onward,
          order: 1,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: 0,
        },
        {
          // An exterior wall is different work — insulation, fire blocking,
          // sometimes masonry behind the drywall. Not priced blind.
          questionId: finishedBoth.id,
          label: "It's an exterior wall",
          value: "exterior_wall",
          accessClassification: "UNKNOWN",
          routeAction: "PHOTO_REVIEW",
          photosBlockBooking: true,
          order: 2,
          requiredPhotoLabels: [
            "The wall where the new outlet is going, floor to ceiling",
            "A wider photo of the room",
          ],
        },
        {
          questionId: finishedBoth.id,
          label: "I'm not sure",
          value: "unsure",
          accessClassification: "UNKNOWN",
          routeAction: "PHOTO_REVIEW",
          photosBlockBooking: true,
          order: 3,
          requiredPhotoLabels: [
            "The wall where the new outlet is going, floor to ceiling",
            "A wider photo of the room",
          ],
        },
      ],
    });
    console.log(`  ✓ new-120v-outlet — finished-space question reworded, "No" removed`);
  }

  // ---- 9 + 10. ceiling access and derived premiums ---------------------
  for (const c of CEILING) {
    const service = await prisma.service.findUnique({
      where: { slug: c.slug },
      include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
    });
    if (!service) continue;

    await prisma.jobComponent.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        customerFacingLabel: c.label,
        approvedPriceCents: c.price,
        addFieldLaborHours: c.hrs,
        addMaterialCostCents: 0,
        addScheduleMinutes: c.mins,
      },
      create: {
        key: c.key,
        name: c.name,
        customerFacingLabel: c.label,
        approvedPriceCents: c.price,
        addFieldLaborHours: c.hrs,
        addMaterialCostCents: 0,
        addScheduleMinutes: c.mins,
      },
    });

    await prisma.service.update({
      where: { id: service.id },
      data: {
        fieldLaborHours: c.accHrs,
        estimatedMinutes: c.accMins,
        estimatedMinutesReviewed: true,
      },
    });

    // The flat +$100 lived on this service's own attic_access answer.
    const access = service.questions.find((q) => q.key === "attic_access");
    if (access) {
      const no = access.options.find((o) => o.value === "no_access");
      if (no) {
        await prisma.answerOptionComponent.deleteMany({ where: { answerOptionId: no.id } });
        await prisma.answerOptionComponent.create({
          data: {
            answerOptionId: no.id,
            componentId: (await prisma.jobComponent.findUniqueOrThrow({ where: { key: c.key } })).id,
          },
        });
        await prisma.answerOption.update({
          where: { id: no.id },
          data: { priceModifierCents: 0, approvedComponentPriceCents: null, disclaimer: null },
        });
      }
      console.log(`  ✓ ${c.slug} — flat $100 replaced by a ${c.hrs} hr component (+$${c.price / 100})`);
    }
  }

  // ---- 9. Fan Replacing Existing Light has no access question ----------
  const frl = await prisma.service.findUnique({
    where: { slug: "fan-replacing-light" },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (frl && !frl.questions.some((q) => q.key === "ceiling_access" || q.key === "attic_access")) {
    // It began as a flat-price service with no questions at all, so when the
    // modules attached, nothing ever established an access class. Every
    // component conditioned on one found no match, and an answer declaring
    // components that match none goes to review — which is why every route
    // through this service was quoting.
    const below = frl.questions.find((q) => q.key === "work_area_below");
    const control = frl.questions.find((q) => q.key === "lighting_control");

    const qAccess = await upsertQuestion(prisma, frl.id, {
      key: "ceiling_access",
      prompt: "What's directly above that ceiling?",
      helpText:
        "An open attic lets us run wiring without opening the ceiling up. Finished space above means more work.",
      order: (below?.order ?? 1) + 1,
    });

    const onward = control
      ? { routeAction: "CONTINUE" as const, nextQuestionId: control.id }
      : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

    await prisma.answerOption.createMany({
      data: [
        { questionId: qAccess.id, label: "An attic or open space we can get into", value: "accessible", accessClassification: "ACCESSIBLE", ...onward, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
        { questionId: qAccess.id, label: "Finished space — another floor or a finished room", value: "finished", accessClassification: "FINISHED", ...onward, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
        { questionId: qAccess.id, label: "I'm not sure", value: "unsure", accessClassification: "UNKNOWN", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: CEILING_REVIEW_PHOTOS },
      ],
    });

    if (below) {
      await prisma.answerOption.updateMany({
        where: { questionId: below.id, routeAction: "CONTINUE" },
        data: { nextQuestionId: qAccess.id },
      });
    }
    console.log(`  ✓ fan-replacing-light — ceiling access question added; switch legs can price again`);
  }

  // ---- 11. troubleshooting ---------------------------------------------
  const ts = await prisma.service.findUnique({ where: { slug: "electrical-troubleshooting" } });
  if (ts) {
    await prisma.service.update({
      where: { id: ts.id },
      data: {
        // basePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
        // No publishedPriceApprovedAt here.
      //
      // This seed sets a price you approved in conversation, which is
      // allowed — but stamping the approval field would be the script
      // recording consent it was never given. Once that's in the data
      // there's no way to tell an owner-approved price from one a
      // calculation invented, which is how the recessed base moved
      // without anyone deciding it should.
      //
      // Approval happens in the admin, or in one explicit reconciliation
      // migration. Not here.
        shortDescription:
          "Something not working and you're not sure why? We'll find out. The visit covers up to an hour of diagnostic and repair time — if we can fix it in that hour, that's the price.",
        // Unknown scope is charged by time; known scope is a fixed price.
        // Billing the half hour after the problem is identified is exactly
        // the clock-watching the rest of the site exists to avoid.
        disclaimer:
          "Your $249 visit includes up to 60 minutes of diagnostic and repair time. If we find the problem and can fix it within that time, you'll only pay for any materials used. If more diagnostic time is needed, your electrician will explain what they've found and get your approval before continuing at $100 per additional 30 minutes. Once we know what's wrong, we'll either finish a small repair within the time you've already approved, or give you a fixed price before doing any additional work.",
      },
    });
    console.log(`  ✓ electrical-troubleshooting — $249, repair included within the first hour`);
  }

  // ---- report ----------------------------------------------------------
  console.log();
  for (const slug of ["new-120v-outlet", "new-ceiling-light", "new-ceiling-fan", "fan-replacing-light", "exterior-gfci-standard"]) {
    const s = await prisma.service.findUnique({ where: { slug } });
    if (!s) continue;
    const d = await findDanglingReferences(prisma, s.id);
    const u = await findUnreachableQuestions(prisma, s.id);
    if (d.length || u.length) {
      console.log(`  ! ${slug}` + (d.length ? `  DANGLING: ${d.join(", ")}` : "") + (u.length ? `  UNREACHABLE: ${u.join(", ")}` : ""));
    }
  }
  console.log(`
  New Ceiling Light   1.5 hr $375 accessible    2.0 hr $500 finished
  New Ceiling Fan    1.75 hr $440 accessible   2.25 hr $565 finished

  Both premiums are half an hour at $125, replacing the flat $100. Neither
  includes switch or switch-leg work — that stacks separately so a finished
  fan needing a new switch is $565 plus the switch-leg component, not one
  blended number.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
