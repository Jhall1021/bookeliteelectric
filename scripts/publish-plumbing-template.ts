/**
 * Publish Plumbing Template V1 into a database — ADR-014.
 *
 *   npx tsx scripts/publish-plumbing-template.ts            # dry run
 *   npx tsx scripts/publish-plumbing-template.ts --apply    # write
 *   npx tsx scripts/publish-plumbing-template.ts --json out.json
 *
 * Electrical's TemplateVersion rows were written by the extractor, from a live
 * catalog. Plumbing is authored, so this writes them from lib/plumbing.
 *
 * IT REFUSES TO WRITE TO PRODUCTION, BY IDENTITY AND NOT BY NAME.
 *
 * `availableTrades()` derives enrollable trades from published SNAPSHOTs, and
 * it feeds the live Guided Setup trade picker. So publishing a plumbing
 * SNAPSHOT to production is not a test fixture — it is the moment Plumbing
 * becomes offerable to every real contractor. That is a launch decision, and a
 * verification run must not be able to make it by accident.
 *
 * The check reads the DatabaseIdentity marker, the same authority
 * verify-database-identity.ts uses. A URL is a claim; the marker is evidence.
 * `--i-am-launching-plumbing-to-production` is the only way past it, and it
 * exists so that the decision has to be typed out in full by someone who means
 * it rather than reached by a default.
 *
 * ATOMIC. One transaction, or nothing. A half-published catalog would appear
 * in availableTrades() as a trade that installs a partial service list.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { loadEnv } from "./_env";
import { buildPlumbingPayload, payloadTotals, type PlumbingPublishPayload } from "../lib/plumbing/publish";
import { probe } from "./_lineage";

loadEnv();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const LAUNCH_FLAG = "--i-am-launching-plumbing-to-production";

/**
 * Is this the production DATABASE, or merely something carrying its marker?
 *
 * DEFECT FOUND BY THE FIRST REAL REHEARSAL. This used to refuse on the marker
 * KEY alone, which was wrong in the one case that matters: a Neon branch is a
 * copy-on-write clone, so it inherits `price2book-production` verbatim. The
 * check therefore refused the legitimate rehearsal target — the exact database
 * this script exists to publish to — while a rebuilt production carrying no
 * marker would have sailed through.
 *
 * The marker records the endpoint it was STAMPED for. Same endpoint means this
 * is the original; a different one means a branch of it. That is the same
 * distinction scripts/_lineage.ts draws, so it is imported rather than
 * re-derived here.
 */
async function isProductionItself(url: string): Promise<{ verdict: boolean; detail: string }> {
  const p = await probe(url);
  if (!p.markerKey) return { verdict: false, detail: `unmarked database at ${p.endpoint}` };
  const original = p.markerEndpoint === p.endpoint;
  return {
    verdict: original && p.markerKey === "price2book-production",
    detail: `${p.markerKey}${original ? " (the original)" : ` (branch; stamped for ${p.markerEndpoint})`} at ${p.endpoint}`,
  };
}

