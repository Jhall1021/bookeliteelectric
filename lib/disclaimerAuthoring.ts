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
 * `Service.unresolvedDisclaimerKeys` it was blocking — for the same reason
 * `declarePolicyMaterialQuantity` is atomic: a fault partway through must not
 * leave a contractor's homeowner-facing catalog in a state where the text
 * exists but is not actually attached, or attached but still reported as
 * blocking activation.
 *
 * REUSES TEMPLATE RESOLUTION, DOES NOT REIMPLEMENT IT
 *
 * `currentDisclaimerRequirements` below calls `templateVersionSource` (the
 * same snapshot+delta fold `installCatalog` and Guided Setup already use)
 * rather than querying every `TemplateAnswerOptionDisclaimer` row that has
 * ever existed for a matching service key. An earlier version did the
 * latter, and it meant a disclaimer requirement retired by a later template
 * DELTA — no longer part of the CURRENT catalog for this trade — could still
 * surface as "pending" for a contractor whose live rows never carried it,
 * because the query never asked which version was current, only whether a
 * key ever matched.
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
import { templateVersionSource } from "./templateProvisioning";

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
  serviceKey: string;
  questionKey: string;
  optionValue: string;
};

/**
 * Every disclaimer requirement the CURRENT catalog actually states, across
 * every trade this contractor is enrolled in.
 *
 * `templateVersionSource(trade).load()` already folds the latest SNAPSHOT
 * with every later DELTA the same way `installCatalog` does — this reuses
 * that fold instead of a bespoke "any TemplateService with this key, any
 * version, ever" query, which is what let a retired attachment leak into
 * today's requirements (see this file's own header).
 */
async function currentDisclaimerRequirements(
  db: PrismaClient,
  contractorId: string
): Promise<DisclaimerRequirement[]> {
  const trades = await db.contractorTrade.findMany({
    where: { contractorId },
    select: { tradeKey: true },
  });

  const requirements: DisclaimerRequirement[] = [];
  for (const { tradeKey } of trades) {
    let catalog: Awaited<ReturnType<ReturnType<typeof templateVersionSource>["load"]>>;
    try {
      catalog = await templateVersionSource(db, tradeKey).load();
    } catch {
      continue; // no published catalog for this trade — nothing to require
    }
    for (const raw of catalog.services) {
      const s = raw as unknown as { key: string; questions: unknown[] };
      for (const rawQ of s.questions ?? []) {
        const q = rawQ as unknown as { key: string; options: unknown[] };
        for (const rawO of q.options ?? []) {
          const o = rawO as unknown as {
            value: string;
            disclaimers: { canonicalDisclaimerId: string }[];
          };
          for (const d of o.disclaimers ?? []) {
            requirements.push({
              canonicalDisclaimerId: d.canonicalDisclaimerId,
              serviceKey: s.key, questionKey: q.key, optionValue: o.value,
            });
          }
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
  const services = await db.service.findMany({
    where: { contractorId, templateKey: { not: null } },
    select: { slug: true, offered: true, templateKey: true },
  });
  const templateServiceKeys = new Set(
    services.map((s) => s.templateKey).filter((k): k is string => k !== null)
  );
  if (templateServiceKeys.size === 0) return [];

  const requirements = (await currentDisclaimerRequirements(db, contractorId))
    .filter((r) => templateServiceKeys.has(r.serviceKey));
  if (requirements.length === 0) return [];

  const canonicals = await db.canonicalDisclaimer.findMany({
    where: { id: { in: [...new Set(requirements.map((r) => r.canonicalDisclaimerId))] } },
    select: { id: true, key: true, name: true, description: true, accessClass: true },
  });
  const canonicalById = new Map(canonicals.map((c) => [c.id, c]));

  const byKey = new Map<string, { name: string; description: string | null; accessClass: string | null; serviceKeys: Set<string> }>();
  for (const r of requirements) {
    const c = canonicalById.get(r.canonicalDisclaimerId);
    if (!c) continue; // referenced canonical row no longer exists — nothing to author against
    const entry = byKey.get(c.key) ?? { name: c.name, description: c.description, accessClass: c.accessClass, serviceKeys: new Set<string>() };
    entry.serviceKeys.add(r.serviceKey);
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
 * options the CURRENT template says needs it, clearing it from every
 * service's `unresolvedDisclaimerKeys` in the same transaction. Never
 * reinstalls the catalog; never touches a row belonging to another
 * contractor.
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

  // Every CURRENT template row that needs this concept, resolved down to
  // THIS contractor's own installed rows only — the same structural mapping
  // installCatalog itself uses (Service/Question/AnswerOption.templateKey),
  // never a foreign row.
  //
  // Resolved and PROVEN through the GUARDED client, per ADR-010
  // (lib/tenantWrites.ts): AnswerOption is a derived-owned model three hops
  // from its contractorId, so a guarded find is what proves each id belongs
  // to the active contractor before it is ever used as a write target.
  const requirements = (await currentDisclaimerRequirements(db, contractorId))
    .filter((r) => r.canonicalDisclaimerId === canonical.id);

  const provenAnswerOptionIds: string[] = [];
  for (const r of requirements) {
    const answerOption = await db.answerOption.findFirst({
      where: {
        value: r.optionValue,
        question: { templateKey: r.questionKey, service: { contractorId, templateKey: r.serviceKey } },
      },
      select: { id: true },
    });
    if (answerOption) provenAnswerOptionIds.push(answerOption.id); // else: not installed for this contractor — nothing to attach
  }

  // The actual write. AnswerOptionDisclaimer has no contractorId to stamp —
  // the guard throws DerivedCreateError on a direct create for exactly that
  // reason — so this runs on the UNGUARDED client, safe only because every
  // id above was just proven through the guarded one. All three parts —
  // the wording, every attachment, and clearing the readiness block — commit
  // in one transaction: a fault partway through must not leave the text
  // existing but unattached, or attached but still reported as blocking.
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

    await clearDisclaimerKeyFromServices(tx as unknown as PrismaClient, contractorId, canonicalDisclaimerKey);

    return count;
  });

  return { ok: true, key: canonicalDisclaimerKey, attached };
}

/**
 * Drop the key from every service that was waiting on it — same shape as
 * lib/policyResolution.ts's clearKeyFromServices, for the same reason:
 * unresolvedDisclaimerKeys is a list on the service rather than a join, so
 * clearing is a read-modify-write, scoped to this contractor's services, and
 * only ever removes the one key a service waiting on two concepts still
 * needs the other.
 */
async function clearDisclaimerKeyFromServices(db: PrismaClient, contractorId: string, key: string) {
  const affected = await db.service.findMany({
    where: { contractorId, unresolvedDisclaimerKeys: { has: key } },
    select: { id: true, unresolvedDisclaimerKeys: true },
  });
  for (const s of affected) {
    await db.service.update({
      where: { id: s.id },
      data: { unresolvedDisclaimerKeys: s.unresolvedDisclaimerKeys.filter((k) => k !== key) },
    });
  }
}
