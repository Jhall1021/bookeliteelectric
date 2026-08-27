/**
 * Four services — 24 August 2026.
 *
 *   npx tsx prisma/seed-low-voltage-and-sconces.ts
 *
 *   Install New Ethernet / Network Line
 *   Install New Coax / Cable TV Line
 *   Replace Existing Wall Sconce
 *   Install New Wall Sconce
 *
 * WHAT'S REUSED, AND WHY THAT'S THE POINT
 *
 * None of these needed a bespoke tree. Running a network cable across a house
 * is the same ROUTING problem as running a circuit: where does it start,
 * where does it end, is there a path above or below, is the wall finished, is
 * it an outside wall. That question set already exists and is already right,
 * so these services ask it too.
 *
 * What differs is the work at each end, and only that:
 *
 *   ethernet and coax   no panel, no breaker, no load calculation. A jack at
 *                       each end and a cable between them. 1.5 crew-hours for
 *                       an accessible run, against the dedicated circuit's
 *                       2.5 — the routing is comparable, the terminations
 *                       are not.
 *
 *   sconces             a light on a wall rather than a ceiling. New ones
 *                       reuse the New Ceiling Light wiring model outright,
 *                       because the wall/ceiling distinction changes nothing
 *                       about getting cable to the box.
 *
 * PRICED BY THE ROUTE, NOT THE FIXTURE
 *
 * A sconce eight feet up and one twelve feet up are the same job if the
 * route is the same. Height only matters when it stops being reachable, and
 * the existing access questions already catch that. So there's no
 * sconce-specific height question — that would be inventing a variable to
 * look thorough.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";
import {
  recomputeServiceMaterialCost,
  clearLegacyMultiplierOnItemize,
} from "../lib/materialCost";
import { calculateMaterialSellCents } from "../lib/pricing";
import {
  eliteContractorId,
  upsertComponent,
} from "./_componentHelpers";
import { categoryOfService } from "./_categoryHelpers";

const prisma = new PrismaClient();

// POLICY[low_voltage.standard_run_ft]: 50
// POLICY[low_voltage.accessible_labor_hours]: 1.5
// POLICY[low_voltage.finished_premium_hours]: 0.75
// POLICY[sconce.priced_by]: WIRING_ROUTE_NOT_HEIGHT
// POLICY[sconce.fixture_supply]: CUSTOMER_SUPPLIED
const LV_ACCESSIBLE = 1.5;
const LV_FINISHED = 2.25;

/**
 * ASSUMED — not confirmed by the owner.
 *
 * Every other material in the catalog is a price Elite actually pays. These
 * four are my estimates, marked so they can be found and corrected rather
 * than quietly becoming fact. Cable is the sensitive one: at 60 ft, a
 * five-cent error per foot is $3 on the package and rounds away, so being
 * roughly right is enough until someone checks a receipt.
 */
const ASSUMED_MATERIALS = [
  { key: "CABLE_CAT6", name: "Cat6 network cable", unitCostCents: 25, unit: "ft" },
  { key: "JACK_KEYSTONE_RJ45", name: "RJ45 keystone jack", unitCostCents: 300, unit: "each" },
  { key: "CABLE_RG6", name: "RG6 coaxial cable", unitCostCents: 30, unit: "ft" },
  { key: "JACK_COAX_F", name: "Coax F-connector keystone jack", unitCostCents: 300, unit: "each" },
];

const SOURCE_PHOTOS = [
  "Where the line starts — the router, modem, or the existing cable box",
  "Where you'd like the new jack to come out",
];

const REVIEW_PHOTOS = [
  "Where the line starts — the router, modem, or the existing cable box",
  "Where you'd like the new jack to come out",
  "The rooms in between, and the ceiling or floor between them if you can",
];

/**
 * A sibling whose category these belong in — steadier than guessing a slug.
 *
 * Returns BOTH pointers (ADR-006). Writing only the pre-split one is what
 * left seeded services without a contractor category, which every operational
 * read now fails closed on.
 */
async function categoryOf(slug: string) {
  return categoryOfService(prisma, slug);
}

