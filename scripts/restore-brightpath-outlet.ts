/**
 * UNDO the accidental Routing V2 migration of BrightPath's New 120V Outlet.
 *
 * The V2 migration resolved its target with `findFirst({ where: { slug } })`.
 * Four contractors own that slug and the lookup has no ordering, so it ran
 * against BrightPath's copy instead of Elite's.
 *
 * WHAT THIS RESTORES, AND FROM WHERE
 *
 * BrightPath's outlet was PROVISIONED from template version
 * `service.templateVersionId`, so that template is not an approximation of
 * what BrightPath had — it is the thing BrightPath was built from. The rebuild
 * copies the same fields `lib/templateProvisioning.ts` copies, from the same
 * rows, for the four questions the migration emptied.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH
 *
 * BrightPath's economics. `materialCostResolved`, `unresolvedMaterialKeys`,
 * `unresolvedPolicyKeys`, ContractorMaterial and ContractorComponent are all
 * exactly as provisioning left them, which is the pre-V2 state — BrightPath is
 * the deliberately-unconfigured second tenant and its emptiness is the point.
 *
 * Every write is filtered by BrightPath's own service id or contractor id.
 * There is no unfiltered deleteMany in this file; a restore that reset shared
 * tables would be a worse accident than the one it repairs.
 */
import { PrismaClient } from "@prisma/client";
import { serviceFor } from "../prisma/_serviceTargets";
import { SURFACE_MODULE_KEYS } from "../prisma/_surfaceRouteModule";
import { ACCESSIBLE_KEYS } from "../prisma/_concealedRouteModules";
import { FINISHED_MODULE_KEYS } from "../prisma/_finishedWallModule";
import { OUTLET_V2_KEYS, RETIRED_OUTLET_QUESTIONS, OUTLET_SLUG } from "../prisma/seed-new-outlet-v2";
import { CAPABILITY_KEYS } from "../lib/capabilities";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const BRIGHTPATH = "brightpath-electric";

/** Every question key the V2 migration ADDED to the outlet. */
const V2_ADDED = [
  OUTLET_V2_KEYS.method,
  ACCESSIBLE_KEYS.feet,
  ...SURFACE_MODULE_KEYS,
  ...FINISHED_MODULE_KEYS,
];

/** Fixture services the mis-anchored seeders created under BrightPath. */
const V2_FIXTURE_PREFIXES = ["rv2-fixture-", "surface-mounted-"];

const plan: string[] = [];
const step = (s: string) => { plan.push(s); console.log(`    ${s}`); };

