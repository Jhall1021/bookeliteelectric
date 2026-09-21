/**
 * Contractor-reviewed 50A four-wire hot-tub/spa package.
 *
 *   npx tsx prisma/seed-hot-tub-spa.ts --apply
 *
 * The homeowner supplies observable context and photos only. The contractor
 * confirms the equipment instructions, panel capacity, disconnect location,
 * wet-location wiring method, measured PVC and liquidtight paths, individual
 * conductor lengths and any included bonding scope before calculation.
 */
import { PrismaClient } from "@prisma/client";
import { findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { PERMIT_DISCLAIMER } from "../lib/permitPolicy";

const prisma = new PrismaClient();
const SLUG = "hot-tub-spa-electrical";
const PHOTOS = [
  "The hot tub model label and electrical requirements, if safely visible",
  "The hot tub installation instructions showing the electrical connection requirements",
  "The electrical panel with the door open and breakers visible — leave the panel cover on",
  "The exterior panel-to-disconnect wall route and proposed disconnect location",
  "The proposed disconnect-to-tub connection path and the tub's bonding lug, if present",
];
const FIXED_ROLE_KEYS = ["SPA_PANEL_GFCI_50A", "BREAKER_DOUBLE_POLE_50A", "CONDUIT_FITTINGS_1", "CONDUIT_LFNC_FITTINGS_1", "CONSUMABLES_MEDIUM"] as const;
const DYNAMIC_ROLE_KEYS = ["CONDUIT_PVC_1", "CONDUIT_LFNC_1", "CONDUCTOR_THHN_6_UNGROUNDED", "CONDUCTOR_THHN_6_GROUNDED", "CONDUCTOR_THHN_10_EQUIPMENT_GROUND", "SPA_BONDING_CONDUCTOR_8_BARE", "SPA_BONDING_LUG_CLAMP"] as const;

async function clearTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await prisma.answerOption.deleteMany({ where: { questionId: question.id } });
  await prisma.question.deleteMany({ where: { serviceId } });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, SLUG) });
  if (!service) throw new Error(`Missing ${SLUG}`);
  const roleKeys = [...FIXED_ROLE_KEYS, ...DYNAMIC_ROLE_KEYS];
  const roles = await prisma.canonicalMaterial.findMany({ where: { key: { in: roleKeys } }, select: { id: true, key: true } });
  if (roles.length !== roleKeys.length) throw new Error("Run the Phase F material-role seed before the hot-tub/spa seed.");
  console.log("\nHOT TUB / SPA — REVIEWED WET-LOCATION PACKAGE\n");
  console.log("  50A four-wire individual wet-location conductors; exterior PVC plus measured liquidtight equipment raceway");
  if (!apply) { console.log("\n  Report only. Re-run with --apply to build the reviewed package.\n"); return; }

  await prisma.service.update({ where: { id: service.id }, data: {
    name: "Hot Tub / Spa Electrical",
    shortDescription: "A reviewed 50A four-wire spa circuit from an exterior panel, with an outdoor GFCI disconnect and measured wet-location wiring methods.",
    bookingType: "REMOTE_QUOTE", active: true, offered: true, isPrimaryEligible: true,
    fieldLaborHours: null, wwtLaborHours: null,
    photoState: "PREPARATION", startingPriceLabel: "Price after photo review",
    disclaimer: "The electrician confirms the hot tub instructions, exact 50A four-wire configuration, panel capacity, compliant disconnect location, measured exterior PVC route, liquidtight equipment connection, conductor lengths, and bonding scope before calculating a price. NM-B cable is not used in the exterior conduit package. Interior or underground routing, trenching, hardscape, 60A equipment, panel or service work, remediation, specialty walls, and unconfirmed bonding remain separate review. " + PERMIT_DISCLAIMER,
  } });
  await clearTree(service.id);

  const specs = [
    { key: "spa_placed", prompt: "Is the hot tub already in its final location?", helpText: "The electrician needs the final tub and disconnect locations before measuring the wiring paths." },
    { key: "spa_requirements", prompt: "Can you photograph the hot tub's electrical label or installation instructions?", helpText: "You do not need to interpret it. The electrician will confirm the exact electrical requirements." },
    { key: "spa_panel_location", prompt: "Where is the electrical panel compared with the hot tub?", helpText: "The reviewed package starts with an exterior panel on the same side of the house. Other layouts still receive manual review." },
    { key: "spa_route", prompt: "What is along the outside route from the panel toward the hot tub?", helpText: "Choose what you can see. The electrician will confirm the wiring method and exact path." },
    { key: "spa_distance", prompt: "Roughly how long is the outside wall route from the panel to the disconnect area?", helpText: "A rough range is enough. The electrician measures the PVC, liquidtight, conductors, and bonding separately before calculating the price." },
  ] as const;
  const questions = new Map<string, { id: string }>();
  for (const [index, spec] of specs.entries()) questions.set(spec.key, await upsertQuestion(prisma, service.id, { ...spec, order: index + 1 }));
  const q = (key: string) => questions.get(key)!.id;
  const next = (key: string, label: string, value: string, nextKey: string, order: number) => ({ questionId: q(key), label, value, routeAction: "CONTINUE" as const, nextQuestionId: q(nextKey), order, requiredPhotoLabels: [] as string[], approvedComponentPriceCents: 0 });
  const review = (key: string, label: string, value: string, order: number) => ({ questionId: q(key), label, value, routeAction: "PHOTO_REVIEW" as const, nextQuestionId: null, order, requiredPhotoLabels: PHOTOS, photosBlockBooking: true, approvedComponentPriceCents: null });
  await prisma.answerOption.createMany({ data: [
    next("spa_placed", "Yes — it is in its final location", "placed", "spa_requirements", 1),
    review("spa_placed", "Not yet, or I am not sure", "not_placed_or_unsure", 2),
    next("spa_requirements", "Yes — I can photograph the label or instructions", "label_available", "spa_panel_location", 1),
    review("spa_requirements", "No label or instructions are available yet", "requirements_unavailable", 2),
    next("spa_panel_location", "Outside, on the same side of the house", "exterior_same_wall", "spa_route", 1),
    review("spa_panel_location", "Inside, on another side, detached, or I am not sure", "other_or_unsure", 2),
    next("spa_route", "An ordinary exposed exterior wall with no digging or hardscape crossing", "ordinary_exterior_wall", "spa_distance", 1),
    review("spa_route", "Lawn, patio, driveway, deck, finished interior, specialty wall, or I am not sure", "nonstandard_or_unsure", 2),
    review("spa_distance", "About 25 feet or less", "within_25", 1),
    review("spa_distance", "More than 25 feet, or I am not sure", "over_25_or_unsure", 2),
  ] });

  const roleByKey = new Map(roles.map((role) => [role.key, role.id]));
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await prisma.serviceMaterial.createMany({ data: FIXED_ROLE_KEYS.map((key, order) => ({ serviceId: service.id, canonicalMaterialId: roleByKey.get(key)!, quantity: 1, order })) });
  await recomputeServiceMaterialCost(prisma as never, service.id);
  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  if (dangling.length || unreachable.length) throw new Error(`${dangling.length} dangling and ${unreachable.length} unreachable spa questions`);
  console.log("  ✓ reviewed exterior-panel 50A four-wire spa package defined; no NM-B or fixed labor hours");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
