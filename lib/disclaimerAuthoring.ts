/**
 * A contractor's own wording for a canonical disclaimer concept — the
 * disclaimer counterpart to `lib/policyResolution.ts`'s pricing policies.
 *
 * WHY THIS EXISTS
 *
 * `installCatalog` (`lib/templateProvisioning.ts`) links a required
 * disclaimer concept onto every applicable answer option ONLY when the
 * contractor already has a `ContractorDisclaimer` for it — never inventing
 * one, per ADR-009 ("the contractor authors their own wording, not ours").
 * A fresh contractor therefore installs with the concept structurally
 * present (`TemplateAnswerOptionDisclaimer`) but the actual attachment
 * missing, and nothing in the app ever revisited that gap: there was no
 * supported way to author the wording afterward and have it reach the rows
 * `installCatalog` skipped, short of reinstalling the whole catalog.
 *
 * THE ONE PLACE THIS WRITE HAPPENS
 *
 * `authorContractorDisclaimer` is atomic and does all three in one
 * transaction — the `ContractorDisclaimer` row, every applicable
 * `AnswerOptionDisclaimer` link, and clearing the concept's key from every
 * satisfied service's `unresolvedDisclaimerKeys` — for the same reason
 * `declarePolicyMaterialQuantity` is atomic: a fault partway through must not
 * leave a contractor's homeowner-facing catalog in a state where the text
 * exists but is not actually attached, or attached but still reported as
 * blocking activation.
 *
 * BOUND TO WHAT THIS CONTRACTOR ACTUALLY INSTALLED, NOT THE NEWEST CATALOG
 *
 * `installedDisclaimerRequirements` below reads each of the contractor's OWN
 * services' own `templateVersionId` — the exact version its structure came
 * from, stamped once at install (lib/templateProvisioning.ts's own "per ROW,
 * from the version this definition actually came from" comment) — and asks
 * THAT specific TemplateService for its requirements, never "whatever the
 * current published catalog says today."
 *
 * An earlier version of this function called `templateVersionSource` to fold
 * the CURRENT snapshot+deltas instead, on the theory that "current" was
 * simply more correct than the version before it (matching every
 * `TemplateService` with the right key across EVERY version a trade has ever
 * published, which could surface a retired requirement). Both are wrong in
 * different directions: publishing a later template change, with no
 * adoption step run, must neither hide a requirement this contractor's own
 * installed rows still carry nor invent one they never installed. Per-row
 * provenance is the one source that can only ever describe what this
 * contractor actually has.
 *
 * This deliberately does NOT build an adoption framework — no diffing, no
 * migration of a contractor onto a newer version. It reads the one version
 * each service already recorded, the same way every other provenance-scoped
 * read in this codebase does.
 *
 * REAL GRAPH REACHABILITY — OVER THE LIVE TREE, NOT THE TEMPLATE
 *
 * `installedDisclaimerRequirements` walks THIS CONTRACTOR'S OWN LIVE
 * `Question`/`AnswerOption` rows — their real ids, their real
 * `routeAction`/`nextQuestionId` — through `lib/templateProvisioning.ts`'s
 * shared `reachableQuestionKeys`, the same forward-walk `installCatalog`
 * uses at install time. The originating TemplateService (per-service
 * provenance, above) is consulted ONLY to look up which canonical concept a
 * given, ALREADY-live-reachable answer needs — never to decide reachability
 * itself.
 *
 * CORRECTED 19 Sep 2026 — an earlier version walked the ORIGINATING
 * TEMPLATE tree for reachability and then merely checked that a live
 * `AnswerOption` row existed. That is not the same claim as "the LIVE tree
 * can actually reach this row": the admin tree editor
 * (`app/api/admin/services/[serviceId]/tree/route.ts`) can rewire a live
 * service's own `nextQuestionId`/`routeAction` after install, independently
 * of the template. A question the template considered reachable but the
 * live tree has since rewired around would still have required wording; a
 * question the template never considered reachable (retired at extraction
 * time) but the live tree has since rewired A PATH TO would have been
 * missed entirely, even though its template-defined disclosure still
 * exists and now applies for real.
 *
 * The walk itself also had to stop at a TERMINAL answer — see
 * `reachableQuestionKeys`'s own correction note; a retained `nextQuestionKey`
 * on a `RESOLVE_INSTANT`/`PHOTO_REVIEW`/etc. answer is never actually
 * followed by a homeowner and must not be followed here either.
 *
 * NEVER Elite's words. `CanonicalDisclaimer.description` is the neutral
 * concept explanation a contractor authors against — see its own schema
 * comment ("never shown to a homeowner"). This module never reads
 * `ContractorDisclaimer.text` from any contractor OTHER than the one
 * writing it, and never suggests one contractor's dollar amounts, included
 * work or promises as another's starting point.
 */
