import type { PrismaClient } from "@prisma/client";
import { addNumericUnknownOption, upsertQuestion } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";

export const GARAGE_FINISHED_KEYS = {
  feet: "garage_finished_route_feet",
  surface: "garage_finished_ceiling_surface",
  obstacles: "garage_finished_route_obstacles",
  confirm: "garage_finished_route_confirm",
} as const;
const PHOTOS = ["A wide photo showing the power source, wall and opener motor", "A photo looking across the ceiling along the proposed hidden route"];
const DISCLAIMER = "This conservative price assumes two fixed wall/ceiling access openings, one top-plate penetration, and one ceiling opening plus joist drilling operation for every 16 inches of distance entered. Drywall patching, texture, primer and paint are not included. Photos confirm the route but do not withhold the displayed price or prevent booking.";

export async function attachGarageFinishedRouteModule(prisma: PrismaClient, serviceId: string, entryOrder: number) {
  const comp = (key: string) => componentIdByKey(prisma, key);
  const qConfirm = await upsertQuestion(prisma, serviceId, { key: GARAGE_FINISHED_KEYS.confirm, prompt: "Review the finished-ceiling assumption", helpText: DISCLAIMER, inputType: "SINGLE_SELECT", order: entryOrder + 3 });
  const qObstacles = await upsertQuestion(prisma, serviceId, { key: GARAGE_FINISHED_KEYS.obstacles, prompt: "Is the ceiling route clear between the wall and opener motor?", helpText: "Beams, soffits, storage racks, ductwork or other visible obstacles can change the route.", inputType: "SINGLE_SELECT", order: entryOrder + 2 });
  const qSurface = await upsertQuestion(prisma, serviceId, { key: GARAGE_FINISHED_KEYS.surface, prompt: "Is the wall and ceiling ordinary drywall?", helpText: "Plaster, masonry, tile, panels and specialty finishes need a closer look.", inputType: "SINGLE_SELECT", order: entryOrder + 1 });
  const qFeet = await upsertQuestion(prisma, serviceId, { key: GARAGE_FINISHED_KEYS.feet, prompt: "About how many feet from the source wall is the opener motor?", helpText: "Estimate from the top of the source wall to the center of the opener motor location.", inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 100, order: entryOrder });
  await prisma.answerOption.create({ data: { questionId: qFeet.id, label: "Approximate wall-to-opener distance in feet", value: "__number__", routeAction: "CONTINUE", nextQuestionId: qSurface.id, order: 1, requiredPhotoLabels: [] } });
  await addNumericUnknownOption(prisma, qFeet.id);
  await prisma.answerOption.createMany({ data: [
    { questionId: qSurface.id, label: "Yes — ordinary drywall", value: "drywall", routeAction: "CONTINUE", nextQuestionId: qObstacles.id, order: 1, requiredPhotoLabels: [] },
    { questionId: qSurface.id, label: "No — another finish", value: "other", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: qSurface.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    { questionId: qObstacles.id, label: "Yes — it is a clear, ordinary ceiling", value: "clear", routeAction: "CONTINUE", nextQuestionId: qConfirm.id, order: 1, requiredPhotoLabels: [] },
    { questionId: qObstacles.id, label: "No — something interrupts the route", value: "obstructed", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: qObstacles.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    { questionId: qConfirm.id, label: "Use this conservative price and let me book", value: "accept", routeAction: "PHOTO_REVIEW", photosBlockBooking: false, order: 1, requiredPhotoLabels: PHOTOS, disclaimer: DISCLAIMER },
    { questionId: qConfirm.id, label: "I'd rather have the route reviewed first", value: "review_first", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
  ] });
  const terminal = await prisma.answerOption.findFirstOrThrow({ where: { questionId: qConfirm.id, value: "accept" }, select: { id: true } });
  await prisma.answerOptionComponent.createMany({ data: [
    { answerOptionId: terminal.id, canonicalComponentId: await comp("ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS"), quantity: 1 },
    { answerOptionId: terminal.id, canonicalComponentId: await comp("GARAGE_FINISHED_CEILING_ROUTE"), quantity: 1 },
    { answerOptionId: terminal.id, canonicalComponentId: await comp("CONCEALED_ROUTE_FT"), quantity: 1, quantityAnswerKey: GARAGE_FINISHED_KEYS.feet },
    { answerOptionId: terminal.id, canonicalComponentId: await comp("RESTORE_DRYWALL_ACCESS"), quantity: 1 },
    { answerOptionId: terminal.id, canonicalComponentId: await comp("OUTLET_EXTENSION_CORE"), quantity: 1 },
  ], skipDuplicates: true });
  return { entryQuestionId: qFeet.id };
}
