/**
 * Electrical Template v1.1 — material composition audit. READ ONLY.
 *
 * Reports the current state of every service's material and component
 * composition for one contractor. It calls findMany and nothing else: no
 * create, no update, no delete, no upsert. It does not reconcile, seed or
 * repair anything, and it is not wired into the deploy gate — running it must
 * never be a way to change data by accident.
 *
 *   npx tsx scripts/audit-material-composition.ts [--contractor elite-electric]
 *                                                 [--out path.json]
 *
 * Writes a machine-readable JSON export and prints a human summary.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const prisma = new PrismaClient();

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const SLUG = arg("contractor") ?? "elite-electric";
const OUT = arg("out") ?? "docs/audits/electrical-material-composition.json";

const money = (c: number | null | undefined) =>
  c === null || c === undefined ? null : Number((c / 100).toFixed(2));

/**
 * "Customer-supplied" has no field in the schema.
 *
 * That is a finding in itself: whether a service expects the customer to bring
 * the part is expressed only in its NAME and in prose, so nothing can query it
 * and nothing can enforce it. Detected here by naming, and reported separately
 * from the structural signal (no materials AND no cost) so the two can be
 * compared rather than conflated.
 */
const SUPPLIED_BY_NAME = /customer-supplied|owner-supplied|customer supplied|owner supplied|you supply|supplied by (you|the customer|the owner)/i;