async function main() {
  console.log(`\nRESTORE BRIGHTPATH OUTLET  [${APPLY ? "APPLY" : "DRY RUN"}]\n`);

  const bp = await prisma.contractor.findUniqueOrThrow({
    where: { slug: BRIGHTPATH }, select: { id: true, slug: true },
  });
  const svc = await serviceFor(prisma, bp.id, OUTLET_SLUG);
  console.log(`  target: ${svc.contractorSlug}/${svc.slug}  (${svc.id})\n`);

  const live = await prisma.service.findUniqueOrThrow({
    where: { id: svc.id }, select: { templateVersionId: true, templateKey: true },
  });
  if (!live.templateVersionId || !live.templateKey) {
    throw new Error(`${svc.slug} carries no template provenance; it cannot be rebuilt from one.`);
  }
  const tsvc = await prisma.templateService.findFirstOrThrow({
    where: { templateVersionId: live.templateVersionId, slug: live.templateKey },
    select: { id: true },
  });
  console.log(`  rebuild source: TemplateService ${tsvc.id} @ version ${live.templateVersionId}\n`);

  // ---------------------------------------------------------------- 1
  console.log("  1  REPOINT below_above_access BACK AT ITS TEMPLATE TARGETS\n");
  const liveQ = await prisma.question.findMany({
    where: { serviceId: svc.id }, select: { id: true, key: true, order: true },
  });
  const qByKey = new Map(liveQ.map((q) => [q.key, q]));

  const tplQ = await prisma.templateQuestion.findMany({
    where: { templateServiceId: tsvc.id },
    select: {
      key: true, order: true,
      options: {
        orderBy: { order: "asc" },
        select: {
          value: true, label: true, routeAction: true, order: true, nextQuestionKey: true,
          rerouteServiceKey: true, referencedServiceKey: true, requiredPhotoLabels: true,
          photosBlockBooking: true, illustrationUrls: true, labelPattern: true,
          numberAtLeast: true, numberAtMost: true, requiresCapabilityKey: true,
          templatePolicyDefinition: { select: { key: true } },
          components: {
            select: {
              canonicalComponentId: true, quantity: true, quantityAnswerKey: true,
              conditionAnswerKey: true, conditionAnswerValue: true,
            },
          },
          materials: { select: { canonicalMaterialId: true, quantity: true, order: true } },
          disclaimers: { select: { canonicalDisclaimerId: true } },
          photoGroups: { select: { photoGroupId: true } },
        },
      },
    },
  });
  const tplByKey = new Map(tplQ.map((q) => [q.key, q]));

  const access = tplByKey.get("below_above_access");
  if (!access) throw new Error("template has no below_above_access");
  for (const o of access.options) {
    const target = o.nextQuestionKey ? qByKey.get(o.nextQuestionKey) : null;
    if (o.nextQuestionKey && !target) throw new Error(`no live question "${o.nextQuestionKey}"`);
    step(`below_above_access/${o.value} -> ${o.nextQuestionKey ?? o.routeAction}`);
    if (APPLY) {
      await prisma.answerOption.updateMany({
        where: { question: { serviceId: svc.id, key: "below_above_access" }, value: o.value },
        data: { routeAction: o.routeAction, nextQuestionId: target?.id ?? null, rerouteServiceId: null },
      });
    }
  }

  // ---------------------------------------------------------------- 2
  console.log("\n  2  REBUILD THE FOUR EMPTIED QUESTIONS FROM THE TEMPLATE\n");
  let optionsMade = 0, componentsMade = 0, disclaimersMade = 0, disclaimersSkipped = 0;
  for (const key of RETIRED_OUTLET_QUESTIONS) {
    const tq = tplByKey.get(key);
    const lq = qByKey.get(key);
    if (!tq) throw new Error(`template has no question "${key}"`);
    if (!lq) throw new Error(`live service has no question "${key}" — it was deleted, not retired`);

    const existing = await prisma.answerOption.count({ where: { questionId: lq.id } });
    step(`${key}: order ${lq.order} -> ${tq.order}, ${existing} live options -> ${tq.options.length}`);
    if (!APPLY) { optionsMade += tq.options.length; continue; }

    await prisma.question.update({ where: { id: lq.id }, data: { order: tq.order } });
    // Idempotent: the template is the source, so a re-run rebuilds rather than
    // duplicates. Scoped to this one question on this one service.
    await prisma.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: lq.id } } });
    await prisma.answerOptionMaterial.deleteMany({ where: { answerOption: { questionId: lq.id } } });
    await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOption: { questionId: lq.id } } });
    await prisma.answerOptionPhotoGroup.deleteMany({ where: { answerOption: { questionId: lq.id } } });
    await prisma.answerOption.deleteMany({ where: { questionId: lq.id } });
    for (const o of tq.options) {
      const next = o.nextQuestionKey ? qByKey.get(o.nextQuestionKey) : null;
      if (o.nextQuestionKey && !next) throw new Error(`${key}/${o.value} -> missing "${o.nextQuestionKey}"`);
      if (o.rerouteServiceKey || o.referencedServiceKey) {
        throw new Error(`${key}/${o.value} references another service; restore needs that mapping`);
      }
      const ao = await prisma.answerOption.create({
        data: {
          questionId: lq.id, value: o.value, label: o.label, routeAction: o.routeAction,
          order: o.order, numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost,
          nextQuestionId: next?.id ?? null,
          requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
          illustrationUrls: o.illustrationUrls, labelPattern: o.labelPattern,
          policyKey: o.templatePolicyDefinition?.key ?? null,
          requiresCapabilityKey: o.requiresCapabilityKey,
          templateVersionId: live.templateVersionId, templateKey: `${key}/${o.value}`,
        },
        select: { id: true },
      });
      optionsMade++;
      for (const c of o.components) {
        await prisma.answerOptionComponent.create({
          data: {
            answerOptionId: ao.id, canonicalComponentId: c.canonicalComponentId,
            quantity: c.quantity, quantityAnswerKey: c.quantityAnswerKey,
            conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue,
          },
        });
        componentsMade++;
      }
      for (const m of o.materials) {
        await prisma.answerOptionMaterial.create({
          data: { answerOptionId: ao.id, canonicalMaterialId: m.canonicalMaterialId,
                  quantity: m.quantity, order: m.order },
        });
      }
      for (const d of o.disclaimers) {
        const authored = await prisma.contractorDisclaimer.findUnique({
          where: { contractorId_canonicalDisclaimerId: {
            contractorId: bp.id, canonicalDisclaimerId: d.canonicalDisclaimerId } },
          select: { id: true },
        });
        if (!authored) { disclaimersSkipped++; continue; }
        await prisma.answerOptionDisclaimer.create({
          data: { answerOptionId: ao.id, contractorDisclaimerId: authored.id },
        });
        disclaimersMade++;
      }
      for (const g of o.photoGroups) {
        await prisma.answerOptionPhotoGroup.create({
          data: { answerOptionId: ao.id, photoGroupId: g.photoGroupId },
        });
      }
    }
  }
  step(`options ${optionsMade}, components ${componentsMade}, disclaimers ${disclaimersMade} (${disclaimersSkipped} unauthored, same as provisioning)`);

  // ---------------------------------------------------------------- 3
  console.log("\n  3  REMOVE THE QUESTIONS V2 ADDED\n");
  for (const key of V2_ADDED) {
    const q = qByKey.get(key);
    if (!q) { step(`${key}: absent already`); continue; }
    const n = await prisma.answerOption.count({ where: { questionId: q.id } });
    step(`${key}: delete question + ${n} options`);
    if (!APPLY) continue;
    await prisma.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: q.id } } });
    await prisma.answerOptionMaterial.deleteMany({ where: { answerOption: { questionId: q.id } } });
    await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOption: { questionId: q.id } } });
    await prisma.answerOptionPhotoGroup.deleteMany({ where: { answerOption: { questionId: q.id } } });
    await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
    await prisma.question.delete({ where: { id: q.id } });
  }

  // ---------------------------------------------------------------- 4
  console.log("\n  4  REMOVE THE FIXTURE SERVICES MIS-ANCHORED ONTO BRIGHTPATH\n");
  const fixtures = await prisma.service.findMany({
    where: { contractorId: bp.id, OR: V2_FIXTURE_PREFIXES.map((p) => ({ slug: { startsWith: p } })) },
    select: { id: true, slug: true, active: true, offered: true },
  });
  for (const f of fixtures) {
    if (f.active || f.offered) throw new Error(`${f.slug} is live; refusing to delete a service customers can reach`);
    step(`delete fixture service ${f.slug}`);
    if (!APPLY) continue;
    const qs = await prisma.question.findMany({ where: { serviceId: f.id }, select: { id: true } });
    for (const q of qs) {
      await prisma.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: q.id } } });
      await prisma.answerOptionMaterial.deleteMany({ where: { answerOption: { questionId: q.id } } });
      await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOption: { questionId: q.id } } });
      await prisma.answerOptionPhotoGroup.deleteMany({ where: { answerOption: { questionId: q.id } } });
      await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
    }
    await prisma.question.deleteMany({ where: { serviceId: f.id } });
    await prisma.serviceMaterial.deleteMany({ where: { serviceId: f.id } });
    await prisma.service.delete({ where: { id: f.id } });
  }
  if (fixtures.length === 0) step("none present");

  // ---------------------------------------------------------------- 5
  console.log("\n  5  REMOVE CAPABILITY ROWS THE V2 VERIFIER LEFT ON BRIGHTPATH\n");
  // verify-contractor-capability.ts resolved its tenant with
  // `contractor.findFirstOrThrow()` and got BrightPath, so its declare/revoke
  // fixtures were written here. A stray un-revoked row makes BrightPath DECLARE
  // a capability it was never asked about — the precise distinction
  // ContractorCapability exists to keep.
  const strays = await prisma.contractorCapability.findMany({
    where: { contractorId: bp.id, key: { in: [...CAPABILITY_KEYS] } },
    select: { id: true, key: true, revokedAt: true },
  });
  for (const c of strays) step(`delete ${c.key} (${c.revokedAt ? "revoked" : "declared"})`);
  if (strays.length === 0) step("none present");
  if (APPLY && strays.length > 0) {
    await prisma.contractorCapability.deleteMany({
      where: { contractorId: bp.id, key: { in: [...CAPABILITY_KEYS] } },
    });
  }

  console.log(`\n  ${APPLY ? "APPLIED" : "DRY RUN — nothing written"}. ${plan.length} steps.\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
