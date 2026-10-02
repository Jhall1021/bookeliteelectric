/**
 * Connect the audited atomic recipes to the customer trees for the remaining
 * ordinary lighting extensions. Customers describe only visible facts:
 * height, access, approximate route length, ordinary finishes and control.
 * Predictable routes price immediately; uncertainty and specialty finishes
 * remain review-bound. Finished routes use the disclosed conservative
 * 16-inch framing envelope in circuitPackagePricing.
 */
import { PrismaClient } from "@prisma/client";
import { addNumericUnknownOption, findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "./_moduleHelpers";
import { workAreaBelowAnswerOptions } from "./_workAreaBelowOptions";
import {
  EXTERIOR_SWITCH_CONTINGENCY_TEXT,
  EXTERIOR_WALL_CONTINGENCY_TEXT,
  EXTERIOR_WALL_DISCLAIMER_KEYS,
  EXTERIOR_WALL_QUESTION_HELP,
} from "../lib/electrical/exteriorWallContingency";

const prisma = new PrismaClient();

const TARGETS = [
  { slug: "new-ceiling-light", noun: "ceiling light", ceiling: true, replacement: "replace-interior-light-fixture" },
  { slug: "new-wall-sconce", noun: "wall sconce", ceiling: false, replacement: "replace-wall-sconce" },
  { slug: "recessed-lighting", noun: "recessed lighting", ceiling: true },
  { slug: "new-exterior-lighting-locations", noun: "exterior light", ceiling: false, replacement: "replace-exterior-light-fixture", exterior: true },
] as const;

const PHOTOS = [
  "A wide photo showing the existing control or power source and the proposed new location",
  "A photo showing the wall or ceiling along the proposed wiring route",
];

export function lightingExtensionRouteTransitions(ids: {
  surface: string;
  clear: string;
}) {
  return {
    finished: ids.surface,
    surface: ids.clear,
  } as const;
}

async function clearTree(db: PrismaClient, serviceId: string) {
  const questions = await db.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await db.answerOption.deleteMany({ where: { questionId: question.id } });
  await db.question.deleteMany({ where: { serviceId } });
}

async function attachContractorDisclaimer(
  db: PrismaClient,
  contractorId: string,
  answerOptionId: string,
  key: string,
) {
  const canonical = await db.canonicalDisclaimer.findUniqueOrThrow({ where: { key }, select: { id: true } });
  const disclaimer = await db.contractorDisclaimer.findUniqueOrThrow({
    where: { contractorId_canonicalDisclaimerId: { contractorId, canonicalDisclaimerId: canonical.id } },
    select: { id: true },
  });
  await db.answerOptionDisclaimer.create({
    data: { answerOptionId, contractorDisclaimerId: disclaimer.id, order: 0 },
  });
}

async function ensureExteriorWallDisclaimers(db: PrismaClient, contractorId: string) {
  const definitions = [
    {
      key: EXTERIOR_WALL_DISCLAIMER_KEYS.switch,
      name: "Exterior wall contingency — switch leg",
      description: "An exterior wall can turn an otherwise accessible new-switch route into a finished-wall route.",
      accessClass: null,
      text: EXTERIOR_SWITCH_CONTINGENCY_TEXT,
    },
    {
      key: EXTERIOR_WALL_DISCLAIMER_KEYS.wallSconce,
      name: "Exterior wall contingency — new wall sconce",
      description: "An exterior wall can turn an otherwise accessible new-wall-sconce route into a finished-wall route.",
      accessClass: "ACCESSIBLE" as const,
      text: EXTERIOR_WALL_CONTINGENCY_TEXT,
    },
  ];
  for (const definition of definitions) {
    const canonical = await db.canonicalDisclaimer.upsert({
      where: { key: definition.key },
      update: { name: definition.name, description: definition.description, accessClass: definition.accessClass },
      create: { key: definition.key, name: definition.name, description: definition.description, accessClass: definition.accessClass },
      select: { id: true },
    });
    await db.contractorDisclaimer.upsert({
      where: { contractorId_canonicalDisclaimerId: { contractorId, canonicalDisclaimerId: canonical.id } },
      update: { text: definition.text },
      create: { contractorId, canonicalDisclaimerId: canonical.id, text: definition.text },
    });
  }
}

export async function migrateRouteCompleteExtensions(db: PrismaClient = prisma, contractorSlug = "elite-electric") {
  const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
  await ensureExteriorWallDisclaimers(db, contractor.id);
  const results: { slug: string; questionCount: number }[] = [];

  for (const target of TARGETS) {
    // A ceiling light's attic/open-framing answer changes both the route and
    // which measurement aids are relevant. Establish it before asking the
    // customer to choose a power/control source so an accessible route never
    // looks like a finished-wall run. The other extension services retain
    // their established source-first sequence.
    const accessBeforeControl = target.slug === "new-ceiling-light";
    const replacementSlug = "replacement" in target ? target.replacement : null;
    const service = await db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId: contractor.id, slug: target.slug } },
      select: { id: true },
    });
    await clearTree(db, service.id);

    const qExisting = replacementSlug ? await upsertQuestion(db, service.id, {
      key: "extension_existing_location",
      prompt: `Is there already a working ${target.noun} at this exact location?`,
      helpText: "Replacing something in the same box is a smaller service than adding a new wired location.",
      order: 0,
    }) : null;
    const qSupply = "exterior" in target ? await upsertQuestion(db, service.id, {
      key: "extension_fixture_supply",
      prompt: "Who is supplying the exterior light fixture?",
      helpText: "This prepared route price includes installing one compatible customer-supplied fixture.",
      order: 1,
    }) : null;
    const qWall = "exterior" in target ? await upsertQuestion(db, service.id, {
      key: "extension_wall_finish",
      prompt: "What is the exterior wall surface?",
      helpText: "Ordinary vinyl or wood siding is priceable here. Masonry, stucco and specialty finishes need review.",
      order: 2,
    }) : null;
    const loadNoun = target.slug === "recessed-lighting" ? "the first recessed light" : `the new ${target.noun}`;
    const remainingLightsHelp = target.slug === "recessed-lighting"
      ? " Measure only to the first recessed light. We automatically add 10 feet of wire for each additional light."
      : "";
    const qControl = await upsertQuestion(db, service.id, {
      key: "extension_control",
      prompt: `Where will the new ${target.noun} get power and control?`,
      helpText: "Choose the existing switch or light fixture that will feed it. If neither will be used, choose a brand-new switch.",
      order: accessBeforeControl ? 6 : 3,
    });
    const qExistingSwitchFeet = await upsertQuestion(db, service.id, {
      key: "extension_existing_switch_feet",
      prompt: `About how many feet is it from the existing switch to ${loadNoun}?`,
      helpText: `Measure along the wiring route rather than straight through the air.${remainingLightsHelp}`,
      inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: accessBeforeControl ? 7 : 4,
    });
    const qExistingFixtureFeet = await upsertQuestion(db, service.id, {
      key: "extension_existing_fixture_feet",
      prompt: `About how many feet is it from the existing light fixture to ${loadNoun}?`,
      helpText: `The new light will share the existing fixture's switch. Measure along the wiring route.${remainingLightsHelp}`,
      inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: accessBeforeControl ? 8 : 5,
    });
    const qPowerToSwitchFeet = await upsertQuestion(db, service.id, {
      key: "extension_power_to_switch_feet",
      prompt: "About how many feet is it from the closest suitable power source to the new switch?",
      helpText: "The power source may be an outlet, switch box or another suitable circuit point. Measure along the wiring route.",
      inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: accessBeforeControl ? 9 : 6,
    });
    const qSwitchToFixtureFeet = await upsertQuestion(db, service.id, {
      key: "extension_switch_to_fixture_feet",
      prompt: `About how many feet is it from the new switch to ${loadNoun}?`,
      helpText: `Measure along the wiring route rather than straight through the air.${remainingLightsHelp}`,
      inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: accessBeforeControl ? 10 : 7,
    });
    const qSwitchExterior = await upsertQuestion(db, service.id, {
      key: "extension_new_switch_exterior_wall",
      prompt: "Is the new switch going on an exterior wall?",
      helpText: EXTERIOR_WALL_QUESTION_HELP,
      order: accessBeforeControl ? 11 : 8,
    });
    const qHeight = await upsertQuestion(db, service.id, {
      key: "fixture_height",
      prompt: `How high is the ${target.noun} location?`,
      helpText: "10 feet and under is the base labor. 11–12 feet adds 15%, 13–14 feet adds 30%, and anything higher needs a photo review.",
      order: accessBeforeControl ? 1 : 9,
    });
    const qBelow = target.ceiling ? await upsertQuestion(db, service.id, {
      key: "work_area_below",
      prompt: "What is directly below the work area?",
      helpText: "A clear, level floor is required for the prepared height price.",
      order: accessBeforeControl ? 2 : 10,
    }) : null;
    const qCount = target.slug === "recessed-lighting" ? await upsertQuestion(db, service.id, {
      key: "recessed_light_count",
      prompt: "How many recessed lights would you like?",
      helpText: "Choose the total number of new wafer lights in this group.",
      order: 11,
    }) : null;
    const qAccess = await upsertQuestion(db, service.id, {
      key: "extension_route_access",
      prompt: target.ceiling
        ? "Is there an accessible attic or open ceiling framing above the new light location and along the wiring route?"
        : "Is there accessible attic, basement, crawlspace or open framing along the wiring route?",
      helpText: target.ceiling
        ? "If there is no usable space above, we can still price an ordinary finished-ceiling route using conservative framing assumptions."
        : "If not, we can still price an ordinary finished-wall route using conservative framing assumptions.",
      order: accessBeforeControl ? 3 : 12,
    });
    const qSconceExterior = target.slug === "new-wall-sconce" ? await upsertQuestion(db, service.id, {
      key: "extension_sconce_exterior_wall",
      prompt: "Is the new wall sconce going on an exterior wall?",
      helpText: EXTERIOR_WALL_QUESTION_HELP,
      order: 13,
    }) : null;
    const qSurface = await upsertQuestion(db, service.id, {
      key: "extension_route_surface",
      prompt: "Is the route ordinary drywall?",
      helpText: "Plaster, masonry, tile, decorative wood and other specialty finishes need review before pricing.",
      order: accessBeforeControl ? 4 : 14,
    });
    const qClear = await upsertQuestion(db, service.id, {
      key: "extension_route_clear",
      prompt: "Is the route clear of beams, tray ceilings, cabinets, fireplaces and other visible obstructions?",
      helpText: "Choose No if something visible interrupts the path.",
      order: accessBeforeControl ? 5 : 15,
    });
    const routeTransitions = lightingExtensionRouteTransitions({
      surface: qSurface.id,
      clear: qClear.id,
    });

    const entryAfterHeight = qBelow?.id ?? qCount?.id ?? qAccess.id;
    const entryAfterBelow = qCount?.id ?? qAccess.id;
    const entryAfterExisting = qSupply?.id ?? (accessBeforeControl ? qHeight.id : qControl.id);
    const entryAfterSupply = qWall?.id ?? qControl.id;

    if (qExisting) {
      const replacement = await db.service.findUnique({
        where: { contractorId_slug: { contractorId: contractor.id, slug: replacementSlug! } }, select: { id: true },
      });
      await db.answerOption.createMany({ data: [
        ...(replacement ? [{ questionId: qExisting.id, label: "Yes — replace the existing one", value: "yes", routeAction: "REROUTE_SERVICE" as const, rerouteServiceId: replacement.id, order: 1, requiredPhotoLabels: [] }] : []),
        { questionId: qExisting.id, label: "No — this is a new location", value: "no", routeAction: "CONTINUE", nextQuestionId: entryAfterExisting, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      ] });
    }
    if (qSupply) await db.answerOption.createMany({ data: [
      { questionId: qSupply.id, label: "I am supplying the fixture", value: "customer", routeAction: "CONTINUE", nextQuestionId: entryAfterSupply, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: qSupply.id, label: "I need the electrician to supply it", value: "contractor", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    ] });
    if (qWall) await db.answerOption.createMany({ data: [
      { questionId: qWall.id, label: "Ordinary vinyl or wood siding", value: "ordinary", routeAction: "CONTINUE", nextQuestionId: qControl.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: qWall.id, label: "Masonry, stucco, stone, tile or another finish", value: "specialty", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: qWall.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    ] });

    await db.answerOption.createMany({ data: [
      { questionId: qHeight.id, label: "10 feet or under", value: "under_10", routeAction: "CONTINUE", nextQuestionId: entryAfterHeight, order: 1, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "11 to 12 feet", value: "11_12", routeAction: "CONTINUE", nextQuestionId: entryAfterHeight, order: 2, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "13 to 14 feet", value: "13_14", routeAction: "CONTINUE", nextQuestionId: entryAfterHeight, order: 3, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "Over 14 feet, or I don't know", value: "over_14_or_unsure", routeAction: "REMOTE_QUOTE", photosBlockBooking: true, order: 4, requiredPhotoLabels: PHOTOS },
    ] });
    if (qBelow) await db.answerOption.createMany({ data: workAreaBelowAnswerOptions({
      questionId: qBelow.id,
      continueOption: { routeAction: "CONTINUE", nextQuestionId: entryAfterBelow },
      reviewPhotoLabels: PHOTOS,
    }) });
    if (qCount) await db.answerOption.createMany({ data: Array.from({ length: 8 }, (_, index) => ({
      questionId: qCount.id, label: `${index + 1} light${index ? "s" : ""}`, value: String(index + 1), routeAction: "CONTINUE" as const,
      nextQuestionId: qAccess.id, order: index + 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0,
    })) });
    await db.answerOption.createMany({ data: [
      { questionId: qAccess.id, label: target.ceiling ? "Yes — accessible attic or open ceiling framing" : "Yes — an accessible path is available", value: "accessible", accessClassification: "ACCESSIBLE", routeAction: qSconceExterior || accessBeforeControl ? "CONTINUE" : "RESOLVE_ADJUSTED", nextQuestionId: qSconceExterior?.id ?? (accessBeforeControl ? qControl.id : null), photosBlockBooking: false, order: 1, requiredPhotoLabels: accessBeforeControl ? [] : PHOTOS, approvedComponentPriceCents: qSconceExterior || accessBeforeControl ? 0 : null },
      { questionId: qAccess.id, label: "No — the route is through finished construction", value: "finished", accessClassification: "FINISHED", routeAction: "CONTINUE", nextQuestionId: routeTransitions.finished, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0, disclaimer: "The price uses a conservative 16-inch framing assumption and assumes an access opening at each framing crossing. Drywall patching, sanding, texture, primer and paint are not included." },
      { questionId: qAccess.id, label: "I'm not sure", value: "unsure", accessClassification: "UNKNOWN", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    ] });
    await db.answerOption.createMany({ data: [
      { questionId: qSurface.id, label: "Yes — ordinary drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: routeTransitions.surface, order: 1, requiredPhotoLabels: [] },
      { questionId: qSurface.id, label: "No — another finish", value: "other", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: qSurface.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
      { questionId: qClear.id, label: "Yes — the route is clear", value: "clear", routeAction: accessBeforeControl ? "CONTINUE" : "RESOLVE_ADJUSTED", nextQuestionId: accessBeforeControl ? qControl.id : null, photosBlockBooking: false, order: 1, requiredPhotoLabels: accessBeforeControl ? [] : PHOTOS, approvedComponentPriceCents: accessBeforeControl ? 0 : null },
      { questionId: qClear.id, label: "No — something interrupts it", value: "obstructed", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: qClear.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
      { questionId: qControl.id, label: "An existing wall switch", value: "existing_switch", routeAction: "CONTINUE", nextQuestionId: qExistingSwitchFeet.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: qControl.id, label: "An existing light fixture", value: "existing_fixture", routeAction: "CONTINUE", nextQuestionId: qExistingFixtureFeet.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0, disclaimer: "The new light will turn on and off with the existing fixture from the same switch." },
      { questionId: qControl.id, label: "Neither — install a brand-new switch", value: "new_switch", routeAction: "CONTINUE", nextQuestionId: qPowerToSwitchFeet.id, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: qControl.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: PHOTOS },
    ] });
    await db.answerOption.create({ data: { questionId: qExistingSwitchFeet.id, label: "Existing-switch route length in feet", value: "__number__", routeAction: accessBeforeControl ? "RESOLVE_ADJUSTED" : "CONTINUE", nextQuestionId: accessBeforeControl ? null : qHeight.id, photosBlockBooking: false, order: 1, requiredPhotoLabels: accessBeforeControl ? PHOTOS : [], approvedComponentPriceCents: accessBeforeControl ? null : 0 } });
    await db.answerOption.create({ data: { questionId: qExistingFixtureFeet.id, label: "Existing-fixture route length in feet", value: "__number__", routeAction: accessBeforeControl ? "RESOLVE_ADJUSTED" : "CONTINUE", nextQuestionId: accessBeforeControl ? null : qHeight.id, photosBlockBooking: false, order: 1, requiredPhotoLabels: accessBeforeControl ? PHOTOS : [], approvedComponentPriceCents: accessBeforeControl ? null : 0 } });
    await db.answerOption.create({ data: { questionId: qPowerToSwitchFeet.id, label: "Power-source-to-switch route length in feet", value: "__number__", routeAction: "CONTINUE", nextQuestionId: qSwitchToFixtureFeet.id, order: 1, requiredPhotoLabels: [] } });
    await db.answerOption.create({ data: { questionId: qSwitchToFixtureFeet.id, label: "Switch-to-light route length in feet", value: "__number__", routeAction: "CONTINUE", nextQuestionId: qSwitchExterior.id, order: 1, requiredPhotoLabels: [] } });
    for (const question of [qExistingSwitchFeet, qExistingFixtureFeet, qPowerToSwitchFeet, qSwitchToFixtureFeet]) await addNumericUnknownOption(db, question.id);

    await db.answerOption.createMany({ data: [
      { questionId: qSwitchExterior.id, label: "No — it is an interior wall", value: "interior", routeAction: accessBeforeControl ? "RESOLVE_ADJUSTED" : "CONTINUE", nextQuestionId: accessBeforeControl ? null : qHeight.id, photosBlockBooking: false, order: 1, requiredPhotoLabels: accessBeforeControl ? PHOTOS : [], approvedComponentPriceCents: accessBeforeControl ? null : 0 },
      { questionId: qSwitchExterior.id, label: "Yes — it is an exterior wall", value: "exterior", routeAction: accessBeforeControl ? "RESOLVE_ADJUSTED" : "CONTINUE", nextQuestionId: accessBeforeControl ? null : qHeight.id, photosBlockBooking: false, order: 2, requiredPhotoLabels: accessBeforeControl ? PHOTOS : [], approvedComponentPriceCents: accessBeforeControl ? null : 0 },
      { questionId: qSwitchExterior.id, label: "I'm not sure", value: "unsure", routeAction: accessBeforeControl ? "RESOLVE_ADJUSTED" : "CONTINUE", nextQuestionId: accessBeforeControl ? null : qHeight.id, photosBlockBooking: false, order: 3, requiredPhotoLabels: accessBeforeControl ? PHOTOS : [], approvedComponentPriceCents: accessBeforeControl ? null : 0 },
    ] });
    const switchExteriorAnswers = await db.answerOption.findMany({
      where: { questionId: qSwitchExterior.id, value: "exterior" }, select: { id: true },
    });
    for (const answer of switchExteriorAnswers) await attachContractorDisclaimer(
      db, contractor.id, answer.id, EXTERIOR_WALL_DISCLAIMER_KEYS.switch,
    );

    if (qSconceExterior) {
      await db.answerOption.createMany({ data: [
        { questionId: qSconceExterior.id, label: "No — it is an interior wall", value: "interior", routeAction: "RESOLVE_ADJUSTED", order: 1, requiredPhotoLabels: PHOTOS },
        { questionId: qSconceExterior.id, label: "Yes — it is an exterior wall", value: "exterior", routeAction: "RESOLVE_ADJUSTED", order: 2, requiredPhotoLabels: PHOTOS },
        { questionId: qSconceExterior.id, label: "I'm not sure", value: "unsure", routeAction: "RESOLVE_ADJUSTED", order: 3, requiredPhotoLabels: PHOTOS },
      ] });
      const sconceExteriorAnswers = await db.answerOption.findMany({
        where: { questionId: qSconceExterior.id, value: "exterior" }, select: { id: true },
      });
      for (const answer of sconceExteriorAnswers) await attachContractorDisclaimer(
        db, contractor.id, answer.id, EXTERIOR_WALL_DISCLAIMER_KEYS.wallSconce,
      );
    }

    await db.service.update({ where: { id: service.id }, data: {
      pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED", photoState: "PREPARATION",
      startingPriceLabel: "Price after route questions", requiresTechCount: 1,
    } });
    const dangling = await findDanglingReferences(db, service.id);
    const unreachable = await findUnreachableQuestions(db, service.id);
    if (dangling.length || unreachable.length) throw new Error(`${target.slug} graph invalid; dangling=${dangling}; unreachable=${unreachable}`);
    results.push({ slug: target.slug, questionCount: await db.question.count({ where: { serviceId: service.id } }) });
  }

  // Doorbell cable is the other customer-facing low-voltage extension. Keep
  // its device/chime boundaries, but measure the route exactly like the data
  // lines instead of retaining the old fixed 25-foot review package.
  const doorbell = await db.service.findUniqueOrThrow({
    where: { contractorId_slug: { contractorId: contractor.id, slug: "new-video-doorbell-wiring" } }, select: { id: true },
  });
  await clearTree(db, doorbell.id);
  const existingDoorbell = await db.service.findUnique({
    where: { contractorId_slug: { contractorId: contractor.id, slug: "video-doorbell-existing-wiring" } }, select: { id: true },
  });
  if (!existingDoorbell) throw new Error("video-doorbell-existing-wiring reroute target is missing");
  const dqExisting = await upsertQuestion(db, doorbell.id, { key: "doorbell_existing", prompt: "Is there working doorbell wiring at this door now?", helpText: "Working existing wiring is a smaller installation service.", order: 0 });
  const dqSurface = await upsertQuestion(db, doorbell.id, { key: "doorbell_surface", prompt: "What's the door surrounded by?", helpText: "Wood, vinyl and fiber-cement are included. Masonry and specialty finishes need review.", order: 1 });
  const dqSupply = await upsertQuestion(db, doorbell.id, { key: "doorbell_supply", prompt: "Who's supplying the video doorbell?", helpText: "This route includes mounting and basic app pairing for a compatible customer-supplied doorbell.", order: 2 });
  const dqChime = await upsertQuestion(db, doorbell.id, { key: "doorbell_chime", prompt: "Do you want a new indoor chime too?", helpText: "A new chime is another device and cable route, so it needs separate review.", order: 3 });
  const dqAccess = await upsertQuestion(db, doorbell.id, { key: "doorbell_route_access", prompt: "Is there an accessible attic, basement, crawlspace or open-framing route to the door?", helpText: "If not, an ordinary finished-wall route can still be priced conservatively.", order: 4 });
  const dqFeet = await upsertQuestion(db, doorbell.id, { key: "doorbell_route_feet", prompt: "About how many feet is the wiring route to the door?", helpText: "Estimate along the wall and ceiling path from the transformer location to the door.", inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: 5 });
  const dqFinish = await upsertQuestion(db, doorbell.id, { key: "doorbell_route_finish", prompt: "Is the finished part of the route ordinary drywall?", helpText: "Plaster, tile, masonry and decorative finishes need review.", order: 6 });
  const dqClear = await upsertQuestion(db, doorbell.id, { key: "doorbell_route_clear", prompt: "Is the route clear of visible obstructions?", helpText: "Cabinets, beams, fireplaces and other interruptions may change the route.", order: 7 });
  await db.answerOption.createMany({ data: [
    { questionId: dqExisting.id, label: "Yes — working wiring is already there", value: "working", routeAction: "REROUTE_SERVICE", rerouteServiceId: existingDoorbell.id, order: 1, requiredPhotoLabels: [] },
    { questionId: dqExisting.id, label: "No — new wiring and a transformer are needed", value: "none", routeAction: "CONTINUE", nextQuestionId: dqSurface.id, order: 2, requiredPhotoLabels: [] },
    { questionId: dqExisting.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    { questionId: dqSurface.id, label: "Wood, vinyl or fiber-cement siding, or a wood door frame", value: "standard", routeAction: "CONTINUE", nextQuestionId: dqSupply.id, order: 1, requiredPhotoLabels: [] },
    { questionId: dqSurface.id, label: "Brick, stucco, stone or another finish", value: "specialty", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: dqSupply.id, label: "I have the doorbell", value: "customer", routeAction: "CONTINUE", nextQuestionId: dqChime.id, order: 1, requiredPhotoLabels: [] },
    { questionId: dqSupply.id, label: "I need the electrician to supply it", value: "contractor", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: dqChime.id, label: "No — phone notifications are fine", value: "no_chime", routeAction: "CONTINUE", nextQuestionId: dqAccess.id, order: 1, requiredPhotoLabels: [] },
    { questionId: dqChime.id, label: "Yes — add a new indoor chime", value: "new_chime", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: dqAccess.id, label: "Yes — an accessible path is available", value: "accessible", accessClassification: "ACCESSIBLE", routeAction: "CONTINUE", nextQuestionId: dqFeet.id, order: 1, requiredPhotoLabels: [] },
    { questionId: dqAccess.id, label: "No — the route is through finished construction", value: "finished", accessClassification: "FINISHED", routeAction: "CONTINUE", nextQuestionId: dqFeet.id, order: 2, requiredPhotoLabels: [], disclaimer: "The finished-wall price assumes framing every 16 inches and an access opening at each crossing. Drywall repair and painting are not included." },
    { questionId: dqAccess.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
  ] });
  await db.answerOption.create({ data: { questionId: dqFeet.id, label: "Approximate route length in feet", value: "__number__", routeAction: "CONTINUE", nextQuestionId: dqFinish.id, order: 1, requiredPhotoLabels: [] } });
  await addNumericUnknownOption(db, dqFeet.id);
  await db.answerOption.createMany({ data: [
    { questionId: dqFinish.id, label: "Yes — ordinary drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: dqClear.id, order: 1, requiredPhotoLabels: [] },
    { questionId: dqFinish.id, label: "No — another finish", value: "other", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: dqFinish.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    { questionId: dqClear.id, label: "Yes — the route is clear", value: "clear", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 1, requiredPhotoLabels: PHOTOS, approvedComponentPriceCents: null },
    { questionId: dqClear.id, label: "No — something interrupts it", value: "obstructed", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: dqClear.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
  ] });
  await db.service.update({ where: { id: doorbell.id }, data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED", photoState: "PREPARATION", startingPriceLabel: "Price after route questions", requiresTechCount: 1 } });
  const doorbellDangling = await findDanglingReferences(db, doorbell.id);
  const doorbellUnreachable = await findUnreachableQuestions(db, doorbell.id);
  if (doorbellDangling.length || doorbellUnreachable.length) throw new Error(`new-video-doorbell-wiring graph invalid; dangling=${doorbellDangling}; unreachable=${doorbellUnreachable}`);
  results.push({ slug: "new-video-doorbell-wiring", questionCount: await db.question.count({ where: { serviceId: doorbell.id } }) });
  return results;
}

if (process.argv[1]?.endsWith("seed-route-complete-extensions.ts")) {
  const i = process.argv.indexOf("--contractor");
  const contractor = i >= 0 ? process.argv[i + 1] : "elite-electric";
  migrateRouteCompleteExtensions(prisma, contractor)
    .then(async (rows) => { for (const row of rows) console.log(`  ✓ ${row.slug}: ${row.questionCount} questions`); await prisma.$disconnect(); })
    .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
}
