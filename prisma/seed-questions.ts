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

  // Fetched so the mount answer options can reference these services'
  // LIVE prices instead of a frozen number — see AnswerOption.referencedServiceId.
  const tiltMount = await prisma.service.findUniqueOrThrow({ where: { slug: "elite-tilt-mount" } });
  const articulatingMount = await prisma.service.findUniqueOrThrow({ where: { slug: "elite-articulating-mount" } });

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
      { questionId: qMount.id, label: "No — add Elite Tilt Mount", value: "add_tilt_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, referencedServiceId: tiltMount.id, order: 2, requiredPhotoLabels: [] },
      { questionId: qMount.id, label: "No — add Elite Full-Motion Mount", value: "add_articulating_mount", routeAction: "CONTINUE", nextQuestionId: qWall.id, referencedServiceId: articulatingMount.id, order: 3, requiredPhotoLabels: [] },
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

  // Same live-price references as the main TV Installation tree — see
  // AnswerOption.referencedServiceId.
  const tiltMount = await prisma.service.findUniqueOrThrow({ where: { slug: "elite-tilt-mount" } });
  const articulatingMount = await prisma.service.findUniqueOrThrow({ where: { slug: "elite-articulating-mount" } });

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
      { questionId: qMountType.id, label: "Elite Tilt Mount", value: "tilt", routeAction: "RESOLVE_ADJUSTED", referencedServiceId: tiltMount.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qMountType.id, label: "Elite Full-Motion Articulating Mount", value: "articulating", routeAction: "RESOLVE_ADJUSTED", referencedServiceId: articulatingMount.id, order: 2, requiredPhotoLabels: [] },
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
  // Rebuilt per client direction: everything in this category is a simple
  // remove-and-replace job using wiring that's already there — no
  // diagnostic branching needed, just a flat price (with a disclaimer on
  // two of them). The one genuine exception is a brand-new microwave
  // install, which really does depend on what's currently above the
  // range. Anything needing an actual new circuit is handled by the
  // Dedicated Circuits category instead, not duplicated here.
  //
  // Every affected service's tree is explicitly cleared first — several
  // of these had a 1-question tree from an earlier version of this
  // function that no longer applies now that they're flat-price.
  const flatServices = [
    "otr-microwave-install",
    "dishwasher-electrical",
    "garbage-disposal-install",
    "range-receptacle-replacement",
    "dryer-receptacle-replacement",
  ];
  for (const slug of flatServices) {
    const service = await prisma.service.findUniqueOrThrow({ where: { slug } });
    await clearServiceTree(service.id);
  }
  console.log("  ✓ Cleared old trees on flat-price appliance services (now zero-question, price + disclaimer only)");

  // Install New Microwave — the one real decision tree in this category.
  const newMicrowave = await prisma.service.findUniqueOrThrow({
    where: { slug: "install-new-microwave" },
  });
  await clearServiceTree(newMicrowave.id);

  const qWhatsAbove = await prisma.question.create({
    data: {
      serviceId: newMicrowave.id,
      key: "whats_above_range",
      prompt: "What's currently above where the microwave will go?",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qWhatsAbove.id,
        label: "There's already power in the cabinet above",
        value: "existing_power",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qWhatsAbove.id,
        label: "There's an existing hood we're removing",
        value: "existing_hood",
        routeAction: "RESOLVE_ADJUSTED",
        priceModifierCents: 7500, // +$75 to install an outlet in a box off the hood feed
        order: 2,
        requiredPhotoLabels: [],
        disclaimer: null,
      },
      {
        questionId: qWhatsAbove.id,
        label: "There's no power or hood there",
        value: "no_power_no_hood",
        routeAction: "RESOLVE_ADJUSTED", // same base price — this covers hanging the microwave only
        order: 3,
        requiredPhotoLabels: [],
        disclaimer:
          "This price covers mounting the microwave itself. Since there's no power source there yet, you'll also need a dedicated circuit run to complete the install — that's priced separately under Dedicated Circuits.",
      },
    ],
  });

  console.log("  ✓ Install New Microwave tree (what's above the range → price + $75 hood add-on + no-power disclaimer)");
}

