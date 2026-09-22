/**
 * ROUTING V2 — the concealed route strategies.
 *
 * Two here, both of which need no eligibility envelope:
 *
 *   ACCESSIBLE CONCEALED — an attic, unfinished basement or crawlspace connects
 *     source to destination, so wiring is concealed without opening anything.
 *     This is where the governing rule shows most clearly: length is a QUANTITY.
 *     A 50 ft accessible route is the same work as an 8 ft one, more of it, and
 *     nothing about its length makes it unpredictable.
 *
 *   BACK TO BACK — the new location is directly opposite the source on the same
 *     wall. DELIBERATELY CARRIES NO FOOTAGE: the distance is the thickness of a
 *     wall, and inventing a per-foot line for symmetry with the other strategies
 *     would price a quantity that is not part of the physical scope.
 */
import type { PrismaClient } from "@prisma/client";
import { upsertQuestion, addNumericUnknownOption } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";
import type { SurfaceEndpoint } from "./_surfaceRouteModule";

/** Endpoint cores are shared with the surface module — the same physical work. */
export const ENDPOINT_CORE: Record<SurfaceEndpoint, string> = {
  OUTLET: "OUTLET_EXTENSION_CORE",
  SWITCH: "SWITCH_ENDPOINT_CORE",
  FIXTURE_BOX: "FIXTURE_BOX_ENDPOINT",
};

export const ACCESSIBLE_KEYS = { feet: "accessible_route_feet" } as const;
export const BACK_TO_BACK_KEYS = { confirm: "back_to_back_confirm" } as const;

/**
 * Answer-validity bounds. NOT an eligibility envelope: this strategy authors
 * none, which is exactly why 50 ft passes through it untouched.
 */
export const ACCESSIBLE_BOUNDS = { min: 1, max: 300 } as const;

const REVIEW_PHOTOS = ["A photo of the open space the wiring will run through"];

/**
 * Accessible concealed: collect a practical homeowner estimate and price it.
 *
 * The homeowner is not expected to measure an installed cable path. They give
 * the approximate point-to-point distance through the accessible space; the
 * contractor's concealed-cable policy supplies the ordinary extra allowance
 * at each end. Route Assist is intentionally not offered here because its room
 * scan did not observe the attic/basement/crawlspace path.
 */
export async function attachAccessibleConcealedModule(
  prisma: PrismaClient,
  serviceId: string,
  endpoint: SurfaceEndpoint,
  entryOrder: number
): Promise<{ entryQuestionId: string }> {
  const comp = (k: string) => componentIdByKey(prisma, k);

  const qFeet = await upsertQuestion(prisma, serviceId, {
    key: ACCESSIBLE_KEYS.feet,
    prompt: "Roughly how long is the accessible route?",
    helpText:
      "Give your best rough estimate in feet—a whole-number guess is enough, and you do not need to measure it. " +
      "Estimate from the area above or below the existing power source to the area above or below the new location. " +
      "Your contractor's standard extra cable allowance for reaching the outlet or switch is added automatically. " +
      "If you cannot safely estimate it, choose I’m not sure.",
    // Explicit at the call site: these bounds are part of the pricing contract.
    // NO numeric ROUTING predicates on the option below — length does not change
    // this route's class, so there is nothing to branch on.
    inputType: "NUMBER",
    numberAllowsDecimal: true,
    numberMin: ACCESSIBLE_BOUNDS.min,
    numberMax: ACCESSIBLE_BOUNDS.max,
    order: entryOrder,
  });

  const opt = await prisma.answerOption.create({
    data: {
      questionId: qFeet.id, label: "Route length in feet", value: "__number__",
      routeAction: "RESOLVE_INSTANT", order: 1,
      requiredPhotoLabels: [],
      approvedComponentPriceCents: null,
    },
  });

  await addNumericUnknownOption(prisma, qFeet.id);

  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: opt.id, canonicalComponentId: await comp("ELEC_ROUTE_ACCESSIBLE_CONCEALED"), quantity: 1 },
      { answerOptionId: opt.id, canonicalComponentId: await comp("CONCEALED_ROUTE_FT"),
        quantity: 1, quantityAnswerKey: ACCESSIBLE_KEYS.feet },
      { answerOptionId: opt.id, canonicalComponentId: await comp(ENDPOINT_CORE[endpoint]), quantity: 1 },
    ],
    skipDuplicates: true,
  });

  return { entryQuestionId: qFeet.id };
}

/**
 * Back to back. One confirmation, no measurement.
 *
 * The absent footage is the design, not an omission: there is no run to measure,
 * and a CONCEALED_ROUTE_FT x1 line would invent a unit of work to keep the
 * strategies looking alike.
 */
export async function attachBackToBackModule(
  prisma: PrismaClient,
  serviceId: string,
  endpoint: SurfaceEndpoint,
  entryOrder: number
): Promise<{ entryQuestionId: string }> {
  const comp = (k: string) => componentIdByKey(prisma, k);

  const q = await upsertQuestion(prisma, serviceId, {
    key: BACK_TO_BACK_KEYS.confirm,
    prompt: "Is the new spot straight through this wall?",
    helpText:
      "The two spots must face each other on opposite sides of the same wall. " +
      "Being on the same wall is not enough.",
    inputType: "SINGLE_SELECT",
    order: entryOrder,
  });

  await prisma.answerOption.createMany({
    data: [
      { questionId: q.id, label: "Yes — straight through the same wall", value: "yes",
        routeAction: "RESOLVE_INSTANT", order: 1, requiredPhotoLabels: [],
        approvedComponentPriceCents: null },
      // Not a route we can describe from here; the finished-wall path handles it.
      { questionId: q.id, label: "No — it's somewhere else on the wall", value: "no",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2,
        requiredPhotoLabels: REVIEW_PHOTOS },
      { questionId: q.id, label: "I'm not sure", value: "unsure",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3,
        requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  const yes = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: q.id, value: "yes" }, select: { id: true },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: yes.id, canonicalComponentId: await comp("ELEC_ROUTE_BACK_TO_BACK"), quantity: 1 },
      { answerOptionId: yes.id, canonicalComponentId: await comp(ENDPOINT_CORE[endpoint]), quantity: 1 },
    ],
    skipDuplicates: true,
  });

  return { entryQuestionId: q.id };
}
