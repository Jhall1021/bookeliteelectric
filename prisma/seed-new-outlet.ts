/**
 * New 120V Outlet — distance-banded pricing + finish acknowledgement.
 *
 *   npx tsx prisma/seed-new-outlet.ts
 *
 * Replaces the inherited flat +$100 finished-space modifier. That figure
 * predated the labor model and charged the same hundred dollars whether the
 * run was six feet or nineteen — so a job with an extra hour of fishing in it
 * was sold for the same premium as one with ten minutes.
 *
 * Same shape as the switch-leg bands: access class and run length are two
 * dimensions, and one answer carries both variants conditioned on the
 * classification established earlier, so nobody is asked about attic access
 * twice.
 *
 * The base price stays at the published $445. The model computes $280 for a
 * one-hour job with $21.80 of material, and that gap is a separate
 * conversation — it wants field data, not arithmetic. Flagged rather than
 * quietly repriced.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";
import {
  eliteContractorId,
  upsertComponent,
  componentIdByKey,
} from "./_componentHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

const SLUG = "new-120v-outlet";
const DISTANCE_KEY = "outlet_run_distance";
const FINISH_ACK_KEY = "outlet_finish_ack";

/**
 * Increments measured from the accessible, under-10-ft case, which is what
 * the base price covers.
 *
 * Material: another 10 ft of 14/2 at $0.50/ft is $5 of cable, marking up to
 * $6.50.
 *
 * This used to need care: under the old band rule a $5 delta landed in the
 * 3.00x band and sold for fifteen, so the markup had to be applied to the
 * whole allowance instead of the difference. The progressive rule removes
 * that trap — 30% is 30% whether the package is $5 or $500 — and the
 * assembled-package rule means it's applied once either way.
 */
const COMPONENTS = [
  {
    // Zero-cost, and it has to exist — see the exterior GFCI seed for the
    // full reasoning. Without an ACCESSIBLE variant on the under-10-ft
    // answer, an open-route customer declares one component, matches none,
    // and gets sent to review instead of the $445 base price.
    key: "OUTLET_RUN_ACCESSIBLE_UNDER_10",
    name: "New outlet — open route, under 10 ft",
    customerFacingLabel: null,
    approvedPriceCents: 0,
    addFieldLaborHours: 0,
    addMaterialCostCents: 0,
    addScheduleMinutes: 0,
    notes: "The base case. Exists so the accessible route matches something.",
  },
  {
    key: "OUTLET_RUN_ACCESSIBLE_10_20",
    name: "New outlet — open route, 10 to 20 ft",
    customerFacingLabel: "Longer wiring run",
    approvedPriceCents: 7000,
    addFieldLaborHours: 0.25,
    addMaterialCostCents: 500,
    addScheduleMinutes: 15,
    notes: "0.25 hr over the base run, plus 10 ft of cable.",
  },
  {
    key: "OUTLET_RUN_FINISHED_UNDER_10",
    name: "New outlet — finished walls, under 10 ft",
    customerFacingLabel: "Fishing through finished walls",
    approvedPriceCents: 12500,
    addFieldLaborHours: 0.5,
    addMaterialCostCents: 0,
    addScheduleMinutes: 30,
    notes: "1.5 hr finished vs 1.0 accessible. Same cable, more time.",
  },
  {
    key: "OUTLET_RUN_FINISHED_10_20",
    name: "New outlet — finished walls, 10 to 20 ft",
    customerFacingLabel: "Fishing through finished walls",
    approvedPriceCents: 26000,
    addFieldLaborHours: 1.0,
    addMaterialCostCents: 500,
    addScheduleMinutes: 60,
    notes: "2.0 hr finished vs 1.0 accessible, plus 10 ft of cable.",
  },
];

const FINISH_ACK_TEXT = [
  "With no attic, basement or drop ceiling to work through, the wiring for this outlet has to be fished through finished walls.",
  "Your electrician will likely need to make one or more openings in the drywall or plaster to get the cable across. We keep them small and put them where they're least visible, but on a finished wall they usually can't be avoided entirely.",
  "Patching, spackling, sanding, painting, wallpaper and trim aren't included unless we've put it in writing.",
  "That's why we asked about attic and basement access — an open route usually means no openings at all and less time on site.",
].join("\n\n");

const REVIEW_PHOTOS = [
  "The wall where the new outlet is going, floor to ceiling",
  "The outlet or panel we'd be running the power from",
  "A wider photo of the room",
];

