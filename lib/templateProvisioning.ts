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
import { assessMaterialReadiness } from "./materialResolution";
import { QUESTION_ORDER } from "./serviceTreeQuery";

/**
 * Which questions a homeowner can actually reach, walking forward from the
 * tree's own entry point (lowest `order`) exactly the way the real Guided
 * Flow does: only a `CONTINUE` answer ever advances to another question.
 *
 * CORRECTED 19 Sep 2026 — the first version followed ANY non-null
 * `nextQuestionKey`/`nextQuestionId` regardless of `routeAction`. Every
 * other route action (`RESOLVE_INSTANT`, `RESOLVE_ADJUSTED`, `PHOTO_REVIEW`,
 * `REMOTE_QUOTE`, `REROUTE_SERVICE`, `REROUTE_TROUBLESHOOTING`) is terminal
 * in the real resolver (`lib/routeResolver.ts`'s own `terminal` check plus
 * its two early REROUTE returns) — a homeowner who picks that answer never
 * advances, even if the row still carries a value in that column from
 * before it was made terminal, or was never cleared. Following it anyway
 * could mark a question "reachable" that no real path can produce.
 *
 * A row EXISTING in a service's structure is not the same as a homeowner ever
 * seeing it, for the same reason. `prisma/seed-new-outlet-v2.ts`'s own stated
 * policy for a question it drops is "rewired out, not deleted" — the row
 * (and anything attached to it, like a required disclaimer) stays in the
 * catalog as a historical record, with nothing left pointing to it. Treating
 * every row as reachable would block a service's activation, or list a
 * disclaimer as "pending", over a requirement no real answer path can ever
 * produce.
 *
 * Generic over the identifier type on purpose: `installCatalog` below walks
 * the TEMPLATE being installed, keyed by its string `key` (nothing has an id
 * yet); `lib/disclaimerAuthoring.ts` walks a contractor's own LIVE
 * Question/AnswerOption rows, keyed by their real database `id` (`key`
 * doubles as "whatever this graph's node identifier is called" — it is
 * never interpreted as a template key here). One traversal, not two that
 * can drift on what "reachable" means.
 */
