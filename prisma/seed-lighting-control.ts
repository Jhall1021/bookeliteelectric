/**
 * Reusable Lighting Control / Switch-Leg module — handoff §13-§15.
 *
 * Run with: npx tsx prisma/seed-lighting-control.ts
 *
 * Two parts:
 *   1. Named JobComponents carrying the §13-§14 labor and material figures.
 *      Defined once; every service that needs a switch leg references them, so
 *      revising the labor is one edit rather than ten.
 *   2. The module questions, attached after the Height/Access module on every
 *      service where a new lighting or fan load might need a switch leg.
 *
 * Idempotent. Safe to re-run.
 *
 * KEY DESIGN POINT — the access answer is never asked twice.
 *
 * §13.2 and §13.3 each have an accessible and a finished variant. Rather than
 * asking about attic access inside this module, one answer carries BOTH
 * variants, each conditioned on `ceiling_access`. Whichever value the customer
 * already gave selects the right component. If it was never established, the
 * route goes to review rather than booking the wrong variant (§29).
 */

import { PrismaClient } from "@prisma/client";
import {
  upsertQuestion,
  rewireTerminalsInto,
  findDanglingReferences,
  findUnreachableQuestions,
} from "./_moduleHelpers";

const prisma = new PrismaClient();

/**
 * Schedule minutes are stored explicitly, never derived from labor hours at
 * runtime — a second technician changes the hours without changing the clock.
 * The launch values below assume one technician working the stated hours, and
 * are editable per component once real job data exists.
 */
/**
 * Approved customer-facing price per component, in cents.
 *
 * Derived from the §3-§4 model: (hours x $250) + (material x tier multiplier),
 * rounded up to $5. The $250 service-call minimum is NOT applied — these are
 * increments inside a primary service, and the minimum is charged once on the
 * whole job, not per switch leg.
 *
 * Set to null to send a route to review instead of pricing it.
 */
const COMPONENTS = [
  {
    key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE",
    // 0.75 hrs = $187.50 + $25 x 1.30 = $32.50 -> $220.
    approvedPriceCents: 22000,
    name: "Convert switched outlet control to ceiling lighting — accessible",
    customerFacingLabel: "Convert existing switched outlet to control your new light",
    addFieldLaborHours: 0.75,
    addMaterialCostCents: 2500,
    addScheduleMinutes: 45,
    notes: "Handoff §13.2, accessible attic route.",
  },
  {
    key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED",
    // 1.25 hrs = $312.50 + $35 x 1.30 = $45.50 -> $360.
    approvedPriceCents: 36000,
    name: "Convert switched outlet control to ceiling lighting — finished space",
    customerFacingLabel: "Convert existing switched outlet to control your new light",
    addFieldLaborHours: 1.25,
    addMaterialCostCents: 3500,
    addScheduleMinutes: 75,
    notes: "Handoff §13.2, finished-space route.",
  },
  {
    // §13.3 originally sent "no outlet nearby" straight to remote review.
    // Running power to a new switch is the same job as adding a new 120V
    // outlet, which is already priced and already has a decision tree — so
    // these two mirror it rather than handing the customer off.
    //
    // Price is the New 120V Outlet WHILE WE'RE THERE rate ($320 live), not
    // its standalone rate: the technician is already on site for the light or
    // fan, so the visit is paid for. Finished-wall adds the same $100 that
    // service's own tree adds.
    //
    // Labor and material are inherited from that service's add-on figures and
    // are launch assumptions, not measured — same caveat as everywhere else.
    key: "SWITCH_POWER_RUN_ACCESSIBLE",
    name: "Run power to a new switch — accessible route",
    customerFacingLabel: "Run power to your new switch",
    approvedPriceCents: 32000,
    addFieldLaborHours: 1.0,
    addMaterialCostCents: 2180,
    addScheduleMinutes: 60,
    notes: "Mirrors New 120V Outlet, accessible route. WWT price $320.",
  },
  {
    key: "SWITCH_POWER_RUN_FINISHED",
    name: "Run power to a new switch — finished walls",
    customerFacingLabel: "Run power to your new switch",
    approvedPriceCents: 42000,
    addFieldLaborHours: 1.5,
    addMaterialCostCents: 2180,
    addScheduleMinutes: 90,
    notes: "Mirrors New 120V Outlet finished-wall route: $320 + the same $100 that service adds.",
  },
  {
    key: "LED_DIMMER_UPGRADE",
    // $30 material x 1.30 tier = $39, rounded to $40. No labor (§14).
    approvedPriceCents: 4000,
    name: "LED dimmer upgrade",
    customerFacingLabel: "LED dimmer upgrade",
    // §14: a material upgrade, not another labor service, unless actual labor
    // materially changes. The §4 markup tier applies to the assembled total.
    addFieldLaborHours: 0,
    addMaterialCostCents: 3000,
    addScheduleMinutes: 0,
    notes: "Handoff §14. Only offered when Elite is already installing a new control.",
  },
];

