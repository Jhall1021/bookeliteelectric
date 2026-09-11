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
import { upsertQuestion } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";

export type SurfaceEndpoint = "OUTLET" | "SWITCH" | "FIXTURE_BOX";

/**
 * The ONLY thing that varies by endpoint. Route setup, footage and corners are
 * shared component ids — verified, not merely intended.
 */
export const SURFACE_ENDPOINT_RECIPE: Record<SurfaceEndpoint, { core: string; box: string }> = {
  OUTLET:      { core: "OUTLET_EXTENSION_CORE", box: "SURFACE_DEVICE_BOX_OUTLET" },
  SWITCH:      { core: "SWITCH_ENDPOINT_CORE",  box: "SURFACE_DEVICE_BOX_SWITCH" },
  FIXTURE_BOX: { core: "FIXTURE_BOX_ENDPOINT",  box: "SURFACE_FIXTURE_BOX" },
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
  inside: "surface_inside_corner_count",
  outside: "surface_outside_corner_count",
  flat: "surface_route_flat_corner_count",
  surface: "surface_mounting_surface",
  obstacles: "surface_route_obstacles",
} as const;

export const SURFACE_MODULE_KEYS = Object.values(SURFACE_KEYS);

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
    prompt: "Does anything sit in the way along that route?",
    helpText:
      "Look along the wall between the power source and the new spot. We're asking what you can " +
      "see — you don't need to know how it's built.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 5,
  });

  const qSurface = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.surface,
    prompt: "What is that wall surface?",
    helpText: "If you're not certain, choose “I'm not sure” and we'll take a look.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 4,
  });

  const qOutside = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.outside,
    prompt: "How many outside corners does the route turn around?",
    helpText:
      "An outside corner is one the wiring wraps AROUND, like the external corner of a chimney " +
      "breast. If there are none, enter 0.",
    // EXPLICIT, not defaulted: these bounds are part of the pricing contract.
    inputType: "NUMBER",
    numberMin: SURFACE_BOUNDS.corners.min,
    numberMax: SURFACE_BOUNDS.corners.max,
    order: entryOrder + 2,
  });

  /**
   * FLAT CORNER — a ninety-degree turn that never leaves the wall.
   *
   * Physically distinct from both siblings, and the research settled it: the
   * NECA MLU publishes a flat elbow as its own line in every raceway family
   * (2911, 411, 811, G4011), separately from the internal and external elbows,
   * and at a different figure. Overloading either of the existing corner
   * questions would have made a real fitting invisible to any takeoff.
   *
   * Same bounds and same NUMBER contract as its siblings — deliberately, since
   * nothing about counting flat turns differs from counting the other two.
   */
  const qFlat = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.flat,
    prompt: "How many times does the route turn a corner while staying on the same wall?",
    helpText:
      "This is a turn that stays flat against the surface — the wiring changes direction but never " +
      "leaves the wall, for example going along and then up. If there are none, enter 0.",
    inputType: "NUMBER",
    numberMin: SURFACE_BOUNDS.corners.min,
    numberMax: SURFACE_BOUNDS.corners.max,
    order: entryOrder + 3,
  });

  const qInside = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.inside,
    prompt: "How many inside corners does the route turn into?",
    helpText:
      "An inside corner is where two walls meet and the wiring turns INTO the corner. If there " +
      "are none, enter 0.",
    inputType: "NUMBER",
    numberMin: SURFACE_BOUNDS.corners.min,
    numberMax: SURFACE_BOUNDS.corners.max,
    order: entryOrder + 1,
  });

  const qFeet = await upsertQuestion(prisma, serviceId, {
    key: SURFACE_KEYS.feet,
    prompt: "Roughly how many feet is that route?",
    helpText:
      "Pace it out or estimate along the wall from the power source to the new spot. A close " +
      "estimate is fine — the electrician measures on the day.",
    inputType: "NUMBER",
    numberMin: SURFACE_BOUNDS.feet.min,
    numberMax: SURFACE_BOUNDS.feet.max,
    order: entryOrder,
  });

  // ── options, front to back ──────────────────────────────────────────────
  // A NUMBER question carries exactly one option; the resolver reads the typed
  // value and takes options[0]. The option is what routing hangs off.
  const numberOption = async (questionId: string, nextQuestionId: string, label: string) =>
    prisma.answerOption.create({
      data: { questionId, label, value: "__number__", routeAction: "CONTINUE",
              nextQuestionId, order: 1, requiredPhotoLabels: [] },
    });

  await numberOption(qFeet.id, qInside.id, "Route length in feet");
  await numberOption(qInside.id, qOutside.id, "Inside corner count");
  // The flat corner sits INSIDE the chain, not merely beside it. A component
  // may only bind its quantity to a question the walked path actually asked —
  // adding the question without threading it here made the binding unreachable
  // and the resolver said so, which is the guard working.
  await numberOption(qOutside.id, qFlat.id, "Outside corner count");
  await numberOption(qFlat.id, qSurface.id, "Flat corner count");

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
      { questionId: qObstacles.id, label: "No — it's a clear run along the wall", value: "clear",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [],
        approvedComponentPriceCents: null },
      { questionId: qObstacles.id, label: "A doorway", value: "doorway", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 2, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "A window", value: "window", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "Cabinets or built-in furniture", value: "cabinet",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "A fireplace or chimney breast", value: "fireplace",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 5, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "Something else interrupts the wall", value: "other",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 6, requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: qObstacles.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true, order: 7, requiredPhotoLabels: REVIEW_PHOTOS },
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
      // Geometry. Omitted entirely when the count is zero — see the resolver.
      { answerOptionId: clear.id, canonicalComponentId: await comp("SURFACE_ROUTE_INSIDE_CORNER"),
        quantity: 1, quantityAnswerKey: SURFACE_KEYS.inside },
      { answerOptionId: clear.id, canonicalComponentId: await comp("SURFACE_ROUTE_OUTSIDE_CORNER"),
        quantity: 1, quantityAnswerKey: SURFACE_KEYS.outside },
      // The generic binding, not a surface-specific engine: 0 omits the
      // component, 3 yields exactly 3. Same mechanism as the other two turns.
      { answerOptionId: clear.id, canonicalComponentId: await comp("SURFACE_ROUTE_FLAT_CORNER"),
        quantity: 1, quantityAnswerKey: SURFACE_KEYS.flat },
      // The only endpoint-dependent lines in the whole module.
      { answerOptionId: clear.id, canonicalComponentId: await comp(recipe.core), quantity: 1 },
      { answerOptionId: clear.id, canonicalComponentId: await comp(recipe.box), quantity: 1 },
    ],
    skipDuplicates: true,
  });

  return { entryQuestionId: qFeet.id };
}
