/**
 * Installing a canonical catalog — ADR-014, atomically.
 *
 * Extracted from scripts/provision-from-template.ts so the CLI and Guided
 * Setup run the SAME code. The behavior is unchanged in every respect that
 * matters: it copies structure into rows the contractor owns, and it refuses
 * to write a single economic value.
 *
 * WHAT CHANGED, AND WHY IT HAD TO
 *
 * The script wrote service by service with individual awaits. A failure at
 * service 62 of 75 left 61 services, some policies and a half-built tree —
 * and nothing told the contractor their catalog was incomplete. Everything is
 * now one transaction: the whole catalog, or none of it. Plumbing's V1 rule
 * ("no partial 62 of 63") is the same requirement, reached from another trade.
 *
 * NOT ELECTRICAL-ONLY
 *
 * The orchestrator never reads TemplateService rows directly. It takes a
 * CANONICAL CATALOG SOURCE, so Electrical reads template rows while Plumbing
 * composes its services through composeAll() — and preview, preflight, atomic
 * write and provenance stamping are identical for both.
 */

import type { PrismaClient } from "@prisma/client";

/** One service as the platform defines it, before any contractor economics. */
export type CanonicalService = Record<string, unknown>;

/** A whole trade catalog at one version, ready to persist. */
export type CanonicalCatalog = {
  trade: string;
  version: number;
  /** Stamped onto every row as provenance. Never read at request time. */
  templateVersionId: string;
  services: CanonicalService[];
  /** Every policy the services reach, by key. Recorded UNRESOLVED. */
  policies: Map<string, Record<string, unknown>>;
};

export type CanonicalCatalogSource = {
  trade: string;
  load(): Promise<CanonicalCatalog>;
};

export type Preflight =
  | { ok: true; catalog: CanonicalCatalog; preview: CatalogPreview }
  | { ok: false; code: string; message: string };

export type CatalogPreview = {
  trade: string;
  version: number;
  services: number;
  questions: number;
  options: number;
  policies: number;
  /** Roles the catalog references that this contractor has not costed. */
  unresolvedMaterialRoles: string[];
};

/**
 * Electrical's source: the published template rows.
 *
 * Resolves the BASE CATALOG — the earliest published version for the trade —
 * not the latest.
 *
 * WHY, BECAUSE IT IS COUNTERINTUITIVE
 *
 * `TemplateVersion` rows are not all complete catalogs. Electrical v1 is the
 * full 75-service catalog; v2 contains ONE service and is described as
 * "AFCI question + insulation option + clearer wording" — it is an update
 * DELTA, not a snapshot. Installing "the latest published version" would have
 * given a brand-new contractor a one-service catalog.
 *
 * So installation takes the base catalog, and everything published after it is
 * carried forward by the existing adoption path, which is what
 * template-update was built to do. Enrollment still names a trade rather than
 * a version.
 *
 * THE MODELING GAP THIS EXPOSES: nothing in the schema distinguishes a
 * complete catalog from a delta. "Earliest published" is a true reading of
 * today's data, not a law. When a second trade or a re-published catalog
 * arrives, TemplateVersion should say which kind it is.
 */
export function templateVersionSource(
  db: PrismaClient,
  trade: string,
  /**
   * One service key instead of the whole catalog.
   *
   * For tests and repairs, never for onboarding — a contractor installs a
   * catalog, not a service. Kept because the provisioning suite legitimately
   * proves one service end to end, and removing it silently broke that suite.
   */
  onlyKey?: string
): CanonicalCatalogSource {
  return {
    trade,
    async load() {
      const tv = await db.templateVersion.findFirst({
        where: { trade },
        orderBy: [{ publishedAt: "asc" }, { version: "asc" }],
      });
      if (!tv) throw new Error(`No published template for trade "${trade}".`);

      const services = await db.templateService.findMany({
        where: { templateVersionId: tv.id, ...(onlyKey ? { key: onlyKey } : {}) },
        include: {
          materials: { include: { canonicalMaterial: { select: { key: true } } } },
          questions: {
            orderBy: { order: "asc" },
            include: {
              options: {
                orderBy: { order: "asc" },
                include: {
                  components: true, disclaimers: true, photoGroups: true,
                  templatePolicyDefinition: true,
                },
              },
            },
          },
          policies: { include: { templatePolicyDefinition: true } },
        },
      });

      // Every policy these services actually reach, whether through an answer
      // option or attached to the service itself.
      const policies = new Map<string, Record<string, unknown>>();
      for (const s of services as unknown as Record<string, never>[]) {
        for (const q of (s.questions as unknown as Record<string, never>[]) ?? []) {
          for (const o of (q.options as unknown as Record<string, never>[]) ?? []) {
            const d = o.templatePolicyDefinition as unknown as { key: string } | null;
            if (d) policies.set(d.key, d as unknown as Record<string, unknown>);
          }
        }
        for (const sp of (s.policies as unknown as Record<string, never>[]) ?? []) {
          const d = (sp as unknown as { templatePolicyDefinition: { key: string } }).templatePolicyDefinition;
          policies.set(d.key, d as unknown as Record<string, unknown>);
        }
      }

      return {
        trade, version: tv.version, templateVersionId: tv.id,
        services: services as unknown as CanonicalService[], policies,
      };
    },
  };
}

