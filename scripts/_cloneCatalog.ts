/**
 * Clone a slice of one contractor's catalog onto another — ADR-020.
 *
 * WHY THIS EXISTS
 *
 * The demonstration contractor used to be provisioned from the electrical
 * template. That is the shipped path and it is the right one for a real
 * contractor, but template-provisioned services carry material QUANTITIES that
 * come from a policy, and no surface exists for a contractor to set a policy —
 * the only write to ContractorPolicyValue in the codebase is provisioning,
 * which creates every one empty. So those services can never be priced, and a
 * demo built on them could only ever show the product declining to price
 * things.
 *
 * Elite's own catalog predates the template and has no policy-driven
 * quantities: 75 of 75 services fully resolved, real material costs, real
 * published prices. Cloning a slice of it gives the demonstration contractor a
 * catalog that actually works, with economics that are real rather than
 * invented.
 *
 * WHAT IT DOES NOT CARRY
 *
 * Identity. The clone takes services, questions, answers and economics, and
 * nothing that names the source: no logo, no phone number, no address, and
 * every mention of the source's name in the copied text is rewritten. A demo
 * that quietly said "Elite" in an answer label would be the exact failure this
 * whole demo tenant exists to avoid.
 */
import type { PrismaClient } from "@prisma/client";

export type CloneResult = { services: number; renamed: number };

/** Rewrites the source contractor's name out of any copied text. */
function debrand(value: string | null, from: RegExp, to: string): string | null {
  if (value === null) return null;
  return value.replace(from, to);
}