/** §13 and §15 — anywhere a new lighting or fan load may need a switch leg. */
const SERVICES = [
  "new-ceiling-light",
  "new-ceiling-fan",
  "fan-replacing-light",
  "recessed-lighting",
];

const CONTROL_KEY = "lighting_control";
const NEAR_POWER_KEY = "switch_near_power";
const DIMMER_KEY = "lighting_dimmer_upgrade";
const ACCESS_KEY = "ceiling_access";
const DISTANCE_KEY = "switch_leg_distance";
const FINISH_ACK_KEY = "switchleg_finish_ack";

/**
 * Switch-leg labor by access class and run length.
 *
 * Another 10 ft through an open attic costs little once the technician is set
 * up. The same 10 ft through finished construction can mean another framing
 * bay, more drilling, another access opening. Past 20 ft the variability
 * outruns a fixed price either way.
 */
const SWITCHLEG = [
  { key: "SWITCHLEG_ACCESSIBLE_UNDER_10", name: "Switch leg — open route, under 10 ft", customerFacingLabel: "New wall switch and control wiring", addFieldLaborHours: 1.0, addMaterialCostCents: 3500, addScheduleMinutes: 60, approvedPriceCents: 30000 },
  { key: "SWITCHLEG_ACCESSIBLE_10_20", name: "Switch leg — open route, 10 to 20 ft", customerFacingLabel: "New wall switch and control wiring", addFieldLaborHours: 1.25, addMaterialCostCents: 3500, addScheduleMinutes: 75, approvedPriceCents: 36000 },
  { key: "SWITCHLEG_FINISHED_UNDER_10", name: "Switch leg — finished walls, under 10 ft", customerFacingLabel: "New wall switch and control wiring", addFieldLaborHours: 1.5, addMaterialCostCents: 4500, addScheduleMinutes: 90, approvedPriceCents: 43500 },
  { key: "SWITCHLEG_FINISHED_10_20", name: "Switch leg — finished walls, 10 to 20 ft", customerFacingLabel: "New wall switch and control wiring", addFieldLaborHours: 2.0, addMaterialCostCents: 4500, addScheduleMinutes: 120, approvedPriceCents: 56000 },
];

/**
 * Shown before the customer accepts a finished-space price. Explains WHY the
 * access question was asked — an open route is cheaper — so it reads as being
 * on their side rather than as groundwork for a surcharge.
 */
/**
 * Shown once, immediately before the switch-leg price.
 *
 * Worded to be true on either route, because an answer can't carry different
 * text depending on the access class established earlier. Both cases are real:
 * with no attic or basement there's no way to get a wire up a finished wall
 * without opening it, and even directly above an outlet the same is true —
 * "directly above" saves distance, not drywall. With an open route we usually
 * avoid openings, but not always.
 *
 * The closing line explains why we asked about access at all, so it reads as
 * being on the customer's side rather than as groundwork for a surcharge.
 */
