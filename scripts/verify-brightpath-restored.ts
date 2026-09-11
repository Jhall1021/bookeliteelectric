/**
 * BrightPath's outlet is back to what provisioning built, and nothing else moved.
 *
 * The accidental Routing V2 migration ran here. The repair is only credible if
 * it is checked against an independent description of the original — so this
 * compares the live tree to the TEMPLATE VERSION the service records as its own
 * provenance, rather than to a snapshot the repair itself produced.
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
  const tsvc = await prisma.templateService.findFirstOrThrow({
    where: { templateVersionId: live.templateVersionId!, slug: live.templateKey! },
    select: { id: true },
  });

  console.log("  A  THE TREE MATCHES ITS OWN TEMPLATE VERSION\n");
  const tq = await prisma.templateQuestion.findMany({
    where: { templateServiceId: tsvc.id }, orderBy: { order: "asc" },
    select: { key: true, order: true, options: { orderBy: { order: "asc" },
      select: { value: true, routeAction: true, order: true, nextQuestionKey: true,
                requiredPhotoLabels: true, _count: { select: { components: true, materials: true } } } } },
  });
  const lq = await prisma.question.findMany({
    where: { serviceId: svc.id }, orderBy: { order: "asc" },
    select: { id: true, key: true, order: true, options: { orderBy: { order: "asc" },
      select: { value: true, routeAction: true, order: true, nextQuestionId: true,
                requiredPhotoLabels: true, _count: { select: { components: true, materials: true } } } } },
  });
  const liveKeyById = new Map(lq.map((q) => [q.id, q.key]));

  ok(lq.length === tq.length,
    `A  question COUNT matches the template (${tq.length})`, `live has ${lq.length}: ${lq.map((q) => q.key).join(", ")}`);
  ok(lq.map((q) => q.key).join("|") === tq.map((q) => q.key).join("|"),
    "A  question KEYS and ORDER match the template",
    `live: ${lq.map((q) => `${q.order}:${q.key}`).join(", ")}\n         tpl:  ${tq.map((q) => `${q.order}:${q.key}`).join(", ")}`);

  const tByKey = new Map(tq.map((q) => [q.key, q]));
  const mismatches: string[] = [];
  for (const q of lq) {
    const t = tByKey.get(q.key);
    if (!t) { mismatches.push(`${q.key}: not in template`); continue; }
    if (q.order !== t.order) mismatches.push(`${q.key}: order ${q.order} != ${t.order}`);
    if (q.options.length !== t.options.length) {
      mismatches.push(`${q.key}: ${q.options.length} options != ${t.options.length}`); continue;
    }
    for (let i = 0; i < q.options.length; i++) {
      const a = q.options[i], b = t.options[i];
      const aNext = a.nextQuestionId ? liveKeyById.get(a.nextQuestionId) ?? "?" : null;
      if (a.value !== b.value) mismatches.push(`${q.key}[${i}]: value ${a.value} != ${b.value}`);
      if (String(a.routeAction) !== String(b.routeAction)) mismatches.push(`${q.key}/${a.value}: action ${a.routeAction} != ${b.routeAction}`);
      if (aNext !== (b.nextQuestionKey ?? null)) mismatches.push(`${q.key}/${a.value}: next ${aNext} != ${b.nextQuestionKey}`);
      if (a.requiredPhotoLabels.length !== b.requiredPhotoLabels.length) mismatches.push(`${q.key}/${a.value}: ${a.requiredPhotoLabels.length} photos != ${b.requiredPhotoLabels.length}`);
      if (a._count.components !== b._count.components) mismatches.push(`${q.key}/${a.value}: ${a._count.components} components != ${b._count.components}`);
      if (a._count.materials !== b._count.materials) mismatches.push(`${q.key}/${a.value}: ${a._count.materials} materials != ${b._count.materials}`);
    }
  }
  ok(mismatches.length === 0,
    "A  every option matches on value, action, target, photos, components and materials",
    mismatches.join("\n         "));

  console.log("\n  B  NOTHING FROM ROUTING V2 REMAINS\n");
  const v2Keys = [OUTLET_V2_KEYS.method, ACCESSIBLE_KEYS.feet, ...SURFACE_MODULE_KEYS, ...FINISHED_MODULE_KEYS];
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