import type { PrismaClient } from "@prisma/client";
import { platformDb } from "./tenantRoute";
import { reachableQuestionKeys } from "./templateProvisioning";

export type PendingDisclaimer = {
  key: string;
  name: string;
  /** The neutral concept explanation to author against — never a homeowner-facing sentence, never another contractor's words. */
  description: string | null;
  /** Null only when access-unconditioned (always shown once authored). */
  accessClass: string | null;
  /** This contractor's current wording, or "" if never authored. */
  text: string;
  authored: boolean;
  /** Real, installed service slugs this concept reaches for THIS contractor. */
  dependentSlugs: string[];
  offeredDependentSlugs: string[];
};

type DisclaimerRequirement = {
  canonicalDisclaimerId: string;
  serviceId: string;
  serviceSlug: string;
  serviceOffered: boolean;
  /** Already proven live and reachable — never a template-side value alone. */
  liveAnswerOptionId: string;
};

/**
 * Every disclaimer requirement THIS contractor's own installed rows actually
 * carry — bound to each service's own recorded `templateVersionId`, reduced
 * to only the reachable questions in that exact originating definition, and
 * intersected with the live `AnswerOption` graph. See this file's own header
 * for why none of the three may be skipped.
 */
async function installedDisclaimerRequirements(
  db: PrismaClient,
  contractorId: string
): Promise<DisclaimerRequirement[]> {
  const services = await db.service.findMany({
    where: { contractorId, templateKey: { not: null }, templateVersionId: { not: null } },
    select: { id: true, slug: true, offered: true, templateKey: true, templateVersionId: true },
  });

  const requirements: DisclaimerRequirement[] = [];
  for (const svc of services) {
    // THE LIVE TREE — this contractor's own CURRENT Question/AnswerOption
    // rows, which may have diverged from the template since install (the
    // admin tree editor can rewire routeAction/nextQuestionId directly).
    // Keyed by real database id, not a template string key — there is no
    // template involved in this walk at all.
    const liveQuestions = await db.question.findMany({
      where: { serviceId: svc.id },
      select: {
        id: true, order: true,
        options: { select: { id: true, routeAction: true, nextQuestionId: true, templateKey: true } },
      },
    });
    const reachableQuestionIds = reachableQuestionKeys(
      liveQuestions.map((q) => ({
        key: q.id, order: q.order,
        options: q.options.map((o) => ({ routeAction: o.routeAction, nextQuestionKey: o.nextQuestionId })),
      }))
    );

    // Every LIVE-reachable answer option, indexed by the template identity
    // it was installed from (`${questionKey}/${optionValue}` —
    // installCatalog's own stamp). A live-authored option with no
    // templateKey at all (a contractor's own custom addition) carries no
    // template disclosure requirement and is simply absent from this map.
    const liveByTemplateKey = new Map<string, string>();
    for (const q of liveQuestions) {
      if (!reachableQuestionIds.has(q.id)) continue;
      for (const o of q.options) {
        if (o.templateKey) liveByTemplateKey.set(o.templateKey, o.id);
      }
    }
    if (liveByTemplateKey.size === 0) continue;

    // THE ORIGINATING TEMPLATE — the exact version this service's structure
    // came from, consulted ONLY to answer "which canonical concept does
    // templateKey X need", never to decide reachability.
    const templateService = await db.templateService.findFirst({
      where: { key: svc.templateKey as string, templateVersionId: svc.templateVersionId as string },
      select: {
        questions: {
          select: {
            key: true,
            options: { select: { value: true, disclaimers: { select: { canonicalDisclaimerId: true } } } },
          },
        },
      },
    });
    if (!templateService) continue;

    for (const q of templateService.questions) {
      for (const o of q.options) {
        if (o.disclaimers.length === 0) continue;
        const liveAnswerOptionId = liveByTemplateKey.get(`${q.key}/${o.value}`);
        if (!liveAnswerOptionId) continue; // not live-reachable today, whatever the template originally intended
        for (const d of o.disclaimers) {
          requirements.push({
            canonicalDisclaimerId: d.canonicalDisclaimerId,
            serviceId: svc.id, serviceSlug: svc.slug, serviceOffered: svc.offered,
            liveAnswerOptionId,
          });
        }
      }
    }
  }
  return requirements;
}

