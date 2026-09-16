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
 * `authorContractorDisclaimer` is atomic and does both halves in one
 * transaction — the `ContractorDisclaimer` row and every applicable
 * `AnswerOptionDisclaimer` link — for the same reason
 * `declarePolicyMaterialQuantity` is atomic: a fault between "wording saved"
 * and "wording attached" must not leave a contractor's homeowner-facing
 * catalog in a state where the text exists but is not actually attached
 * anywhere.
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
  const services = await db.service.findMany({
    where: { contractorId, templateKey: { not: null } },
    select: { slug: true, offered: true, templateKey: true },
  });
  const templateServiceKeys = services.map((s) => s.templateKey).filter((k): k is string => k !== null);
  if (templateServiceKeys.length === 0) return [];

  const links = await db.templateAnswerOptionDisclaimer.findMany({
    where: { templateAnswerOption: { templateQuestion: { templateService: { key: { in: templateServiceKeys } } } } },
    select: {
      canonicalDisclaimer: { select: { id: true, key: true, name: true, description: true, accessClass: true } },
      templateAnswerOption: {
        select: {
          templateQuestion: { select: { templateService: { select: { key: true } } } },
        },
      },
    },
  });

  const byKey = new Map<string, { name: string; description: string | null; accessClass: string | null; serviceKeys: Set<string> }>();
  for (const l of links) {
    const c = l.canonicalDisclaimer;
    const entry = byKey.get(c.key) ?? { name: c.name, description: c.description, accessClass: c.accessClass, serviceKeys: new Set<string>() };
    entry.serviceKeys.add(l.templateAnswerOption.templateQuestion.templateService.key);
    byKey.set(c.key, entry);
  }
  if (byKey.size === 0) return [];

  const authored = await db.contractorDisclaimer.findMany({
    where: { contractorId, canonicalDisclaimer: { key: { in: [...byKey.keys()] } } },
    select: { text: true, canonicalDisclaimer: { select: { key: true } } },
  });
  const textByKey = new Map(authored.map((a) => [a.canonicalDisclaimer.key, a.text]));
  const slugByTemplateKey = new Map(services.map((s) => [s.templateKey as string, s]));

  return [...byKey.entries()]
    .map(([key, v]) => {
      const dependents = [...v.serviceKeys].map((tk) => slugByTemplateKey.get(tk)).filter((s): s is (typeof services)[number] => s !== undefined);
      return {
        key, name: v.name, description: v.description, accessClass: v.accessClass,
        text: textByKey.get(key) ?? "",
        authored: textByKey.has(key),
        dependentSlugs: dependents.map((s) => s.slug).sort(),
        offeredDependentSlugs: dependents.filter((s) => s.offered).map((s) => s.slug).sort(),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type AuthorDisclaimerResult =
  | { ok: true; key: string; attached: number }
  | { ok: false; code: "UNKNOWN_DISCLAIMER" | "TEXT_REQUIRED"; message: string };

/**
 * Save a contractor's own wording for one canonical disclaimer concept, and
 * attach it — atomically — to every one of THIS contractor's own answer
 * options the template says needs it. Never reinstalls the catalog; never
 * touches a row belonging to another contractor.
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

  // Every TEMPLATE row that needs this concept, resolved down to THIS
  // contractor's own installed rows only — the same structural mapping
  // installCatalog itself uses (Service/Question/AnswerOption.templateKey),
  // never a foreign row.
  //
  // Resolved and PROVEN through the GUARDED client, per ADR-010
  // (lib/tenantWrites.ts): AnswerOption is a derived-owned model three hops
  // from its contractorId, so a guarded find is what proves each id belongs
  // to the active contractor before it is ever used as a write target.
  const links = await db.templateAnswerOptionDisclaimer.findMany({
    where: { canonicalDisclaimerId: canonical.id },
    select: {
      templateAnswerOption: {
        select: {
          value: true,
          templateQuestion: { select: { key: true, templateService: { select: { key: true } } } },
        },
      },
    },
  });

  const provenAnswerOptionIds: string[] = [];
  for (const link of links) {
    const opt = link.templateAnswerOption;
    const answerOption = await db.answerOption.findFirst({
      where: {
        value: opt.value,
        question: { templateKey: opt.templateQuestion.key, service: { contractorId, templateKey: opt.templateQuestion.templateService.key } },
      },
      select: { id: true },
    });
    if (answerOption) provenAnswerOptionIds.push(answerOption.id); // else: not installed for this contractor — nothing to attach
  }

  // The actual write. AnswerOptionDisclaimer has no contractorId to stamp —
  // the guard throws DerivedCreateError on a direct create for exactly that
  // reason — so this runs on the UNGUARDED client, safe only because every
  // id above was just proven through the guarded one. Both halves (the
  // wording and every attachment) commit in one transaction: a fault between
  // "wording saved" and "wording attached" must not leave the text existing
  // but unattached anywhere.
  const attached = await platformDb.$transaction(async (tx) => {
    const cd = await tx.contractorDisclaimer.upsert({
      where: { contractorId_canonicalDisclaimerId: { contractorId, canonicalDisclaimerId: canonical.id } },
      update: { text: trimmed },
      create: { contractorId, canonicalDisclaimerId: canonical.id, text: trimmed },
      select: { id: true },
    });

    let count = 0;
    for (const answerOptionId of provenAnswerOptionIds) {
      await tx.answerOptionDisclaimer.upsert({
        where: { answerOptionId_contractorDisclaimerId: { answerOptionId, contractorDisclaimerId: cd.id } },
        update: {},
        create: { answerOptionId, contractorDisclaimerId: cd.id },
      });
      count++;
    }
    return count;
  });

  return { ok: true, key: canonicalDisclaimerKey, attached };
}
