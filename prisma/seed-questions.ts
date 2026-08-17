/**
 * BookEliteElectric.com — Phase 2 decision-tree seed
 * Question/AnswerOption trees for the two pilot categories: Outlets &
 * Switches and TV & Media. Run AFTER prisma/seed.ts (needs the Service
 * rows to already exist).
 *
 * Run with: npx tsx prisma/seed-questions.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Every seed*Tree function below calls this FIRST, before creating any
// questions. Without it, re-running this script (e.g. to fix a typo or
// adjust pricing on an existing tree) just piles a second, duplicate tree
// on top of the first one instead of replacing it — both sets of questions
// end up attached to the same service, and which one the customer actually
// sees becomes a coin-flip based on database row order. This makes the
// whole script safely rerunnable any time a tree needs editing.
async function clearServiceTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId } });
  for (const q of questions) {
    await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
  }
  await prisma.question.deleteMany({ where: { serviceId } });
}

async function seedReplaceStandardOutlet() {
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "replace-standard-outlet" },
  });
  await clearServiceTree(service.id);

  // Simple instant-book flow — one question, no branching complexity.
  // Demonstrates the minimum viable tree: a single qualifying question
  // that resolves straight to a price.
  const q1 = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "outlet_condition",
      prompt: "What's happening with the outlet?",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q1.id,
        label: "It just needs to be swapped for a new one",
        value: "standard_swap",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q1.id,
        label: "It's warm, sparking, or smells like burning",
        value: "unsafe_condition",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 2,
        requiredPhotoLabels: [],
      },
      {
        questionId: q1.id,
        label: "It doesn't work at all / no power",
        value: "no_power",
        routeAction: "REROUTE_TROUBLESHOOTING",
        order: 3,
        requiredPhotoLabels: [],
      },
    ],
  });

  console.log("  ✓ Replace Standard Outlet tree");
}

async function seedNewOutlet() {
  // Redesigned per the general principle: don't ask the customer to
  // self-classify into a pricing tier they can't articulate ("accessible"
  // vs. "finished-wall fishing" means nothing to most homeowners). Instead,
  // ask what they can actually observe about their home, and let the
  // routing logic determine the tier. This collapses what used to be two
  // separate Service catalog entries into one service with an internal
  // ADJUSTED-pricing branch.
  const newOutlet = await prisma.service.findUniqueOrThrow({
    where: { slug: "new-120v-outlet" },
  });
  const dedicatedCircuit = await prisma.service.findUniqueOrThrow({
    where: { slug: "dedicated-120v-circuit-outlet" },
  });
  await clearServiceTree(newOutlet.id);

  const q1 = await prisma.question.create({
    data: {
      serviceId: newOutlet.id,
      key: "purpose",
      prompt: "What will this outlet power?",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const q2 = await prisma.question.create({
    data: {
      serviceId: newOutlet.id,
      key: "below_above_access",
      prompt: "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below where the outlet is going?",
      helpText: "This is what determines whether we can run the wire without opening up your walls.",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const q3 = await prisma.question.create({
    data: {
      serviceId: newOutlet.id,
      key: "finished_space_both_sides",
      prompt: "Is there finished living space directly above and below this wall?",
      helpText: "For example, a finished bedroom upstairs and a finished room below, with no open access between them.",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  // Q1 — purpose
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q1.id,
        label: "General use (lamp, charger, small appliance)",
        value: "general_use",
        routeAction: "CONTINUE",
        nextQuestionId: q2.id,
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q1.id,
        label: "A specific large appliance (window AC, freezer, etc.)",
        value: "large_appliance",
        // Genuinely a different job — dedicated circuit sizing/breaker
        // requirements, not just a harder pull. Reroute preserves nothing lost.
        routeAction: "REROUTE_SERVICE",
        rerouteServiceId: dedicatedCircuit.id,
        order: 2,
        requiredPhotoLabels: [],
      },
    ],
  });

  // Q2 — attic/basement access
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q2.id,
        label: "Yes",
        value: "has_access",
        routeAction: "RESOLVE_INSTANT", // uses newOutlet.basePrice: $395
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q2.id,
        label: "No",
        value: "no_access",
        routeAction: "CONTINUE",
        nextQuestionId: q3.id,
        order: 2,
        requiredPhotoLabels: [],
      },
    ],
  });

  // Q3 — finished space both sides (only reached if Q2 was "No")
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: q3.id,
        label: "Yes",
        value: "finished_both_sides",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 10000, // $395 -> $495: fishing wire + cutting/patching sheetrock
        order: 1,
        requiredPhotoLabels: [],
      },
      {
        questionId: q3.id,
        label: "No",
        value: "not_finished_both_sides",
        // No access AND no confirmed finished space (e.g. slab foundation,
        // exterior wall) — genuinely ambiguous, don't guess at a price.
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Wall where the outlet is needed, full height", "Nearest attic or basement access point, if any"],
      },
      {
        questionId: q3.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Wall where the outlet is needed, full height", "Nearest attic or basement access point, if any"],
      },
    ],
  });

  console.log("  ✓ New 120V Outlet tree (diagnostic questions, single service with adjusted-price branch)");
}

async function seedTvInstall() {
  // Redesigned per client direction: one consolidated "Professional TV
  // Installation" service instead of three separate size-tier services the
  // customer had to pre-guess between. Size is now just the first question
  // in the tree, matching the "diagnostic questions, not self-classification"
  // principle already established for New Outlet.
  //
  // New at the end of the tree: a receptacle check. Running power up to
  // behind the TV is bundled free IF an outlet already exists below —
  // otherwise it becomes a real new-outlet job, priced using the exact
  // same accessible-vs-finished-wall logic as the New 120V Outlet service,
  // embedded directly in this tree so the customer gets one combined price
  // for "mount the TV AND get me power back there" in a single flow,
  // rather than being bounced to a second, separate purchase.
  const tvInstall = await prisma.service.findUniqueOrThrow({
    where: { slug: "tv-installation" },
  });
  await clearServiceTree(tvInstall.id);

  const qSize = await prisma.question.create({
    data: {
      serviceId: tvInstall.id,
      key: "tv_size",
      prompt: "What size is your TV?",
      helpText: "Measure corner to corner on the front of your TV.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const qMount = await prisma.question.create({
    data: {
      serviceId: tvInstall.id,
      key: "has_mount",
      prompt: "Do you already have a compatible wall mount?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const qWall = await prisma.question.create({
    data: {
      serviceId: tvInstall.id,
      key: "wall_construction",
      prompt: "What's the wall made of?",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  const qFireplace = await prisma.question.create({
    data: {
      serviceId: tvInstall.id,
      key: "above_fireplace",
      prompt: "Is the TV going above a fireplace?",
      inputType: "SINGLE_SELECT",
      order: 4,
    },
  });

  const qReceptacle = await prisma.question.create({
    data: {
      serviceId: tvInstall.id,
      key: "receptacle_below",
      prompt: "Is there an electrical outlet already located below where the TV will be mounted?",
      helpText: "If there's power nearby, we can run it up behind your TV at no extra charge.",
      inputType: "SINGLE_SELECT",
      order: 5,
    },
  });

  // Only reached if there's NO outlet below — mirrors the New 120V Outlet
  // tree's access question, but priced as an addition on top of the TV
  // install price already accrued rather than as its own separate purchase.
  const qOutletAccess = await prisma.question.create({
    data: {
      serviceId: tvInstall.id,
      key: "outlet_access",
      prompt: "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below this wall?",
      inputType: "SINGLE_SELECT",
      order: 6,
    },
  });

  const qOutletFinishedSpace = await prisma.question.create({
    data: {
      serviceId: tvInstall.id,
      key: "outlet_finished_space",
      prompt: "Is there finished living space directly above and below this wall?",
      inputType: "SINGLE_SELECT",
      order: 7,
    },
  });

  // Size branches — simplified to two tiers matching the sibling "Existing
  // Location" service: Up to 55" at base price, 55"–100" at a flat
  // upcharge. No separate "Over 85" photo-review branch anymore.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qSize.id, label: "Up to 55\"", value: "up_to_55", routeAction: "CONTINUE", nextQuestionId: qMount.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qSize.id, label: "55\"–100\"", value: "55_100", routeAction: "CONTINUE", nextQuestionId: qMount.id, priceModifierCents: 20000, order: 2, requiredPhotoLabels: [] },
    ],
  });

  // Mount branches
  await prisma.answerOption.createMany({
    data: [
      { questionId: qMount.id, label: "Yes, I have a mount", value: "has_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qMount.id, label: "No — add Elite Tilt Mount ($99)", value: "add_tilt_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, priceModifierCents: 9900, order: 2, requiredPhotoLabels: [] },
      { questionId: qMount.id, label: "No — add Elite Full-Motion Mount ($179)", value: "add_articulating_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, priceModifierCents: 17900, order: 3, requiredPhotoLabels: [] },
    ],
  });

  // Wall construction branches
  await prisma.answerOption.createMany({
    data: [
      { questionId: qWall.id, label: "Drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: qFireplace.id, order: 1, requiredPhotoLabels: [] },
      {
        questionId: qWall.id,
        label: "Stone, brick, or masonry",
        value: "masonry",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Full wall where the TV is going", "Close-up of the wall surface/texture"],
      },
    ],
  });

  // Fireplace branch
  await prisma.answerOption.createMany({
    data: [
      { questionId: qFireplace.id, label: "No", value: "no", routeAction: "CONTINUE", nextQuestionId: qReceptacle.id, order: 1, requiredPhotoLabels: [] },
      {
        questionId: qFireplace.id,
        label: "Yes",
        value: "yes",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Fireplace and surrounding wall, full width"],
      },
    ],
  });

  // Receptacle branch — the new logic. Yes = free, bundled into the TV
  // price already accrued. No = continue into the embedded new-outlet
  // questions, which ADD to that price rather than replacing it.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qReceptacle.id, label: "Yes", value: "yes", routeAction: "RESOLVE_ADJUSTED", order: 1, requiredPhotoLabels: [] },
      { questionId: qReceptacle.id, label: "No", value: "no", routeAction: "CONTINUE", nextQuestionId: qOutletAccess.id, order: 2, requiredPhotoLabels: [] },
    ],
  });

  // Embedded new-outlet access question — adds a discounted TV-install-only
  // rate ($137.50, 50% off the standard $275 While We're There price for
  // New 120V Outlet) on top of whatever the TV install has already
  // accrued — a deeper discount than the regular WWT rate, since this
  // outlet is going in "regardless" of anything else, bundled into a job
  // that's already happening.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qOutletAccess.id, label: "Yes", value: "has_access", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 13750, order: 1, requiredPhotoLabels: [] },
      { questionId: qOutletAccess.id, label: "No", value: "no_access", routeAction: "CONTINUE", nextQuestionId: qOutletFinishedSpace.id, order: 2, requiredPhotoLabels: [] },
    ],
  });

  // Embedded new-outlet finished-space question — adds $187.50 (50% off the
  // standard $375 While We're There finished-wall-fishing price) if
  // confirmed; ambiguous answers go to photo review rather than guessing,
  // same as the standalone New Outlet tree.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qOutletFinishedSpace.id, label: "Yes", value: "finished_both_sides", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 18750, order: 1, requiredPhotoLabels: [] },
      {
        questionId: qOutletFinishedSpace.id,
        label: "No",
        value: "not_finished_both_sides",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Wall where the TV and outlet are needed, full height", "Nearest attic or basement access point, if any"],
      },
      {
        questionId: qOutletFinishedSpace.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Wall where the TV and outlet are needed, full height", "Nearest attic or basement access point, if any"],
      },
    ],
  });

  console.log("  ✓ Professional TV Installation tree (consolidated sizes, embedded new-outlet receptacle logic)");
}

async function seedTvInstallExistingLocation() {
  // Simpler, cheaper sibling to the full Professional TV Installation —
  // for the common case where power and cable routing already exist
  // (e.g. mounting in a spot a TV was already set up in before). No
  // outlet, wall-construction, or fireplace questions at all, since the
  // whole point of this service is that none of that work is needed.
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "tv-install-existing-location" },
  });
  await clearServiceTree(service.id);

  const qSize = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "tv_size",
      prompt: "What size is your TV?",
      helpText: "Measure corner to corner on the front of your TV.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const qMountSupplied = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "mount_supplied",
      prompt: "Are you supplying your own mount?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const qMountType = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "mount_type",
      prompt: "What type of mount would you like?",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  // Size — two tiers, matching the $315 / $415 pricing given.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qSize.id, label: "Up to 55\"", value: "up_to_55", routeAction: "CONTINUE", nextQuestionId: qMountSupplied.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qSize.id, label: "56\"–100\"", value: "56_100", routeAction: "CONTINUE", nextQuestionId: qMountSupplied.id, priceModifierCents: 10000, order: 2, requiredPhotoLabels: [] },
    ],
  });

  // Mount supplied — Yes resolves immediately; No continues to pick a mount.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qMountSupplied.id, label: "Yes, I have my own mount", value: "yes", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [] },
      { questionId: qMountSupplied.id, label: "No, I need a mount", value: "no", routeAction: "CONTINUE", nextQuestionId: qMountType.id, order: 2, requiredPhotoLabels: [] },
    ],
  });

  // Mount type — same two Elite-supplied mount options and prices used in
  // the full TV Installation flow.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qMountType.id, label: "Elite Tilt Mount ($99)", value: "tilt", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 9900, order: 1, requiredPhotoLabels: [] },
      { questionId: qMountType.id, label: "Elite Full-Motion Articulating Mount ($179)", value: "articulating", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 17900, order: 2, requiredPhotoLabels: [] },
    ],
  });

  console.log("  ✓ Install TV in Existing Location tree (size → mount supplied? → mount type)");
}

async function seedRecessedLighting() {
  // Applies the same diagnostic-question principle used everywhere else
  // (New Outlet, TV Installation) to lighting: ask what's actually
  // observable about the room, don't make the customer self-classify.
  //
  // Pricing structure: the FIRST light resolves at the service's base
  // price via the guided flow; every ADDITIONAL light in the same visit
  // uses the existing "units after the first price at the While We're
  // There rate" cart mechanic (see app/api/visit/route.ts) rather than a
  // separate in-flow quantity question — $200/light with attic access,
  // matching the client's number exactly, no new engine feature needed.
  //
  // KNOWN LIMITATION: the cart's per-unit discount is a single flat rate
  // per service. If the first light resolves via the NO-ATTIC-ACCESS
  // branch (higher price), a second light added afterward via the cart's
  // "+" button will currently still be discounted at the standard $200
  // attic-access WWT rate, not a higher no-access repeat rate. Flagging
  // this rather than silently under-charging on that specific edge case.
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "recessed-lighting" },
  });
  await clearServiceTree(service.id);

  const qAtticAccess = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "attic_access",
      prompt: "Is there accessible attic space directly above where the light(s) are going?",
      helpText: "This is what lets us run wiring without opening up your ceiling.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const qExistingLight = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "existing_light_source",
      prompt: "Is there an existing light fixture we'll be removing, or one nearby we can tap power from?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const qSwitchedSource = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "switched_source",
      prompt: "Is there an existing switch in the room we could use to control the new light(s)?",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  // Attic access — the main branch point. No access still resolves to a
  // real price (not photo review), per the client's direction, with a
  // disclaimer about sheetrock cutting attached to the price itself.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qAtticAccess.id, label: "Yes", value: "has_access", routeAction: "CONTINUE", nextQuestionId: qExistingLight.id, order: 1, requiredPhotoLabels: [], disclaimer: null },
      {
        questionId: qAtticAccess.id,
        label: "No",
        value: "no_access",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 10000, // $395 base -> $495 for the first fixture without attic access
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: "This price includes cutting into the ceiling to run wiring. Elite does not patch or paint drywall — that will need to be arranged separately after installation.",
      },
    ],
  });

  // Existing light to tap from — Yes is the standard (base) price with no
  // modifier. No continues to check for a switched power source instead.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qExistingLight.id, label: "Yes", value: "yes", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qExistingLight.id, label: "No", value: "no", routeAction: "CONTINUE", nextQuestionId: qSwitchedSource.id, order: 2, requiredPhotoLabels: [], disclaimer: null },
    ],
  });

  // Existing switch — Yes adds the $150 wire-snaking charge (switch already
  // there, just needs a wire run to the ceiling). No existing switch means
  // that SAME wire run is still needed, PLUS a brand-new switch has to be
  // installed — that install reuses the standard "Replace Standard Switch"
  // While We're There rate ($75), so No totals $150 + $75 = $225. Genuine
  // uncertainty still goes to photo review rather than guessing.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qSwitchedSource.id,
        label: "Yes",
        value: "yes",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 15000, // +$150 to snake a wire from the existing switch up to the ceiling
        order: 1,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qSwitchedSource.id,
        label: "No",
        value: "no",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 22500, // +$150 wire run + $75 new switch (Replace Standard Switch WWT rate)
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qSwitchedSource.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Room where the light(s) are going, full view", "Ceiling area where the fixture will be installed"],
      },
    ],
  });

  console.log("  ✓ Recessed Lighting tree (attic access → existing source → switched source, with disclaimer support)");
}

async function seedNewCeilingLight() {
  // Identical structure to Recessed Lighting — same attic-access →
  // existing-fixture → existing-switch tree, applied to a new ceiling
  // light fixture instead of a recessed can. Per client direction, this
  // "existing switch in the room" question is standardized across every
  // new light/fan installation tree.
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "new-ceiling-light" },
  });
  await clearServiceTree(service.id);

  const qAtticAccess = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "attic_access",
      prompt: "Is there accessible attic space directly above where the light is going?",
      helpText: "This is what lets us run wiring without opening up your ceiling.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const qExistingLight = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "existing_light_source",
      prompt: "Is there an existing light fixture we'll be removing, or one nearby we can tap power from?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const qSwitchedSource = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "switched_source",
      prompt: "Is there an existing switch in the room we could use to control the new light?",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qAtticAccess.id, label: "Yes", value: "has_access", routeAction: "CONTINUE", nextQuestionId: qExistingLight.id, order: 1, requiredPhotoLabels: [], disclaimer: null },
      {
        questionId: qAtticAccess.id,
        label: "No",
        value: "no_access",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 10000, // $395 base -> $495 without attic access
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: "This price includes cutting into the ceiling to run wiring. Elite does not patch or paint drywall — that will need to be arranged separately after installation.",
      },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qExistingLight.id, label: "Yes", value: "yes", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qExistingLight.id, label: "No", value: "no", routeAction: "CONTINUE", nextQuestionId: qSwitchedSource.id, order: 2, requiredPhotoLabels: [], disclaimer: null },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qSwitchedSource.id,
        label: "Yes",
        value: "yes",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 15000, // +$150 to snake a wire from the existing switch up to the ceiling
        order: 1,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qSwitchedSource.id,
        label: "No",
        value: "no",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 22500, // +$150 wire run + $75 new switch (Replace Standard Switch WWT rate)
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qSwitchedSource.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Room where the light is going, full view", "Ceiling area where the fixture will be installed"],
      },
    ],
  });

  console.log("  ✓ Install New Ceiling Light tree (same structure as Recessed Lighting)");
}

async function seedNewCeilingFan() {
  // Same tree as Install New Ceiling Light and Recessed Lighting — attic
  // access → existing fixture → existing switch — applied to a new ceiling
  // fan. Base prices differ ($425 attic access / $525 no access, per
  // client) but the wire-run and new-switch add-on logic is identical.
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "new-ceiling-fan" },
  });
  await clearServiceTree(service.id);

  const qAtticAccess = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "attic_access",
      prompt: "Is there accessible attic space directly above where the fan is going?",
      helpText: "This is what lets us run wiring without opening up your ceiling.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  const qExistingLight = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "existing_light_source",
      prompt: "Is there an existing light fixture we'll be removing, or one nearby we can tap power from?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  const qSwitchedSource = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "switched_source",
      prompt: "Is there an existing switch in the room we could use to control the new fan?",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qAtticAccess.id, label: "Yes", value: "has_access", routeAction: "CONTINUE", nextQuestionId: qExistingLight.id, order: 1, requiredPhotoLabels: [], disclaimer: null },
      {
        questionId: qAtticAccess.id,
        label: "No",
        value: "no_access",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 10000, // $425 base -> $525 without attic access
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: "This price includes cutting into the ceiling to run wiring. Elite does not patch or paint drywall — that will need to be arranged separately after installation.",
      },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qExistingLight.id, label: "Yes", value: "yes", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qExistingLight.id, label: "No", value: "no", routeAction: "CONTINUE", nextQuestionId: qSwitchedSource.id, order: 2, requiredPhotoLabels: [], disclaimer: null },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qSwitchedSource.id,
        label: "Yes",
        value: "yes",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 15000, // +$150 to snake a wire from the existing switch up to the ceiling
        order: 1,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qSwitchedSource.id,
        label: "No",
        value: "no",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 22500, // +$150 wire run + $75 new switch (Replace Standard Switch WWT rate)
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qSwitchedSource.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Room where the fan is going, full view", "Ceiling area where the fan will be installed"],
      },
    ],
  });

  console.log("  ✓ Install New Ceiling Fan tree (same structure as Recessed Lighting / New Ceiling Light)");
}

async function seedApplianceInstallation() {
  // Phase 4 — first of the remaining categories. Same diagnostic-question
  // principle as everywhere else: each of these instant-book jobs assumes
  // wiring is already in place per the master doc's description, so the
  // one real branch point is confirming that's actually true. If it's
  // not, there's no fixed price for running new wiring here (no number
  // was ever given for that), so it goes to photo review rather than
  // silently overcharging or undercharging.
  //
  // The two receptacle-swap services (range/dryer) branch on whether the
  // new receptacle matches the existing plug configuration — a same-type
  // swap is a simple job; a different configuration (e.g. 3-prong to
  // 4-prong) usually means panel/wiring changes that need a look first.
  //
  // new-range-circuit and new-dryer-circuit are intentionally left with
  // no tree at all — they're genuinely open-ended custom work with no
  // fixed anchor price, so the engine's REMOTE_QUOTE fallback (added this
  // session) routes them straight to photo review.

  async function simpleExistingWiringTree(slug: string, itemLabel: string, photoLabels: string[]) {
    const service = await prisma.service.findUniqueOrThrow({ where: { slug } });
    await clearServiceTree(service.id);

    const q = await prisma.question.create({
      data: {
        serviceId: service.id,
        key: "existing_wiring",
        prompt: `Is there already an electrical connection in place for the ${itemLabel}?`,
        helpText: "For example, from a previous unit that used to be there.",
        inputType: "SINGLE_SELECT",
        order: 1,
      },
    });

    await prisma.answerOption.createMany({
      data: [
        { questionId: q.id, label: "Yes", value: "yes", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
        {
          questionId: q.id,
          label: "No",
          value: "no",
          routeAction: "PHOTO_REVIEW",
          order: 2,
          requiredPhotoLabels: photoLabels,
        },
      ],
    });

    console.log(`  ✓ ${slug} tree (existing wiring check)`);
  }

  await simpleExistingWiringTree("otr-microwave-install", "microwave", [
    "Cabinet space above the range",
    "Nearest outlet or electrical panel",
  ]);
  await simpleExistingWiringTree("dishwasher-electrical", "dishwasher", [
    "Under-sink area where the dishwasher connects",
    "Nearest outlet or panel",
  ]);
  await simpleExistingWiringTree("garbage-disposal-install", "garbage disposal", [
    "Under-sink area",
    "Nearest switch or outlet",
  ]);
  await simpleExistingWiringTree("range-hood-replacement", "range hood", [
    "Area above the range/cooktop",
    "Nearest electrical connection",
  ]);

  // Receptacle swaps — same-type is instant, different configuration or
  // uncertainty goes to photo review.
  async function receptacleSwapTree(slug: string, applianceLabel: string) {
    const service = await prisma.service.findUniqueOrThrow({ where: { slug } });
    await clearServiceTree(service.id);

    const q = await prisma.question.create({
      data: {
        serviceId: service.id,
        key: "same_receptacle_type",
        prompt: `Is the new receptacle the same type as what's there now (e.g. swapping a 3-prong for a 3-prong)?`,
        helpText: `This is about the ${applianceLabel} outlet's plug shape, not just that it's the same brand.`,
        inputType: "SINGLE_SELECT",
        order: 1,
      },
    });

    await prisma.answerOption.createMany({
      data: [
        { questionId: q.id, label: "Yes, same type", value: "same_type", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
        {
          questionId: q.id,
          label: "No, it's different",
          value: "different_type",
          routeAction: "PHOTO_REVIEW",
          order: 2,
          requiredPhotoLabels: [`Current ${applianceLabel} receptacle, close-up`, "Breaker panel"],
        },
        {
          questionId: q.id,
          label: "I'm not sure",
          value: "unsure",
          routeAction: "PHOTO_REVIEW",
          order: 3,
          requiredPhotoLabels: [`Current ${applianceLabel} receptacle, close-up`, "Breaker panel"],
        },
      ],
    });

    console.log(`  ✓ ${slug} tree (receptacle type check)`);
  }

  await receptacleSwapTree("range-receptacle-replacement", "range");
  await receptacleSwapTree("dryer-receptacle-replacement", "dryer");
}

async function main() {
  console.log("Seeding Phase 2 decision trees...");
  await seedReplaceStandardOutlet();
  await seedNewOutlet();
  await seedTvInstall();
  await seedTvInstallExistingLocation();
  await seedRecessedLighting();
  await seedNewCeilingLight();
  await seedNewCeilingFan();
  await seedApplianceInstallation();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
