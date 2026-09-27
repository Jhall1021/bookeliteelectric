/**
 * Finished-ceiling route for a new ceiling fan with no accessible attic.
 *
 * The homeowner supplies one observable quantity: the approximate distance
 * from the control wall to the fan location. Pricing deliberately assumes the
 * conservative case: framing at 16 inches, every framing bay crossed, two
 * fixed switch-leg access openings and one top-plate penetration. Photos are
 * still required, but they prepare/validate a price rather than blocking it.
 */
import type { PrismaClient } from "@prisma/client";
import { addNumericUnknownOption, upsertQuestion } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";

export const CEILING_FAN_FINISHED_KEYS = {
  feet: "fan_finished_route_feet",
  surface: "fan_finished_ceiling_surface",
  obstacles: "fan_finished_route_obstacles",
  confirm: "fan_finished_route_confirm",
} as const;

const PHOTOS = [
  "A wide photo showing the wall control and the proposed fan location",
  "A photo looking across the ceiling between the wall and the proposed fan location",
];

const DISCLAIMER = [
  "This is a conservative finished-ceiling price based on the distance you entered.",
  "It assumes two fixed access openings for the switch-leg route, one top-plate penetration, and one ceiling access opening plus one joist drilling operation for every 16 inches between the wall and fan location.",
  "Drywall patching, sanding, texture, primer and paint are not included. The photos let the electrician confirm the route before the visit without withholding the price or preventing booking.",
].join("\n\n");

export async function attachCeilingFanFinishedRouteModule(
  prisma: PrismaClient,
  serviceId: string,
  entryOrder: number,
): Promise<{ entryQuestionId: string }> {
  const comp = (key: string) => componentIdByKey(prisma, key);

  const qConfirm = await upsertQuestion(prisma, serviceId, {
    key: CEILING_FAN_FINISHED_KEYS.confirm,
    prompt: "Review the finished-ceiling assumption",
    helpText: DISCLAIMER,
    inputType: "SINGLE_SELECT",
    order: entryOrder + 3,
  });
  const qObstacles = await upsertQuestion(prisma, serviceId, {
    key: CEILING_FAN_FINISHED_KEYS.obstacles,
    prompt: "Is the ceiling route clear between that wall and the fan location?",
    helpText: "Beams, tray ceilings, soffits, cabinets or other visible obstructions can change the route.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 2,
  });
  const qSurface = await upsertQuestion(prisma, serviceId, {
    key: CEILING_FAN_FINISHED_KEYS.surface,
    prompt: "Is the wall and ceiling surface ordinary drywall?",
    helpText: "Plaster, masonry, tile, wood panels and decorative finishes need a closer look before pricing.",
    inputType: "SINGLE_SELECT",
    order: entryOrder + 1,
  });
  const qFeet = await upsertQuestion(prisma, serviceId, {
    key: CEILING_FAN_FINISHED_KEYS.feet,
    prompt: "About how many feet from the control wall will the fan be?",
    helpText: "Estimate from the top of the wall where the fan will be controlled to the center of the proposed fan location. A whole-number estimate is fine.",
    inputType: "NUMBER",
    numberAllowsDecimal: true,
    numberMin: 1,
    numberMax: 300,
    order: entryOrder,
  });

  await prisma.answerOption.create({
    data: {
      questionId: qFeet.id,
      label: "Approximate wall-to-fan distance in feet",
      value: "__number__",
      routeAction: "CONTINUE",
      nextQuestionId: qSurface.id,
      order: 1,
      requiredPhotoLabels: [],
    },
  });
  await addNumericUnknownOption(prisma, qFeet.id);

  await prisma.answerOption.createMany({ data: [
    { questionId: qSurface.id, label: "Yes — ordinary drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: qObstacles.id, order: 1, requiredPhotoLabels: [] },
    { questionId: qSurface.id, label: "No — another finish", value: "other", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: qSurface.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
  ] });

  await prisma.answerOption.createMany({ data: [
    { questionId: qObstacles.id, label: "Yes — it is a clear, ordinary ceiling", value: "clear", routeAction: "CONTINUE", nextQuestionId: qConfirm.id, order: 1, requiredPhotoLabels: [] },
    { questionId: qObstacles.id, label: "No — something interrupts the route", value: "obstructed", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: qObstacles.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
  ] });

  await prisma.answerOption.createMany({ data: [
    {
      questionId: qConfirm.id,
      label: "Use this conservative price and let me book",
      value: "accept",
      routeAction: "PHOTO_REVIEW",
      photosBlockBooking: false,
      order: 1,
      requiredPhotoLabels: PHOTOS,
      disclaimer: DISCLAIMER,
      approvedComponentPriceCents: null,
    },
    {
      questionId: qConfirm.id,
      label: "I'd rather have the route reviewed first",
      value: "review_first",
      routeAction: "PHOTO_REVIEW",
      photosBlockBooking: true,
      order: 2,
      requiredPhotoLabels: PHOTOS,
    },
  ] });

  const terminal = await prisma.answerOption.findFirstOrThrow({
    where: { questionId: qConfirm.id, value: "accept" },
    select: { id: true },
  });
  await prisma.answerOptionComponent.createMany({
    data: [
      { answerOptionId: terminal.id, canonicalComponentId: await comp("ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS"), quantity: 1 },
      { answerOptionId: terminal.id, canonicalComponentId: await comp("CONCEALED_ROUTE_FT"), quantity: 1, quantityAnswerKey: CEILING_FAN_FINISHED_KEYS.feet },
      { answerOptionId: terminal.id, canonicalComponentId: await comp("RESTORE_DRYWALL_ACCESS"), quantity: 1 },
      { answerOptionId: terminal.id, canonicalComponentId: await comp("FIXTURE_BOX_ENDPOINT"), quantity: 1 },
      { answerOptionId: terminal.id, canonicalComponentId: await comp("CEILING_FAN_INSTALL_CORE"), quantity: 1 },
    ],
    skipDuplicates: true,
  });

  return { entryQuestionId: qFeet.id };
}
