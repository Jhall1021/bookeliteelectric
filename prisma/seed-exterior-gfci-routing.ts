/**
 * Exterior GFCI — Other Routing.
 *
 *   npx tsx prisma/seed-exterior-gfci-routing.ts
 *
 * This service had no tree at all. It's the destination for "there's no
 * outlet behind that wall" on the back-to-back service, and it fell through
 * to the flow engine's generic two-photo request — "photo of the area" and
 * "your electrical panel" — which tells the office almost nothing about an
 * exterior run.
 *
 * It's the New 120V Outlet job with an exterior device on the end, so it uses
 * the same access-and-distance matrix. The deltas are identical (+0.25 for a
 * longer accessible run, +0.5 for finished, +1.0 for both); only the starting
 * point differs.
 *
 * WHY THE BASE IS 1.5 AND NOT 1.0
 *
 * The outlet matrix starts at 1.0 for an interior receptacle. This job ends
 * in a weatherproof box on an outside wall — the same device work as the
 * back-to-back service, which is 1.5 hours — plus the run. Starting at 1.0
 * would price the harder job below the easier one.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { publishIfUnset, describePriceResult } from "./_priceGuard";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";
import {
  eliteContractorId,
  upsertComponent,
  componentIdByKey,
} from "./_componentHelpers";
import { recomputeServiceMaterialCost } from "../lib/materialCost";

const prisma = new PrismaClient();

const SLUG = "exterior-gfci-other-routing";

/**
 * Device materials are the back-to-back list. Wire is the difference: a
 * back-to-back needs 2 ft, a run needs the distance plus slack — 15 ft
 * allowed for a sub-10-ft run, 25 ft for 10-20.
 */
const DEVICE_MATERIALS: [string, number][] = [
  ["GFCI_WEATHER_RESISTANT", 1],
  ["COVER_IN_USE_BUBBLE", 1],
  ["BOX_FS_CAST", 1],
  ["CONSUMABLES_SMALL", 1],
  ["WIRE_12_2", 15],
];

const COMPONENTS = [
  {
    // Zero-cost, and it has to exist.
    //
    // An answer that declares components but matches none goes to review —
    // correct when it means "we don't know which variant applies", wrong here
    // where it means "no extra charge". Without an ACCESSIBLE variant to
    // match, every open-route customer under 10 ft was sent to review instead
    // of being given the base price.
    key: "EXT_GFCI_RUN_ACCESSIBLE_UNDER_10",
    name: "Exterior GFCI — open route, under 10 ft",
    customerFacingLabel: null,
    approvedPriceCents: 0,
    addFieldLaborHours: 0,
    addMaterialCostCents: 0,
    addScheduleMinutes: 0,
    notes: "The base case. Exists so the accessible route matches something.",
  },
  {
    key: "EXT_GFCI_RUN_ACCESSIBLE_10_20",
    name: "Exterior GFCI — open route, 10 to 20 ft",
    customerFacingLabel: "Longer wiring run",
    // $75, not $70. Recomputed under the progressive markup: 0.25 crew-hours
    // is $62.50, and 7.2 ft of extra cable at $9.36 brings it to $71.86,
    // rounding to $75. The old figure assumed material selling at a rate
    // that no longer exists.
    approvedPriceCents: 7500,
    addFieldLaborHours: 0.25,
    // Another 10 ft of 12/2 at $0.72.
    addMaterialCostCents: 720,
    addScheduleMinutes: 15,
    notes: "Matches the New 120V Outlet 10-20 ft delta.",
  },
  {
    key: "EXT_GFCI_RUN_FINISHED_UNDER_10",
    name: "Exterior GFCI — finished walls, under 10 ft",
    customerFacingLabel: "Fishing through finished walls",
    approvedPriceCents: 12500,
    addFieldLaborHours: 0.5,
    addMaterialCostCents: 0,
    addScheduleMinutes: 30,
    notes: "Same half-hour finished premium as the outlet matrix.",
  },
  {
    key: "EXT_GFCI_RUN_FINISHED_10_20",
    name: "Exterior GFCI — finished walls, 10 to 20 ft",
    customerFacingLabel: "Fishing through finished walls",
    approvedPriceCents: 26000,
    addFieldLaborHours: 1.0,
    addMaterialCostCents: 720,
    addScheduleMinutes: 60,
    notes: "Matches the outlet matrix finished 10-20 delta.",
  },
];

/**
 * An exterior wall is the case where an open attic doesn't guarantee an open
 * route — the space over an outside wall can be too tight to drill. And this
 * service ends on an exterior wall by definition, so the caveat always
 * applies rather than being conditional.
 */