async function main() {
  const contractor = await prisma.contractor.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true, pricingStrategy: true },
  });
  if (!contractor) {
    console.error(`\n  No contractor "${SLUG}".\n`);
    process.exit(1);
  }

  // The contractor's own cost per shared material role.
  const ownMaterials = new Map(
    (await prisma.contractorMaterial.findMany({
      where: { contractorId: contractor.id },
      select: {
        canonicalMaterialId: true, unitCostCents: true, unitCostMilliCents: true,
        costConfidence: true, costStatus: true, costSource: true, costUpdatedAt: true,
        active: true, canonicalMaterial: { select: { key: true, name: true, unit: true } },
      },
    })).map((m) => [m.canonicalMaterialId, m]),
  );

  // The contractor's own economics per shared component role.
  const ownComponents = new Map(
    (await prisma.contractorComponent.findMany({
      where: { contractorId: contractor.id },
      select: {
        canonicalComponentId: true, approvedPriceCents: true, addMaterialCostCents: true,
        addFieldLaborHours: true, addScheduleMinutes: true, addTechCount: true,
        active: true, labelOverride: true,
        canonicalComponent: { select: { key: true, name: true } },
      },
    })).map((c) => [c.canonicalComponentId, c]),
  );

  const services = await prisma.service.findMany({
    where: { contractorId: contractor.id },
    orderBy: [{ name: "asc" }],
    select: {
      id: true, slug: true, name: true, bookingType: true, active: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
      materialCostCents: true, materialCostResolved: true,
      unresolvedMaterialKeys: true, unresolvedPolicyKeys: true,
      basePrice: true, disclaimer: true,
      contractorCategory: { select: { nameOverride: true, canonicalCategory: { select: { name: true, slug: true } } } },
      questions: {
        select: {
          key: true,
          options: {
            select: {
              label: true, value: true, routeAction: true,
              addMaterialCostCents: true, addFieldLaborHours: true,
              approvedComponentPriceCents: true, priceModifierCents: true,
              components: {
                select: {
                  quantity: true, conditionAnswerKey: true, conditionAnswerValue: true,
                  conditionAccessClass: true, canonicalComponentId: true,
                  canonicalComponent: { select: { key: true, name: true, customerFacingLabel: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const serviceMaterials = await prisma.serviceMaterial.findMany({
    where: { service: { contractorId: contractor.id } },
    select: {
      serviceId: true, quantity: true, order: true, canonicalMaterialId: true,
      canonicalMaterial: { select: { key: true, name: true, unit: true } },
      materialId: true,
    },
  });
  const materialsByService = new Map<string, typeof serviceMaterials>();
  for (const sm of serviceMaterials) {
    const list = materialsByService.get(sm.serviceId) ?? [];
    list.push(sm);
    materialsByService.set(sm.serviceId, list);
  }

  const rows = services.map((s) => {
    const category =
      s.contractorCategory?.nameOverride ??
      s.contractorCategory?.canonicalCategory?.name ??
      "(uncategorised)";

    const mats = (materialsByService.get(s.id) ?? [])
      .sort((a, b) => a.order - b.order)
      .map((sm) => {
        const own = sm.canonicalMaterialId ? ownMaterials.get(sm.canonicalMaterialId) : null;
        return {
          role: sm.canonicalMaterial?.key ?? null,
          name: sm.canonicalMaterial?.name ?? null,
          unit: sm.canonicalMaterial?.unit ?? null,
          quantity: sm.quantity,
          /** Legacy per-contractor Material row, where one is still attached. */
          legacyMaterialId: sm.materialId,
          contractorCost: own
            ? {
                unitCostCents: own.unitCostCents,
                unitCostDollars: money(own.unitCostCents),
                unitCostMilliCents: own.unitCostMilliCents,
                confidence: own.costConfidence,
                status: own.costStatus,
                source: own.costSource,
                updatedAt: own.costUpdatedAt,
                active: own.active,
              }
            : null,
          costResolved: !!own,
        };
      });

    // Every component the tree can select, with the contractor's economics.
    const components = s.questions.flatMap((q) =>
      q.options.flatMap((o) =>
        o.components.map((c) => {
          const own = c.canonicalComponentId ? ownComponents.get(c.canonicalComponentId) : null;
          return {
            questionKey: q.key,
            answerLabel: o.label,
            answerValue: o.value,
            routeAction: o.routeAction,
            role: c.canonicalComponent?.key ?? null,
            name: c.canonicalComponent?.name ?? null,
            customerFacingLabel: c.canonicalComponent?.customerFacingLabel ?? null,
            quantity: c.quantity,
            condition: {
              answerKey: c.conditionAnswerKey,
              answerValue: c.conditionAnswerValue,
              accessClass: c.conditionAccessClass,
            },
            contractorEconomics: own
              ? {
                  approvedPriceCents: own.approvedPriceCents,
                  approvedPriceDollars: money(own.approvedPriceCents),
                  addMaterialCostCents: own.addMaterialCostCents,
                  addMaterialCostDollars: money(own.addMaterialCostCents),
                  addFieldLaborHours: own.addFieldLaborHours,
                  addScheduleMinutes: own.addScheduleMinutes,
                  addTechCount: own.addTechCount,
                  active: own.active,
                }
              : null,
            economicsResolved: !!own,
          };
        }),
      ),
    );

    // Answer-level additions that bypass component roles entirely.
    const answerLevelAdditions = s.questions.flatMap((q) =>
      q.options
        .filter((o) => (o.addMaterialCostCents ?? 0) !== 0 || (o.addFieldLaborHours ?? 0) !== 0)
        .map((o) => ({
          questionKey: q.key,
          answerLabel: o.label,
          addMaterialCostCents: o.addMaterialCostCents,
          addMaterialCostDollars: money(o.addMaterialCostCents),
          addFieldLaborHours: o.addFieldLaborHours,
        })),
    );

    const namedCustomerSupplied = SUPPLIED_BY_NAME.test(`${s.name} ${s.slug}`);

    return {
      category,
      categorySlug: s.contractorCategory?.canonicalCategory?.slug ?? null,
      slug: s.slug,
      name: s.name,
      bookingType: s.bookingType,
      active: s.active,
      fieldLaborHours: s.fieldLaborHours,
      wwtLaborHours: s.wwtLaborHours,
      requiresTechCount: s.requiresTechCount,
      basePriceCents: s.basePrice,
      basePriceDollars: money(s.basePrice),
      materialCostCents: s.materialCostCents,
      materialCostDollars: money(s.materialCostCents),
      materialCostResolved: s.materialCostResolved,
      unresolvedMaterialKeys: s.unresolvedMaterialKeys,
      unresolvedPolicyKeys: s.unresolvedPolicyKeys,
      serviceMaterials: mats,
      treeComponents: components,
      answerLevelAdditions,
      flags: {
        /** A cached material cost with no recipe behind it. */
        costWithoutRecipe: (s.materialCostCents ?? 0) > 0 && mats.length === 0,
        /** A recipe with at least one role this contractor has never costed. */
        recipeWithUnresolvedCost: mats.length > 0 && mats.some((m) => !m.costResolved),
        /** A role row that points at no canonical role at all. */
        recipeRowWithoutRole: mats.some((m) => m.role === null),
        /** A component the tree can select whose economics this contractor lacks. */
        componentWithoutEconomics: components.some((c) => !c.economicsResolved),
        /** A component priced as a lump sum rather than an itemised recipe. */
        componentPricedAsLumpSum: components.some(
          (c) => (c.contractorEconomics?.addMaterialCostCents ?? 0) > 0,
        ),
        /** An answer that adds a dollar material amount directly. */
        answerAddsLumpSumMaterial: answerLevelAdditions.some(
          (a) => (a.addMaterialCostCents ?? 0) > 0,
        ),
        namedCustomerSupplied,
        /** No recipe and no cached cost — structurally material-free. */
        structurallyMaterialFree: mats.length === 0 && (s.materialCostCents ?? 0) === 0,
      },
    };
  });

  // Component roles priced as a lump sum, collected once across the catalogue.
  const lumpSumComponents = [...ownComponents.values()]
    .filter((c) => c.addMaterialCostCents > 0)
    .map((c) => ({
      role: c.canonicalComponent.key,
      name: c.canonicalComponent.name,
      addMaterialCostCents: c.addMaterialCostCents,
      addMaterialCostDollars: money(c.addMaterialCostCents),
      addFieldLaborHours: c.addFieldLaborHours,
      approvedPriceCents: c.approvedPriceCents,
      approvedPriceDollars: money(c.approvedPriceCents),
      active: c.active,
    }))
    .sort((a, b) => b.addMaterialCostCents - a.addMaterialCostCents);

  const byCategory: Record<string, typeof rows> = {};
  for (const r of rows) (byCategory[r.category] ??= []).push(r);

  const pick = (f: keyof (typeof rows)[0]["flags"]) => rows.filter((r) => r.flags[f]);

  const report = {
    generatedBy: "scripts/audit-material-composition.ts",
    mode: "READ ONLY — no data was created, updated or deleted",
    contractor: { slug: SLUG, name: contractor.name, pricingStrategy: contractor.pricingStrategy },
    totals: {
      services: rows.length,
      active: rows.filter((r) => r.active).length,
      priced: rows.filter((r) => r.basePriceCents !== null).length,
      withRecipe: rows.filter((r) => r.serviceMaterials.length > 0).length,
      withTreeComponents: rows.filter((r) => r.treeComponents.length > 0).length,
      contractorMaterialRoles: ownMaterials.size,
      contractorComponentRoles: ownComponents.size,
    },
    findings: {
      costWithoutRecipe: pick("costWithoutRecipe").map((r) => ({ slug: r.slug, name: r.name, materialCostDollars: r.materialCostDollars })),
      recipeWithUnresolvedCost: pick("recipeWithUnresolvedCost").map((r) => ({
        slug: r.slug, name: r.name,
        unresolvedRoles: r.serviceMaterials.filter((m) => !m.costResolved).map((m) => m.role),
      })),
      recipeRowWithoutRole: pick("recipeRowWithoutRole").map((r) => ({ slug: r.slug, name: r.name })),
      componentWithoutEconomics: pick("componentWithoutEconomics").map((r) => ({
        slug: r.slug, name: r.name,
        roles: [...new Set(r.treeComponents.filter((c) => !c.economicsResolved).map((c) => c.role))],
      })),
      componentPricedAsLumpSum: pick("componentPricedAsLumpSum").map((r) => ({ slug: r.slug, name: r.name })),
      answerAddsLumpSumMaterial: pick("answerAddsLumpSumMaterial").map((r) => ({
        slug: r.slug, name: r.name, additions: r.answerLevelAdditions.filter((a) => (a.addMaterialCostCents ?? 0) > 0),
      })),
      lumpSumComponentRoles: lumpSumComponents,
      namedCustomerSupplied: pick("namedCustomerSupplied").map((r) => ({ slug: r.slug, name: r.name, materialCostDollars: r.materialCostDollars, recipeRows: r.serviceMaterials.length })),
      structurallyMaterialFree: pick("structurallyMaterialFree").map((r) => ({ slug: r.slug, name: r.name, bookingType: r.bookingType, active: r.active })),
    },
    byCategory,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  // ── human summary ────────────────────────────────────────────────────────
  const t = report.totals;
  console.log(`\nELECTRICAL MATERIAL COMPOSITION — ${contractor.name}   (READ ONLY)\n`);
  console.log(`  ${t.services} services · ${t.active} active · ${t.priced} priced`);
  console.log(`  ${t.withRecipe} have a material recipe · ${t.withTreeComponents} have selectable components`);
  console.log(`  ${t.contractorMaterialRoles} material roles costed · ${t.contractorComponentRoles} component roles configured\n`);

  const line = (label: string, list: unknown[]) =>
    console.log(`  ${String(list.length).padStart(3)}  ${label}`);
  console.log(`  FINDINGS`);
  line("services with a cached material cost and NO recipe behind it", report.findings.costWithoutRecipe);
  line("services whose recipe has a role this contractor never costed", report.findings.recipeWithUnresolvedCost);
  line("recipe rows pointing at no canonical role", report.findings.recipeRowWithoutRole);
  line("services with a selectable component lacking economics", report.findings.componentWithoutEconomics);
  line("services with a component priced as a lump sum, not a recipe", report.findings.componentPricedAsLumpSum);
  line("services where an ANSWER adds a dollar material amount", report.findings.answerAddsLumpSumMaterial);
  line("component roles carrying addMaterialCostCents (lump sum)", report.findings.lumpSumComponentRoles);
  line("services named customer/owner-supplied", report.findings.namedCustomerSupplied);
  line("services with no recipe and no cached cost", report.findings.structurallyMaterialFree);

  console.log(`\n  BY CATEGORY`);
  for (const [cat, list] of Object.entries(byCategory).sort()) {
    const withRecipe = list.filter((r) => r.serviceMaterials.length > 0).length;
    const flagged = list.filter((r) => Object.values(r.flags).some(Boolean)).length;
    console.log(`    ${cat.padEnd(28)} ${String(list.length).padStart(2)} services · ${String(withRecipe).padStart(2)} with a recipe · ${flagged} flagged`);
  }

  console.log(`\n  -> ${OUT}\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
