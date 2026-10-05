import { PrismaClient } from "@prisma/client";
import { attachAccessibleConcealedModule } from "./_concealedRouteModules";
import { attachGarageEmtRouteModule } from "./_garageEmtRouteModule";
import { attachGarageFinishedRouteModule } from "./_garageFinishedRouteModule";
import { findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "./_moduleHelpers";

const prisma = new PrismaClient();
const PHOTOS = [
  "Garage ceiling and opener motor, showing where the outlet is needed",
  "Nearest existing outlet or other possible power source",
  "Electrical panel with the door open, showing the breakers",
];

async function clearQuestions(db: PrismaClient, serviceId: string) {
  const questions = await db.question.findMany({ where: { serviceId }, select: { id: true } });
  if (!questions.length) return;
  const ids = questions.map((question) => question.id);
  await db.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: { in: ids } } } });
  await db.answerOption.deleteMany({ where: { questionId: { in: ids } } });
  await db.question.deleteMany({ where: { id: { in: ids } } });
}

export async function migrateGarageOpenerToV2(db: PrismaClient = prisma, contractorSlug = "elite-electric") {
  const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
  const service = await db.service.findFirstOrThrow({
    where: { contractorId: contractor.id, slug: "garage-door-opener-outlet" },
  });
  await clearQuestions(db, service.id);

  const accessible = await attachAccessibleConcealedModule(db, service.id, "OUTLET", 20);
  const finished = await attachGarageFinishedRouteModule(db, service.id, 30);
  const emt = await attachGarageEmtRouteModule(db, service.id, 40);

  const qMethod = await upsertQuestion(db, service.id, {
    key: "garage_opener_route_method",
    prompt: "How would you like the wiring run to the opener?",
    helpText: "Hidden wiring may require access openings. The visible garage option uses 1/2-inch EMT, not decorative Wiremold.",
    inputType: "SINGLE_SELECT", order: 12,
  });
  const qAccess = await upsertQuestion(db, service.id, {
    key: "garage_opener_access",
    prompt: "Is there accessible attic or open framing along the route?",
    helpText: "Accessible space lets the electrician run and support cable without opening the finished ceiling.",
    inputType: "SINGLE_SELECT", order: 11,
  });
  const qHeight = await upsertQuestion(db, service.id, {
    key: "fixture_height",
    prompt: "About how high is the garage-door opener or work area?",
    helpText: "Ten feet and under uses the base labor. Work over 14 feet, or an uncertain height, needs photos and a remote quote.",
    inputType: "SINGLE_SELECT", order: 0,
  });
  await db.answerOption.createMany({ data: [
    { questionId: qHeight.id, label: "10 feet or under", value: "under_10", routeAction: "CONTINUE", nextQuestionId: qAccess.id, order: 1, requiredPhotoLabels: [] },
    { questionId: qHeight.id, label: "11 to 12 feet", value: "11_12", routeAction: "CONTINUE", nextQuestionId: qAccess.id, order: 2, requiredPhotoLabels: [] },
    { questionId: qHeight.id, label: "13 to 14 feet", value: "13_14", routeAction: "CONTINUE", nextQuestionId: qAccess.id, order: 3, requiredPhotoLabels: [] },
    { questionId: qHeight.id, label: "Over 14 feet, or I don't know", value: "over_14_or_unsure", routeAction: "REMOTE_QUOTE", photosBlockBooking: true, order: 4, requiredPhotoLabels: [PHOTOS[0]] },
    { questionId: qAccess.id, label: "Yes — accessible attic or open framing", value: "accessible", routeAction: "CONTINUE", nextQuestionId: accessible.entryQuestionId, order: 1, requiredPhotoLabels: [] },
    { questionId: qAccess.id, label: "No — the wall and ceiling are finished", value: "finished", routeAction: "CONTINUE", nextQuestionId: qMethod.id, order: 2, requiredPhotoLabels: [] },
    { questionId: qAccess.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
    { questionId: qMethod.id, label: "Hide it in the wall and ceiling, with drywall access as needed", value: "concealed", routeAction: "CONTINUE", nextQuestionId: finished.entryQuestionId, order: 1, requiredPhotoLabels: [] },
    { questionId: qMethod.id, label: "Use visible 1/2-inch EMT metal conduit", value: "emt", routeAction: "CONTINUE", nextQuestionId: emt.entryQuestionId, order: 2, requiredPhotoLabels: [] },
    { questionId: qMethod.id, label: "I'm not sure — help me decide", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
  ] });

  await db.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await db.service.update({
    where: { id: service.id },
    data: {
      pricingMethod: "DERIVED_RESOLVED_SCOPE",
      name: "New Garage Outlet",
      shortDescription: "A new surface-mounted garage outlet, including a ceiling outlet for a garage-door opener.",
    },
  });

  const alias = await db.service.findFirst({ where: { contractorId: contractor.id, slug: "garage-door-opener-outlet-ev" }, select: { id: true } });
  if (alias) {
    await db.answerOptionComponent.deleteMany({ where: { answerOption: { question: { serviceId: alias.id } } } });
    await db.answerOption.deleteMany({ where: { question: { serviceId: alias.id } } });
    await db.question.deleteMany({ where: { serviceId: alias.id } });
    const entry = await db.question.create({ data: { serviceId: alias.id, key: "garage_opener_entry", prompt: "Add a ceiling outlet for your garage-door opener?", inputType: "SINGLE_SELECT", order: 1 } });
    await db.answerOption.create({ data: { questionId: entry.id, label: "Yes, continue", value: "continue", routeAction: "REROUTE_SERVICE", rerouteServiceId: service.id, order: 1, requiredPhotoLabels: [] } });
  }

  const dangling = await findDanglingReferences(db, service.id);
  const unreachable = await findUnreachableQuestions(db, service.id);
  if (dangling.length || unreachable.length) throw new Error(`garage opener V2 graph invalid; dangling=${dangling.join(",")}; unreachable=${unreachable.join(",")}`);
  return { serviceId: service.id };
}

if (process.argv[1]?.endsWith("seed-garage-opener-v2.ts")) {
  const index = process.argv.indexOf("--contractor");
  const contractorSlug = index >= 0 ? process.argv[index + 1] : "elite-electric";
  if (!contractorSlug) throw new Error("--contractor requires a slug");
  migrateGarageOpenerToV2(prisma, contractorSlug)
    .then(async (result) => { console.log(`Garage opener V2 ready for ${contractorSlug}: ${result.serviceId}`); await prisma.$disconnect(); })
    .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
}
