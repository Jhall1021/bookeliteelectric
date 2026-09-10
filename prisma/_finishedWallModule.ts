/**
 * ROUTING V2 — finished-wall concealed routing.
 *
 * No accessible space, and the customer wants the wiring hidden. The question
 * this module answers is not "how long is it" but "is this route PREDICTABLE
 * enough to price", and the two are kept strictly apart:
 *
 *   - the footage question accepts any measurement in its authored domain;
 *   - the ELIGIBILITY ENVELOPE is authored here, as numeric ROUTING, and
 *     belongs to this module alone. Accessible and surface routes author none,
 *     which is why a 50 ft attic run and a 63 ft raceway run are unaffected.
 *
 * 24 ft is a perfectly valid measurement that goes to Guided Estimate. It is
 * not an invalid number, and the difference matters: one is the customer
 * mistyping, the other is us declining to guess.
 *
 * BACK-TO-BACK IS ASKED FIRST and never enters the envelope. The distance is a
 * wall's thickness; sending it through a footage question would invent a
 * quantity and then judge it against a limit meant for runs along a wall.
 */
import type { PrismaClient } from "@prisma/client";
import { upsertQuestion } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";
import type { SurfaceEndpoint } from "./_surfaceRouteModule";
import { ENDPOINT_CORE } from "./_concealedRouteModules";

export const FINISHED_KEYS = {
  backToBack: "concealed_back_to_back",
  feet: "concealed_route_feet",
  surface: "concealed_wall_surface",
  method: "concealed_access_method",
  baseboard: "concealed_baseboard_continuous",
  obstacles: "concealed_route_obstacles",
} as const;

export const FINISHED_MODULE_KEYS = Object.values(FINISHED_KEYS);

/** Answer-validity domain. Wider than the envelope, deliberately. */
export const CONCEALED_BOUNDS = { min: 1, max: 300 } as const;

/**
 * The initial V2 eligibility envelope for FINISHED-WALL concealed work only.
 *
 * Conservative on purpose and widenable with evidence. It is expressed as
 * numeric ROUTING — which branch the customer takes — never as a component or
 * a price tier, so widening it later changes who is eligible and changes no
 * price.
 */
export const CONCEALED_ENVELOPE_FT = 20;

const REVIEW_PHOTOS = ["A wide photo of the wall between the power source and the new location"];

