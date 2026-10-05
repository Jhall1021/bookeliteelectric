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
import { upsertQuestion, addNumericUnknownOption } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";
import type { SurfaceEndpoint } from "./_surfaceRouteModule";
import { ENDPOINT_CORE } from "./_concealedRouteModules";
import { FINISHED_WALL_METHOD_DISCLOSURE } from "../lib/electrical/finishedWallDisclosure";

export const FINISHED_KEYS = {
  backToBack: "concealed_back_to_back",
  feet: "concealed_route_feet",
  surface: "concealed_wall_surface",
  method: "concealed_access_method",
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

  const qMethod = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.method,
    prompt: "How we'll route wiring through the finished wall",
    helpText: FINISHED_WALL_METHOD_DISCLOSURE,
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
    prompt: "How far along the wall, in feet?",
    helpText: "Measure along the proposed wall path. Decimals are fine. This does not measure wiring hidden inside the wall; choose I’m not sure if you cannot establish the distance.",
    inputType: "NUMBER",
    numberAllowsDecimal: true,
    numberMin: CONCEALED_BOUNDS.min,
    numberMax: CONCEALED_BOUNDS.max,
    order: entryOrder + 1,
  });

  const qBackToBack = await upsertQuestion(prisma, serviceId, {
    key: FINISHED_KEYS.backToBack,
    prompt: "Is the existing power source directly behind the new location?",
    helpText:
      "Choose Yes only when the existing outlet, switch or fixture box is on the opposite side of the same wall, " +
      "directly back-to-back with the new spot—for example, one outlet in each room at the same place on the wall.",
    inputType: "SINGLE_SELECT", order: entryOrder,
  });

  // ── options ─────────────────────────────────────────────────────────────
  // Back to back first, and it never touches the footage envelope.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qBackToBack.id, label: "Yes — it is directly behind the new spot", value: "yes",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: null },
      { questionId: qBackToBack.id, label: "No — power needs to travel along or through the wall", value: "no",
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
        numberAtLeast: CONCEALED_ENVELOPE_FT, numberAtLeastExclusive: true, numberAtMost: CONCEALED_BOUNDS.max },
    ],
  });

  await addNumericUnknownOption(prisma, qFeet.id);

  await prisma.answerOption.createMany({
    data: [
      { questionId: qSurface.id, label: "Drywall", value: "drywall", routeAction: "CONTINUE",
        nextQuestionId: qObstacles.id, order: 1, requiredPhotoLabels: [] },
      // Everything we cannot fix a method to from a homeowner's description.
      ...["plaster", "tile", "stone", "wallpaper", "wood_panel", "other", "unsure"].map((v, i) => ({
        questionId: qSurface.id,
        label: { plaster: "Plaster", tile: "Tile", stone: "Stone", wallpaper: "Wallpaper or a decorative finish",
                 wood_panel: "Wood paneling", other: "Something else", unsure: "I'm not sure" }[v]!,
        value: v, routeAction: "PHOTO_REVIEW" as const, photosBlockBooking: true,
        order: i + 2, requiredPhotoLabels: REVIEW_PHOTOS,
      })),
    ],
  });

  // Obstacles are asked once before the scope acknowledgement. The electrician,
  // not the homeowner, chooses the practical construction method on site.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qObstacles.id, label: "No — the wall is clear", value: "clear",
        routeAction: "CONTINUE", nextQuestionId: qMethod.id, order: 1, requiredPhotoLabels: [] },
      // A standard doorway is measurable work, not an unknown condition. The
      // measurement card records it and pricing adds the fourteen-foot detour
      // plus the resulting drywall-access labor. Keep this option as a priced
      // fallback for older sessions that reach the obstacle question directly.
      { questionId: qObstacles.id, label: "A doorway", value: "doorway",
        routeAction: "CONTINUE", nextQuestionId: qMethod.id, order: 2, requiredPhotoLabels: [] },
      ...["window", "cabinet", "fireplace", "tiled_section", "other", "unsure"].map((v, i) => ({
        questionId: qObstacles.id,
        label: { window: "A window", cabinet: "Cabinets or built-ins",
                 fireplace: "A fireplace or chimney breast", tiled_section: "A tiled or decorative section",
                 other: "Something else", unsure: "I'm not sure" }[v]!,
        value: v, routeAction: "PHOTO_REVIEW" as const, photosBlockBooking: true,
        order: i + 3, requiredPhotoLabels: REVIEW_PHOTOS,
      })),
    ],
  });

  // The homeowner accepts one bounded finished-wall package. Pricing uses the
  // conservative drywall-access recipe; on site the electrician may instead
  // use reusable baseboard when that is the better practical route. This keeps
  // construction-method judgment with the professional and never asks a
  // customer to diagnose the wall.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qMethod.id, label: "I understand — use the best practical route", value: "best_practical",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: null,
        disclaimer: FINISHED_WALL_METHOD_DISCLOSURE },
    ],
  });

  const terminal = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qMethod.id, value: "best_practical" }, select: { id: true } });

  // The drywall operation includes retaining and resecuring each cut piece;
  // RESTORE_DRYWALL_ACCESS records the scope without adding that labor twice.
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: terminal.id, canonicalComponentId: await comp("ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS"), quantity: 1 },
      { answerOptionId: terminal.id, canonicalComponentId: await comp("CONCEALED_ROUTE_FT"), quantity: 1, quantityAnswerKey: FINISHED_KEYS.feet },
      { answerOptionId: terminal.id, canonicalComponentId: await comp("RESTORE_DRYWALL_ACCESS"), quantity: 1 },
      { answerOptionId: terminal.id, canonicalComponentId: await comp(ENDPOINT_CORE[endpoint]), quantity: 1 },
      ...(endpoint === "CEILING_FAN"
        ? [{ answerOptionId: terminal.id, canonicalComponentId: await comp("CEILING_FAN_INSTALL_CORE"), quantity: 1 }]
        : []),
    ], skipDuplicates: true,
  });

  return { entryQuestionId: qBackToBack.id };
}