const FINISHED_DISCLAIMER = [
  "Getting a wire to a new switch usually means opening the wall.",
  "If there's no attic, basement or drop ceiling to work from, your electrician will be fishing through finished walls, and one or more small openings in the drywall or plaster are very likely — even when the switch sits directly above an outlet. With an open route above or below, we can often avoid them, though a small opening is sometimes still needed.",
  "Either way, patching, sanding, painting, wallpaper and trim aren't included unless we've put it in writing.",
  "That's why we ask about attic and basement access — an open route usually means fewer openings and less time.",
].join("\n\n");
// Deliberately the SAME keys the New 120V Outlet tree uses. If the customer
// has already answered them — including after a reroute from that service —
// §29 reuse skips them rather than asking twice.
const WALL_ACCESS_KEY = "below_above_access";
const FINISHED_BOTH_KEY = "finished_space_both_sides";

const REVIEW_PHOTOS = [
  "The wall switch in question, plate on — please don't remove it",
  "The ceiling location where the new light or fan will go",
  "A wider photo of the room",
];

/**
 * NEW_SWITCH_AND_SWITCH_LEG_ACCESSIBLE and _FINISHED are gone. They carried a
 * single figure per access class with no distance dimension, which is where
 * the flat finished-space surcharge came from. seed-access-normalization.ts
 * replaces them with four components split by run length as well.
 *
 * Retired rather than deleted below — they may appear on past bookings.
 */
async function retireOldSwitchLegComponents() {
  const retired = await prisma.jobComponent.updateMany({
    where: { key: { in: ["NEW_SWITCH_AND_SWITCH_LEG_ACCESSIBLE", "NEW_SWITCH_AND_SWITCH_LEG_FINISHED"] } },
    data: { active: false },
  });
  if (retired.count) console.log(`  ✓ ${retired.count} superseded switch-leg component(s) retired`);
}

async function seedComponents() {
  for (const c of COMPONENTS) {
    await prisma.jobComponent.upsert({
      where: { key: c.key },
      update: {
        name: c.name,
        customerFacingLabel: c.customerFacingLabel,
        addFieldLaborHours: c.addFieldLaborHours,
        addMaterialCostCents: c.addMaterialCostCents,
        addScheduleMinutes: c.addScheduleMinutes,
        approvedPriceCents: c.approvedPriceCents,
        notes: c.notes,
      },
      create: c,
    });
  }
  for (const c of SWITCHLEG) {
    await prisma.jobComponent.upsert({ where: { key: c.key }, update: { ...c }, create: c });
  }
  console.log(`  ✓ ${COMPONENTS.length + SWITCHLEG.length} job components defined`);
}

