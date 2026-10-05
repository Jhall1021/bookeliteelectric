import type { PrismaClient } from "@prisma/client";
import { addNumericUnknownOption, upsertQuestion } from "./_moduleHelpers";
import { componentIdByKey } from "./_componentHelpers";

export const GARAGE_EMT_KEYS = {
  feet: "garage_emt_route_feet",
  bends: "garage_emt_bend_count",
  obstacles: "garage_emt_route_obstacles",
} as const;

const PHOTOS = [
  "A wide photo showing the possible power source and the garage-door-opener motor",
  "A photo showing the complete proposed wall-and-ceiling conduit route",
];

export async function attachGarageEmtRouteModule(prisma: PrismaClient, serviceId: string, entryOrder: number) {
  const comp = (key: string) => componentIdByKey(prisma, key);
  const qObstacles = await upsertQuestion(prisma, serviceId, {
    key: GARAGE_EMT_KEYS.obstacles,
    prompt: "Is the visible conduit route clear?",
    helpText: "Door tracks, cabinets, beams, equipment and other obstacles can require offsets or additional pull points.",
    inputType: "SINGLE_SELECT", order: entryOrder + 3,
  });
  const qBends = await upsertQuestion(prisma, serviceId, {
    key: GARAGE_EMT_KEYS.bends,
    prompt: "About how many 90-degree direction changes will the conduit make?",
    helpText: "Count ordinary turns from the source to the opener outlet. Enter 0 for one straight run.",
    inputType: "NUMBER", numberMin: 0, numberMax: 4, order: entryOrder + 1,
  });
  const qFeet = await upsertQuestion(prisma, serviceId, {
    key: GARAGE_EMT_KEYS.feet,
    prompt: "About how many feet is the visible conduit route?",
    helpText: "Measure along the wall and ceiling from the power source to the garage-door-opener motor.",
    inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: entryOrder,
  });

  await prisma.answerOption.create({ data: { questionId: qFeet.id, label: "Approximate conduit length in feet", value: "__number__", routeAction: "CONTINUE", nextQuestionId: qBends.id, order: 1, requiredPhotoLabels: [] } });
  await prisma.answerOption.create({ data: { questionId: qBends.id, label: "Number of ordinary 90-degree turns", value: "__number__", routeAction: "CONTINUE", nextQuestionId: qObstacles.id, order: 1, requiredPhotoLabels: [] } });
  await addNumericUnknownOption(prisma, qFeet.id);
  await addNumericUnknownOption(prisma, qBends.id);
  await prisma.answerOption.createMany({ data: [
    { questionId: qObstacles.id, label: "Yes — the route is clear", value: "clear", routeAction: "PHOTO_REVIEW", photosBlockBooking: false, order: 1, requiredPhotoLabels: PHOTOS, disclaimer: "The price uses 1/2-inch EMT, three #12 copper conductors, one-hole straps, a metal outlet box and a raised metal duplex cover. It assumes the measured route and ordinary bends shown in your answers; unusual offsets, pull points or obstructions are reviewed before work begins." },
    { questionId: qObstacles.id, label: "No — something interrupts the route", value: "obstructed", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: PHOTOS },
    { questionId: qObstacles.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
  ] });
  const terminal = await prisma.answerOption.findFirstOrThrow({ where: { questionId: qObstacles.id, value: "clear" }, select: { id: true } });
  await prisma.answerOptionComponent.createMany({ data: [
    { answerOptionId: terminal.id, canonicalComponentId: await comp("ELEC_ROUTE_GARAGE_EMT"), quantity: 1 },
    { answerOptionId: terminal.id, canonicalComponentId: await comp("GARAGE_EMT_ROUTE_FT"), quantity: 1, quantityAnswerKey: GARAGE_EMT_KEYS.feet },
    { answerOptionId: terminal.id, canonicalComponentId: await comp("GARAGE_EMT_BEND"), quantity: 1, quantityAnswerKey: GARAGE_EMT_KEYS.bends },
    { answerOptionId: terminal.id, canonicalComponentId: await comp("GARAGE_EMT_DEVICE_BOX_OUTLET"), quantity: 1 },
  ], skipDuplicates: true });
  return { entryQuestionId: qFeet.id };
}