/**
 * Everything that must be true BEFORE anything is written.
 *
 * The preview comes from the same loaded catalog the install will persist, so
 * it cannot promise a different catalog than it delivers.
 */
export async function preflight(
  db: PrismaClient,
  contractorId: string,
  source: CanonicalCatalogSource
): Promise<Preflight> {
  const alreadyProvisioned = await db.service.count({
    where: { contractorId, templateVersionId: { not: null } },
  });
  if (alreadyProvisioned > 0) {
    return {
      ok: false, code: "CATALOG_ALREADY_INSTALLED",
      message: `You already have ${alreadyProvisioned} service(s) from a canonical catalog. Installing again would duplicate them.`,
    };
  }

  let catalog: CanonicalCatalog;
  try {
    catalog = await source.load();
  } catch (e) {
    return {
      ok: false, code: "NO_PUBLISHED_TEMPLATE",
      message: e instanceof Error ? e.message : "No published catalog for that trade.",
    };
  }
  if (catalog.services.length === 0) {
    return { ok: false, code: "EMPTY_CATALOG", message: "That catalog has no services." };
  }

  // Which material roles the contractor has already costed — everything else
  // arrives unresolved, which for a new contractor is all of them.
  const priced = new Set(
    (await db.contractorMaterial.findMany({ where: { contractorId }, select: { canonicalMaterialId: true } }))
      .map((m) => m.canonicalMaterialId)
  );

  let questions = 0, options = 0;
  const roles = new Set<string>();
  for (const s of catalog.services as unknown as Record<string, never>[]) {
    const qs = (s.questions as unknown as Record<string, never>[]) ?? [];
    questions += qs.length;
    for (const q of qs) options += ((q.options as unknown as unknown[]) ?? []).length;
    for (const m of (s.materials as unknown as Record<string, never>[]) ?? []) {
      const cm = m as unknown as { canonicalMaterialId: string; canonicalMaterial: { key: string } };
      if (!priced.has(cm.canonicalMaterialId)) roles.add(cm.canonicalMaterial.key);
    }
  }

  return {
    ok: true, catalog,
    preview: {
      trade: catalog.trade, version: catalog.version,
      services: catalog.services.length, questions, options,
      policies: catalog.policies.size,
      unresolvedMaterialRoles: [...roles].sort(),
    },
  };
}

export type InstallResult = {
  services: number;
  policies: number;
  unresolvedMaterialRoles: number;
  disclaimersToAuthor: number;
};

/**
 * Write the whole catalog, or none of it.
 *
 * Every economic value is deliberately absent rather than zero: a contractor
 * who has not told us their included run length has not told us it is nothing.
 * Nothing is active and nothing is offered when this returns.
 */
/**
 * @param db  the UNGUARDED client, deliberately.
 *
 * Questions, answer options and their children are DERIVED models: they take
 * their owner through Service, so there is no contractorId to stamp and the
 * guard refuses to create them — correctly, since a stamped guess would be
 * worse than a refusal. The guard's own instruction for this case is to
 * validate the parent and use the unguarded client.
 *
 * `contractorId` must therefore already be established by the caller: the
 * route gets it from `withAdminRoute`, which resolves it from an authenticated
 * membership, and the CLI from an explicit slug. Every write below is keyed to
 * that id or to a row created under it in this same transaction.
 */