async function write(db: PrismaClient, p: PlumbingPublishPayload) {
  return db.$transaction(async (tx) => {
    const t = tx as unknown as PrismaClient;

    // Canonical identity is SHARED and referenced, never owned by a trade.
    // Upserted rather than created so republishing is not a duplicate.
    const catBySlug = new Map<string, string>();
    for (const c of p.categories) {
      const row = await t.canonicalCategory.upsert({
        where: { slug: c.slug }, update: { name: c.name },
        create: { slug: c.slug, name: c.name },
      });
      catBySlug.set(c.slug, row.id);
    }
    // No cost, deliberately. A canonical material is an identity; what it
    // costs is the contractor's, and arrives unresolved.
    const materialByKey = new Map<string, string>();
    for (const m of p.materials) {
      const row = await t.canonicalMaterial.upsert({ where: { key: m.key }, update: {}, create: { key: m.key, name: m.name } });
      materialByKey.set(m.key, row.id);
    }
    const componentByKey = new Map<string, string>();
    for (const c of p.components) {
      const row = await t.canonicalComponent.upsert({ where: { key: c.key }, update: {}, create: { key: c.key, name: c.name } });
      componentByKey.set(c.key, row.id);
    }

    // The branch half of the material split. A role only one configuration
    // needs rides the component that configuration attaches, through the
    // platform's own recipe table — so selecting power vent exposes PVC vent
    // pipe, and selecting atmospheric exposes the metal flue connector.
    for (const cm of p.componentMaterials) {
      const compId = componentByKey.get(cm.componentKey);
      if (!compId) throw new Error(`Recipe names unknown component "${cm.componentKey}".`);
      for (const [i, mk] of cm.materialKeys.entries()) {
        const matId = materialByKey.get(mk);
        if (!matId) throw new Error(`Recipe for "${cm.componentKey}" names unknown role "${mk}".`);
        await t.canonicalComponentMaterial.upsert({
          where: { canonicalComponentId_canonicalMaterialId: { canonicalComponentId: compId, canonicalMaterialId: matId } },
          update: { quantity: 1, order: i },
          create: { canonicalComponentId: compId, canonicalMaterialId: matId, quantity: 1, order: i },
        });
      }
    }

    const version = await t.templateVersion.upsert({
      where: { trade_version: { trade: p.trade, version: p.version } },
      update: { kind: p.kind as never, notes: p.notes },
      create: { trade: p.trade, version: p.version, kind: p.kind as never, notes: p.notes },
    });

    const policyByKey = new Map<string, string>();
    for (const d of p.policies) {
      const row = await t.templatePolicyDefinition.upsert({
        where: { templateVersionId_key: { templateVersionId: version.id, key: d.key } },
        update: { type: d.type as never, unit: d.unit, boundaryCount: d.boundaryCount, prompt: d.prompt },
        create: {
          templateVersionId: version.id, key: d.key, type: d.type as never,
          unit: d.unit, boundaryCount: d.boundaryCount, prompt: d.prompt,
        },
      });
      policyByKey.set(d.key, row.id);
    }

    for (const s of p.services) {
      const svc = await t.templateService.upsert({
        where: { templateVersionId_key: { templateVersionId: version.id, key: s.key } },
        update: {
          slug: s.slug, name: s.name, shortDescription: s.shortDescription,
          canonicalCategoryId: catBySlug.get(s.canonicalCategorySlug)!,
          bookingType: s.bookingType as never, photoState: s.photoState as never,
          isPrimaryEligible: s.isPrimaryEligible, requiresTechCount: s.requiresTechCount,
        },
        create: {
          templateVersionId: version.id, key: s.key, slug: s.slug, name: s.name,
          shortDescription: s.shortDescription,
          canonicalCategoryId: catBySlug.get(s.canonicalCategorySlug)!,
          bookingType: s.bookingType as never, photoState: s.photoState as never,
          isPrimaryEligible: s.isPrimaryEligible, requiresTechCount: s.requiresTechCount,
        },
      });

      for (const pk of s.policyKeys)
        await t.templateServicePolicy.upsert({
          where: {
            templateServiceId_templatePolicyDefinitionId: {
              templateServiceId: svc.id, templatePolicyDefinitionId: policyByKey.get(pk)!,
            },
          },
          update: {}, create: { templateServiceId: svc.id, templatePolicyDefinitionId: policyByKey.get(pk)! },
        });

      for (const q of s.questions) {
        const question = await t.templateQuestion.upsert({
          where: { templateServiceId_key: { templateServiceId: svc.id, key: q.key } },
          update: { prompt: q.prompt, helpText: q.helpText, inputType: q.inputType as never, order: q.order },
          create: {
            templateServiceId: svc.id, key: q.key, prompt: q.prompt, helpText: q.helpText,
            inputType: q.inputType as never, order: q.order,
          },
        });
        for (const o of q.options) {
          const opt = await t.templateAnswerOption.upsert({
            where: { templateQuestionId_value: { templateQuestionId: question.id, value: o.value } },
            update: {
              label: o.label, routeAction: o.routeAction as never, order: o.order,
              requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
              nextQuestionKey: o.nextQuestionKey, labelPattern: o.labelPattern,
              templatePolicyDefinitionId: o.policyKey ? policyByKey.get(o.policyKey)! : null,
            },
            create: {
              templateQuestionId: question.id, value: o.value, label: o.label,
              routeAction: o.routeAction as never, order: o.order,
              requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
              nextQuestionKey: o.nextQuestionKey, labelPattern: o.labelPattern,
              templatePolicyDefinitionId: o.policyKey ? policyByKey.get(o.policyKey)! : null,
            },
          });
          // What this ANSWER selects. Identity only — the approved increment
          // lives on the contractor's ContractorComponent and never here.
          // Base material of the branch itself — AnswerOption -> Material.
          for (const mk of o.materialKeys) {
            const mat = materialByKey.get(mk);
            if (!mat) throw new Error(`Answer ${s.key}/${q.key}/${o.value} consumes unknown role "${mk}".`);
            await t.templateAnswerOptionMaterial.upsert({
              where: { templateAnswerOptionId_canonicalMaterialId: { templateAnswerOptionId: opt.id, canonicalMaterialId: mat } },
              update: { quantity: 1 },
              create: { templateAnswerOptionId: opt.id, canonicalMaterialId: mat, quantity: 1 },
            });
          }
          for (const ck of o.componentKeys) {
            const comp = componentByKey.get(ck);
            if (!comp) throw new Error(`Answer ${s.key}/${q.key}/${o.value} selects unknown component "${ck}".`);
            await t.templateAnswerOptionComponent.upsert({
              where: { templateAnswerOptionId_canonicalComponentId: { templateAnswerOptionId: opt.id, canonicalComponentId: comp } },
              update: { quantity: 1 },
              create: { templateAnswerOptionId: opt.id, canonicalComponentId: comp, quantity: 1 },
            });
          }
        }
      }

      // What the job consumes whatever is answered. Quantity is a count of the
      // thing, never an allowance — the contractor's COST for the role is what
      // makes it publishable, and its absence is what fails closed.
      for (const m of s.materialRoles) {
        const mat = materialByKey.get(m.key);
        if (!mat) throw new Error(`Service ${s.key} requires unknown material role "${m.key}".`);
        await t.templateServiceMaterial.upsert({
          where: { templateServiceId_canonicalMaterialId: { templateServiceId: svc.id, canonicalMaterialId: mat } },
          update: { quantity: m.quantity, quantityIsPolicy: false },
          create: { templateServiceId: svc.id, canonicalMaterialId: mat, quantity: m.quantity, quantityIsPolicy: false },
        });
      }
    }
    return version.id;
  }, { timeout: 180_000, maxWait: 20_000 });
}