async function main() {
  const contractorId = await eliteContractorId(prisma);
  for (const c of COMPONENTS) {
    await upsertComponent(prisma, contractorId, c);
  }
  console.log(`  ✓ ${COMPONENTS.length} distance components defined`);

  const service = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log(`  – ${SLUG} not in the catalog`);
    return;
  }

  const access = service.questions.find((q) => q.key === "below_above_access");
  const finishedBoth = service.questions.find((q) => q.key === "finished_space_both_sides");
  if (!access) {
    console.log(`  – ${SLUG} has no access question; nothing to band`);
    return;
  }

  const lastOrder = Math.max(...service.questions.map((q) => q.order));

  const qAck = await upsertQuestion(prisma, service.id, {
    key: FINISH_ACK_KEY,
    prompt: "Before we price this — one thing about your walls",
    helpText: FINISH_ACK_TEXT,
    order: lastOrder + 1,
  });

  const qDistance = await upsertQuestion(prisma, service.id, {
    key: DISTANCE_KEY,
    prompt: "About how far is the new outlet from the power we'd run it from?",
    helpText:
      "Roughly the path the wire would take — through the basement or attic, or across the wall — rather than the straight line across the room.",
    order: lastOrder + 2,
  });

  // --- distance answers -------------------------------------------------
  // Both variants on each answer, conditioned on the access classification
  // established earlier. Past 20 ft the variability outruns a fixed price,
  // same cap reasoning as the switch leg at 20 ft and the dedicated circuit
  // at 50 ft.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qDistance.id, label: "Less than 10 feet", value: "under_10", routeAction: "RESOLVE_ADJUSTED", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: qDistance.id, label: "10 to 20 feet", value: "10_to_20", routeAction: "RESOLVE_ADJUSTED", order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: qDistance.id, label: "More than 20 feet", value: "over_20", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qDistance.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  const comp = async (k: string) =>
    await componentIdByKey(prisma, k);

  // Under 10 ft on an open route is the base price, so it carries no
  // component — an answer with no components resolves at the accumulated
  // total, which is exactly right.
  const under10 = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDistance.id, value: "under_10" },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: under10.id, canonicalComponentId: await comp("OUTLET_RUN_ACCESSIBLE_UNDER_10"), conditionAccessClass: "ACCESSIBLE" },
      { answerOptionId: under10.id, canonicalComponentId: await comp("OUTLET_RUN_FINISHED_UNDER_10"), conditionAccessClass: "FINISHED" },
    ],
  });

  const d10_20 = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDistance.id, value: "10_to_20" },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: d10_20.id, canonicalComponentId: await comp("OUTLET_RUN_ACCESSIBLE_10_20"), conditionAccessClass: "ACCESSIBLE" },
      { answerOptionId: d10_20.id, canonicalComponentId: await comp("OUTLET_RUN_FINISHED_10_20"), conditionAccessClass: "FINISHED" },
    ],
  });

  // --- acknowledgement --------------------------------------------------
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qAck.id,
        label: "I understand — go ahead",
        value: "accepted",
        routeAction: "CONTINUE",
        nextQuestionId: qDistance.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qAck.id,
        label: "I'd rather Elite take a look first",
        value: "review_first",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  // --- rewire the existing tree ------------------------------------------
  // Accessible goes straight to the distance question. Finished passes
  // through the acknowledgement first — cutting drywall is foreseeable there,
  // and the customer should accept it before seeing a price rather than after.
  // The exterior-wall question, if seed-conditional-disclaimers has inserted
  // one, sits BETWEEN the access answer and the distance question. Pointing
  // has_access straight at distance would orphan it — which is exactly what
  // happened the first time these two seeds ran in the wrong order.
  //
  // Two seeds writing the same nextQuestionId is the recurring shape of this
  // bug. Each has to know what the other might have put there.
  const exteriorWall = service.questions.find((q) => q.key === "device_on_exterior_wall");
  const afterAccess = exteriorWall ?? qDistance;

  await prisma.answerOption.updateMany({
    where: { questionId: access.id, value: "has_access" },
    data: {
      routeAction: "CONTINUE",
      nextQuestionId: afterAccess.id,
      priceModifierCents: 0,
      approvedComponentPriceCents: 0,
    },
  });

  // And if it exists, make sure it still leads onward to the distance
  // question rather than wherever it pointed before this seed ran.
  if (exteriorWall) {
    await prisma.answerOption.updateMany({
      where: { questionId: exteriorWall.id, routeAction: "CONTINUE" },
      data: { nextQuestionId: qDistance.id },
    });
    console.log(`  · exterior-wall question preserved between access and distance`);
  }

  if (finishedBoth) {
    // "Yes, finished on both sides" was the +$100 branch. The hundred goes;
    // the distance components price it now.
    await prisma.answerOption.updateMany({
      where: { questionId: finishedBoth.id, value: "finished_both_sides" },
      data: {
        routeAction: "CONTINUE",
        nextQuestionId: qAck.id,
        priceModifierCents: 0,
        approvedComponentPriceCents: 0,
        disclaimer: null,
      },
    });
  }

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  if (unreachable.includes("device_on_exterior_wall")) {
    console.log(`  ! the exterior-wall question is orphaned — run seed-conditional-disclaimers.ts`);
  }
  console.log(
    `  ✓ ${SLUG} — distance bands and acknowledgement wired` +
      (dangling.length ? `  [DANGLING: ${dangling.join(", ")}]` : "") +
      (unreachable.length ? `  [UNREACHABLE: ${unreachable.join(", ")}]` : "")
  );
  console.log(`
  accessible, under 10 ft    $445   (base, unchanged)
  accessible, 10-20 ft       $515   +$70
  finished, under 10 ft      $570   +$125
  finished, 10-20 ft         $705   +$260
  over 20 ft or unsure       photo review

  The flat +$100 is gone. It charged the same premium for six feet as for
  nineteen. Base price left at the published $445 — the model computes $280
  for a one-hour job, and that gap wants field data rather than arithmetic.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