async function seedSafetyProtection() {
  // Hardwired Smoke Detector, Smoke/CO Detector, and Home Electrical
  // Safety Inspection stay flat-price with no tree — straightforward
  // replace/service jobs with no real branch point, same reasoning as
  // most of Appliance Installation.
  //
  // Whole-House Surge Protection is the one exception: whether the panel
  // has an open slot for the new breaker is a genuine real-world
  // constraint that affects whether this is a standard job or needs a
  // look first — not just a formality question.
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "whole-house-surge-protection" },
  });
  await clearServiceTree(service.id);

  const q = await prisma.question.create({
    data: {
      serviceId: service.id,
      key: "panel_has_open_slot",
      prompt: "Does your electrical panel have an open slot for a new breaker?",
      helpText: "This is what the surge protector connects to. If your panel is full, we may need a different approach.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: q.id, label: "Yes", value: "yes", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
      {
        questionId: q.id,
        label: "No, it's full",
        value: "full",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Panel with the door open", "Breaker directory/label, if there is one"],
      },
      {
        questionId: q.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Panel with the door open", "Breaker directory/label, if there is one"],
      },
    ],
  });

  console.log("  ✓ Whole-House Surge Protection tree (open panel slot check)");
}

async function seedSmartHomeSecurity() {
  // Video Doorbell (Existing Wiring), Floodlight Camera (Existing
  // Fixture), and Doorbell Transformer Replacement stay flat-price —
  // straightforward jobs using what's already there, no real branch.
  //
  // Smart Thermostat Installation gets a real diagnostic branch: whether
  // the existing thermostat wiring has a C-wire (common wire) genuinely
  // changes what the job requires — a well-known variable in smart
  // thermostat installs, not a formality question.
  const thermostat = await prisma.service.findUniqueOrThrow({
    where: { slug: "smart-thermostat-install" },
  });
  await clearServiceTree(thermostat.id);

  const qCWire = await prisma.question.create({
    data: {
      serviceId: thermostat.id,
      key: "has_c_wire",
      prompt: "Does your current thermostat wiring include a C-wire (common wire)?",
      helpText: "Most smart thermostats need this to work. If you're not sure, take a look behind your existing thermostat — a C-wire is usually labeled \"C\" on the terminal block.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qCWire.id, label: "Yes", value: "yes", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
      {
        questionId: qCWire.id,
        label: "No",
        value: "no",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Current thermostat with the cover removed, showing the wiring"],
      },
      {
        questionId: qCWire.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Current thermostat with the cover removed, showing the wiring"],
      },
    ],
  });
  console.log("  ✓ Smart Thermostat Installation tree (C-wire check)");

  // The two remote-quote-only jobs get a single lightweight question just
  // to collect a more useful photo than the engine's generic fallback
  // would — no price differentiation, since none was ever given for these.
  const newDoorbell = await prisma.service.findUniqueOrThrow({
    where: { slug: "new-video-doorbell-wiring" },
  });
  await clearServiceTree(newDoorbell.id);

  const qDoorbellReady = await prisma.question.create({
    data: {
      serviceId: newDoorbell.id,
      key: "ready_for_review",
      prompt: "Let's get you a price — we'll just need a couple of photos.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qDoorbellReady.id,
        label: "Continue",
        value: "continue",
        routeAction: "PHOTO_REVIEW",
        order: 1,
        requiredPhotoLabels: ["Where the doorbell will be mounted, from outside", "Nearest indoor outlet or electrical panel"],
      },
    ],
  });

  const newCamera = await prisma.service.findUniqueOrThrow({
    where: { slug: "new-exterior-flood-camera" },
  });
  await clearServiceTree(newCamera.id);

  const qCameraReady = await prisma.question.create({
    data: {
      serviceId: newCamera.id,
      key: "ready_for_review",
      prompt: "Let's get you a price — we'll just need a couple of photos.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qCameraReady.id,
        label: "Continue",
        value: "continue",
        routeAction: "PHOTO_REVIEW",
        order: 1,
        requiredPhotoLabels: ["Full wall where the camera is going", "Nearest existing exterior fixture or outlet, if any"],
      },
    ],
  });

  console.log("  ✓ New Video Doorbell Wiring / New Exterior Flood Camera trees (tailored photo requests)");
}