export async function installCatalog(
  db: PrismaClient,
  contractorId: string,
  catalog: CanonicalCatalog
): Promise<InstallResult> {
  return db.$transaction(
    async (tx) => {
      const t = tx as unknown as PrismaClient;
      let disclaimersToAuthor = 0;
      const unresolvedRoles = new Set<string>();

      // Unresolved, not zero.
      for (const d of catalog.policies.values()) {
        const def = d as unknown as {
          key: string; type: never; unit: string | null; boundaryCount: number; prompt: string;
        };
        await t.contractorPolicyValue.upsert({
          where: { contractorId_key: { contractorId, key: def.key } },
          update: {},
          create: {
            contractorId, key: def.key, type: def.type, unit: def.unit,
            boundaryCount: def.boundaryCount, prompt: def.prompt, boundaries: [],
          },
        });
      }

      // Legacy required relation; the contract phase removes it.
      const legacyCat = await t.serviceCategory.findFirstOrThrow({ select: { id: true } });

      for (const raw of catalog.services) {
        const s = raw as unknown as Record<string, never> & {
          key: string; slug: string; name: string; canonicalCategoryId: string;
          materials: never[]; questions: never[]; policies: never[];
        };

        const cc = await t.contractorCategory.upsert({
          where: {
            contractorId_canonicalCategoryId: {
              contractorId, canonicalCategoryId: s.canonicalCategoryId,
            },
          },
          update: {},
          create: { contractorId, canonicalCategoryId: s.canonicalCategoryId, sortOrder: 0 },
        });

        const mats = s.materials as unknown as {
          quantityIsPolicy: boolean; canonicalMaterialId: string; quantity: number | null;
          order: number; canonicalMaterial: { key: string };
        }[];
        const structural = mats.filter((m) => !m.quantityIsPolicy);
        const unresolved = mats.filter((m) => m.quantityIsPolicy).map((m) => m.canonicalMaterial.key);

        const svc = await t.service.create({
          data: {
            contractorId, contractorCategoryId: cc.id, categoryId: legacyCat.id,
            slug: s.slug, name: s.name,
            shortDescription: (s as unknown as { shortDescription: string | null }).shortDescription,
            icon: (s as unknown as { icon: string | null }).icon,
            bookingType: (s as unknown as { bookingType: never }).bookingType,
            photoState: (s as unknown as { photoState: never }).photoState,
            isPrimaryEligible: (s as unknown as { isPrimaryEligible: boolean }).isPrimaryEligible,
            requiresTechCount: (s as unknown as { requiresTechCount: number }).requiresTechCount,
            templateVersionId: catalog.templateVersionId, templateKey: s.key,
            // NOTHING economic, and nothing offered or live. `offered` keeps
            // its default of false: a provisioned catalog is a set of
            // possibilities, not a set of commitments.
            active: false,
            materialCostResolved: unresolved.length === 0,
            unresolvedMaterialKeys: unresolved,
          },
          select: { id: true },
        });

        // A material is linked only if the contractor has already priced it.
        // ContractorMaterial.unitCostCents is required and provisioning may
        // not invent a cost, so an uncosted role joins unresolvedMaterialKeys.
        const stillUnresolved = [...unresolved];
        for (const m of structural) {
          const priced = await t.contractorMaterial.findUnique({
            where: {
              contractorId_canonicalMaterialId: {
                contractorId, canonicalMaterialId: m.canonicalMaterialId,
              },
            },
            select: { id: true },
          });
          if (!priced) { stillUnresolved.push(m.canonicalMaterial.key); continue; }
          await t.serviceMaterial.create({
            data: {
              serviceId: svc.id, canonicalMaterialId: m.canonicalMaterialId,
              quantity: m.quantity!, order: m.order,
            },
          });
        }
        stillUnresolved.forEach((k) => unresolvedRoles.add(k));
        if (stillUnresolved.length !== unresolved.length) {
          await t.service.update({
            where: { id: svc.id },
            data: { unresolvedMaterialKeys: stillUnresolved, materialCostResolved: false },
          });
        }

        // Two passes: nextQuestionKey can point forward, and a key only
        // becomes an id once the row exists.
        const unresolvedPolicies = new Set<string>(
          (s.policies as unknown as { templatePolicyDefinition: { key: string } }[])
            .map((sp) => sp.templatePolicyDefinition.key)
        );
        const qId = new Map<string, string>();
        const questions = s.questions as unknown as Record<string, never>[];

        for (const q of questions) {
          const qq = q as unknown as {
            key: string; prompt: string; helpText: string | null; inputType: never; order: number;
          };
          const created = await t.question.create({
            data: {
              serviceId: svc.id, key: qq.key, prompt: qq.prompt, helpText: qq.helpText,
              inputType: qq.inputType, order: qq.order,
              templateVersionId: catalog.templateVersionId, templateKey: qq.key,
            },
            select: { id: true },
          });
          qId.set(qq.key, created.id);
        }

        for (const q of questions) {
          const qq = q as unknown as { key: string; options: Record<string, never>[] };
          for (const rawOpt of qq.options) {
            const o = rawOpt as unknown as {
              value: string; label: string; routeAction: never; order: number;
              nextQuestionKey: string | null; rerouteServiceKey: string | null;
              referencedServiceKey: string | null; requiredPhotoLabels: string[];
              photosBlockBooking: boolean; illustrationUrls: string[];
              labelPattern: string | null;
              templatePolicyDefinition: { key: string } | null;
              components: { canonicalComponentId: string; quantity: number;
                conditionAnswerKey: string | null; conditionAnswerValue: string | null }[];
              disclaimers: { canonicalDisclaimerId: string }[];
              photoGroups: { photoGroupId: string }[];
            };

            // A dangling route would send a homeowner somewhere that does not
            // exist, so a target resolves only if the contractor has it.
            const target = o.rerouteServiceKey
              ? await t.service.findFirst({
                  where: { contractorId, slug: o.rerouteServiceKey }, select: { id: true },
                })
              : null;
            const ref = o.referencedServiceKey
              ? await t.service.findFirst({
                  where: { contractorId, slug: o.referencedServiceKey }, select: { id: true },
                })
              : null;
            if (o.templatePolicyDefinition) unresolvedPolicies.add(o.templatePolicyDefinition.key);

            const ao = await t.answerOption.create({
              data: {
                questionId: qId.get(qq.key)!, value: o.value, label: o.label,
                routeAction: o.routeAction, order: o.order,
                nextQuestionId: o.nextQuestionKey ? qId.get(o.nextQuestionKey) ?? null : null,
                rerouteServiceId: target?.id ?? null, referencedServiceId: ref?.id ?? null,
                requiredPhotoLabels: o.requiredPhotoLabels,
                photosBlockBooking: o.photosBlockBooking,
                illustrationUrls: o.illustrationUrls, labelPattern: o.labelPattern,
                policyKey: o.templatePolicyDefinition?.key ?? null,
                // priceModifierCents keeps its schema default. The template has
                // no opinion about it and neither may provisioning.
                templateVersionId: catalog.templateVersionId,
                templateKey: `${qq.key}/${o.value}`,
              },
              select: { id: true },
            });

            for (const c of o.components) {
              // Same rule as materials: the STRUCTURE says this answer adds a
              // component; what it costs is the contractor's to decide.
              const priced = await t.contractorComponent.findUnique({
                where: {
                  contractorId_canonicalComponentId: {
                    contractorId, canonicalComponentId: c.canonicalComponentId,
                  },
                },
                select: { id: true },
              });
              if (!priced) continue;
              await t.answerOptionComponent.create({
                data: {
                  answerOptionId: ao.id, canonicalComponentId: c.canonicalComponentId,
                  quantity: c.quantity, conditionAnswerKey: c.conditionAnswerKey,
                  conditionAnswerValue: c.conditionAnswerValue,
                },
              });
            }

            for (const d of o.disclaimers) {
              // The template says this answer NEEDS a disclaimer. What it SAYS
              // is the contractor's policy (ADR-009), so provisioning attaches
              // only what they have authored and counts the rest.
              const authored = await t.contractorDisclaimer.findUnique({
                where: {
                  contractorId_canonicalDisclaimerId: {
                    contractorId, canonicalDisclaimerId: d.canonicalDisclaimerId,
                  },
                },
                select: { id: true },
              });
              if (!authored) { disclaimersToAuthor++; continue; }
              await t.answerOptionDisclaimer.create({
                data: { answerOptionId: ao.id, contractorDisclaimerId: authored.id },
              });
            }

            for (const g of o.photoGroups) {
              await t.answerOptionPhotoGroup.create({
                data: { answerOptionId: ao.id, photoGroupId: g.photoGroupId },
              });
            }
          }
        }

        if (unresolvedPolicies.size) {
          await t.service.update({
            where: { id: svc.id },
            data: { unresolvedPolicyKeys: [...unresolvedPolicies].sort() },
          });
        }
      }

      return {
        services: catalog.services.length,
        policies: catalog.policies.size,
        unresolvedMaterialRoles: unresolvedRoles.size,
        disclaimersToAuthor,
      };
    },
    // A full catalog is dozens of services and hundreds of rows. The default
    // 5s interactive limit would abort a healthy install partway, which is
    // exactly the outcome the transaction exists to prevent.
    { timeout: 180_000, maxWait: 20_000 }
  );
}