async function main() {
  const contractor = await prisma.contractor.findUnique({
    where: { slug: "elite-electric" },
    select: { id: true },
  });
  if (!contractor) {
    console.error(
      `No contractor "elite-electric". Run ` +
        `prisma/migrate-material-split-2026-08-24.ts first.`
    );
    process.exit(1);
    return;
  }

  for (const m of ASSUMED_MATERIALS) {
    // Identity and economics are written separately.
    //
    // The ROLE — "Cat6 network cable, per foot" — is platform knowledge, true
    // for anyone running low-voltage. The COST is Elite's estimate, and it is
    // the estimate that carries the ASSUMED flag.
    const canonical = await prisma.canonicalMaterial.upsert({
      where: { key: m.key },
      update: { name: m.name, unit: m.unit },
      create: { key: m.key, name: m.name, unit: m.unit },
    });

    await prisma.contractorMaterial.upsert({
      where: {
        contractorId_canonicalMaterialId: {
          contractorId: contractor.id,
          canonicalMaterialId: canonical.id,
        },
      },
      // unitCostCents belongs in BOTH branches. Omitting it from update is
      // what froze these estimates: correcting a figure above and re-running
      // applied the new name and left the old cost in place.
      update: {
        unitCostCents: m.unitCostCents,
        costConfidence: "ASSUMED",
        notes: "ASSUMED — not yet confirmed by the owner.",
      },
      create: {
        contractorId: contractor.id,
        canonicalMaterialId: canonical.id,
        unitCostCents: m.unitCostCents,
        costConfidence: "ASSUMED",
        notes: "ASSUMED — not yet confirmed by the owner.",
      },
    });
  }
  console.log(`  ${ASSUMED_MATERIALS.length} material(s) added, all marked ASSUMED\n`);

  const lightingCat = await categoryOf("replace-interior-light-fixture");
  const tvCat = await categoryOf("tv-installation");

  // ---- the two low-voltage runs ----------------------------------------
  for (const spec of [
    {
      slug: "new-ethernet-line",
      name: "Install New Ethernet / Network Line",
      description:
        "A network cable run from your router or modem to a new jack in another room, ending in a proper wall plate rather than a cable under the door.",
      category: tvCat,
      items: [
        ["CABLE_CAT6", 60],
        ["JACK_KEYSTONE_RJ45", 2],
        ["LOW_VOLTAGE_RING", 1],
        ["WALL_PLATE", 1],
        ["CONSUMABLES_SMALL", 1],
      ] as [string, number][],
    },
    {
      slug: "new-coax-line",
      name: "Install New Coax / Cable TV Line",
      description:
        "A coax line run to a new outlet where you need one — for a TV, a cable box, or an internet modem in a different room.",
      category: tvCat,
      items: [
        ["CABLE_RG6", 60],
        ["JACK_COAX_F", 2],
        ["LOW_VOLTAGE_RING", 1],
        ["WALL_PLATE", 1],
        ["CONSUMABLES_SMALL", 1],
      ] as [string, number][],
    },
  ]) {
    if (!spec.category) {
      console.log(`  ! no category found for ${spec.slug} — skipped`);
      continue;
    }

    const svc = await prisma.service.upsert({
      where: { slug: spec.slug },
      update: {
        fieldLaborHours: LV_ACCESSIBLE,
        wwtLaborHours: LV_ACCESSIBLE - 0.25,
        estimatedMinutes: 120,
        photoState: "PREPARATION",
        isPrimaryEligible: true,
      },
      create: {
        // Required as of pass three's contract.
        contractorId: contractor.id,
        slug: spec.slug,
        name: spec.name,
        shortDescription: spec.description,
        ...spec.category,
        bookingType: "ADJUSTED",
        fieldLaborHours: LV_ACCESSIBLE,
        wwtLaborHours: LV_ACCESSIBLE - 0.25,
        estimatedMinutes: 120,
        requiresTechCount: 1,
        photoState: "PREPARATION",
        isPrimaryEligible: true,
        active: true,
      },
    });

    await buildRoutingTree(svc.id, spec.slug);
    await attachMaterials(svc.id, spec.items);
  }

  // ---- the two sconce services -----------------------------------------
  if (lightingCat) {
    // Replace: no routing question at all. The box and the cable are already
    // there, so none of the access questions have anything to decide.
    const replace = await prisma.service.upsert({
      where: { slug: "replace-wall-sconce" },
      update: { fieldLaborHours: 0.75, wwtLaborHours: 0.5, estimatedMinutes: 60 },
      create: {
        // Required as of pass three's contract.
        contractorId: contractor.id,
        slug: "replace-wall-sconce",
        name: "Replace an Existing Wall Sconce",
        shortDescription:
          "Taking down a wall light and putting up the new one you've bought, in the same spot.",
        ...lightingCat,
        bookingType: "ADJUSTED",
        fieldLaborHours: 0.75,
        wwtLaborHours: 0.5,
        estimatedMinutes: 60,
        requiresTechCount: 1,
        photoState: "NONE",
        isPrimaryEligible: true,
        active: true,
      },
    });
    await attachMaterials(replace.id, [["CONSUMABLES_SMALL", 1]]);

    const newSconce = await prisma.service.upsert({
      where: { slug: "new-wall-sconce" },
      update: { fieldLaborHours: 1.25, wwtLaborHours: 1.0, estimatedMinutes: 120 },
      create: {
        // Required as of pass three's contract.
        contractorId: contractor.id,
        slug: "new-wall-sconce",
        name: "Install a New Wall Sconce",
        shortDescription:
          "A wall light where there isn't one now. You supply the fixture; we run the wiring and put it up.",
        ...lightingCat,
        bookingType: "ADJUSTED",
        fieldLaborHours: 1.25,
        wwtLaborHours: 1.0,
        estimatedMinutes: 120,
        requiresTechCount: 1,
        photoState: "PREPARATION",
        isPrimaryEligible: true,
        active: true,
      },
    });
    await buildRoutingTree(newSconce.id, "new-wall-sconce", {
      finishedHours: 1.75,
      finishedWwt: 1.5,
    });
    await attachMaterials(newSconce.id, [
      ["BOX_OLD_WORK", 1],
      ["WIRE_14_2", 25],
      ["CONSUMABLES_SMALL", 1],
    ]);
  }

  console.log();
}