const EXTERIOR_CAVEAT =
  "This one ends on an outside wall. Exterior walls are harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across. We'd show you what we're looking at and confirm the price before doing any of it, and patching and painting aren't included.";

const FINISH_ACK = [
  "With no attic, basement or drop ceiling to work through, the wiring for this outlet has to be fished through finished walls.",
  "Your electrician will likely need to make one or more openings in the drywall or plaster to get the cable across. We keep them small and put them where they're least visible, but on a finished wall they usually can't be avoided entirely.",
  "Patching, spackling, sanding, painting, wallpaper and trim aren't included unless we've put it in writing.",
  "That's why we asked about attic and basement access — an open route usually means no openings at all and less time on site.",
].join("\n\n");

const REVIEW_PHOTOS = [
  "Where you'd like the outdoor outlet, with enough of the wall around it to see the siding",
  "Inside that same wall, where the power would come from",
  "The attic or basement above or below, if you have one",
];

async function main() {
  const contractorId = await eliteContractorId(prisma);
  const service = await prisma.service.findUnique({ where: { slug: SLUG } });
  if (!service) {
    console.log(`  – ${SLUG} not in the catalog`);
    return;
  }

  for (const c of COMPONENTS) {
    await upsertComponent(prisma, contractorId, c);
  }
  console.log(`  ✓ ${COMPONENTS.length} distance components defined`);

  // Materials, itemized — which also clears the imported multiplier.
  //
  // The recipe names the ROLE. The total is no longer accumulated here from
  // the deprecated Material's cost: it comes from recomputeServiceMaterialCost
  // below, which resolves each role to THIS contractor's price and fails
  // closed on any it hasn't costed. Summing here would have been a second
  // implementation of that resolution, and a contractor-blind one.
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  for (const [i, [key, qty]] of DEVICE_MATERIALS.entries()) {
    const canonical = await prisma.canonicalMaterial.findUnique({ where: { key } });
    if (!canonical) {
      console.log(`  ! material role ${key} missing — run seed-materials.ts first`);
      continue;
    }
    await prisma.serviceMaterial.create({
      data: {
        serviceId: service.id,
        canonicalMaterialId: canonical.id,
        quantity: qty,
        order: i,
      },
    });
  }

  const recomputed = await recomputeServiceMaterialCost(prisma, service.id);
  const material = recomputed?.afterCents ?? 0;

  await prisma.service.update({
    where: { id: service.id },
    data: {
      name: "Exterior GFCI — New Outlet Location",
      shortDescription:
        "A weatherproof outdoor outlet where there's nothing directly behind the wall to tap into. We run new wiring to it.",
      bookingType: "ADJUSTED",
      // Same device work as the back-to-back service, plus the run.
      fieldLaborHours: 1.5,
      wwtLaborHours: 1.25,
      estimatedMinutes: 90,
      estimatedMinutesReviewed: true,
      requiresTechCount: 1,
      materialCostCents: material,
      materialMultiplier: null,
      photoState: "PREPARATION",
      startingPriceLabel: null,
      // Computed from 1.5 hr + materials. Published now so the service can be
      // booked at all — it's been quote-only with no price and no tree.
      // basePrice moved to the price guard — a seed must not
      // overwrite a published price. See _priceGuard.ts.
      // whileWeThereBasePrice moved to the price guard — a seed must not
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
      disclaimer: EXTERIOR_CAVEAT,
    },
  });
  // This service had no price at all — it was quote-only with no tree. The
  // guard establishes one and would refuse to touch it on any later run.
  const priced = await publishIfUnset(prisma, service.id, {
    basePrice: 46000,
    whileWeThereBasePrice: 39500,
  });
  const note = describePriceResult(SLUG, priced);
  console.log(`  ✓ ${SLUG} — 1.5 hr base, $${(material / 100).toFixed(2)} material`);
  if (note) console.log(note);

  // ---- tree -------------------------------------------------------------
  const existing = await prisma.question.findMany({ where: { serviceId: service.id } });
  for (const q of existing) await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  await prisma.question.deleteMany({ where: { serviceId: service.id } });

  const qAccess = await upsertQuestion(prisma, service.id, {
    key: "below_above_access",
    prompt:
      "Is there a basement, crawlspace or attic we can get into, above or below where the wiring would run?",
    helpText: "It decides whether we can run the wire without opening up the wall inside.",
    order: 0,
  });

  const qFinished = await upsertQuestion(prisma, service.id, {
    key: "finished_space_both_sides",
    prompt:
      "Is there finished living space directly above and/or below that wall, or is the room on a slab?",
    helpText:
      "Either way we'd be running the wire inside the finished wall. We're checking there's nothing unusual behind it.",
    order: 1,
  });

  const qAck = await upsertQuestion(prisma, service.id, {
    key: "ext_gfci_finish_ack",
    prompt: "Before we price this — one thing about your walls",
    helpText: FINISH_ACK,
    order: 2,
  });

  const qDistance = await upsertQuestion(prisma, service.id, {
    key: "ext_gfci_distance",
    prompt: "About how far is the new outdoor outlet from the power we'd run it from?",
    helpText:
      "Roughly the path the wire would take rather than the straight line — through the basement or attic, or across the wall.",
    order: 3,
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qAccess.id,
        label: "Yes — attic, basement or crawlspace",
        value: "has_access",
        accessClassification: "ACCESSIBLE",
        routeAction: "CONTINUE",
        nextQuestionId: qDistance.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qAccess.id,
        label: "No — it's finished on both sides",
        value: "no_access",
        accessClassification: "FINISHED",
        routeAction: "CONTINUE",
        nextQuestionId: qFinished.id,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qAccess.id,
        label: "I'm not sure",
        value: "unsure",
        accessClassification: "UNKNOWN",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },

      {
        questionId: qFinished.id,
        label: "Yes — finished space above or below, or the room's on a slab",
        value: "finished_both_sides",
        accessClassification: "FINISHED",
        routeAction: "CONTINUE",
        nextQuestionId: qAck.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qFinished.id,
        label: "I'm not sure",
        value: "unsure",
        accessClassification: "UNKNOWN",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },

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

      // Photos ride along without blocking — the price is settled, they just
      // mean the technician arrives knowing what siding he's cutting.
      {
        questionId: qDistance.id,
        label: "Less than 10 feet",
        value: "under_10",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: false,
        order: 1,
        requiredPhotoLabels: [
          "Where you'd like the outdoor outlet, with enough wall around it to see the siding",
          "Inside that same wall, where the power would come from",
        ],
        approvedComponentPriceCents: null,
      },
      {
        questionId: qDistance.id,
        label: "10 to 20 feet",
        value: "10_to_20",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: false,
        order: 2,
        requiredPhotoLabels: [
          "Where you'd like the outdoor outlet, with enough wall around it to see the siding",
          "Inside that same wall, where the power would come from",
        ],
        approvedComponentPriceCents: null,
      },
      {
        // Past 20 ft the variability outruns a fixed price, same cap as the
        // switch leg and the outlet matrix.
        questionId: qDistance.id,
        label: "More than 20 feet",
        value: "over_20",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
      {
        questionId: qDistance.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 4,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  const comp = async (k: string) =>
    await componentIdByKey(prisma, k);

  // Under 10 ft on an open route is the base price — no component. The
  // finished variant is conditioned so it only applies on that route.
  const under10 = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDistance.id, value: "under_10" },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: under10.id, canonicalComponentId: await comp("EXT_GFCI_RUN_ACCESSIBLE_UNDER_10"), conditionAccessClass: "ACCESSIBLE" },
      { answerOptionId: under10.id, canonicalComponentId: await comp("EXT_GFCI_RUN_FINISHED_UNDER_10"), conditionAccessClass: "FINISHED" },
    ],
  });

  const d10 = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDistance.id, value: "10_to_20" },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: d10.id, canonicalComponentId: await comp("EXT_GFCI_RUN_ACCESSIBLE_10_20"), conditionAccessClass: "ACCESSIBLE" },
      { answerOptionId: d10.id, canonicalComponentId: await comp("EXT_GFCI_RUN_FINISHED_10_20"), conditionAccessClass: "FINISHED" },
    ],
  });

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  console.log(
    `  ✓ 4 questions wired` +
      (dangling.length ? `  [DANGLING: ${dangling.join(", ")}]` : "") +
      (unreachable.length ? `  [UNREACHABLE: ${unreachable.join(", ")}]` : "")
  );

  console.log(`
  accessible, under 10 ft    $460   (base)
  accessible, 10-20 ft       $530   +$70
  finished, under 10 ft      $585   +$125
  finished, 10-20 ft         $720   +$260
  over 20 ft or unsure       photo review

  Base is 1.5 hr, matching the back-to-back service — this ends in the same
  weatherproof box on the same kind of wall, and starting from the outlet
  matrix's 1.0 would price the harder job below the easier one.

  The exterior-wall caveat is on the service rather than an answer: this one
  ends on an outside wall by definition, so it always applies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
