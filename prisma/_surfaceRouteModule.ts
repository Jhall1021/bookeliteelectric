/**
 * ROUTING V2 — the shared surface-mounted route.
 *
 * ONE physical implementation, reused by every service that offers visible
 * wiring. The module knows nothing about which service invoked it except one
 * parameter: which ENDPOINT sits at the far end of the route. Everything else —
 * the questions, the route components, the geometry — is identical, because the
 * physical work is identical.
 *
 * That is the whole point. A cloned `surface_route_outlet` /
 * `surface_route_switch` pair would be two decision trees to keep in step and
 * two prices to drift apart, for work that is the same run of wiring with a
 * different device on the end.
 *
 * WHAT THE CUSTOMER IS ASKED is only what a customer can see: how far, how many
 * direction changes, what the wall is, what is in the way. They are never asked
 * to choose EMT, PVC, raceway, conductor type or a fitting. The contractor and
 * the platform decide what a visible route in that environment requires; the
 * homeowner describes the route.
 */
import type { PrismaClient } from "@prisma/client";
import { upsertQuestion, addNumericUnknownOption } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";

export type SurfaceEndpoint = "OUTLET" | "SWITCH" | "FIXTURE_BOX" | "CEILING_FAN";

/**
 * The ONLY thing that varies by endpoint. Route setup, footage and corners are
 * shared component ids — verified, not merely intended.
 */
export const SURFACE_ENDPOINT_RECIPE: Record<SurfaceEndpoint, { core: string; box: string; finish?: string }> = {
  OUTLET:      { core: "OUTLET_EXTENSION_CORE", box: "SURFACE_DEVICE_BOX_OUTLET" },
  SWITCH:      { core: "SWITCH_ENDPOINT_CORE",  box: "SURFACE_DEVICE_BOX_SWITCH" },
  FIXTURE_BOX: { core: "FIXTURE_BOX_ENDPOINT",  box: "SURFACE_FIXTURE_BOX" },
  CEILING_FAN: { core: "FIXTURE_BOX_ENDPOINT",  box: "SURFACE_FIXTURE_BOX", finish: "CEILING_FAN_INSTALL_CORE" },
};

/** Route components every endpoint shares, in recipe order. */
export const SURFACE_ROUTE_COMPONENTS = [
  "ELEC_ROUTE_SURFACE_MOUNTED",
  "SURFACE_ROUTE_FT",
  "SURFACE_ROUTE_INSIDE_CORNER",
  "SURFACE_ROUTE_OUTSIDE_CORNER",
  "SURFACE_ROUTE_FLAT_CORNER",
] as const;

export const SURFACE_KEYS = {
  feet: "surface_route_feet",
  sameWall: "surface_route_same_wall",
  doorBetween: "surface_route_door_between",
  // Retained as stable historical keys. New customer paths no longer ask
  // homeowners to count fittings; the two observable questions above infer
  // this geometry instead.
  inside: "surface_inside_corner_count",
  outside: "surface_outside_corner_count",
  flat: "surface_route_flat_corner_count",
  surface: "surface_mounting_surface",
  obstacles: "surface_route_obstacles",
} as const;

export const SURFACE_MODULE_KEYS = [
  SURFACE_KEYS.feet,
  SURFACE_KEYS.sameWall,
  SURFACE_KEYS.doorBetween,
  SURFACE_KEYS.surface,
  SURFACE_KEYS.obstacles,
] as const;

export const RETIRED_SURFACE_KEYS = [
  SURFACE_KEYS.inside,
  SURFACE_KEYS.outside,
  SURFACE_KEYS.flat,
] as const;

/** A 36-inch by 80-inch doorway replaces the direct 36-inch baseboard run
 * with two 80-inch rises plus the same 36-inch crossing: 160 extra inches.
 * Round conservatively to whole feet for a homeowner estimate. */
export const SURFACE_DOOR_DETOUR_FEET = 14;

/**
 * Answer-VALIDITY bounds, not eligibility rules.
 *
 * 200 ft is the largest number this question can meaningfully carry, not the
 * longest route that may be priced. Whether a given physical route is
 * predictable enough to price is decided by the tree, never by these numbers —
 * that separation is what stopped the old 10/20 ft matrix being reinvented as
 * validation.
 */
