/**
 * Verifies the Elite `articulating-tv-mount` / `tilt-tv-mount` service-gap
 * reconciliation: exactly two new Elite Service rows, matching the
 * canonical template definitions field for field, priced/published as
 * approved, with zero unrelated mutation anywhere else.
 *
 *   npx tsx scripts/verify-elite-tv-mount-reconciliation.ts
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const ELITE_SLUG = "elite-electric";
const TARGETS = [
  { key: "articulating-tv-mount", basePriceCents: 14500 },
  { key: "tilt-tv-mount", basePriceCents: 9500 },
];
const FROZEN_KEYS = ["under-cabinet-led-lighting", "hot-tub-spa-electrical", "200a-service-upgrade"];

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function main() {
  console.log(`\nVERIFY — Elite TV-mount service reconciliation\n`);
  const elite = await prisma.contractor.findUniqueOrThrow({ where: { slug: ELITE_SLUG }, select: { id: true } });

  for (const target of TARGETS) {
    const svc = await prisma.service.findFirst({
      where: { contractorId: elite.id, slug: target.key },
      select: {
        id: true, slug: true, name: true, shortDescription: true, icon: true, bookingType: true, photoState: true,
        isPrimaryEligible: true, requiresTechCount: true, templateKey: true, tradeKey: true, templateVersionId: true,
        active: true, offered: true, basePrice: true, publishedPriceApprovedAt: true,
        materialCostResolved: true, unresolvedMaterialKeys: true,
      },
    });
    ok(`1/2. ${target.key} now exists as an Elite service with the exact canonical slug`, !!svc && svc.slug === target.key);
    if (!svc) continue;

    const templateSvc = await prisma.templateService.findFirst({
      where: { key: target.key, templateVersion: { trade: "electrical", version: 1 } },
      select: { name: true, shortDescription: true, icon: true, bookingType: true, photoState: true, isPrimaryEligible: true, requiresTechCount: true },
    });
    const matches = !!templateSvc && svc.name === templateSvc.name && svc.shortDescription === templateSvc.shortDescription
      && svc.icon === templateSvc.icon && svc.bookingType === templateSvc.bookingType && svc.photoState === templateSvc.photoState
      && svc.isPrimaryEligible === templateSvc.isPrimaryEligible && svc.requiresTechCount === templateSvc.requiresTechCount;
    ok(`3. ${target.key}: definition matches the template source exactly (name/description/icon/bookingType/photoState/isPrimaryEligible/requiresTechCount)`,
      matches, JSON.stringify({ elite: svc, template: templateSvc }));
    ok(`   templateKey/tradeKey/templateVersionId are correctly stamped`, svc.templateKey === target.key && svc.tradeKey === "electrical" && !!svc.templateVersionId);

    const matCount = await prisma.serviceMaterial.count({ where: { serviceId: svc.id } });
    const qCount = await prisma.question.count({ where: { serviceId: svc.id } });
    ok(`4. ${target.key}: material behavior matches template source (zero materials, zero questions — both zero at the template level)`,
      matCount === 0 && qCount === 0 && svc.materialCostResolved === true && svc.unresolvedMaterialKeys.length === 0,
      `materials=${matCount} questions=${qCount} resolved=${svc.materialCostResolved} unresolved=${JSON.stringify(svc.unresolvedMaterialKeys)}`);

    ok(`5/6. ${target.key}: basePrice = ${target.basePriceCents} cents ($${(target.basePriceCents / 100).toFixed(2)})`, svc.basePrice === target.basePriceCents, `got ${svc.basePrice}`);
    ok(`7. ${target.key}: active=true, offered=true, publishedPriceApprovedAt set`, svc.active === true && svc.offered === true && !!svc.publishedPriceApprovedAt);
  }

  const foldedCount = await prisma.templateService.findMany({
    where: { templateVersion: { trade: "electrical" } }, select: { key: true }, distinct: ["key"],
  });
  ok(`11. folded Electrical template catalog remains exactly 78 distinct keys`, foldedCount.length === 78, `got ${foldedCount.length}`);

  const versions = await prisma.templateVersion.findMany({ where: { trade: "electrical" }, select: { version: true, kind: true }, orderBy: { version: "asc" } });
  ok(`12/13. Electrical template versions are exactly v1-v6, no new TemplateVersion was created`,
    versions.length === 6 && versions.every((v, i) => v.version === i + 1), JSON.stringify(versions));

  const canonicalCount = await prisma.canonicalMaterial.count();
  ok(`14. canonical_materials count unchanged at 74 — no canonical material created or changed`, canonicalCount === 74, `got ${canonicalCount}`);

  const v6 = await prisma.templateService.findMany({ where: { templateVersion: { trade: "electrical", version: 6 } }, select: { key: true } });
  const v6Keys = new Set(v6.map((r) => r.key));
  ok(`15. Batch 2F's v6 remains intact — still exactly whole-house-surge-protection and replace-bathroom-exhaust-fan`,
    v6.length === 2 && v6Keys.has("whole-house-surge-protection") && v6Keys.has("replace-bathroom-exhaust-fan"), JSON.stringify([...v6Keys]));
  const surgeMatCount = await prisma.templateServiceMaterial.count({
    where: { templateService: { key: "whole-house-surge-protection", templateVersion: { trade: "electrical", version: 6 } } },
  });
  ok(`   whole-house-surge-protection's v6 material row count unchanged (3)`, surgeMatCount === 3, `got ${surgeMatCount}`);

  for (const key of FROZEN_KEYS) {
    const override = await prisma.templateService.findFirst({ where: { key, templateVersion: { trade: "electrical", version: { gt: 1 } } } });
    ok(`16. ${key} (frozen) has no override beyond v1`, override === null);
  }

  await prisma.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