/**
 * The shared routing questions.
 *
 * Same shape as the outlet services: is there a path, is the wall finished,
 * how far. Written once here rather than three times, because they're the
 * same question and should stay the same question.
 */
async function buildRoutingTree(
  serviceId: string,
  slug: string,
  opts?: { finishedHours: number; finishedWwt: number }
) {
  // Clear first. Upserting the questions I want doesn't remove ones I don't,
  // and a stale question at order 1 becomes the entry point.
  const existing = await prisma.question.findMany({ where: { serviceId } });
  for (const q of existing) {
    await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  }
  await prisma.question.deleteMany({ where: { serviceId } });

  const isLowVoltage = !opts;

  const qAccess = await upsertQuestion(prisma, serviceId, {
    key: `${slug}_route_access`,
    prompt: "Is there an attic, basement or crawl space between the two points?",
    helpText:
      "An open path above or below is what makes this straightforward. Without one the cable has to go through finished walls.",
    order: 1,
  });

  const qDistance = await upsertQuestion(prisma, serviceId, {
    key: `${slug}_distance`,
    prompt: isLowVoltage
      ? "Roughly how far apart are the two points?"
      : "Roughly how far is it to the nearest power?",
    helpText: "A rough guess is fine — we're only sorting short runs from long ones.",
    order: 2,
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qAccess.id,
        label: "Yes — there's an attic, basement or crawl space we can use",
        value: "accessible",
        accessClassification: "ACCESSIBLE",
        routeAction: "CONTINUE",
        nextQuestionId: qDistance.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qAccess.id,
        label: "No — it's finished space the whole way",
        value: "finished",
        accessClassification: "FINISHED",
        disclaimer:
          "Without a path above or below, the cable has to be fished through finished walls. Small openings in the drywall are sometimes needed, and patching and painting aren't included.",
        routeAction: "CONTINUE",
        nextQuestionId: qDistance.id,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
      },
      {
        questionId: qAccess.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
        approvedComponentPriceCents: null,
      },
    ],
  });

  const shortLabel = isLowVoltage ? "Less than 50 feet" : "Less than 20 feet";
  const longLabel = isLowVoltage ? "More than 50 feet" : "More than 20 feet";

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qDistance.id,
        label: shortLabel,
        value: "standard",
        routeAction: "RESOLVE_ADJUSTED",
        order: 1,
        // Preparation, not a gate. The price is settled; these are so the
        // crew knows what they're connecting to before they arrive.
        requiredPhotoLabels: SOURCE_PHOTOS,
        photosBlockBooking: false,
        approvedComponentPriceCents: null,
      },
      {
        // Long runs go to review rather than getting a band. There's no
        // field data yet on what a 90-foot pull actually takes, and a
        // guessed band would be a price with nothing behind it.
        questionId: qDistance.id,
        label: longLabel,
        value: "long",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
        approvedComponentPriceCents: null,
      },
      {
        questionId: qDistance.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
        approvedComponentPriceCents: null,
      },
    ],
  });

  const finishedHours = opts?.finishedHours ?? LV_FINISHED;
  const finishedWwt = opts?.finishedWwt ?? LV_FINISHED - 0.25;
  const baseHours = opts ? 1.25 : LV_ACCESSIBLE;

  // The finished route as a component, so the extra time is visible as time
  // rather than buried in a second price.
  const key = `${slug.toUpperCase().replace(/-/g, "_")}_FINISHED_ROUTE`;
  const componentId = await upsertComponent(prisma, await eliteContractorId(prisma), {
    key,
    name: `${slug} — finished route`,
    customerFacingLabel: "Fishing through finished walls",
    addFieldLaborHours: finishedHours - baseHours,
    addMaterialCostCents: 0,
    addScheduleMinutes: 30,
    addTechCount: 0,
    active: true,
  });

  const finishedOption = await prisma.answerOption.findFirst({
    where: { questionId: qAccess.id, value: "finished" },
  });
  if (finishedOption) {
    await prisma.answerOptionComponent.upsert({
      where: {
        answerOptionId_canonicalComponentId: {
          answerOptionId: finishedOption.id,
          canonicalComponentId: componentId,
        },
      },
      update: { quantity: 1 },
      create: { answerOptionId: finishedOption.id, canonicalComponentId: componentId, quantity: 1 },
    });
  }

  const dangling = await findDanglingReferences(prisma, serviceId);
  const unreachable = await findUnreachableQuestions(prisma, serviceId);
  console.log(
    `  ✓ ${slug}   ${baseHours} hr accessible / ${finishedHours} finished   ` +
      `dangling ${dangling.length}, unreachable ${unreachable.length}`
  );
}