async function seedPanelsTroubleshooting() {
  // Single/Double-Pole Breaker Replacement stay flat-price — simple swaps,
  // no branch point. Electrical Troubleshooting deliberately has NO tree
  // at all — the entire point of that service is diagnosing an unknown
  // problem, so there's nothing to ask upfront that would meaningfully
  // change the $249 starting price.
  //
  // Panel Replacement and 200A Service Upgrade both get tailored photo
  // requests (same pattern as the smart-home remote-quote jobs) instead
  // of the engine's generic fallback — no price differentiation, since
  // these are always custom-quoted regardless of the answer, but the
  // right photos matter a lot for a job this size.
  async function tailoredPhotoReview(slug: string, photoLabels: string[]) {
    const service = await prisma.service.findUniqueOrThrow({ where: { slug } });
    await clearServiceTree(service.id);

    const q = await prisma.question.create({
      data: {
        serviceId: service.id,
        key: "ready_for_review",
        prompt: "Let's get you a price — we'll just need a few photos.",
        inputType: "SINGLE_SELECT",
        order: 1,
      },
    });
    await prisma.answerOption.createMany({
      data: [
        {
          questionId: q.id,
          label: "Continue",
          value: "continue",
          routeAction: "PHOTO_REVIEW",
          order: 1,
          requiredPhotoLabels: photoLabels,
        },
      ],
    });
    console.log(`  ✓ ${slug} tree (tailored photo request)`);
  }

  await tailoredPhotoReview("electrical-panel-replacement", [
    "Panel with the door open, showing the amp rating and breakers",
    "Wide shot of the area around the panel (for access/clearance)",
  ]);
  await tailoredPhotoReview("200a-service-upgrade", [
    "Panel with the door open, showing the current amp rating",
    "Electric meter",
    "Wide shot of the panel area and clearance around it",
  ]);
}

