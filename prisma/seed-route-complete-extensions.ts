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

async function clearTree(db: PrismaClient, serviceId: string) {
  const questions = await db.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await db.answerOption.deleteMany({ where: { questionId: question.id } });
  await db.question.deleteMany({ where: { serviceId } });
}

export async function migrateRouteCompleteExtensions(db: PrismaClient = prisma, contractorSlug = "elite-electric") {
  const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
  const results: { slug: string; questionCount: number }[] = [];

  for (const target of TARGETS) {
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
    const qHeight = await upsertQuestion(db, service.id, {
      key: "fixture_height",
      prompt: `How high is the ${target.noun} location?`,
      helpText: "10 feet and under is the base labor. 11–12 feet adds 15%, 13–14 feet adds 30%, and anything higher needs a photo review.",
      order: 3,
    });
    const qBelow = target.ceiling ? await upsertQuestion(db, service.id, {
      key: "work_area_below",
      prompt: "What is directly below the work area?",
      helpText: "A clear, level floor is required for the prepared height price.",
      order: 4,
    }) : null;
    const qCount = target.slug === "recessed-lighting" ? await upsertQuestion(db, service.id, {
      key: "recessed_light_count",
      prompt: "How many recessed lights would you like?",
      helpText: "Choose the total number of new wafer lights in this group.",
      order: 5,
    }) : null;
    const qAccess = await upsertQuestion(db, service.id, {
      key: "extension_route_access",
      prompt: "Is there accessible attic, basement, crawlspace or open framing along the wiring route?",
      helpText: "If not, we can still price an ordinary finished-wall or finished-ceiling route using conservative framing assumptions.",
      order: 6,
    });
    const qFeet = await upsertQuestion(db, service.id, {
      key: "extension_route_feet",
      prompt: target.slug === "recessed-lighting"
        ? "About how many total feet of wiring will connect the source and all the new lights?"
        : `About how many feet is it from the existing power source to the new ${target.noun} location?`,
      helpText: "A whole-number estimate is fine. For finished construction, measure along the wall and ceiling route rather than straight through the air.",
      inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: 7,
    });
    const qSurface = await upsertQuestion(db, service.id, {
      key: "extension_route_surface",
      prompt: "Is the route ordinary drywall?",
      helpText: "Plaster, masonry, tile, decorative wood and other specialty finishes need review before pricing.",
      order: 8,
    });
    const qClear = await upsertQuestion(db, service.id, {
      key: "extension_route_clear",
      prompt: "Is the route clear of beams, tray ceilings, cabinets, fireplaces and other visible obstructions?",
      helpText: "Choose No if something visible interrupts the path.",
      order: 9,
    });
    const qControl = await upsertQuestion(db, service.id, {
      key: "extension_control",
      prompt: "How will the new light be controlled?",
      helpText: "The prepared price can extend a suitable existing switched-lighting source. A brand-new switch route is reviewed separately until its own route is measured.",
      order: 10,
    });

    const entryAfterHeight = qBelow?.id ?? qCount?.id ?? qAccess.id;
    const entryAfterBelow = qCount?.id ?? qAccess.id;
    const entryAfterExisting = qSupply?.id ?? qHeight.id;
    const entryAfterSupply = qWall?.id ?? qHeight.id;

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
      { questionId: qWall.id, label: "Ordinary vinyl or wood siding", value: "ordinary", routeAction: "CONTINUE", nextQuestionId: qHeight.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: qWall.id, label: "Masonry, stucco, stone, tile or another finish", value: "specialty", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: qWall.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    ] });

    await db.answerOption.createMany({ data: [
      { questionId: qHeight.id, label: "10 feet or under", value: "under_10", routeAction: "CONTINUE", nextQuestionId: entryAfterHeight, order: 1, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "11 to 12 feet", value: "11_12", routeAction: "CONTINUE", nextQuestionId: entryAfterHeight, order: 2, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "13 to 14 feet", value: "13_14", routeAction: "CONTINUE", nextQuestionId: entryAfterHeight, order: 3, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "Over 14 feet, or I don't know", value: "over_14_or_unsure", routeAction: "REMOTE_QUOTE", photosBlockBooking: true, order: 4, requiredPhotoLabels: PHOTOS },
    ] });
    if (qBelow) await db.answerOption.createMany({ data: [
      { questionId: qBelow.id, label: "Clear, level floor", value: "level_floor", routeAction: "CONTINUE", nextQuestionId: entryAfterBelow, order: 1, requiredPhotoLabels: [] },
      { questionId: qBelow.id, label: "Stairs, furniture, counters or another obstruction", value: "obstructed", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    ] });
    if (qCount) await db.answerOption.createMany({ data: Array.from({ length: 8 }, (_, index) => ({
      questionId: qCount.id, label: `${index + 1} light${index ? "s" : ""}`, value: String(index + 1), routeAction: "CONTINUE" as const,
      nextQuestionId: qAccess.id, order: index + 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0,
    })) });
    await db.answerOption.createMany({ data: [
      { questionId: qAccess.id, label: "Yes — an accessible path is available", value: "accessible", accessClassification: "ACCESSIBLE", routeAction: "CONTINUE", nextQuestionId: qFeet.id, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
      { questionId: qAccess.id, label: "No — the route is through finished construction", value: "finished", accessClassification: "FINISHED", routeAction: "CONTINUE", nextQuestionId: qFeet.id, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0, disclaimer: "The price uses a conservative 16-inch framing assumption and assumes an access opening at each framing crossing. Drywall patching, sanding, texture, primer and paint are not included." },
      { questionId: qAccess.id, label: "I'm not sure", value: "unsure", accessClassification: "UNKNOWN", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    ] });
    await db.answerOption.create({ data: { questionId: qFeet.id, label: "Approximate route length in feet", value: "__number__", routeAction: "CONTINUE", nextQuestionId: qSurface.id, order: 1, requiredPhotoLabels: [] } });
    await addNumericUnknownOption(db, qFeet.id);
    await db.answerOption.createMany({ data: [
      { questionId: qSurface.id, label: "Yes — ordinary drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: qClear.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qSurface.id, label: "No — another finish", value: "other", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: qSurface.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
      { questionId: qClear.id, label: "Yes — the route is clear", value: "clear", routeAction: "CONTINUE", nextQuestionId: qControl.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qClear.id, label: "No — something interrupts it", value: "obstructed", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: qClear.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
      { questionId: qControl.id, label: "Extend a suitable existing switched-lighting source", value: "existing_switch", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 1, requiredPhotoLabels: PHOTOS, approvedComponentPriceCents: null },
      { questionId: qControl.id, label: "Install a brand-new switch and switch leg", value: "new_switch", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
      { questionId: qControl.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    ] });

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