/**
 * Attach a service's materials and bring its cached total in step.
 *
 * The summation used to live here, making this the FOURTH copy of the same
 * arithmetic — alongside prisma/seed-materials.ts, a private syncTotal() in
 * the Materials API, and now lib/materialCost.ts. This one also summed
 * without rounding each line, unlike the other three. No divergence resulted,
 * because every cost times quantity in this file happens to be a whole number
 * of cents; the first fractional quantity would have produced a total that
 * disagreed with the same recipe computed anywhere else.
 *
 * The multiplier clear is a separate call now. It is still right here —
 * attaching materials IS itemizing — but it is no longer welded to the
 * recompute, so a future cost change can't drag it along.
 */
async function attachMaterials(serviceId: string, items: [string, number][]) {
  await prisma.serviceMaterial.deleteMany({ where: { serviceId } });
  for (const [key, qty] of items) {
    // The recipe names the ROLE. Pricing resolves it to this contractor's
    // cost in the recompute below.
    const canonical = await prisma.canonicalMaterial.findUnique({ where: { key } });
    if (!canonical) {
      console.log(`      ! material role ${key} not found`);
      continue;
    }
    await prisma.serviceMaterial.create({
      data: { serviceId, canonicalMaterialId: canonical.id, quantity: qty },
    });
  }

  const recomputed = await recomputeServiceMaterialCost(prisma, serviceId);
  await clearLegacyMultiplierOnItemize(prisma, serviceId);

  const total = recomputed?.afterCents ?? 0;
  console.log(
    `      materials $${(total / 100).toFixed(2)} direct` +
      ` -> $${(calculateMaterialSellCents(total) / 100).toFixed(2)} sell`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
