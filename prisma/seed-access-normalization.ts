/**
 * Access-contract normalization + distance-banded switch legs.
 *
 *   npx tsx prisma/seed-access-normalization.ts
 *
 * TWO PROBLEMS, ONE ROOT CAUSE.
 *
 * Six questions across the catalog ask whether there's an open path to run
 * wiring, using three different answer vocabularies:
 *
 *   attic_access            has_access / no_access / unsure
 *   ceiling_access          accessible / finished / unsure
 *   below_above_access      has_access / no_access
 *   outlet_access           (its own)
 *   attic_basement_access   (its own)
 *   dedicated_route_access  unfinished_basement / drop_ceiling / ... (seven)
 *
 * Switch-leg components conditioned on the string "accessible", so an answer
 * of "has_access" never matched. New Ceiling Light, New Ceiling Fan and Fan
 * Replacing Existing Light have been silently sending every switch-leg route
 * to photo review instead of pricing it.
 *
 * The fix isn't renaming keys — the VALUES disagree too. Instead each ANSWER
 * declares what it means, and components condition on that meaning. Raw values
 * keep their detail, so a job sheet still says "unfinished basement" while the
 * pricing engine sees ACCESSIBLE.
 *
 * The distance bands then become possible: a switch leg's cost depends on
 * access AND run length, and both dimensions resolve from one classification
 * plus one distance answer.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";

const prisma = new PrismaClient();

/**
 * Every access answer in the catalog, and what it means.
 *
 * Keyed by question key, then by answer value. Anything not listed keeps a
 * null classification and fails safe — components stay unmatched and the
 * route goes to review rather than guessing a variant.
 */
const CLASSIFICATIONS: Record<string, Record<string, "ACCESSIBLE" | "FINISHED" | "UNKNOWN">> = {
  attic_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  ceiling_access: { accessible: "ACCESSIBLE", finished: "FINISHED", unsure: "UNKNOWN" },
  below_above_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  outlet_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  attic_basement_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  dedicated_route_access: {
    // Four ways of saying "there's an open path". Kept as separate answers so
    // the job sheet knows which — a drop ceiling means moving tiles, an attic
    // means a crawl — but all four price identically.
    unfinished_basement: "ACCESSIBLE",
    drop_ceiling: "ACCESSIBLE",
    accessible_attic: "ACCESSIBLE",
    combination: "ACCESSIBLE",
    finished_route: "FINISHED",
    no_accessible_route: "FINISHED",
    unsure: "UNKNOWN",
  },
  // The New 120V Outlet follow-up. Reached only after no_access, so "yes,
  // finished on both sides" confirms FINISHED rather than adding a third state.
  finished_space_both_sides: {
    finished_both_sides: "FINISHED",
    not_finished_both_sides: "UNKNOWN",
    unsure: "UNKNOWN",
  },
};

/**
 * Switch-leg labor by access class and run length.
 *
 * Another 10 ft through an open attic costs little once the technician is set
 * up — 0.25 of an hour. The same 10 ft through finished construction can mean
 * another framing bay, more drilling, another access opening: 0.5 of an hour.
 * Over 20 ft the variability outruns a fixed price either way.
 */
const SWITCHLEG = [
  { key: "SWITCHLEG_ACCESSIBLE_UNDER_10", name: "Switch leg — open route, under 10 ft", label: "New wall switch and control wiring", hrs: 1.0, mat: 3500, mins: 60, price: 30000 },
  { key: "SWITCHLEG_ACCESSIBLE_10_20", name: "Switch leg — open route, 10 to 20 ft", label: "New wall switch and control wiring", hrs: 1.25, mat: 3500, mins: 75, price: 36000 },
  { key: "SWITCHLEG_FINISHED_UNDER_10", name: "Switch leg — finished walls, under 10 ft", label: "New wall switch and control wiring", hrs: 1.5, mat: 4500, mins: 90, price: 43500 },
  { key: "SWITCHLEG_FINISHED_10_20", name: "Switch leg — finished walls, 10 to 20 ft", label: "New wall switch and control wiring", hrs: 2.0, mat: 4500, mins: 120, price: 56000 },
];

const DISTANCE_KEY = "switch_leg_distance";
const LIGHTING_SERVICES = ["new-ceiling-light", "new-ceiling-fan", "fan-replacing-light", "recessed-lighting"];

/**
 * Shown before the customer accepts a finished-space price. Explains WHY the
 * access question was asked — an open route is cheaper — so it reads as being
 * on their side rather than as groundwork for a surcharge.
 */
const FINISHED_DISCLAIMER = [
  "There's no attic, basement or drop ceiling to run this through, so your electrician will be fishing the wiring through finished walls or ceilings.",
  "That usually means one or more small openings in the drywall or plaster. Patching, sanding, painting, wallpaper and trim aren't included unless we've put it in writing.",
  "That's why we asked about attic and basement access — an open route avoids these openings and takes less time.",
].join("\n\n");

async function classifyAnswers() {
  let classified = 0;
  const unmapped: string[] = [];

  for (const [questionKey, values] of Object.entries(CLASSIFICATIONS)) {
    const questions = await prisma.question.findMany({
      where: { key: questionKey },
      include: { options: true, service: { select: { slug: true } } },
    });

    for (const q of questions) {
      for (const o of q.options) {
        const cls = values[o.value];
        if (!cls) {
          unmapped.push(`${q.service.slug}/${questionKey} = "${o.value}"`);
          continue;
        }
        await prisma.answerOption.update({
          where: { id: o.id },
          data: { accessClassification: cls },
        });
        classified++;
      }
    }
  }

  console.log(`  ✓ ${classified} access answer(s) classified`);
  if (unmapped.length) {
    console.log(`  ! ${unmapped.length} unmapped — these stay null and fail safe to review:`);
    for (const u of unmapped) console.log(`      ${u}`);
  }
}

