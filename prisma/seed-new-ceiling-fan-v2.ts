/**
 * Route-priced New Ceiling Fan.
 *
 * No attic access is still priceable when the customer chooses either:
 *   - a conservative concealed drywall route driven by wall-to-fan feet and
 *     16-inch framing counts, with photos required but booking allowed; or
 *   - the shared visible surface-raceway route and fixture/fan box.
 *
 * Run after the Routing V2 component/material seeds and after the lighting
 * control module. The shared height module may run afterwards and remains the
 * outermost entry gate.
 */
import { PrismaClient } from "@prisma/client";
import { attachAccessibleConcealedModule } from "./_concealedRouteModules";
import { attachSurfaceRouteModule } from "./_surfaceRouteModule";
import { attachCeilingFanFinishedRouteModule, CEILING_FAN_FINISHED_KEYS } from "./_ceilingFanFinishedRouteModule";
import { findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "./_moduleHelpers";

const prisma = new PrismaClient();

export const FAN_ROUTE_METHOD_KEY = "fan_install_route_method";
const FAN_INSTALL_COMPONENT = {
  key: "CEILING_FAN_INSTALL_CORE",
  name: "Ceiling fan endpoint — assemble, mount and connect",
  customerFacingLabel: "Install the customer-supplied ceiling fan",
  notes:
    "ENDPOINT FINISH WORK, quantity 1. INCLUDES: assembling, mounting and electrically " +
    "connecting one customer-supplied ceiling fan after a powered fan-rated box has been " +
    "established, operational testing and basic cleanup. EXCLUDES: the wiring route, route " +
    "length, the fan-rated box, controls, drywall repair and every finish repair.",
} as const;
const FINAL_PHOTOS = [
  "A wide photo showing the wall control and the proposed fan location",
  "A photo looking across the ceiling between the wall and the proposed fan location",
];

export async function migrateNewCeilingFanToV2(db: PrismaClient = prisma, contractorSlug = "elite-electric") {
  // Keep this targeted migration independently runnable on an already-built
  // contractor. Fresh rehearsal builds create the same canonical role in the
  // shared Routing V2 component seed, while an existing contractor may not
  // have received that newer seed yet.
  await db.canonicalComponent.upsert({
    where: { key: FAN_INSTALL_COMPONENT.key },
    update: {
      name: FAN_INSTALL_COMPONENT.name,
      customerFacingLabel: FAN_INSTALL_COMPONENT.customerFacingLabel,
      notes: FAN_INSTALL_COMPONENT.notes,
      active: true,
    },
    create: { ...FAN_INSTALL_COMPONENT, active: true },
  });

  const contractor = await db.contractor.findUniqueOrThrow({
    where: { slug: contractorSlug }, select: { id: true },
  });
  const target = await db.service.findFirstOrThrow({
    where: { contractorId: contractor.id, slug: "new-ceiling-fan" }, select: { id: true },
  });
  const service = await db.service.findUniqueOrThrow({
    where: { id: target.id },
    include: { questions: { include: { options: true } } },
  });

  const qAttic = service.questions.find((q) => q.key === "attic_access");
  const qExisting = service.questions.find((q) => q.key === "existing_light_source");
  const qControl = service.questions.find((q) => q.key === "lighting_control");
  const qDimmer = service.questions.find((q) => q.key === "lighting_dimmer_upgrade");
  const qHeight = service.questions.find((q) => q.key === "fixture_height");
  const qBelow = service.questions.find((q) => q.key === "work_area_below");
  if (!qAttic || !qExisting || !qControl || !qDimmer) {
    throw new Error("new-ceiling-fan must have attic, source and lighting-control questions before Routing V2 is attached");
  }

  const accessible = await attachAccessibleConcealedModule(db, service.id, "CEILING_FAN", 30);
  const finished = await attachCeilingFanFinishedRouteModule(db, service.id, 40);
  const surface = await attachSurfaceRouteModule(db, service.id, "CEILING_FAN", 50);

  const qMethod = await upsertQuestion(db, service.id, {
    key: FAN_ROUTE_METHOD_KEY,
    prompt: "How would you like the wiring run?",
    helpText:
      "Hidden wiring uses conservative drywall-access and 16-inch framing assumptions. " +
      "Surface-mounted wiring runs in a visible channel and avoids opening the ceiling along the route.",
    inputType: "SINGLE_SELECT",
    order: 20,
  });
  await db.answerOption.createMany({ data: [
    { questionId: qMethod.id, label: "Hidden through the drywall ceiling", value: "concealed", routeAction: "CONTINUE", nextQuestionId: finished.entryQuestionId, order: 1, requiredPhotoLabels: [] },
    { questionId: qMethod.id, label: "Visible surface-mounted raceway", value: "surface", routeAction: "CONTINUE", nextQuestionId: surface.entryQuestionId, order: 2, requiredPhotoLabels: [] },
    { questionId: qMethod.id, label: "I'm not sure — help me decide", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: FINAL_PHOTOS },
  ] });

  // Attic access establishes the access class before the lighting-control
  // components are evaluated. Each route then collects its physical recipe
  // and hands off to the existing source/control questions.
  await db.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: qAttic.id } } });
  await db.answerOption.updateMany({
    where: { questionId: qAttic.id, value: "has_access" },
    data: { routeAction: "CONTINUE", nextQuestionId: accessible.entryQuestionId, priceModifierCents: 0, approvedComponentPriceCents: null, disclaimer: null },
  });

  // On an already-provisioned contractor the shared height gate already
  // exists. Keep it outermost and hand its ordinary-floor answers to attic
  // access. On a fresh template this migration runs first and the height seed
  // adds the same handoff afterwards.
  if (qHeight && qBelow) {
    await db.answerOption.deleteMany({ where: { questionId: qHeight.id } });
    const heightPhotos = ["A wide photo of the whole room, including the proposed fan location and the floor below"];
    await db.answerOption.createMany({ data: [
      { questionId: qHeight.id, label: "10 feet or under", value: "under_10", routeAction: "CONTINUE", nextQuestionId: qBelow.id, order: 1, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "11 to 12 feet", value: "11_12", routeAction: "CONTINUE", nextQuestionId: qBelow.id, order: 2, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "13 to 14 feet", value: "13_14", routeAction: "CONTINUE", nextQuestionId: qBelow.id, order: 3, requiredPhotoLabels: [] },
      { questionId: qHeight.id, label: "Over 14 feet, or I don't know", value: "over_14_or_unsure", routeAction: "REMOTE_QUOTE", photosBlockBooking: true, order: 4, requiredPhotoLabels: heightPhotos },
    ] });
    await db.answerOption.updateMany({
      where: { questionId: qBelow.id, routeAction: "CONTINUE" },
      data: { nextQuestionId: qAttic.id },
    });
  }
  await db.answerOption.updateMany({
    where: { questionId: qAttic.id, value: "no_access" },
    data: { routeAction: "CONTINUE", nextQuestionId: qMethod.id, priceModifierCents: 0, approvedComponentPriceCents: null, disclaimer: null },
  });

  // Route terminals become handoffs. Components remain attached and therefore
  // travel into the final derived calculation.
  for (const [questionKey, value] of [
    ["accessible_route_feet", "__number__"],
    [CEILING_FAN_FINISHED_KEYS.confirm, "accept"],
    ["surface_route_obstacles", "clear"],
  ] as const) {
    const q = await db.question.findFirstOrThrow({ where: { serviceId: service.id, key: questionKey }, select: { id: true } });
    await db.answerOption.updateMany({
      where: { questionId: q.id, value },
      data: { routeAction: "CONTINUE", nextQuestionId: qExisting.id },
    });
  }

  // The source question always enters the already-authored control module.
  await db.answerOption.updateMany({
    where: { questionId: qExisting.id, value: { in: ["yes", "no"] } },
    data: { routeAction: "CONTINUE", nextQuestionId: qControl.id },
  });

  // Every priceable fan route ends by collecting two useful installation
  // photos. They do not send the job to office review and do not block booking.
  await db.answerOption.updateMany({
    where: { questionId: qDimmer.id, value: { in: ["standard", "dimmer"] } },
    data: {
      routeAction: "PHOTO_REVIEW",
      photosBlockBooking: false,
      nextQuestionId: null,
      requiredPhotoLabels: FINAL_PHOTOS,
    },
  });

  // Superseded fixture-side acknowledgement. The new concealed branch has a
  // more precise, distance-driven acknowledgement of its own.
  const oldAck = service.questions.find((q) => q.key === "fixture_finish_ack");
  if (oldAck) {
    await db.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: oldAck.id } } });
    await db.answerOption.deleteMany({ where: { questionId: oldAck.id } });
    await db.question.delete({ where: { id: oldAck.id } });
  }

  // A resolved physical route is now the sole pricing authority. The old
  // unconditional fan materials and published anchor must not be counted on
  // top of the measured takeoff.
  await db.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await db.service.update({
    where: { id: service.id },
    data: { pricingMethod: "DERIVED_RESOLVED_SCOPE" },
  });

  // Stable, unique ordering; routing itself follows nextQuestionId. The height
  // module runs later and inserts its two questions ahead of this list.
  const priority = [
    ...(qHeight && qBelow ? ["fixture_height", "work_area_below"] : []),
    "attic_access", FAN_ROUTE_METHOD_KEY,
    "accessible_route_feet",
    ...Object.values(CEILING_FAN_FINISHED_KEYS),
    "surface_route_feet", "surface_inside_corner_count", "surface_outside_corner_count",
    "surface_route_flat_corner_count", "surface_mounting_surface", "surface_route_obstacles",
    "existing_light_source", "lighting_control", "switch_near_power", "below_above_access",
    "finished_space_both_sides", "switch_leg_distance", "switchleg_finish_ack", "lighting_dimmer_upgrade",
  ];
  const questions = await db.question.findMany({ where: { serviceId: service.id }, select: { id: true, key: true, order: true } });
  const live = questions.sort((a, b) => {
    const ai = priority.indexOf(a.key), bi = priority.indexOf(b.key);
    return (ai < 0 ? 800 + a.order : ai) - (bi < 0 ? 800 + b.order : bi);
  });
  for (const [order, question] of live.entries()) {
    await db.question.update({ where: { id: question.id }, data: { order } });
  }

  const dangling = await findDanglingReferences(db, service.id);
  const unreachable = await findUnreachableQuestions(db, service.id);
  if (dangling.length || unreachable.length) {
    throw new Error(`new-ceiling-fan V2 graph invalid; dangling=${dangling.join(",")}; unreachable=${unreachable.join(",")}`);
  }
  return { serviceId: service.id, questionCount: live.length };
}

if (process.argv[1]?.endsWith("seed-new-ceiling-fan-v2.ts")) {
  const contractorArg = process.argv.indexOf("--contractor");
  const contractorSlug = contractorArg >= 0 ? process.argv[contractorArg + 1] : "elite-electric";
  if (!contractorSlug) throw new Error("--contractor requires a slug");
  migrateNewCeilingFanToV2(prisma, contractorSlug)
    .then(async (result) => { console.log(`\n  new-ceiling-fan Routing V2 ready (${result.questionCount} active questions).\n`); await prisma.$disconnect(); })
    .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
}