export function reachableQuestionKeys(
  questions: readonly {
    key: string;
    order: number;
    options: readonly { routeAction: string; nextQuestionKey: string | null }[];
  }[]
): Set<string> {
  if (questions.length === 0) return new Set();
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const entry = questions.reduce((a, b) => (b.order < a.order ? b : a));
  const reachable = new Set<string>();
  const stack = [entry.key];
  while (stack.length > 0) {
    const key = stack.pop()!;
    if (reachable.has(key)) continue;
    reachable.add(key);
    for (const o of byKey.get(key)?.options ?? []) {
      if (o.routeAction === "CONTINUE" && o.nextQuestionKey && byKey.has(o.nextQuestionKey)) {
        stack.push(o.nextQuestionKey);
      }
    }
  }
  return reachable;
}

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
 * The current catalog state for a trade: the latest SNAPSHOT, with every
 * later DELTA folded in.
 *
 * `TemplateVersion.kind` says which is which — explicitly, because both
 * obvious shortcuts are wrong. "Latest version" would install Electrical v2,
 * a one-service update. "Earliest version" happens to be right for Electrical
 * today and breaks the moment a trade republishes a complete catalog. Neither
 * is a property of template versions; both are facts about this data's
 * history.
 *
 * FOLDING, NOT ADOPTING. A new contractor gets the current state directly: the
 * snapshot's services, overlaid by any later delta that redefines one, in
 * version order. There is no second update engine here — adoption exists for
 * contractors who ALREADY have a catalog and have since customized it, which
 * is a different and much harder problem. A contractor with nothing yet has
 * nothing to conflict with.
 *
 * Trade-neutral: Plumbing publishes its composed 63-service catalog as a
 * SNAPSHOT and this resolves it identically, knowing nothing about either
 * trade.
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
  onlyKey?: string,
  /**
   * Install AT a named version instead of the current folded state.
   *
   * For tests and repairs only. Adoption exists for contractors who
   * provisioned BEFORE a delta was published, and the only way to stand that
   * situation up deliberately is to install at the older version — otherwise
   * a freshly provisioned contractor is already current and has nothing to
   * adopt, which is correct behavior that makes the update path untestable.
   *
   * Onboarding never passes this: a contractor installs the catalog as it is
   * today, not as it was.
   */
  atVersion?: number
): CanonicalCatalogSource {
  return {
    trade,
    async load() {
      const snapshot = atVersion
        ? await db.templateVersion.findFirst({ where: { trade, version: atVersion } })
        : await db.templateVersion.findFirst({
            where: { trade, kind: "SNAPSHOT" },
            orderBy: { version: "desc" },
          });
      if (!snapshot) {
        throw new Error(
          atVersion
            ? `No published version ${atVersion} for trade "${trade}".`
            : `No published SNAPSHOT catalog for trade "${trade}".`
        );
      }

      // Deltas published after the snapshot. Ascending, so a later one wins
      // over an earlier one for the same service key. Pinning to a version
      // folds nothing — that is the point of pinning.
      const deltas = atVersion
        ? []
        : await db.templateVersion.findMany({
            where: { trade, kind: "DELTA", version: { gt: snapshot.version } },
            orderBy: { version: "asc" },
            select: { id: true, version: true },
          });

      const tv = snapshot;
      const versionIds = [snapshot.id, ...deltas.map((d) => d.id)];
      const rows = await db.templateService.findMany({
        where: { templateVersionId: { in: versionIds }, ...(onlyKey ? { key: onlyKey } : {}) },
        include: {
          materials: { include: { canonicalMaterial: { select: { key: true } } } },
          questions: {
            orderBy: QUESTION_ORDER,
            include: {
              options: {
                orderBy: { order: "asc" },
                include: {
                  components: true, materials: true, disclaimers: true, photoGroups: true,
                  templatePolicyDefinition: true,
                },
              },
            },
          },
          policies: { include: { templatePolicyDefinition: true } },
        },
      });

      // Fold: snapshot first, then each delta in version order, later
      // definitions replacing earlier ones for the same service key.
      const rank = new Map(versionIds.map((id, i) => [id, i]));
      const byKey = new Map<string, Record<string, never>>();
      for (const r of rows as unknown as Record<string, never>[]) {
        const row = r as unknown as { key: string; templateVersionId: string };
        const held = byKey.get(row.key) as unknown as { templateVersionId: string } | undefined;
        if (!held || rank.get(row.templateVersionId)! > rank.get(held.templateVersionId)!) {
          byKey.set(row.key, r);
        }
      }
      const services = [...byKey.values()];

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
        trade,
        version: tv.version,
        // Provenance records the SNAPSHOT the catalog was installed from. A
        // folded delta is recorded per row by templateKey, and adoption reads
        // the version each service actually came from.
        templateVersionId: tv.id,
        services: services as unknown as CanonicalService[],
        policies,
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
      // CanonicalDisclaimer carries no economics and no contractorId — a
      // platform lookup, read once, to turn each unauthored link's bare
      // canonicalDisclaimerId into the KEY unresolvedDisclaimerKeys actually
      // stores (the same shape unresolvedMaterialKeys/unresolvedPolicyKeys
      // already use: name the decision, not a count).
      const canonicalDisclaimerKeyById = new Map(
        (await t.canonicalDisclaimer.findMany({ select: { id: true, key: true } })).map((c) => [c.id, c.key])
      );

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
          templateVersionId: string;
          materials: never[]; questions: never[]; policies: never[];
        };

        // Provenance is per ROW, from the version this definition actually
        // came from — not the snapshot the install started at.
        //
        // Stamping the snapshot everywhere made a freshly provisioned service
        // claim it came from v1 while carrying v2's content, so adoption
        // offered three changes that were already applied. Provenance has to
        // say where the row IS, or the update path is comparing against a
        // version the contractor never had.
        const fromVersionId = s.templateVersionId;

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
            // Carried from the template, never defaulted here. A Routing V2
            // service arriving as LEGACY_PUBLISHED would be configured to price
            // the one way its measured scope cannot be priced.
            pricingMethod: (s as unknown as { pricingMethod: never }).pricingMethod,
            templateVersionId: fromVersionId, templateKey: s.key,
            // THE DURABLE TRADE IDENTITY — G2.
            //
            // Stamped at creation from the catalog being installed, so every
            // provisioned service knows its own trade without anything reading
            // through provenance at request time. `templateVersionId` above
            // stays what it is: a record, not a link.
            //
            // This is the whole reason a diagnostic lookup can be scoped. A
            // contractor selling two trades has a service call in each, and
            // which one a route resolves to is decided by the ORIGINATING
            // service's trade — read from here.
            tradeKey: catalog.trade,
            // NOTHING economic, and nothing offered or live. `offered` keeps
            // its default of false: a provisioned catalog is a set of
            // possibilities, not a set of commitments.
            active: false,
            // Corrected below once every role is linked and readiness has
            // actually been asked — a service is never created claiming
            // resolution it has not earned.
            materialCostResolved: mats.length === 0,
            unresolvedMaterialKeys: [],
          },
          select: { id: true },
        });

        /**
         * EVERY ROLE IS LINKED, WHETHER OR NOT IT IS COSTED OR QUANTIFIED YET.
         *
         * This used to skip the link entirely for an uncosted structural role
         * — and record the key in unresolvedMaterialKeys anyway. That was
         * backwards, and it was a trap rather than a conservatism: with no
         * link, requiredRolesFor() sees nothing, assessMaterialReadiness
         * reports "ready, 0 roles", recomputeServiceMaterialCost exits early
         * as "not itemized", and the key can NEVER be cleared. Entering the
         * cost afterwards changed nothing. Three of six Plumbing starter
         * services were permanently unlaunchable this way, while Guided Setup
         * went on telling the contractor to enter a cost they had already
         * entered.
         *
         * A policy-quantity role had the SAME defect one layer up: it was
         * never linked at all, so requiredRolesFor() could not see it either
         * — a service whose only unresolved role was a policy quantity could
         * recompute its OTHER roles' costs, find nothing linked to refuse on,
         * and report materialCostResolved: true while silently pricing
         * without the policy role's cost. Linking it too, with `quantity:
         * null`, closes that the same way the structural fix did: readiness
         * sees the role and refuses on it — for the right reason, "no
         * allowance set" rather than "no cost entered" — until the contractor
         * declares their own figure through the ordinary quantity-edit path.
         *
         * The rule the fix restores, now for both cases:
         *
         *   PROVISIONING owns structure and provenance — this service consumes
         *   this role, in this quantity (or "the contractor decides", for a
         *   policy role). A fact about the canonical catalog, and it persists.
         *
         *   READINESS owns whether the current combination can make a pricing
         *   promise. A question about contractor state RIGHT NOW, derived on
         *   every read, never captured at install time.
         *
         * A ServiceMaterial row carries no money, so linking an uncosted or
         * unquantified role is safe: assessMaterialReadiness refuses before
         * anything is totalled.
         */
        for (const m of mats) {
          await t.serviceMaterial.create({
            data: {
              serviceId: svc.id, canonicalMaterialId: m.canonicalMaterialId,
              quantity: m.quantityIsPolicy ? null : m.quantity!,
              quantityIsPolicy: m.quantityIsPolicy,
              order: m.order,
            },
          });
        }

        // DERIVED, not captured. The authority readiness uses later is asked
        // now, so the first state and every later state are computed the
        // same way — one readiness question covers both an uncosted role and
        // an undeclared policy quantity, distinguished only in the reason it
        // reports.
        if (mats.length > 0) {
          const readiness = await assessMaterialReadiness(t, svc.id, contractorId);
          const stillUnresolved = readiness.ready ? [] : readiness.missing.map((r) => r.key);
          stillUnresolved.forEach((k) => unresolvedRoles.add(k));
          await t.service.update({
            where: { id: svc.id },
            data: { unresolvedMaterialKeys: stillUnresolved, materialCostResolved: stillUnresolved.length === 0 },
          });
        }

        // Two passes: nextQuestionKey can point forward, and a key only
        // becomes an id once the row exists.
        /**
         * `unresolvedPolicyKeys` means one specific thing: ANSWER TEXT A
         * HOMEOWNER WOULD READ cannot be written yet. Band policies
         * interpolate their boundaries into option labels — an unresolved one
         * literally renders "{b1} feet or less" on the storefront, which is
         * why activation refuses on it.
         *
         * MEASUREMENT and MATERIAL_SPECIFICATION policies write no label. A
         * termination slack allowance and a conductor specification are real
         * decisions a contractor owes, and they gate PRICING through the
         * derived-scope readiness contract — but they corrupt no homeowner
         * text, so listing them here would refuse activation for a service
         * whose storefront reads perfectly.
         *
         * The offcut policy makes that concrete: it is deliberately left
         * unresolved, because it only decides turned-route piece counts and
         * those stay in review by design. Counted here, it would block this
         * service from ever going live for a reason that is working as
         * intended.
         */
        const LABEL_WRITING_POLICY_TYPES = new Set([
          "DISTANCE_BREAKPOINTS", "HEIGHT_BREAKPOINTS", "SUPPLY_ARRANGEMENT",
        ]);
        const unresolvedPolicies = new Set<string>(
          (s.policies as unknown as { templatePolicyDefinition: { key: string; type: string } }[])
            .filter((sp) => LABEL_WRITING_POLICY_TYPES.has(sp.templatePolicyDefinition.type))
            .map((sp) => sp.templatePolicyDefinition.key)
        );
        // Same contract, for disclaimers: a homeowner-reachable answer on
        // THIS service needs a concept this contractor has not authored yet.
        // "Reachable" is load-bearing here, not decorative: a question a
        // later seed step rewires out (see reachableQuestionKeys' own doc)
        // still exists in this catalog, with its disclaimer link intact, and
        // must not block activation over an answer path nothing produces.
        const unresolvedDisclaimers = new Set<string>();
        const qId = new Map<string, string>();
        const questions = s.questions as unknown as Record<string, never>[];
        const reachableKeys = reachableQuestionKeys(
          questions as unknown as { key: string; order: number; options: { routeAction: string; nextQuestionKey: string | null }[] }[]
        );

        for (const q of questions) {
          const qq = q as unknown as {
            key: string; prompt: string; helpText: string | null; inputType: never; order: number;
            /// ROUTING V2 — an authored range is required for a bound NUMBER
            /// question, so it must arrive with the question.
            numberAllowsDecimal?: boolean; numberMin: number | null; numberMax: number | null;
          };
          const created = await t.question.create({
            data: {
              serviceId: svc.id, key: qq.key, prompt: qq.prompt, helpText: qq.helpText,
              inputType: qq.inputType, numberAllowsDecimal: qq.numberAllowsDecimal ?? false, numberMin: qq.numberMin, numberMax: qq.numberMax,
              order: qq.order,
              templateVersionId: fromVersionId, templateKey: qq.key,
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
              /// ROUTING V2 numeric routing — see AnswerOption.numberAtLeast.
              /// An option whose range is lost stops matching, which turns a
              /// sound tree into a gap and refuses every answer in that span.
              numberAtLeastExclusive?: boolean; numberAtLeast: number | null; numberAtMost: number | null;
              /// ROUTING V2 capability gate — what this route REQUIRES. The
              /// contractor's ContractorCapability says what they OFFER, and
              /// provisioning must never write that: a route being able to
              /// require drywall restoration is not a claim that this
              /// contractor does it.
              requiresCapabilityKey: string | null;
              /// What this answer means for wiring access — see
              /// AnswerOption.accessClassification/accessSlot, which this
              /// carries forward verbatim.
              accessClassification: never | null; accessSlot: string | null;
              nextQuestionKey: string | null; rerouteServiceKey: string | null;
              referencedServiceKey: string | null; requiredPhotoLabels: string[];
              photosBlockBooking: boolean; illustrationUrls: string[];
              labelPattern: string | null;
              templatePolicyDefinition: { key: string } | null;
              components: { canonicalComponentId: string; quantity: number;
                conditionAnswerKey: string | null; conditionAnswerValue: string | null;
                /// ROUTING V2. Listed explicitly because this copy is a field
                /// list, not a spread — a binding dropped here degrades to
                /// static quantity 1 and prices a 31-foot route as one foot,
                /// with no error anywhere.
                quantityAnswerKey: string | null;
                /// Mutually-exclusive access variants — see
                /// AnswerOptionComponent.conditionAccessClass. Dropped here,
                /// both variants install unconditioned and a route selects
                /// both pieces of mutually exclusive work at once.
                conditionAccessClass: never | null; conditionAccessSlot: string | null }[];
              disclaimers: { canonicalDisclaimerId: string }[];
              materials: { canonicalMaterialId: string; quantity: number; order: number }[];
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
                numberAtLeastExclusive: o.numberAtLeastExclusive ?? false, numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost,
                requiresCapabilityKey: o.requiresCapabilityKey,
                accessClassification: o.accessClassification, accessSlot: o.accessSlot ?? "PRIMARY",
                nextQuestionId: o.nextQuestionKey ? qId.get(o.nextQuestionKey) ?? null : null,
                rerouteServiceId: target?.id ?? null, referencedServiceId: ref?.id ?? null,
                requiredPhotoLabels: o.requiredPhotoLabels,
                photosBlockBooking: o.photosBlockBooking,
                illustrationUrls: o.illustrationUrls, labelPattern: o.labelPattern,
                policyKey: o.templatePolicyDefinition?.key ?? null,
                // priceModifierCents keeps its schema default. The template has
                // no opinion about it and neither may provisioning.
                templateVersionId: fromVersionId,
                templateKey: `${qq.key}/${o.value}`,
              },
              select: { id: true },
            });

            for (const c of o.components) {
              /**
               * ALWAYS linked, priced or not — the same rule as branch
               * material below, and now the same rule as ServiceMaterial
               * above, which B1 corrected for exactly this reason.
               *
               * This used to look up the contractor's ContractorComponent
               * first and `continue` when it was missing, which silently threw
               * the structural link away. The template's claim is about WORK:
               * this answer selects this component. Whether the contractor has
               * priced it yet is a fact about the contractor, and provisioning
               * is not entitled to edit the job because of it.
               *
               * The cost of the old shape was permanent. Nothing outside
               * installCatalog creates an AnswerOptionComponent, so a
               * contractor who priced a component the day after onboarding
               * never got the link at all, and no amount of later
               * configuration could produce it — only a reinstall.
               *
               * Unpriced is still refused, just by the authority that owns
               * that question: the route fails closed to REVIEW while the
               * component has no approved price. Structure here, economics
               * there.
               */
              await t.answerOptionComponent.create({
                data: {
                  answerOptionId: ao.id, canonicalComponentId: c.canonicalComponentId,
                  quantity: c.quantity, quantityAnswerKey: c.quantityAnswerKey,
                  conditionAnswerKey: c.conditionAnswerKey,
                  conditionAnswerValue: c.conditionAnswerValue,
                  conditionAccessClass: c.conditionAccessClass,
                  conditionAccessSlot: c.conditionAccessSlot ?? "PRIMARY",
                },
              });
            }

            /**
             * Branch material — ALWAYS linked, priced or not. Same rule
             * ServiceMaterial above now follows too: the total is never
             * broken by an uncosted or unquantified row, because
             * assessMaterialReadiness refuses on it before it is summed
             * rather than the row being withheld to protect the sum.
             *
             * AnswerOptionMaterial feeds no total of its own — it is
             * structure, this branch consumes this role — and the cost is
             * looked up at activation. Skipping the unpriced ones would
             * delete the only evidence the branch needs anything, which is
             * precisely the invisibility this primitive was added to end.
             */
            for (const m of o.materials) {
              await t.answerOptionMaterial.create({
                data: {
                  answerOptionId: ao.id,
                  canonicalMaterialId: m.canonicalMaterialId,
                  quantity: m.quantity,
                  order: m.order,
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
              if (!authored) {
                disclaimersToAuthor++;
                const key = canonicalDisclaimerKeyById.get(d.canonicalDisclaimerId);
                if (key && reachableKeys.has(qq.key)) unresolvedDisclaimers.add(key);
                continue;
              }
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

        if (unresolvedPolicies.size || unresolvedDisclaimers.size) {
          await t.service.update({
            where: { id: svc.id },
            data: {
              unresolvedPolicyKeys: [...unresolvedPolicies].sort(),
              unresolvedDisclaimerKeys: [...unresolvedDisclaimers].sort(),
            },
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


/**
 * Trades a contractor could enrol in — derived, never listed.
 *
 * A trade is available when it has a published SNAPSHOT, because a trade with
 * only deltas has no catalog to install. Reading it from the published data
 * means Plumbing appears the day its catalog is published and no onboarding
 * code changes.
 */
export async function availableTrades(db: PrismaClient): Promise<string[]> {
  const rows = await db.templateVersion.findMany({
    where: { kind: "SNAPSHOT" },
    select: { trade: true },
    distinct: ["trade"],
    orderBy: { trade: "asc" },
  });
  return rows.map((r) => r.trade);
}

/**
 * Services this contractor holds that came from a given trade's catalog.
 *
 * What makes an enrolment un-removable: a catalog that has been installed is
 * priced, possibly live, and possibly booked against. Withdrawing the
 * enrolment underneath it is a migration, not a setting.
 */
export async function provisionedFromTrade(
  db: PrismaClient,
  contractorId: string,
  tradeKey: string
): Promise<number> {
  // Service.templateVersionId is provenance WITHOUT a relation — deliberately,
  // since it is never read at request time — so the versions are resolved
  // first rather than joined.
  const versions = await db.templateVersion.findMany({
    where: { trade: tradeKey }, select: { id: true },
  });
  if (versions.length === 0) return 0;
  return db.service.count({
    where: { contractorId, templateVersionId: { in: versions.map((v) => v.id) } },
  });
}