async function seedSwitchLegComponents() {
  for (const c of SWITCHLEG) {
    await prisma.jobComponent.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        customerFacingLabel: c.label,
        approvedPriceCents: c.price,
        addFieldLaborHours: c.hrs,
        addMaterialCostCents: c.mat,
        addScheduleMinutes: c.mins,
      },
      create: {
        key: c.key,
        name: c.name,
        customerFacingLabel: c.label,
        approvedPriceCents: c.price,
        addFieldLaborHours: c.hrs,
        addMaterialCostCents: c.mat,
        addScheduleMinutes: c.mins,
      },
    });
  }
  console.log(`  ✓ ${SWITCHLEG.length} distance-banded switch-leg components defined`);
}

/**
 * Insert the distance question between "yes, there's an outlet near the new
 * switch" and the dimmer question, and move the components onto it.
 *
 * They used to hang off the near-power answer with only two variants and no
 * distance dimension — which is where the flat $100 finished surcharge came
 * from. That figure predated the labor model entirely and undercharged the
 * finished branch by $35 to $160.
 */
async function attachDistanceBands(slug: string) {
  const service = await prisma.service.findUnique({
    where: { slug },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  const nearPower = service.questions.find((q) => q.key === "switch_near_power");
  const dimmer = service.questions.find((q) => q.key === "lighting_dimmer_upgrade");
  if (!nearPower) {
    console.log(`  – ${slug} — no switch_near_power question; run seed-lighting-control first`);
    return;
  }

  const qDist = await upsertQuestion(prisma, service.id, {
    key: DISTANCE_KEY,
    prompt: "About how far is the new switch from the light?",
    helpText: "Roughly the path the wire would take, not the straight line across the room.",
    order: nearPower.order + 1,
  });

  const proceed = dimmer
    ? { routeAction: "CONTINUE" as const, nextQuestionId: dimmer.id }
    : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

  await prisma.answerOption.createMany({
    data: [
      { questionId: qDist.id, label: "Less than 10 feet", value: "under_10", ...proceed, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: qDist.id, label: "10 to 20 feet", value: "10_to_20", ...proceed, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      // Past 20 ft through finished construction the variability outruns a
      // fixed price. Same cap reasoning as the dedicated circuit at 50 ft.
      { questionId: qDist.id, label: "More than 20 feet", value: "over_20", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: [] },
      { questionId: qDist.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: [] },
    ],
  });

  // Each distance answer carries both access variants; the classification
  // established earlier picks which applies. No re-asking (§29).
  const comp = async (k: string) =>
    (await prisma.jobComponent.findUniqueOrThrow({ where: { key: k } })).id;

  for (const [value, accKey, finKey] of [
    ["under_10", "SWITCHLEG_ACCESSIBLE_UNDER_10", "SWITCHLEG_FINISHED_UNDER_10"],
    ["10_to_20", "SWITCHLEG_ACCESSIBLE_10_20", "SWITCHLEG_FINISHED_10_20"],
  ] as const) {
    const opt = await prisma.answerOption.findFirstOrThrow({
      where: { questionId: qDist.id, value },
    });
    await prisma.answerOptionComponent.createMany({
      data: [
        { answerOptionId: opt.id, componentId: await comp(accKey), conditionAccessClass: "ACCESSIBLE" },
        { answerOptionId: opt.id, componentId: await comp(finKey), conditionAccessClass: "FINISHED" },
      ],
    });
    // The finished branch cuts drywall, so say so before they accept it.
    await prisma.answerOption.update({
      where: { id: opt.id },
      data: { disclaimer: FINISHED_DISCLAIMER },
    });
  }

  // Point the near-power "yes" at the distance question, and strip the old
  // undifferentiated components off it.
  const yes = nearPower.options.find((o) => o.value === "yes");
  if (yes) {
    await prisma.answerOptionComponent.deleteMany({ where: { answerOptionId: yes.id } });
    await prisma.answerOption.update({
      where: { id: yes.id },
      data: { routeAction: "CONTINUE", nextQuestionId: qDist.id, approvedComponentPriceCents: 0 },
    });
  }

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  console.log(
    `  ✓ ${slug} — distance bands attached` +
      (dangling.length ? `  [DANGLING: ${dangling.join(", ")}]` : "") +
      (unreachable.length ? `  [UNREACHABLE: ${unreachable.join(", ")}]` : "")
  );
}

async function main() {
  console.log("Normalizing the access contract...\n");
  await classifyAnswers();
  console.log();
  await seedSwitchLegComponents();
  console.log();
  for (const slug of LIGHTING_SERVICES) await attachDistanceBands(slug);

  console.log(`
Components now condition on what an answer MEANS, not on how its question was
worded. New Ceiling Light, New Ceiling Fan and Fan Replacing Existing Light
can instant-price a switch leg again.

Switch leg:   open route  $300 under 10 ft, $360 at 10-20 ft
              finished    $435 under 10 ft, $560 at 10-20 ft
              over 20 ft or unsure -> photo review

The flat $100 finished surcharge is gone. It predated the labor model and
undercharged the finished branch by $35 to $160.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