async function seedEvGarage() {
  // Level 2 EV Charger — the most variable job in this category. All
  // answers ultimately still route to photo review (no fixed price was
  // ever given for the different scenarios), but given the value of this
  // job it's worth collecting real qualifying info upfront rather than a
  // single "Continue" button, same way a real intake call would.
  const evCharger = await prisma.service.findUniqueOrThrow({
    where: { slug: "level-2-ev-charger" },
  });
  await clearServiceTree(evCharger.id);

  const qDistance = await prisma.question.create({
    data: {
      serviceId: evCharger.id,
      key: "panel_distance",
      prompt: "How far is your electrical panel from where the charger will be installed?",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });
  const qCapacity = await prisma.question.create({
    data: {
      serviceId: evCharger.id,
      key: "panel_capacity",
      prompt: "Does your panel have an open double-pole breaker slot for the charger?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });
  const qGarageType = await prisma.question.create({
    data: {
      serviceId: evCharger.id,
      key: "garage_type",
      prompt: "Is this for an attached or detached garage, or an outdoor location like a driveway?",
      inputType: "SINGLE_SELECT",
      order: 3,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qDistance.id, label: "Same wall or room as the panel", value: "same_room", routeAction: "CONTINUE", nextQuestionId: qCapacity.id, order: 1, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qDistance.id, label: "Same floor, different room", value: "same_floor", routeAction: "CONTINUE", nextQuestionId: qCapacity.id, order: 2, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qDistance.id, label: "Different floor", value: "different_floor", routeAction: "CONTINUE", nextQuestionId: qCapacity.id, order: 3, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qDistance.id, label: "Detached garage", value: "detached", routeAction: "CONTINUE", nextQuestionId: qCapacity.id, order: 4, requiredPhotoLabels: [], disclaimer: null },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qCapacity.id, label: "Yes", value: "yes", routeAction: "CONTINUE", nextQuestionId: qGarageType.id, order: 1, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qCapacity.id, label: "No", value: "no", routeAction: "CONTINUE", nextQuestionId: qGarageType.id, order: 2, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qCapacity.id, label: "I'm not sure", value: "unsure", routeAction: "CONTINUE", nextQuestionId: qGarageType.id, order: 3, requiredPhotoLabels: [], disclaimer: null },
    ],
  });

  const evPhotoLabels = [
    "Panel with the door open, showing the amp rating and breakers",
    "Where the charger will be mounted",
    "Path between the panel and the charger location (for run distance)",
  ];
  await prisma.answerOption.createMany({
    data: [
      { questionId: qGarageType.id, label: "Attached garage", value: "attached", routeAction: "PHOTO_REVIEW", order: 1, requiredPhotoLabels: evPhotoLabels },
      { questionId: qGarageType.id, label: "Detached garage", value: "detached_confirm", routeAction: "PHOTO_REVIEW", order: 2, requiredPhotoLabels: evPhotoLabels },
      { questionId: qGarageType.id, label: "Outdoor / driveway", value: "outdoor", routeAction: "PHOTO_REVIEW", order: 3, requiredPhotoLabels: evPhotoLabels },
    ],
  });
  console.log("  ✓ Level 2 EV Charger tree (distance → capacity → location, tailored intake)");

  // Garage Door Opener Outlet — identical logic to the New 120V Outlet
  // service (same job, same pricing tiers), just listed here too for
  // discoverability in this category.
  const garageOutlet = await prisma.service.findUniqueOrThrow({
    where: { slug: "garage-door-opener-outlet-ev" },
  });
  await clearServiceTree(garageOutlet.id);

  const qAccess = await prisma.question.create({
    data: {
      serviceId: garageOutlet.id,
      key: "attic_basement_access",
      prompt: "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below where the outlet is going?",
      helpText: "This is what determines whether we can run the wire without opening up your walls.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });
  const qFinishedSpace = await prisma.question.create({
    data: {
      serviceId: garageOutlet.id,
      key: "finished_space_both_sides",
      prompt: "Is there finished living space directly above and below this wall?",
      inputType: "SINGLE_SELECT",
      order: 2,
    },
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qAccess.id, label: "Yes", value: "has_access", routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], disclaimer: null },
      { questionId: qAccess.id, label: "No", value: "no_access", routeAction: "CONTINUE", nextQuestionId: qFinishedSpace.id, order: 2, requiredPhotoLabels: [], disclaimer: null },
    ],
  });
  await prisma.answerOption.createMany({
    data: [
      { questionId: qFinishedSpace.id, label: "Yes", value: "finished_both_sides", routeAction: "RESOLVE_ADJUSTED", priceModifierCents: 10000, order: 1, requiredPhotoLabels: [], disclaimer: null },
      {
        questionId: qFinishedSpace.id,
        label: "No",
        value: "not_finished_both_sides",
        routeAction: "PHOTO_REVIEW",
        order: 2,
        requiredPhotoLabels: ["Wall where the outlet is needed, full height", "Nearest attic or basement access point, if any"],
      },
      {
        questionId: qFinishedSpace.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        order: 3,
        requiredPhotoLabels: ["Wall where the outlet is needed, full height", "Nearest attic or basement access point, if any"],
      },
    ],
  });
  console.log("  ✓ Garage Door Opener Outlet (EV & Garage) tree — same logic as New 120V Outlet");

  // 240V Garage Outlet — lighter tailored-photo-review treatment, same
  // pattern as the smart-home/panels remote-quote jobs.
  const garage240 = await prisma.service.findUniqueOrThrow({
    where: { slug: "240v-garage-outlet" },
  });
  await clearServiceTree(garage240.id);

  const qReady = await prisma.question.create({
    data: {
      serviceId: garage240.id,
      key: "ready_for_review",
      prompt: "Let's get you a price — we'll just need a couple of photos.",
      inputType: "SINGLE_SELECT",
      order: 1,
    },
  });
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qReady.id,
        label: "Continue",
        value: "continue",
        routeAction: "PHOTO_REVIEW",
        order: 1,
        requiredPhotoLabels: ["Panel with the door open", "Where the outlet is needed in the garage"],
      },
    ],
  });
  console.log("  ✓ 240V Garage Outlet tree (tailored photo request)");
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
  await seedSafetyProtection();
  await seedSmartHomeSecurity();
  await seedPanelsTroubleshooting();
  await seedEvGarage();
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
