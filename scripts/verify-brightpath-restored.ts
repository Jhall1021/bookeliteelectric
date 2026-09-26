/**
 * BrightPath's outlet is back to what provisioning built, and nothing else moved.
 *
 * The accidental Routing V2 migration ran here. The repair is only credible if
 * it is checked against an independent description of the original. The
 * rehearsal initializer now consolidates the current catalog into a fresh
 * snapshot, so the historical TemplateVersion row is intentionally absent.
 * The frozen structural fingerprint below records the restored V1 tree from
 * its authoring source (seed-new-outlet.ts plus the historical over_40 delta).
 *
 * It also asserts the economics did NOT move. BrightPath is the deliberately
 * unconfigured second tenant; its empty material and component state is the
 * product fact that makes it useful, and a restore that "helpfully" resolved
 * anything would have destroyed the evidence it exists to provide.
 */
import { PrismaClient } from "@prisma/client";
import { serviceFor } from "../prisma/_serviceTargets";
import { SURFACE_MODULE_KEYS } from "../prisma/_surfaceRouteModule";
import { ACCESSIBLE_KEYS } from "../prisma/_concealedRouteModules";
import { FINISHED_MODULE_KEYS } from "../prisma/_finishedWallModule";
import { OUTLET_V2_KEYS, OUTLET_SLUG } from "../prisma/seed-new-outlet-v2";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** What BrightPath's outlet looked like before the accident, recorded at the time. */
const PRE_V2_ECONOMICS = {
  materialCostCents: null as number | null,
  materialCostResolved: false,
  unresolvedMaterialKeys: ["WIRE_14_2", "CONSUMABLES_SMALL", "RECEPTACLE_STANDARD", "BOX_OLD_WORK", "WALL_PLATE"],
  unresolvedPolicyKeys: ["outlet_run.breakpoints"],
  serviceMaterialRows: 0,
};

/** key/order/option-count fingerprint of the restored legacy tree. */
const PRE_V2_QUESTIONS = [
  "0:outlet_load_type:6",
  "1:outlet_power_source:2",
  "2:below_above_access:2",
  "3:finished_space_both_sides:3",
  "4:device_on_exterior_wall:3",
  "5:outlet_finish_ack:2",
  "6:outlet_run_distance:5",
  "90:afci_protection:3",
] as const;

/** question/option-order/value/action/next/components/materials. */
const PRE_V2_OPTIONS = [
  "outlet_load_type:0:everyday:CONTINUE:outlet_power_source:0:0",
  "outlet_load_type:1:motor_appliance:REROUTE_SERVICE::0:0",
  "outlet_load_type:2:heating_appliance:REROUTE_SERVICE::0:0",
  "outlet_load_type:3:shop_equipment:REROUTE_SERVICE::0:0",
  "outlet_load_type:4:ev:REROUTE_SERVICE::0:0",
  "outlet_load_type:5:unsure:PHOTO_REVIEW::0:0",
  "outlet_power_source:0:tap_existing:CONTINUE:below_above_access:0:0",
  "outlet_power_source:1:dedicated:REROUTE_SERVICE::0:0",
  "below_above_access:0:has_access:CONTINUE:device_on_exterior_wall:0:0",
  "below_above_access:1:no_access:CONTINUE:finished_space_both_sides:0:0",
  "finished_space_both_sides:1:finished_both_sides:CONTINUE:outlet_finish_ack:0:0",
  "finished_space_both_sides:2:exterior_wall:PHOTO_REVIEW::0:0",
  "finished_space_both_sides:3:unsure:PHOTO_REVIEW::0:0",
  "device_on_exterior_wall:0:exterior:CONTINUE:outlet_run_distance:0:0",
  "device_on_exterior_wall:1:interior:CONTINUE:outlet_run_distance:0:0",
  "device_on_exterior_wall:2:unsure:CONTINUE:outlet_run_distance:0:0",
  "outlet_finish_ack:0:accepted:CONTINUE:outlet_run_distance:0:0",
  "outlet_finish_ack:1:review_first:PHOTO_REVIEW::0:0",
  "outlet_run_distance:0:under_10:RESOLVE_ADJUSTED::2:0",
  "outlet_run_distance:1:10_to_20:RESOLVE_ADJUSTED::2:0",
  "outlet_run_distance:2:over_20:PHOTO_REVIEW::0:0",
  "outlet_run_distance:3:unsure:PHOTO_REVIEW::0:0",
  "outlet_run_distance:99:over_40:RESOLVE_ADJUSTED::0:0",
  "afci_protection:0:yes:RESOLVE_ADJUSTED::0:0",
  "afci_protection:1:no:RESOLVE_ADJUSTED::0:0",
  "afci_protection:2:unsure:RESOLVE_ADJUSTED::0:0",
] as const;