async function attach(slug: string) {
  const service = await prisma.service.findUnique({
    where: { slug },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  const moduleKeys = [CONTROL_KEY, NEAR_POWER_KEY, DISTANCE_KEY, FINISH_ACK_KEY, DIMMER_KEY, WALL_ACCESS_KEY, FINISHED_BOTH_KEY];

  // Questions are upserted by key, never deleted and recreated. Recreating
  // them handed out new ids while other answers still pointed at the old
  // ones, which silently broke four trees.
  const kept = service.questions.filter((q) => !moduleKeys.includes(q.key));
  const nextOrder = kept.length;

  const comp = async (key: string) =>
    (await prisma.jobComponent.findUniqueOrThrow({ where: { key } })).id;

  const qControl = await upsertQuestion(prisma, service.id, {
    key: CONTROL_KEY,
prompt: "How would you like the new light controlled?",
      helpText:
        "You don't need to look inside anything — just tell us how you'd like it to work.",
    order: nextOrder,
  });

  const qNearPower = await upsertQuestion(prisma, service.id, {
    key: NEAR_POWER_KEY,
    prompt: "Could the new switch go directly above an existing outlet?",
    helpText:
      "If the switch sits right above an outlet we can bring power straight up inside the same wall cavity. Anywhere else means fishing a wire or opening the wall, which takes longer.",
    order: nextOrder + 1,
  });

  // Mirrors the New 120V Outlet access pair, for the case where power has to
  // be run to the new switch location.
  const qWallAccess = await upsertQuestion(prisma, service.id, {
    key: WALL_ACCESS_KEY,
prompt:
        "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below the wall where the switch will go?",
      helpText: "This is what decides whether we can run the wire without opening up the wall.",
    order: nextOrder + 3,
  });

  const qFinishedBoth = await upsertQuestion(prisma, service.id, {
    key: FINISHED_BOTH_KEY,
    prompt:
      "Is there finished living space directly above and/or below that wall, or is the room on a slab?",
    helpText:
      "Either way we'd be running the wire inside the finished wall. We're checking there's nothing unusual behind it.",
    order: nextOrder + 4,
  });

  const qDistance = await upsertQuestion(prisma, service.id, {
    key: DISTANCE_KEY,
    prompt: "About how far is the new switch from the light?",
    helpText: "Roughly the path the wire would take, not the straight line across the room.",
    order: nextOrder + 5,
  });

  // Reached only from an answer that establishes a finished route. Sitting it
  // here rather than on the price means it fires once, on the path where
  // cutting is genuinely foreseeable — and never on the attic path, where
  // warning about drywall would be a lie.
  //
  // Applies even when the switch is directly above an outlet: with no attic or
  // basement to work from, getting a wire from that outlet up to the switch
  // still means opening the wall.
  const qFinishAck = await upsertQuestion(prisma, service.id, {
    key: FINISH_ACK_KEY,
    prompt: "Before we price this — one thing about access",
    helpText: FINISHED_DISCLAIMER,
    order: nextOrder + 6,
  });

  const qDimmer = await upsertQuestion(prisma, service.id, {
    key: DIMMER_KEY,
prompt: "Would you like a dimmer on the new switch?",
    order: nextOrder + 2,
  });

  // §13.1 — an existing switched ceiling light is already the condition we
  // need. No component, no add-on: "Existing wall-switch control — Included".
  // §13.4 — a switch that controls something else, nothing, or the customer
  // doesn't know: do NOT assume it can be used.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qControl.id,
        label: "From the wall switch that already controls a ceiling light in this room",
        value: "existing_switched_light",
        // The consequence has to be visible BEFORE they pick it: the new
        // light will come on with the existing one, from the same switch.
        // "Can we tap power from a nearby light" hid that, and a customer
        // who wanted independent control would only find out on the day.
        // True whichever route the house has: sharing the switch is a
        // consequence of picking up power at that fixture, full stop.
        disclaimer:
          "We'll pick up power at that existing light, so your new one will turn on and off together with it, from the same switch. If you'd rather it had its own switch, choose the new-switch option instead.",
        // Only true with no attic or open space above.
        accessFinishedDisclaimer:
          "Because there's no open space above this ceiling, we'll need to make an opening at the existing light as well as at the new one to make that connection. The fixture covers some of it, but not always all.",
        routeAction: "CONTINUE",
        nextQuestionId: qDimmer.id,
        order: 1,
        requiredPhotoLabels: [],
        // §13.1 — nothing to add, and nothing to approve.
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qControl.id,
        label: "A wall switch here controls an outlet — I'd like it to control the new light instead",
        value: "switched_outlet",
        routeAction: "CONTINUE",
        nextQuestionId: qDimmer.id,
        order: 2,
        requiredPhotoLabels: [],
        // Price comes from whichever component variant the earlier access
        // answer selects — accessible and finished cost different amounts, so
        // no single figure on the answer could be right for both.
        approvedComponentPriceCents: null,
      },
      {
        questionId: qControl.id,
        label: "I need a new wall switch — there isn't one where I want it",
        value: "no_switch",
        routeAction: "CONTINUE",
        nextQuestionId: qNearPower.id,
        order: 3,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qControl.id,
        label: "There's a switch, but I don't know what it controls",
        value: "switch_unclear",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 4,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
      {
        questionId: qControl.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 5,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  // §13.2 — the switched-outlet conversion, in both access variants.
  const switchedOutlet = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qControl.id, value: "switched_outlet" },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      // Conditioned on the access CLASSIFICATION, not on this service's
      // wording — so it resolves whether the customer answered
      // "ceiling_access = accessible" or "attic_access = has_access".
      {
        answerOptionId: switchedOutlet.id,
        componentId: await comp("CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE"),
        conditionAccessClass: "ACCESSIBLE",
      },
      {
        answerOptionId: switchedOutlet.id,
        componentId: await comp("CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED"),
        conditionAccessClass: "FINISHED",
      },
    ],
  });

  // §13.3 — new switch plus switch leg, needing suitable nearby power.
  await prisma.answerOption.createMany({
    data: [
      {
        // The only cheap case: switch directly above an outlet, power comes
        // straight up the same stud bay. "Is there an outlet nearby" used to
        // invite a yes about an outlet across the room — which is a snake or
        // a cut, not a grab, and got priced as though it weren't.
        questionId: qNearPower.id,
        label: "Yes — I can put it directly above an outlet",
        value: "yes",
        routeAction: "CONTINUE",
        nextQuestionId: qDistance.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        // There IS power in the room, just not under the switch. Same work as
        // running a new circuit to it — kept separate from "no outlets at all"
        // because the job sheet benefits from knowing power is close by.
        questionId: qNearPower.id,
        label: "There's an outlet in the room, but not where the switch needs to go",
        value: "outlet_elsewhere",
        routeAction: "CONTINUE",
        nextQuestionId: qWallAccess.id,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qNearPower.id,
        label: "No outlets nearby at all",
        value: "no",
        routeAction: "CONTINUE",
        nextQuestionId: qWallAccess.id,
        order: 3,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qNearPower.id,
        label: "I'm not sure",
        value: "unsure",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 4,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  // Switch-leg components are attached by seed-access-normalization.ts, which
  // splits them by run length as well as access class. The old
  // undifferentiated pair used to be attached here.

  // --- power-run path: no outlet near the new switch ---------------------
  // Mirrors the New 120V Outlet access logic. Running power to a new switch
  // is the same job as adding an outlet, so it asks the same questions and
  // prices from the same figures rather than dead-ending at review.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qWallAccess.id,
        label: "Yes",
        value: "has_access",
        accessClassification: "ACCESSIBLE",
        routeAction: "CONTINUE",
        nextQuestionId: qDimmer.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
      },
      {
        questionId: qWallAccess.id,
        label: "No",
        value: "no_access",
        accessClassification: "FINISHED",
        routeAction: "CONTINUE",
        nextQuestionId: qFinishedBoth.id,
        order: 2,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
    ],
  });

  const wallHasAccess = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qWallAccess.id, value: "has_access" },
  });
  await prisma.answerOptionComponent.create({
    data: { answerOptionId: wallHasAccess.id, componentId: await comp("SWITCH_POWER_RUN_ACCESSIBLE") },
  });

  await prisma.answerOption.createMany({
    data: [
      {
        // "No" made no sense here — the only way to reach this question is
        // having already said there's no attic or basement. Slab folded into
        // the prompt because it's the same job: no path, fish the wall.
        questionId: qFinishedBoth.id,
        label: "Yes — finished space above or below, or the room's on a slab",
        value: "finished_both_sides",
        accessClassification: "FINISHED",
        routeAction: "CONTINUE",
        nextQuestionId: qFinishAck.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: null,
      },
      {
        // Different work — insulation, fire blocking, sometimes masonry
        // behind the drywall. Not priced blind.
        questionId: qFinishedBoth.id,
        label: "It's an exterior wall",
        value: "exterior_wall",
        accessClassification: "UNKNOWN",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
      {
        questionId: qFinishedBoth.id,
        label: "I'm not sure",
        value: "unsure",
        accessClassification: "UNKNOWN",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  const finishedYes = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qFinishedBoth.id, value: "finished_both_sides" },
  });
  await prisma.answerOptionComponent.create({
    data: { answerOptionId: finishedYes.id, componentId: await comp("SWITCH_POWER_RUN_FINISHED") },
  });

  // Distance bands. Each answer carries both access variants; the
  // classification established earlier picks which applies, so the homeowner
  // is never asked about attic access twice (§29).
  await prisma.answerOption.createMany({
    data: [
      { questionId: qDistance.id, label: "Less than 10 feet", value: "under_10", routeAction: "CONTINUE", nextQuestionId: qFinishAck.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: qDistance.id, label: "10 to 20 feet", value: "10_to_20", routeAction: "CONTINUE", nextQuestionId: qFinishAck.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      // Past 20 ft the variability outruns a fixed price. Same reasoning as
      // the dedicated circuit's 50 ft cap.
      { questionId: qDistance.id, label: "More than 20 feet", value: "over_20", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qDistance.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  for (const [value, accKey, finKey] of [
    ["under_10", "SWITCHLEG_ACCESSIBLE_UNDER_10", "SWITCHLEG_FINISHED_UNDER_10"],
    ["10_to_20", "SWITCHLEG_ACCESSIBLE_10_20", "SWITCHLEG_FINISHED_10_20"],
  ] as const) {
    const opt = await prisma.answerOption.findFirstOrThrow({
      where: { questionId: qDistance.id, value },
    });
    await prisma.answerOptionComponent.createMany({
      data: [
        { answerOptionId: opt.id, componentId: await comp(accKey), conditionAccessClass: "ACCESSIBLE" },
        { answerOptionId: opt.id, componentId: await comp(finKey), conditionAccessClass: "FINISHED" },
      ],
    });
  }

  // Two answers, not a checkbox: agreeing is a real choice, so someone who'd
  // rather have it looked at first needs somewhere to go. The acceptance lands
  // in answersSnapshot, where it's provable later.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qFinishAck.id,
        label: "I understand — go ahead",
        value: "accepted",
        routeAction: "CONTINUE",
        nextQuestionId: qDimmer.id,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qFinishAck.id,
        label: "I'd rather Elite take a look first",
        value: "review_first",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS,
      },
    ],
  });

  // §14 — dimmer is a material upgrade on a control we're already installing.
  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qDimmer.id,
        label: "No, a standard switch is fine",
        value: "standard",
        routeAction: "RESOLVE_INSTANT",
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        questionId: qDimmer.id,
        label: "Yes, add an LED dimmer",
        value: "dimmer",
        routeAction: "RESOLVE_INSTANT",
        order: 2,
        requiredPhotoLabels: [],
        // Priced by the component itself (§14) — a $30 material upgrade.
        approvedComponentPriceCents: null,
      },
    ],
  });

  const dimmerYes = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qDimmer.id, value: "dimmer" },
  });
  await prisma.answerOptionComponent.create({
    data: { answerOptionId: dimmerYes.id, componentId: await comp("LED_DIMMER_UPGRADE") },
  });

  // --- wire the module INTO the tree -----------------------------------
  // Appending questions doesn't make them reachable. Routing follows
  // nextQuestionId, not `order`, so every answer that currently ENDS the flow
  // has to hand off to the control question instead — otherwise the customer
  // gets their price at the end of the service's own questions and never sees
  // the module at all.
  //
  // Only terminal resolving answers are rewired. Photo-review, reroute and
  // troubleshooting branches are left exactly as they are: those are
  // deliberate exits, and a customer heading to review doesn't need to be
  // asked about switch wiring first.
  //
  // priceModifierCents on a rewired answer still accumulates — switching
  // RESOLVE_ADJUSTED to CONTINUE changes where the customer goes next, not
  // what the answer contributes.
  // Converts first-run terminals AND repairs anything pointing at a question
  // that no longer exists — the damage delete-and-recreate left behind.
  const { converted, repaired } = await rewireTerminalsInto(
    prisma,
    service.id,
    qControl.id,
    moduleKeys
  );

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);

  console.log(
    `  ✓ ${slug} — ${converted} terminal answer(s) wired in` +
      (repaired ? `, ${repaired} broken reference(s) repaired` : "") +
      (dangling.length ? `  [DANGLING: ${dangling.join(", ")}]` : "") +
      (unreachable.length ? `  [UNREACHABLE: ${unreachable.join(", ")}]` : "")
  );
}

async function main() {
  console.log("Seeding the Lighting Control / Switch-Leg module...\n");
  await seedComponents();
  await retireOldSwitchLegComponents();
  console.log();
  for (const slug of SERVICES) await attach(slug);
  console.log(`
Components carry real labor, material and schedule time — not dollar amounts —
so they reprice when the tech-hour rate changes and they contribute to the
technician-hours the job actually consumes.

Routes selecting components have NO approved customer price yet, so they go to
review rather than booking a calculated figure. Approve prices per answer in
the admin editor to make them instantly bookable.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
