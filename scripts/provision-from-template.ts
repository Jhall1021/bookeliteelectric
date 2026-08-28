/**
 * Provision a contractor's service from the template — ADR-014.
 *
 * Copies STRUCTURE into rows the contractor owns. After this the rows are
 * ordinary contractor rows, indistinguishable at runtime from ones they wrote
 * themselves, and the template is irrelevant to serving their storefront.
 *
 * WHAT IT REFUSES TO DO
 *
 * Write a single economic value. Price, labour, materials cost, markups and
 * allowances all arrive UNRESOLVED, and unresolved means the service cannot
 * publish a price — ADR-003's guarantee, reached from a new direction.
 *
 * Zero is never used to mean "unknown". A policy-quantity material gets NO
 * link at all; its key lands in Service.unresolvedMaterialKeys so the
 * contractor supplies their own figure, because writing 25 ft would be
 * shipping Elite's allowance and writing 0 ft would be inventing a decision.
 *
 * The same rule governs BREAKPOINT POLICIES. An answer reading "Less than
 * {b1} feet" arrives with the hole still in it and the policy recorded as
 * unresolved, because the alternative — seeding the boundary Elite happens to
 * use — would hand every contractor Elite's included run length as their
 * starting point, which is the whole thing this separation exists to prevent.
 *
 * Canonical identity is REFERENCED: categories, materials, components and
 * disclaimers resolve to the contractor's own rows for the shared canonical
 * concept, created empty (no price) where they do not exist yet.
 *
 *   --contractor <slug>  target
 *   --trade/--version    which template
 *   --service <key>      which template service (all if omitted)
 *   --apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const contractorSlug = arg("contractor");
  const trade = arg("trade") ?? "electrical";
  const version = Number(arg("version") ?? "1");
  const only = arg("service");
  const apply = process.argv.includes("--apply");
  if (!contractorSlug) { console.error("  --contractor <slug> required"); process.exit(1); }

  const contractor = await prisma.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true, name: true } });
  const tv = await prisma.templateVersion.findUniqueOrThrow({ where: { trade_version: { trade, version } } });
  const services = await prisma.templateService.findMany({
    where: { templateVersionId: tv.id, ...(only ? { key: only } : {}) },
    include: {
      materials: { include: { canonicalMaterial: { select: { key: true } } } },
      questions: { orderBy: { order: "asc" }, include: {
        options: { orderBy: { order: "asc" }, include: {
          components: true, disclaimers: true, photoGroups: true,
          templatePolicyDefinition: true } } } },
      policies: { include: { templatePolicyDefinition: true } },
    },
  });

  // Every policy the services being provisioned actually reach, whether it
  // arrives through an answer option or is attached to the service itself.
  const reached = new Map<string, { key: string; type: any; unit: string | null; boundaryCount: number; prompt: string }>();
  for (const s of services)
    for (const q of s.questions)
      for (const o of q.options)
        if (o.templatePolicyDefinition) reached.set(o.templatePolicyDefinition.key, o.templatePolicyDefinition);
  for (const s of services)
    for (const sp of s.policies) reached.set(sp.templatePolicyDefinition.key, sp.templatePolicyDefinition);

  console.log(`\nPROVISION  ${trade} v${version}  ->  ${contractor.name}`);
  console.log(`  ${services.length} template service(s), ${reached.size} policy question(s)   ${apply ? "APPLY" : "DRY RUN"}\n`);
  if (!apply) {
    for (const s of services) {
      const policyMats = s.materials.filter((m) => m.quantityIsPolicy);
      console.log(`  ${s.key}: ${s.questions.length}q ${s.questions.flatMap(q=>q.options).length}opt, ` +
        `${s.materials.length - policyMats.length} structural materials, ${policyMats.length} left unresolved`);
    }
    console.log(`\n  Dry run.\n`); await prisma.$disconnect(); return;
  }

  // Unresolved, not zero. A contractor who has not told us their included run
  // length has not told us it is nothing.
  for (const d of reached.values()) {
    await prisma.contractorPolicyValue.upsert({
      where: { contractorId_key: { contractorId: contractor.id, key: d.key } },
      update: {},
      create: { contractorId: contractor.id, key: d.key, type: d.type, unit: d.unit,
                boundaryCount: d.boundaryCount, prompt: d.prompt, boundaries: [] },
    });
  }
  if (reached.size) console.log(`  ${reached.size} policy question(s) recorded, all unresolved.`);

  for (const t of services) {
    // Canonical identity -> the contractor's own row for that shared concept.
    const cc = await prisma.contractorCategory.upsert({
      where: { contractorId_canonicalCategoryId: { contractorId: contractor.id, canonicalCategoryId: t.canonicalCategoryId } },
      update: {}, create: { contractorId: contractor.id, canonicalCategoryId: t.canonicalCategoryId, sortOrder: 0 },
    });
    // Legacy required relation; the contract phase removes it.
    const legacyCat = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });

    const structural = t.materials.filter((m) => !m.quantityIsPolicy);
    const unresolved = t.materials.filter((m) => m.quantityIsPolicy).map((m) => m.canonicalMaterial.key);

    const svc = await prisma.service.create({
      data: {
        contractorId: contractor.id, contractorCategoryId: cc.id, categoryId: legacyCat.id,
        slug: t.slug, name: t.name, shortDescription: t.shortDescription, icon: t.icon,
        bookingType: t.bookingType, photoState: t.photoState,
        isPrimaryEligible: t.isPrimaryEligible, requiresTechCount: t.requiresTechCount,
        // Provenance: a record, never read at request time.
        templateVersionId: tv.id, templateKey: t.key,
        // NOTHING economic. Absent, not zero — the contractor must decide.
        active: false,
        materialCostResolved: unresolved.length === 0,
        unresolvedMaterialKeys: unresolved,
      },
    });

    // A material is linked only if the contractor has already priced it.
    //
    // ContractorMaterial.unitCostCents is required, and provisioning may not
    // invent a cost — so a canonical material this contractor has never priced
    // cannot be linked at all. It joins unresolvedMaterialKeys instead. For a
    // brand-new contractor that means EVERY material is unresolved, which is
    // the honest answer: they have not told us what anything costs yet.
    const stillUnresolved = [...unresolved];
    for (const m of structural) {
      const priced = await prisma.contractorMaterial.findUnique({
        where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: m.canonicalMaterialId } },
        select: { id: true },
      });
      if (!priced) { stillUnresolved.push(m.canonicalMaterial.key); continue; }
      await prisma.serviceMaterial.create({
        data: { serviceId: svc.id, canonicalMaterialId: m.canonicalMaterialId, quantity: m.quantity!, order: m.order },
      });
    }
    if (stillUnresolved.length !== unresolved.length) {
      await prisma.service.update({
        where: { id: svc.id },
        data: { unresolvedMaterialKeys: stillUnresolved, materialCostResolved: false },
      });
    }

    // Two passes: questions first, then options, because nextQuestionKey can
    // point forward and a key only becomes an id once the row exists.
    let needsDisclaimer = 0;
    // Service-level policies count as unresolved for this service even though
    // no question raises them.
    const unresolvedPolicies = new Set<string>(t.policies.map((sp) => sp.templatePolicyDefinition.key));
    const qId = new Map<string, string>();
    for (const q of t.questions) {
      const created = await prisma.question.create({
        data: { serviceId: svc.id, key: q.key, prompt: q.prompt, helpText: q.helpText,
                inputType: q.inputType, order: q.order,
                templateVersionId: tv.id, templateKey: q.key },
      });
      qId.set(q.key, created.id);
    }
    for (const q of t.questions) {
      for (const o of q.options) {
        // Reroute targets resolve only if this contractor already has that
        // service. Otherwise null: a dangling route would send a homeowner
        // somewhere that does not exist.
        const target = o.rerouteServiceKey
          ? await prisma.service.findFirst({ where: { contractorId: contractor.id, slug: o.rerouteServiceKey }, select: { id: true } })
          : null;
        const ref = o.referencedServiceKey
          ? await prisma.service.findFirst({ where: { contractorId: contractor.id, slug: o.referencedServiceKey }, select: { id: true } })
          : null;
        if (o.templatePolicyDefinition) unresolvedPolicies.add(o.templatePolicyDefinition.key);
        const ao = await prisma.answerOption.create({
          data: {
            questionId: qId.get(q.key)!, value: o.value, label: o.label,
            routeAction: o.routeAction, order: o.order,
            nextQuestionId: o.nextQuestionKey ? qId.get(o.nextQuestionKey) ?? null : null,
            rerouteServiceId: target?.id ?? null, referencedServiceId: ref?.id ?? null,
            requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
            illustrationUrls: o.illustrationUrls,
            labelPattern: o.labelPattern,
            policyKey: o.templatePolicyDefinition?.key ?? null,
            // priceModifierCents deliberately left at its schema default. The
            // template has no opinion about it and neither may provisioning.
            templateVersionId: tv.id, templateKey: `${q.key}/${o.value}`,
          },
        });
        for (const c of o.components) {
          // Same rule as materials: a component the contractor has not priced
          // is not linked. The STRUCTURE says this answer adds a component;
          // what it costs is theirs to decide.
          const priced = await prisma.contractorComponent.findUnique({
            where: { contractorId_canonicalComponentId: { contractorId: contractor.id, canonicalComponentId: c.canonicalComponentId } },
            select: { id: true },
          });
          if (!priced) continue;
          await prisma.answerOptionComponent.create({
            data: { answerOptionId: ao.id, canonicalComponentId: c.canonicalComponentId, quantity: c.quantity,
                    conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue },
          });
        }
        for (const d of o.disclaimers) {
          // The template says this answer NEEDS a disclaimer for a canonical
          // condition. What it SAYS is the contractor's policy (ADR-009), so
          // provisioning attaches only what they have authored and counts the
          // rest — it will not write words on their behalf.
          const authored = await prisma.contractorDisclaimer.findUnique({
            where: { contractorId_canonicalDisclaimerId: { contractorId: contractor.id, canonicalDisclaimerId: d.canonicalDisclaimerId } },
            select: { id: true },
          });
          if (!authored) { needsDisclaimer++; continue; }
          await prisma.answerOptionDisclaimer.create({
            data: { answerOptionId: ao.id, contractorDisclaimerId: authored.id },
          });
        }
        for (const g of o.photoGroups) {
          await prisma.answerOptionPhotoGroup.create({ data: { answerOptionId: ao.id, photoGroupId: g.photoGroupId } });
        }
      }
    }
    if (unresolvedPolicies.size)
      await prisma.service.update({
        where: { id: svc.id },
        data: { unresolvedPolicyKeys: [...unresolvedPolicies].sort() },
      });
    console.log(`  ${t.key}: ${t.questions.length} questions, ${t.questions.flatMap(q=>q.options).length} options, ` +
      `${stillUnresolved.length} material(s) unresolved, ${unresolvedPolicies.size} policy(s) unresolved, ` +
      `${needsDisclaimer} disclaimer(s) the contractor must author`);
  }
  console.log(`\n  Provisioned. Nothing is priced and nothing is active.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(`\n  ${(e as Error).message}\n`); await prisma.$disconnect(); process.exit(1); });
}