async function main() {
  console.log("\nBRIGHTPATH OUTLET — RESTORED TO ITS PROVISIONED STATE\n");

  const bp = await prisma.contractor.findUniqueOrThrow({
    where: { slug: "brightpath-electric" }, select: { id: true } });
  const svc = await serviceFor(prisma, bp.id, OUTLET_SLUG);
  const live = await prisma.service.findUniqueOrThrow({
    where: { id: svc.id },
    select: { templateVersionId: true, templateKey: true, materialCostCents: true,
              materialCostResolved: true, unresolvedMaterialKeys: true, unresolvedPolicyKeys: true },
  });
  console.log("  A  THE TREE MATCHES THE FROZEN PRE-V2 FINGERPRINT\n");
  const lq = await prisma.question.findMany({
    where: { serviceId: svc.id }, orderBy: { order: "asc" },
    select: { id: true, key: true, order: true, options: { orderBy: { order: "asc" },
      select: { value: true, routeAction: true, order: true, nextQuestionId: true,
                requiredPhotoLabels: true, _count: { select: { components: true, materials: true } } } } },
  });
  const liveKeyById = new Map(lq.map((q) => [q.id, q.key]));
  const questionFingerprint = lq.map((q) => `${q.order}:${q.key}:${q.options.length}`);
  ok(questionFingerprint.join("|") === PRE_V2_QUESTIONS.join("|"),
    `A  all ${PRE_V2_QUESTIONS.length} legacy questions retain their key, order and option count`,
    questionFingerprint.join("\n         "));
  const optionFingerprint = lq.flatMap((q) => q.options.map((o) => [
    q.key, o.order, o.value, o.routeAction,
    o.nextQuestionId ? liveKeyById.get(o.nextQuestionId) ?? "?" : "",
    o._count.components, o._count.materials,
  ].join(":")));
  ok(optionFingerprint.join("|") === PRE_V2_OPTIONS.join("|"),
    `A  all ${PRE_V2_OPTIONS.length} legacy options retain action, target and recipe counts`,
    optionFingerprint.join("\n         "));

  console.log("\n  B  NOTHING FROM ROUTING V2 REMAINS\n");
  const v2Keys = [...Object.values(OUTLET_V2_KEYS), ACCESSIBLE_KEYS.feet, ...SURFACE_MODULE_KEYS, ...FINISHED_MODULE_KEYS];
  const leftover = lq.filter((q) => (v2Keys as string[]).includes(q.key)).map((q) => q.key);
  ok(leftover.length === 0, `B  none of the ${v2Keys.length} Routing V2 question keys survive`, leftover.join(", "));

  const fixtures = await prisma.service.findMany({
    where: { contractorId: bp.id, OR: [{ slug: { startsWith: "rv2-fixture-" } }, { slug: { startsWith: "surface-mounted-" } }] },
    select: { slug: true },
  });
  ok(fixtures.length === 0, "B  no Routing V2 fixture service is left under BrightPath", fixtures.map((f) => f.slug).join(", "));

  const bpComponents = await prisma.contractorComponent.count({ where: { contractorId: bp.id } });
  ok(bpComponents === 0, "B  the V2 work created no ContractorComponent for BrightPath", `${bpComponents} rows`);
  const bpCaps = await prisma.contractorCapability.count({ where: { contractorId: bp.id } });
  ok(bpCaps === 0, "B  the V2 work left no ContractorCapability on BrightPath", `${bpCaps} rows`);

  console.log("\n  C  THE ECONOMICS DID NOT MOVE\n");
  const smRows = await prisma.serviceMaterial.count({ where: { serviceId: svc.id } });
  ok(live.materialCostCents === PRE_V2_ECONOMICS.materialCostCents,
    `C  materialCostCents is still ${PRE_V2_ECONOMICS.materialCostCents}`, String(live.materialCostCents));
  ok(live.materialCostResolved === PRE_V2_ECONOMICS.materialCostResolved,
    `C  materialCostResolved is still ${PRE_V2_ECONOMICS.materialCostResolved}`, String(live.materialCostResolved));
  ok([...live.unresolvedMaterialKeys].sort().join(",") === [...PRE_V2_ECONOMICS.unresolvedMaterialKeys].sort().join(","),
    "C  unresolvedMaterialKeys is unchanged", live.unresolvedMaterialKeys.join(","));
  ok(live.unresolvedPolicyKeys.join(",") === PRE_V2_ECONOMICS.unresolvedPolicyKeys.join(","),
    "C  unresolvedPolicyKeys is unchanged — BrightPath's policy blocker is NOT ours to clear",
    live.unresolvedPolicyKeys.join(","));
  ok(smRows === PRE_V2_ECONOMICS.serviceMaterialRows,
    `C  ServiceMaterial row count is still ${PRE_V2_ECONOMICS.serviceMaterialRows}`, String(smRows));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