export const SURFACE_BOUNDS = {
  feet: { min: 1, max: 200 },
  corners: { min: 0, max: 20 },
} as const;

const REVIEW_PHOTOS = ["A wide photo showing the whole route from the power source to the new location"];

/**
 * Attach the shared surface route to a service.
 *
 * @param entryOrder  where the module's first question sits in the service's order
 * @param endpoint    which endpoint recipe the priced terminal materializes
 */
export async function attachSurfaceRouteModule(
  prisma: PrismaClient,
  serviceId: string,
  endpoint: SurfaceEndpoint,
  entryOrder: number
): Promise<{ entryQuestionId: string }> {
  const comp = (key: string) => componentIdByKey(prisma, key);

  // Authored back to front so each question can point at a real next id.
  // upsertQuestion updates IN PLACE — never delete-and-recreate, which hands out
  // new ids while other answers still point at the old ones.

  const qObstacles = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.obstacles,
    prompt: "Is anything in the way?",
    helpText:
      "Look along the visible route between the power source and the new spot. We're asking what you can " +
      "see — you don't need to know how it's built.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 5,
  });

  const qSurface = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.surface,
    prompt: "What is the mounting surface made of?",
    helpText: "Choose the wall or ceiling surface the visible route will be fastened to. If you're not certain, choose “I'm not sure” and we'll take a look.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 3,
  });

  const qDoor = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.doorBetween,
    prompt: "Is there a doorway between the closest power source and the new location?",
    helpText:
      "A doorway makes the visible raceway travel up, across and back down. We use a standard " +
      "36-inch-wide doorway and include the extra raceway and turns automatically.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 2,
  });

  const qSameWall = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.sameWall,
    prompt: "Is the new device on the same wall as the closest power source?",
    helpText:
      "Choose yes when both locations are on one continuous wall. If the route has to turn onto " +
      "another wall, choose no; the price will include that wall corner automatically.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 1,
  });

  const qFeet = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.feet,
    prompt: "How long is the route, in feet?",
    helpText:
      "Measure along the planned visible wall-and-ceiling route from the power source to the new spot. " +
      "Decimals are fine, such as 14.625. If you cannot establish the length, choose I’m not sure.",
    inputType: "NUMBER",
    numberAllowsDecimal: true,
    numberMin: SURFACE_BOUNDS.feet.min,
    numberMax: SURFACE_BOUNDS.feet.max,
    order: entryOrder,
  });

  // ── options, front to back ──────────────────────────────────────────────
  // A NUMBER question has one numeric option and an explicit unknown review
  // option. The shared numeric selector validates the typed value first.
  const numberOption = async (questionId: string, nextQuestionId: string, label: string) =>
    prisma.answerOption.create({
      data: { questionId, label, value: "__number__", routeAction: "CONTINUE",
              nextQuestionId, order: 1, requiredPhotoLabels: [] },
    });

  await numberOption(qFeet.id, qSameWall.id, "Route length in feet");
  await addNumericUnknownOption(prisma, qFeet.id);

  const sameWallOptions = await Promise.all([
    prisma.answerOption.create({ data: {
      questionId: qSameWall.id, label: "Yes — they are on the same wall", value: "yes",
      routeAction: "CONTINUE", nextQuestionId: qDoor.id, order: 1, requiredPhotoLabels: [],
    }, select: { id: true } }),
    prisma.answerOption.create({ data: {
      questionId: qSameWall.id, label: "No — the route turns onto another wall", value: "no",
      routeAction: "CONTINUE", nextQuestionId: qDoor.id, order: 2, requiredPhotoLabels: [],
    }, select: { id: true } }),
  ]);
  await prisma.answerOption.create({ data: {
    questionId: qSameWall.id, label: "I'm not sure", value: "unsure",
    routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3,
    requiredPhotoLabels: REVIEW_PHOTOS,
  } });
  await prisma.answerOptionComponent.createMany({ data: [
    { answerOptionId: sameWallOptions[0].id, canonicalComponentId: await comp("SURFACE_ROUTE_FLAT_CORNER"), quantity: 2 },
    { answerOptionId: sameWallOptions[1].id, canonicalComponentId: await comp("SURFACE_ROUTE_FLAT_CORNER"), quantity: 2 },
    // Inside and outside elbows cost the same. This component is the neutral
    // one-wall-transition allowance; the customer never has to classify it.
    { answerOptionId: sameWallOptions[1].id, canonicalComponentId: await comp("SURFACE_ROUTE_INSIDE_CORNER"), quantity: 1 },
  ] });

  const doorYes = await prisma.answerOption.create({ data: {
    questionId: qDoor.id, label: "Yes — the raceway must go around a doorway", value: "yes",
    routeAction: "CONTINUE", nextQuestionId: qSurface.id, order: 1, requiredPhotoLabels: [],
  }, select: { id: true } });
  await prisma.answerOption.createMany({ data: [
    { questionId: qDoor.id, label: "No", value: "no", routeAction: "CONTINUE",
      nextQuestionId: qSurface.id, order: 2, requiredPhotoLabels: [] },
    { questionId: qDoor.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW",
      photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
  ] });
  await prisma.answerOptionComponent.createMany({ data: [{
    answerOptionId: doorYes.id,
    canonicalComponentId: await comp("SURFACE_ROUTE_FLAT_CORNER"),
    quantity: 2,
  }] });

  // Mounting surface. Ordinary surfaces continue; anything we cannot fix a
  // method to from a homeowner's description goes to review rather than being
  // diagnosed from an answer.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qSurface.id, label: "Drywall", value: "drywall", routeAction: "CONTINUE",
        nextQuestionId: qObstacles.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qSurface.id, label: "Masonry, block or brick", value: "masonry", routeAction: "CONTINUE",
        nextQuestionId: qObstacles.id, order: 2, requiredPhotoLabels: [] },
      { questionId: qSurface.id, label: "Tile", value: "tile", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qSurface.id, label: "Something else", value: "other", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 4, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qSurface.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 5, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  // Obstacles. Exactly one answer prices; everything a customer might see in the
  // way, and "not sure", goes to review. An unpriced route is recoverable; a
  // wrong price booked against a fireplace is not.
  await prisma.answerOption.createMany({
    data: [
      { questionId: qObstacles.id, label: "No — it's a clear visible route", value: "clear",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [],
        approvedComponentPriceCents: null },
      { questionId: qObstacles.id, label: "A window", value: "window", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 2, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "Cabinets or built-in furniture", value: "cabinet",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "A fireplace or chimney breast", value: "fireplace",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "Something else interrupts the wall", value: "other",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 5, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 6, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  // ── the terminal recipe ─────────────────────────────────────────────────
  const clear = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qObstacles.id, value: "clear" }, select: { id: true },
  });
  const recipe = SURFACE_ENDPOINT_RECIPE[endpoint];

  await prisma.answerOptionComponent.createMany({
    data: [
      // Route setup: one visible run, however long it turns out to be.
      { answerOptionId: clear.id, canonicalComponentId: await comp("ELEC_ROUTE_SURFACE_MOUNTED"), quantity: 1 },
      // Length is a QUANTITY. 8 ft and 40 ft are the same work, more of it.
      { answerOptionId: clear.id, canonicalComponentId: await comp("SURFACE_ROUTE_FT"),
        quantity: 1, quantityAnswerKey: SURFACE_KEYS.feet },
      // The only endpoint-dependent lines in the whole module.
      { answerOptionId: clear.id, canonicalComponentId: await comp(recipe.core), quantity: 1 },
      { answerOptionId: clear.id, canonicalComponentId: await comp(recipe.box), quantity: 1 },
      ...(recipe.finish
        ? [{ answerOptionId: clear.id, canonicalComponentId: await comp(recipe.finish), quantity: 1 }]
        : []),
    ],
    skipDuplicates: true,
  });

  // Historical manual corner questions stay addressable for old bookings, but
  // are unreachable from every newly-authored route and cannot emit work.
  for (const [index, key] of RETIRED_SURFACE_KEYS.entries()) {
    const retired = await prisma.question.findFirst({ where: { serviceId, key }, select: { id: true } });
    if (!retired) continue;
    await prisma.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: retired.id } } });
    await prisma.answerOption.deleteMany({ where: { questionId: retired.id } });
    await prisma.question.update({ where: { id: retired.id }, data: { order: 920 + index } });
  }

  return { entryQuestionId: qFeet.id };
}