async function main() {
  const payload = buildPlumbingPayload();
  const totals = payloadTotals(payload);
  const apply = process.argv.includes("--apply");
  const jsonPath = arg("json");

  console.log(`\nPUBLISH  ${payload.trade} v${payload.version}  ${payload.kind}`);
  console.log(`  ${totals.services} services, ${totals.questions} questions, ${totals.options} options`);
  console.log(`  ${totals.policies} policy question(s), ${totals.categories} canonical categories`);
  console.log(`  ${totals.materials} material role(s), ${totals.components} component(s) — none costed`);
  console.log(`  ${totals.serviceMaterials} required service-material link(s), ${totals.optionComponents} answer-selected component link(s)`);
  console.log(`  ${totals.componentMaterials} component-material recipe row(s), ${totals.optionMaterials} branch base-material link(s)`);
  console.log(`  ${totals.bandOptions} band answer(s) still holding their {b1} holes\n`);

  if (jsonPath) { writeFileSync(jsonPath, JSON.stringify(payload, null, 2)); console.log(`  Payload written to ${jsonPath}\n`); }
  if (!apply) { console.log(`  Dry run. Nothing written.\n`); return; }

  const url = process.env.DATABASE_URL;
  if (!url) { console.error(`\n  DATABASE_URL is not set.\n`); process.exit(1); }
  const db = new PrismaClient();
  const { verdict: isProduction, detail } = await isProductionItself(url);
  console.log(`  target database identity: ${detail}`);

  if (isProduction && !process.argv.includes(LAUNCH_FLAG)) {
    console.error(
      `\n  REFUSING to publish Plumbing to production.\n\n` +
      `  availableTrades() reads published SNAPSHOTs and feeds the live Guided\n` +
      `  Setup trade picker, so this write would make Plumbing enrollable by\n` +
      `  every real contractor. That is a launch decision, not a verification\n` +
      `  step.\n\n  If you mean it: ${LAUNCH_FLAG}\n`);
    await db.$disconnect();
    process.exit(1);
  }

  const versionId = await write(db, payload);
  console.log(`  Published. TemplateVersion ${versionId}\n`);
  await db.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).message}\n`); process.exit(1); });