/**
 * Every canonical disclaimer concept this contractor's OWN installed catalog
 * actually reaches, authored or not — "a contractor returning to setup must
 * still see what needs attention," derived fresh every read, the same
 * design `policiesFor` already uses for pricing policies.
 */
export async function pendingContractorDisclaimers(
  db: PrismaClient,
  contractorId: string
): Promise<PendingDisclaimer[]> {
  const requirements = await installedDisclaimerRequirements(db, contractorId);
  if (requirements.length === 0) return [];

  const canonicals = await db.canonicalDisclaimer.findMany({
    where: { id: { in: [...new Set(requirements.map((r) => r.canonicalDisclaimerId))] } },
    select: { id: true, key: true, name: true, description: true, accessClass: true },
  });
  const canonicalById = new Map(canonicals.map((c) => [c.id, c]));

  const byKey = new Map<string, { name: string; description: string | null; accessClass: string | null; serviceSlugs: Set<string>; offeredServiceSlugs: Set<string> }>();
  for (const r of requirements) {
    const c = canonicalById.get(r.canonicalDisclaimerId);
    if (!c) continue; // referenced canonical row no longer exists — nothing to author against
    const entry = byKey.get(c.key) ?? { name: c.name, description: c.description, accessClass: c.accessClass, serviceSlugs: new Set<string>(), offeredServiceSlugs: new Set<string>() };
    entry.serviceSlugs.add(r.serviceSlug);
    if (r.serviceOffered) entry.offeredServiceSlugs.add(r.serviceSlug);
    byKey.set(c.key, entry);
  }
  if (byKey.size === 0) return [];

  const authored = await db.contractorDisclaimer.findMany({
    where: { contractorId, canonicalDisclaimer: { key: { in: [...byKey.keys()] } } },
    select: { text: true, canonicalDisclaimer: { select: { key: true } } },
  });
  const textByKey = new Map(authored.map((a) => [a.canonicalDisclaimer.key, a.text]));

  return [...byKey.entries()]
    .map(([key, v]) => ({
      key, name: v.name, description: v.description, accessClass: v.accessClass,
      text: textByKey.get(key) ?? "",
      authored: textByKey.has(key),
      dependentSlugs: [...v.serviceSlugs].sort(),
      offeredDependentSlugs: [...v.offeredServiceSlugs].sort(),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type AuthorDisclaimerResult =
  | { ok: true; key: string; attached: number }
  | { ok: false; code: "UNKNOWN_DISCLAIMER" | "TEXT_REQUIRED"; message: string };

/**
 * Save a contractor's own wording for one canonical disclaimer concept, and
 * attach it — atomically — to every one of THIS contractor's own answer
 * options their OWN installed definition says needs it, clearing it from
 * exactly the services that were actually satisfied. Never reinstalls the
 * catalog; never touches a row belonging to another contractor.
 *
 * A save that resolves to zero real targets (nothing installed still
 * requires this concept) attaches nothing and clears no service's blocker —
 * "saved" and "satisfied" are not the same claim, and this refuses to
 * conflate them.
 *
 * Idempotent and safe to call again later to REVISE the wording: existing
 * attachments are left alone (the join is keyed by role, not re-created),
 * and any answer option installed since the last call — a service adopted
 * afterward, say — is picked up this time.
 */
export async function authorContractorDisclaimer(
  db: PrismaClient,
  contractorId: string,
  canonicalDisclaimerKey: string,
  text: string
): Promise<AuthorDisclaimerResult> {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, code: "TEXT_REQUIRED", message: "Enter the wording you want homeowners to see before saving." };
  }

  const canonical = await db.canonicalDisclaimer.findUnique({ where: { key: canonicalDisclaimerKey }, select: { id: true } });
  if (!canonical) {
    return { ok: false, code: "UNKNOWN_DISCLAIMER", message: `No disclaimer concept "${canonicalDisclaimerKey}".` };
  }

  // Every requirement THIS contractor's own installed rows carry for this
  // concept — already proven live and reachable through the GUARDED client
  // (installedDisclaimerRequirements' own answerOption.findFirst is scoped
  // to a serviceId that db.service.findMany already proved belongs to this
  // contractor), per ADR-010 (lib/tenantWrites.ts): AnswerOptionDisclaimer is
  // a derived-owned model with no contractorId to stamp, so a guarded read
  // is what proves ownership before any id is used as a write target.
  const requirements = (await installedDisclaimerRequirements(db, contractorId))
    .filter((r) => r.canonicalDisclaimerId === canonical.id);

  const answerOptionIdsByService = new Map<string, string[]>();
  for (const r of requirements) {
    (answerOptionIdsByService.get(r.serviceId) ?? answerOptionIdsByService.set(r.serviceId, []).get(r.serviceId)!)
      .push(r.liveAnswerOptionId);
  }

  // The actual write. AnswerOptionDisclaimer has no contractorId to stamp —
  // the guard throws DerivedCreateError on a direct create for exactly that
  // reason — so this runs on the UNGUARDED client, safe only because every
  // id above was just proven through the guarded one. All three parts —
  // the wording, every attachment, and clearing the readiness block for
  // exactly the services actually satisfied — commit in one transaction: a
  // fault partway through must not leave the text existing but unattached,
  // or attached but still reported as blocking.
  const attached = await platformDb.$transaction(async (tx) => {
    const cd = await tx.contractorDisclaimer.upsert({
      where: { contractorId_canonicalDisclaimerId: { contractorId, canonicalDisclaimerId: canonical.id } },
      update: { text: trimmed },
      create: { contractorId, canonicalDisclaimerId: canonical.id, text: trimmed },
      select: { id: true },
    });

    let count = 0;
    for (const answerOptionIds of answerOptionIdsByService.values()) {
      for (const answerOptionId of answerOptionIds) {
        await tx.answerOptionDisclaimer.upsert({
          where: { answerOptionId_contractorDisclaimerId: { answerOptionId, contractorDisclaimerId: cd.id } },
          update: {},
          create: { answerOptionId, contractorDisclaimerId: cd.id },
        });
        count++;
      }
    }

    // Only the services actually satisfied by THIS save — a concept with
    // zero matching installed targets attaches nothing above and clears
    // nothing here, rather than optimistically clearing every service that
    // happened to be waiting on this key.
    await clearDisclaimerKeyFromServices(tx as unknown as PrismaClient, [...answerOptionIdsByService.keys()], canonicalDisclaimerKey);

    return count;
  });

  return { ok: true, key: canonicalDisclaimerKey, attached };
}

/**
 * Drop the key from exactly the given services — same shape as
 * lib/policyResolution.ts's clearKeyFromServices, for the same reason:
 * unresolvedDisclaimerKeys is a list on the service rather than a join, so
 * clearing is a read-modify-write. Scoped to a caller-provided service list
 * (the ones actually satisfied by this save) rather than "every service
 * whose array has this key", so a save with zero real targets clears
 * nothing.
 */
async function clearDisclaimerKeyFromServices(db: PrismaClient, serviceIds: string[], key: string) {
  if (serviceIds.length === 0) return;
  const affected = await db.service.findMany({
    where: { id: { in: serviceIds }, unresolvedDisclaimerKeys: { has: key } },
    select: { id: true, unresolvedDisclaimerKeys: true },
  });
  for (const s of affected) {
    await db.service.update({
      where: { id: s.id },
      data: { unresolvedDisclaimerKeys: s.unresolvedDisclaimerKeys.filter((k) => k !== key) },
    });
  }
}