export async function attachFinishedWallModule(
  prisma: PrismaClient,
  serviceId: string,
  endpoint: SurfaceEndpoint,
  entryOrder: number,
  opts: { surfaceEntryQuestionId?: string } = {}
): Promise<{ entryQuestionId: string }> {
  const comp = (k: string) => componentIdByKey(prisma, k);

  // ── authored back to front ──────────────────────────────────────────────
  const qObstacles = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.obstacles,
    prompt: "Is anything in the way along that wall?",
    helpText: "Just what you can see between the two spots.",
    inputType: "SINGLE_SELECT", order: entryOrder + 3,
  });

  const qBaseboard = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.baseboard,
    prompt: "Does a continuous baseboard run along that wall, and does it look removable?",
    helpText:
      "One unbroken run of skirting board, fixed with nails rather than glued or built in. " +
      "If you're not sure, say so.",
    inputType: "SINGLE_SELECT", order: entryOrder + 5,
  });

  const qMethod = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.method,
    prompt: "How would you prefer we get the wiring across?",
    helpText:
      "Behind the baseboard means lifting and refitting your existing trim. Through the wall " +
      "means small openings we patch and leave ready for paint. Neither includes painting.",
    inputType: "SINGLE_SELECT", order: entryOrder + 4,
  });

  const qSurface = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.surface,
    prompt: "What is that wall finished with?",
    helpText: "If you're not certain, choose “I'm not sure”.",
    inputType: "SINGLE_SELECT", order: entryOrder + 2,
  });

  // The measurement. Its DOMAIN is 1-300; its ROUTING splits at the envelope.
  const qFeet = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.feet,
    prompt: "Roughly how far along the wall is it?",
    helpText: "A close estimate is fine — the electrician measures on the day.",
    inputType: "NUMBER",
    numberMin: CONCEALED_BOUNDS.min,
    numberMax: CONCEALED_BOUNDS.max,
    order: entryOrder + 1,
  });

  const qBackToBack = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.backToBack,
    prompt: "Is the new spot directly opposite the existing one, through the same wall?",
    helpText: "Straight through the wall, rather than along it.",
    inputType: "SINGLE_SELECT", order: entryOrder,
  });

  // ── options ─────────────────────────────────────────────────────────────
  // Back to back first, and it never touches the footage envelope.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qBackToBack.id, label: "Yes — straight through", value: "yes",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: qBackToBack.id, label: "No — it's along the wall", value: "no",
        routeAction: "CONTINUE", nextQuestionId: qFeet.id, order: 2, requiredPhotoLabels: [] },
      { questionId: qBackToBack.id, label: "I'm not sure", value: "unsure",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });
  const b2b = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qBackToBack.id, value: "yes" }, select: { id: true } });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: b2b.id, canonicalComponentId: await comp("ELEC_ROUTE_BACK_TO_BACK"), quantity: 1 },
      { answerOptionId: b2b.id, canonicalComponentId: await comp(ENDPOINT_CORE[endpoint]), quantity: 1 },
    ], skipDuplicates: true,
  });

  // THE ENVELOPE, as numeric routing. Complete, non-overlapping cover of 1-300.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qFeet.id, label: "Within the supported range", value: "within",
        routeAction: "CONTINUE", nextQuestionId: qSurface.id, order: 1, requiredPhotoLabels: [],
        numberAtLeast: CONCEALED_BOUNDS.min, numberAtMost: CONCEALED_ENVELOPE_FT },
      { questionId: qFeet.id, label: "Beyond the supported range", value: "beyond",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: REVIEW_PHOTOS,
        numberAtLeast: CONCEALED_ENVELOPE_FT + 1, numberAtMost: CONCEALED_BOUNDS.max },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qSurface.id, label: "Drywall", value: "drywall", routeAction: "CONTINUE",
        nextQuestionId: qObstacles.id, order: 1, requiredPhotoLabels: [] },
      // Everything we cannot fix a method to from a homeowner's description.
      ...["plaster", "tile", "stone", "wallpaper", "wood_panel", "other", "unsure"].map((v, i) => ({
        questionId: qSurface.id,
        label: { plaster: "Plaster", tile: "Tile", stone: "Stone", wallpaper: "Wallpaper or a decorative finish",
                 wood_panel: "Wood panelling", other: "Something else", unsure: "I'm not sure" }[v]!,
        value: v, routeAction: "PHOTO_REVIEW" as const, photosBlockBooking: true,
        order: i + 2, requiredPhotoLabels: REVIEW_PHOTOS,
      })),
    ],
  });

  // Obstacles asked ONCE, before the method choice — the wall is the same wall
  // whichever way we cross it.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qObstacles.id, label: "No — the wall is clear", value: "clear",
        routeAction: "CONTINUE", nextQuestionId: qMethod.id, order: 1, requiredPhotoLabels: [] },
      ...["doorway", "window", "cabinet", "fireplace", "tiled_section", "other", "unsure"].map((v, i) => ({
        questionId: qObstacles.id,
        label: { doorway: "A doorway", window: "A window", cabinet: "Cabinets or built-ins",
                 fireplace: "A fireplace or chimney breast", tiled_section: "A tiled or decorative section",
                 other: "Something else", unsure: "I'm not sure" }[v]!,
        value: v, routeAction: "PHOTO_REVIEW" as const, photosBlockBooking: true,
        order: i + 2, requiredPhotoLabels: REVIEW_PHOTOS,
      })),
    ],
  });

  // EACH METHOD OWNS ITS TERMINAL. That is what lets each carry its own
  // capability requirement: an option gates on one scope, and baseboard work
  // and drywall work are different scopes a contractor may offer independently.
  //
  // Drywall resolves here directly. Baseboard needs one more observable fact —
  // whether the trim can actually be lifted — so it continues first.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qMethod.id, label: "Behind the baseboard", value: "baseboard",
        routeAction: "CONTINUE", nextQuestionId: qBaseboard.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qMethod.id, label: "Through the wall, patched ready for paint", value: "drywall_access",
        routeAction: "RESOLVE_INSTANT", order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: null,
        requiresCapabilityKey: "DRYWALL_ACCESS_RESTORATION" },
      { questionId: qMethod.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: qBaseboard.id, label: "Yes — one continuous run that looks liftable", value: "yes",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: null,
        requiresCapabilityKey: "BASEBOARD_ACCESS_REINSTALL" },
      { questionId: qBaseboard.id, label: "No — it's broken up, glued or built in", value: "no",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qBaseboard.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  const baseboardTerminal = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qBaseboard.id, value: "yes" }, select: { id: true } });
  const drywallTerminal = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qMethod.id, value: "drywall_access" }, select: { id: true } });

  // RESTORATION IS NOT OPTIONAL ON EITHER TERMINAL. A route that reaches here
  // opens something up; the only alternatives are "we close it again" or "we do
  // not quote this", never "we quote it and leave the wall open".
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: baseboardTerminal.id, canonicalComponentId: await comp("ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS"), quantity: 1 },
      { answerOptionId: baseboardTerminal.id, canonicalComponentId: await comp("CONCEALED_ROUTE_FT"), quantity: 1, quantityAnswerKey: FINISHED_KEYS.feet },
      { answerOptionId: baseboardTerminal.id, canonicalComponentId: await comp("RESTORE_BASEBOARD_ACCESS"), quantity: 1 },
      { answerOptionId: baseboardTerminal.id, canonicalComponentId: await comp(ENDPOINT_CORE[endpoint]), quantity: 1 },

      { answerOptionId: drywallTerminal.id, canonicalComponentId: await comp("ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS"), quantity: 1 },
      { answerOptionId: drywallTerminal.id, canonicalComponentId: await comp("CONCEALED_ROUTE_FT"), quantity: 1, quantityAnswerKey: FINISHED_KEYS.feet },
      { answerOptionId: drywallTerminal.id, canonicalComponentId: await comp("RESTORE_DRYWALL_ACCESS"), quantity: 1 },
      { answerOptionId: drywallTerminal.id, canonicalComponentId: await comp(ENDPOINT_CORE[endpoint]), quantity: 1 },
    ], skipDuplicates: true,
  });

  return { entryQuestionId: qBackToBack.id };
}