export async function cloneCatalog(
  prisma: PrismaClient,
  opts: {
    fromContractorId: string;
    toContractorId: string;
    /** Service slugs to copy. Reroute targets are added automatically. */
    slugs: string[];
    /** Name to strip out of copied text, and what to put in its place. */
    sourceName: RegExp;
    replacementName: string;
  },
): Promise<CloneResult> {
  const { fromContractorId, toContractorId, sourceName, replacementName } = opts;
  const fix = (v: string | null) => debrand(v, sourceName, replacementName);

  // 1 — the contractor's own economics for shared roles.
  for (const m of await prisma.contractorMaterial.findMany({ where: { contractorId: fromContractorId } })) {
    const { id, contractorId, activeSupplierLinkId, createdAt, updatedAt, ...rest } = m;
    await prisma.contractorMaterial.upsert({
      where: { contractorId_canonicalMaterialId: { contractorId: toContractorId, canonicalMaterialId: m.canonicalMaterialId } },
      update: {},
      create: { ...rest, contractorId: toContractorId },
    });
  }
  for (const c of await prisma.contractorComponent.findMany({ where: { contractorId: fromContractorId } })) {
    const { id, contractorId, createdAt, updatedAt, ...rest } = c as any;
    await prisma.contractorComponent.create({ data: { ...rest, contractorId: toContractorId } }).catch(() => {});
  }
  const discMap = new Map<string, string>();
  for (const d of await prisma.contractorDisclaimer.findMany({ where: { contractorId: fromContractorId } })) {
    const { id, contractorId, createdAt, updatedAt, ...rest } = d as any;
    for (const k of Object.keys(rest)) if (typeof rest[k] === "string") rest[k] = fix(rest[k]);
    const made = await prisma.contractorDisclaimer.create({ data: { ...rest, contractorId: toContractorId }, select: { id: true } });
    discMap.set(d.id, made.id);
  }

  // 2 — the service set, closed over anything it routes to.
  const all = await prisma.service.findMany({
    where: { contractorId: fromContractorId },
    select: { id: true, slug: true, questions: { select: { options: { select: { rerouteServiceId: true, referencedServiceId: true } } } } },
  });
  const bySlug = new Map(all.map((s) => [s.slug, s]));
  const byId = new Map(all.map((s) => [s.id, s]));
  const keep = new Set(opts.slugs.map((sl) => bySlug.get(sl)?.id).filter((v): v is string => !!v));
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of [...keep]) {
      for (const q of byId.get(id)?.questions ?? []) {
        for (const o of q.options) {
          for (const t of [o.rerouteServiceId, o.referencedServiceId]) {
            if (t && byId.has(t) && !keep.has(t)) { keep.add(t); changed = true; }
          }
        }
      }
    }
  }

  // 3 — categories, then services, questions and answers.
  const catMap = new Map<string, string>();
  for (const c of await prisma.contractorCategory.findMany({ where: { contractorId: fromContractorId } })) {
    const { id, contractorId, createdAt, updatedAt, ...rest } = c as any;
    if ("nameOverride" in rest) rest.nameOverride = fix(rest.nameOverride);
    const made = await prisma.contractorCategory.upsert({
      where: { contractorId_canonicalCategoryId: { contractorId: toContractorId, canonicalCategoryId: c.canonicalCategoryId } },
      update: {},
      create: { ...rest, contractorId: toContractorId },
      select: { id: true },
    });
    catMap.set(c.id, made.id);
  }

  const svcMap = new Map<string, string>();
  const optionFixups: { newOptionId: string; nextQuestionId: string | null; rerouteServiceId: string | null; referencedServiceId: string | null }[] = [];
  const qMap = new Map<string, string>();
  let renamed = 0;

  for (const sourceId of keep) {
    const svc = await prisma.service.findUniqueOrThrow({ where: { id: sourceId } });
    const { id, contractorId, contractorCategoryId, createdAt, updatedAt, ...rest } = svc as any;
    for (const k of ["name", "shortDescription", "disclaimer", "startingPriceLabel", "slug"]) {
      if (typeof rest[k] === "string") {
        const fixed = k === "slug" ? rest[k].replace(/^elite-/, "") : fix(rest[k]);
        if (fixed !== rest[k]) renamed++;
        rest[k] = fixed;
      }
    }
    const made = await prisma.service.create({
      data: { ...rest, contractorId: toContractorId, contractorCategoryId: contractorCategoryId ? catMap.get(contractorCategoryId) ?? null : null },
      select: { id: true },
    });
    svcMap.set(sourceId, made.id);

    for (const q of await prisma.question.findMany({ where: { serviceId: sourceId }, orderBy: { order: "asc" } })) {
      const { id: qid, serviceId, ...qrest } = q as any;
      for (const k of ["prompt", "helpText"]) if (typeof qrest[k] === "string") { const f = fix(qrest[k]); if (f !== qrest[k]) renamed++; qrest[k] = f; }
      const newQ = await prisma.question.create({ data: { ...qrest, serviceId: made.id }, select: { id: true } });
      qMap.set(q.id, newQ.id);

      for (const o of await prisma.answerOption.findMany({ where: { questionId: q.id }, orderBy: { order: "asc" } })) {
        const { id: oid, questionId, nextQuestionId, rerouteServiceId, referencedServiceId, ...orest } = o as any;
        for (const k of ["label", "disclaimer", "accessFinishedDisclaimer"]) {
          if (typeof orest[k] === "string") { const f = fix(orest[k]); if (f !== orest[k]) renamed++; orest[k] = f; }
        }
        const newO = await prisma.answerOption.create({
          data: { ...orest, questionId: newQ.id, nextQuestionId: null, rerouteServiceId: null, referencedServiceId: null },
          select: { id: true },
        });
        optionFixups.push({ newOptionId: newO.id, nextQuestionId, rerouteServiceId, referencedServiceId });

        for (const c of await prisma.answerOptionComponent.findMany({ where: { answerOptionId: o.id } })) {
          const { id: cid, answerOptionId, ...crest } = c as any;
          await prisma.answerOptionComponent.create({ data: { ...crest, answerOptionId: newO.id } }).catch(() => {});
        }
        for (const d of await prisma.answerOptionDisclaimer.findMany({ where: { answerOptionId: o.id } })) {
          const { id: did, answerOptionId, contractorDisclaimerId, ...drest } = d as any;
          const mapped = discMap.get(contractorDisclaimerId);
          if (!mapped) continue;
          await prisma.answerOptionDisclaimer.create({ data: { ...drest, answerOptionId: newO.id, contractorDisclaimerId: mapped } }).catch(() => {});
        }
      }
    }
  }

  // 4 — rewire the graph now that every id exists.
  for (const f of optionFixups) {
    await prisma.answerOption.update({
      where: { id: f.newOptionId },
      data: {
        nextQuestionId: f.nextQuestionId ? qMap.get(f.nextQuestionId) ?? null : null,
        rerouteServiceId: f.rerouteServiceId ? svcMap.get(f.rerouteServiceId) ?? null : null,
        referencedServiceId: f.referencedServiceId ? svcMap.get(f.referencedServiceId) ?? null : null,
      },
    });
  }

  return { services: svcMap.size, renamed };
}
