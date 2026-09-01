/**
 * Tenant isolation, enforced in one place.
 *
 * NOT ATTACHED TO `lib/prisma.ts`. This exports a factory; the application's
 * client is unchanged and every existing query still runs unguarded. Adoption
 * happens after the live test proves the mechanism, route by route.
 *
 * WHAT IT REPLACES
 *
 * `where: { contractorId }` written by hand at every query site. Roughly two
 * hundred of them. Missing one does not throw — it returns another
 * contractor's row, prices a job at someone else's rate, or shows a
 * stranger's booking. A failure that is silent and looks like working
 * software is not something to leave to diligence.
 *
 * HOW IT WORKS — AND A CORRECTION
 *
 * An earlier version of this rewrote `findUnique` into `findFirst`, on the
 * belief that Prisma refuses a non-unique field in a unique where clause.
 * That was true once. `extendedWhereUnique` went generally available in
 * Prisma 5, and `findUnique`, `update`, `delete` and `upsert` all accept
 * additional non-unique filters now.
 *
 * So there is no rewrite. `contractorId` is injected into the where clause
 * and the operation runs as itself. The rewrite was solving a problem that
 * had not existed for two major versions, it required passing a second
 * argument to Prisma's `query` callback — which takes one — and it is what
 * broke the build.
 *
 * WHAT IT DOES NOT COVER
 *
 * Raw SQL. `$queryRaw` and `$executeRaw` bypass the extension entirely
 * because Prisma has no model context to intercept. If raw queries are ever
 * needed on tenant data, that is the moment to consider Postgres row-level
 * security, which enforces at the database and cannot be sidestepped.
 *
 * Seeds also bypass it: each constructs its own `new PrismaClient()`. That is
 * correct — seeds are platform-level and write across tenants — but it means
 * this protects the web application only.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { requireTenant, CrossTenantError } from "./tenantContext";

/**
 * Models that carry `contractorId` TODAY and can therefore be scoped.
 *
 * Deliberately short, and deliberately matched to the schema rather than to
 * intent. Injecting `contractorId` into a model that has no such column
 * produces a Prisma error, so aspiration here would break every query.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  /// Guided Setup progress. Tenant-owned like everything else a contractor
  /// decides — and deliberately holds no readiness, because readiness is
  /// derived from the systems that own each rule.
  "ContractorOnboarding",
  /// Which canonical trade catalogs this contractor is enrolled in.
  "ContractorTrade",
  "Service",
  "ContractorMaterial",
  "ContractorComponent",
  /// ADR-006. A contractor's presentation of a canonical category: their
  /// ordering, grouping, naming and whether they offer it at all.
  "ContractorCategory",
  /// One contractor's statement of policy for a canonical condition. The
  /// homeowner-facing text lives here because it IS policy — whether they
  /// patch, whether they paint, what language they use.
  "ContractorDisclaimer",
  /// One contractor's answer to a canonical policy question — where their
  /// price steps for height or distance, who supplies the equipment. The
  /// template holds the shape of the band; these are the numbers, and they
  /// are commercially specific to this contractor.
  "ContractorPolicyValue",
  /// CONFIGURATION, scoped in an earlier pass and left in PENDING_TENANT_SCOPE
  /// by mistake until 27 August. All five carry contractorId today —
  /// PricingSettings, BusinessHours, ContractorMaterialSettings and
  /// JobberConnection with @unique, ServiceArea with an index.
  ///
  /// Found by a 500, not by reading the list: loadPricingSettings on the
  /// guarded client threw NotYetTenantScopedError and add-to-visit broke. The
  /// list said work remained that had been finished, which is ADR-007a's point
  /// running in the other direction — an inventory overstates as easily as it
  /// understates, and only the schema is authoritative.
  "PricingSettings",
  "BusinessHours",
  "ContractorMaterialSettings",
  "JobberConnection",
  "ServiceArea",
  /// ADR-008, done 27 August. A contractor-owned match cache, keyed on
  /// (contractorId, normalizedText). It was a platform-wide cache with the
  /// phrase alone as the key, which meant one contractor's cached answer
  /// decided every contractor's suggestion.
  "ServiceQuery",
  /// PASS THREE, 27 August. The three ownership ROOTS of the booking flow.
  /// Each carries contractorId because nothing above it can supply one:
  ///
  ///   Visit     no required parent. An OPEN visit legitimately has no line
  ///             items yet (3 such rows live), so it cannot borrow an owner
  ///             from them — and the owner has to be IN the lookup key,
  ///             because sessionId is one browser cookie with no contractor
  ///             dimension.
  ///   Customer  no parents at all, and created BEFORE the Booking or Quote
  ///             that would own it. PII: one homeowner using two contractors
  ///             is two rows, never one shared row.
  ///   Photo     three ALTERNATIVE optional parents, so no single relation
  ///             path exists to derive from. Independently: both write sites
  ///             are nested writes, which extensions never intercept, so the
  ///             owner must be stamped structurally at write time.
  "Visit",
  "Customer",
  "Photo",
  /// Synced from a contractor's Jobber account. Not derived through
  /// JobberConnection: that row is deleted on disconnect, so it is not a
  /// stable parent. Its jobberUserId @unique is global and the crew sync
  /// upserts on it — contractor B's sync would overwrite contractor A's row —
  /// so the compound unique is already in the schema and contract drops the
  /// global one.
  "JobberCrewMember",
]);

/**
 * Models with no tenant dimension, by design.
 *
 * `CanonicalMaterial` is the important one: a material ROLE is platform
 * knowledge shared by every contractor, which is the whole basis of the
 * template library. `Material` is the deprecated pre-split model, awaiting
 * removal in the contract phase.
 */
export const PLATFORM_MODELS = new Set<string>([
  /// ADR-014. The electrical template: trade STRUCTURE shared by every
  /// contractor, carrying no economics and no contractorId.
  ///
  /// Platform, not tenant, and deliberately so — but note what that does NOT
  /// mean. Nothing reads these at request time. Provisioning COPIES structure
  /// into contractor-owned rows and then the template is irrelevant to serving
  /// a storefront; a contractor's live tree never depends on a mutable
  /// template row (that is the whole of ADR-014's Option 1 rejection).
  "TemplateVersion",
  "TemplateService",
  "TemplateQuestion",
  "TemplateAnswerOption",
  "TemplateServiceMaterial",
  "TemplateAnswerOptionComponent",
  /// The template half of the branch-material primitive. Trade knowledge —
  /// which role a physical branch consumes — carrying no money and no
  /// contractor, exactly like TemplateServiceMaterial beside it.
  "TemplateAnswerOptionMaterial",
  "TemplateAnswerOptionDisclaimer",
  "TemplateAnswerOptionPhotoGroup",
  "Contractor",
  "CanonicalMaterial",
  /// A component ROLE is trade knowledge shared by every contractor — the
  /// same basis as CanonicalMaterial. Its economics live on
  /// ContractorComponent, which is tenant-scoped.
  "CanonicalComponent",
  /// v1.1 §1.1 — what a component role physically consumes. Trade knowledge,
  /// carrying no money and no contractor. The cost of those materials is
  /// tenant-owned and lives on ContractorMaterial.
  "CanonicalComponentMaterial",
  /// ADR-020. An early-access request from the public marketing site.
  ///
  /// Platform because a lead is NOT a tenant. There is no contractorId to
  /// scope by — the person who filled the form in has no contractor here, and
  /// inventing an association to give the row a home would turn an
  /// unauthenticated public POST into a write inside somebody's tenant. It is
  /// written by /api/early-access and read only by an operator.
  "EarlyAccessRequest",
  "ZipCode",
  /// ADR §2.2 — public storefront identity mapped to one contractor.
  ///
  /// PLATFORM BY NECESSITY, not by convenience. This is what ESTABLISHES
  /// tenant context, so requiring context to read it would be circular: a
  /// request could never open the context it needs in order to discover which
  /// context to open.
  ///
  /// Safe because it is routing data. It holds no customer data, no pricing
  /// and no catalog — only the mapping from a public identity to a
  /// contractorId, which is the one fact a storefront request must learn
  /// before it is allowed to learn anything else.
  "ContractorSite",
  /// Photo requirements are trade and SAFETY knowledge, not contractor policy
  /// — "for this electrical condition these photos are useful, and don't
  /// remove the panel dead front" is true for every electrician. The six rows
  /// are reusable electrical concepts and carry no economics and no scope
  /// policy.
  ///
  /// Deliberately NOT split. If a contractor later wants different labels or
  /// extra photos, an override layer is additive and costs nothing to add
  /// then; building one now would be architecture for a requirement that does
  /// not exist. Contrast CanonicalDisclaimer, where the text IS contractor
  /// policy.
  "PhotoGroup",
  /// A category ROLE is trade knowledge shared by every contractor — ADR-006,
  /// the same basis as CanonicalMaterial and CanonicalComponent. Ordering,
  /// naming and visibility live on ContractorCategory, which is tenant-scoped.
  "CanonicalCategory",
  /// The reusable CONDITION a disclaimer applies to — trade knowledge. Carries
  /// no homeowner-facing text; that is contractor policy on
  /// ContractorDisclaimer.
  "CanonicalDisclaimer",

]);

/**
 * Models awaiting removal in the contract phase.
 *
 * SEPARATE FROM PLATFORM_MODELS ON PURPOSE. Both pass through the guard, so
 * this changes no runtime behavior — but "shared trade knowledge" and "dead
 * structure we have not deleted yet" are not the same thing, and one set
 * holding both meanings makes every future question about it ambiguous.
 *
 * It matters concretely: scripts/audit-platform-tenant-relations.ts watches
 * relation names hanging off platform parents, and a deprecated model's
 * relations are not real query paths. PricingRule.service made the extremely
 * common field name `service` a watched name and produced eighteen false
 * findings the moment it was classified.
 *
 * Nothing here is a tenant-scope target. No columns, no guard rules, no
 * migration code, no tests — unless a live dependency reappears.
 */
export const DEPRECATED_MODELS = new Set<string>([
  /// Pre-split, superseded by CanonicalMaterial + ContractorMaterial.
  "Material",
  /// Pre-split, superseded by CanonicalComponent + ContractorComponent.
  "JobComponent",
  /// ADR-006 superseded the plan to tenant-scope this. CanonicalCategory
  /// carries identity, ContractorCategory carries presentation, and no
  /// operational read treats this as the source of truth. The only remaining
  /// write derives Service.categoryId, NOT NULL until contract.
  "ServiceCategory",
  /// ADR-009/010. Zero rows, and the only references anywhere are the delete
  /// statements in the isolation test's own cleanup.
  "PricingRule",
]);

/**
 * Models that SHOULD be tenant-scoped and have no `contractorId` column yet.
 *
 * These throw rather than passing through. It would be easy to let them run
 * unscoped until the schema catches up — and that is exactly how a leak ships
 * quietly. A loud failure keeps the remaining work visible, and this list is
 * the to-do list for the tenant schema work.
 *
 * EMPTYING THIS LIST DOES NOT MEAN TENANCY IS DONE — ADR-007a.
 *
 * It is an inventory and a tripwire, not proof of isolation. It throws on a
 * DIRECT query and is silent on nested reads and nested writes, so a
 * platform-parent -> tenant-child traversal crosses the boundary without ever
 * reaching this classification. That was measured, not feared: from a
 * throwaway contractor's context the live harness read 5 of Elite's contractor
 * components through a platform root while every model here was classified
 * correctly.
 *
 * Note also that `withTenantGuard` is called in exactly ONE place in this
 * repository — scripts/verify-tenant-isolation-live.ts. No application code
 * uses a guarded client, so today this list monitors a test rather than the
 * application.
 *
 * Completion is nine conditions, listed in ADR-007a. This list is one of them.
 */
export const PENDING_TENANT_SCOPE = new Set<string>([
  "MaterialSupplierLink",
  "MaterialCostEvent",
  "ConditionalDisclaimer",
  "TroubleshootingSession",
]);

/**
 * Models whose owner is DERIVED through a required parent chain — ADR-010.
 *
 * A third class, deliberately, alongside direct-tenant and platform. These are
 * tenant-owned; they simply do not carry the column.
 *
 * WHY NOT JUST ADD contractorId
 *
 * `Question.contractorId` would duplicate `Question.serviceId ->
 * Service.contractorId`, and a duplicate can disagree with the thing it
 * duplicates. The same is true recursively for AnswerOption and the joins. The
 * parent relationship is the single source of truth for ownership, so the
 * guard reads it rather than a copy of it.
 *
 * That also avoids self-inflicting the cross-tenant pair problem: every
 * denormalized contractorId is a second column that must be proven to agree
 * with the first, by a hand-written check per model, forever.
 *
 * WHAT THE VALUE IS
 *
 * The relation path from the model to the owner. The guard turns
 * `["question", "service"]` into
 * `{ question: { service: { contractorId } } }`.
 *
 * NOT PLATFORM MODELS. Lacking a scalar contractorId is not the same as being
 * shared knowledge, and classifying them platform would wave every query
 * through unscoped.
 *
 * PricingRule is deliberately absent: zero rows, no live reads or writes, and
 * a contract-phase drop candidate. Dead models do not get guard rules.
 */
export const DERIVED_TENANT_MODELS = new Map<string, readonly string[]>([
  ["Question", ["service"]],
  ["ServiceMaterial", ["service"]],
  ["AnswerOption", ["question", "service"]],
  ["QuestionDisclaimer", ["question", "service"]],
  ["AnswerOptionComponent", ["answerOption", "question", "service"]],
  /// Same owner path as the component join it mirrors: a branch material has
  /// no contractorId of its own and takes one from the tree it hangs in.
  ["AnswerOptionMaterial", ["answerOption", "question", "service"]],
  ["AnswerOptionPhotoGroup", ["answerOption", "question", "service"]],
  ["AnswerOptionDisclaimer", ["answerOption", "question", "service"]],
  /// PASS THREE, 27 August. The booking flow's derived models.
  ///
  /// LineItem and Booking derive through Visit rather than through Service.
  /// Both also carry a serviceId/customerId that resolves to a contractor,
  /// but those are SECONDARY REFERENCES, not competing owners. Deriving from
  /// Visit keeps "does this service belong to my visit's contractor?" a real
  /// question; deriving from Service would make it tautological and let a
  /// foreign service silently redefine whose visit it is.
  ["LineItem", ["visit"]],
  ["Booking", ["visit"]],
  /// Quote derives through SERVICE, not visit — and the live data decided it,
  /// not the schema. visitId and lineItemId are both optional AND actually
  /// absent: of two rows, one has no visitId, both have no lineItemId, and
  /// one has neither. serviceId is the only required owner-bearing parent.
  ["Quote", ["service"]],
  /// Was a bare serviceAreaId scalar Prisma could not traverse, which let a
  /// Booking be correctly owned through its Visit while pointing at another
  /// contractor's window. The relation now exists, so the owner is reachable.
  ["ArrivalWindow", ["serviceArea"]],
  /// The pre-work visit workflow, 29 August. Both derive through
  /// Booking -> Visit — the same chain LineItem and Booking already use, and
  /// for the same reason: the visit is what says whose booking it is.
  ["Appointment", ["booking", "visit"]],
  ["PreWorkVisit", ["booking", "visit"]],
  /// The financial ledgers. Same chain, and the reason is sharper here than
  /// anywhere else: a payment row reachable across a tenant boundary is one
  /// contractor able to read what another was paid.
  ["PaymentEvent", ["booking", "visit"]],
  ["BookingAdjustment", ["booking", "visit"]],
]);

/** `["question","service"]` -> `{ question: { service: { contractorId } } }`. */
export function derivedOwnerFilter(
  path: readonly string[],
  contractorId: string
): Record<string, unknown> {
  let node: Record<string, unknown> = { contractorId };
  for (let i = path.length - 1; i >= 0; i--) node = { [path[i]]: node };
  return node;
}

export class UnclassifiedModelError extends Error {}
export class NotYetTenantScopedError extends Error {}
/** A derived-ownership model cannot have an owner stamped onto it. */
export class DerivedCreateError extends Error {}

/**
 * Operations whose `where` must contain a UNIQUE selector.
 *
 * These take a WhereUniqueInput, which requires a unique field at the TOP
 * level. Prisma 5's extendedWhereUnique allows extra scalar filters beside
 * it — but wrapping the whole thing in `AND` moves the unique field down a
 * level and the argument stops being valid:
 *
 *   Argument `where` of type ContractorMaterialWhereUniqueInput needs at
 *   least one of `id`, `activeSupplierLinkId` or
 *   `contractorId_canonicalMaterialId` arguments.
 *
 * So these merge instead. That is safe because a where clause naming a
 * different contractor is refused before we get here — by the time the merge
 * happens, either there is no contractorId or it already matches.
 */
const UNIQUE_WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);

/** Operations taking an ordinary filter, where AND is both valid and safer. */
const FILTER_WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

/**
 * Any `contractorId` value appearing anywhere in a where clause.
 *
 * Used to catch a caller naming a different contractor explicitly. Walks
 * nested objects so a compound unique key — `{ contractorId_canonicalMaterialId:
 * { contractorId, ... } }` — is seen too.
 */
function findContractorIds(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const n of node) findContractorIds(n, found);
    return found;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "contractorId" && typeof v === "string") found.push(v);
    else findContractorIds(v, found);
  }
  return found;
}

/**
 * AND the caller's filter with ours. Used where `where` is a plain filter.
 *
 * ANDing rather than merging means a caller's OR cannot widen past the tenant
 * boundary — `{ OR: [...] }` becomes `(OR ...) AND contractorId` rather than
 * something the OR could escape.
 */
function andScoped(where: unknown, contractorId: string, filter?: Record<string, unknown>) {
  const ours = filter ?? { contractorId };
  return where && typeof where === "object" ? { AND: [where, ours] } : ours;
}

/**
 * Merge our filter into the caller's. Used where `where` must keep a unique
 * field at the top level.
 *
 * Ours is spread last, so it wins on collision. A caller naming a different
 * contractor never reaches this — scopeArgs refuses it first.
 */
function mergeScoped(where: unknown, contractorId: string) {
  return where && typeof where === "object"
    ? { ...(where as object), contractorId }
    : { contractorId };
}

export function classifyModel(model: string): "platform" | "tenant" | "derived" {
  // Deprecated models pass through exactly as platform ones do — they hold no
  // tenant data worth scoping and are awaiting deletion.
  if (PLATFORM_MODELS.has(model) || DEPRECATED_MODELS.has(model)) return "platform";
  if (TENANT_SCOPED_MODELS.has(model)) return "tenant";
  if (DERIVED_TENANT_MODELS.has(model)) return "derived";
  if (PENDING_TENANT_SCOPE.has(model)) {
    throw new NotYetTenantScopedError(
      `Model "${model}" has no contractorId column yet, so it cannot be ` +
        `isolated. Add the column and move it to TENANT_SCOPED_MODELS before ` +
        `querying it through the guarded client.`
    );
  }
  throw new UnclassifiedModelError(
    `Model "${model}" is in none of TENANT_SCOPED_MODELS, PLATFORM_MODELS or ` +
      `PENDING_TENANT_SCOPE. Classify it in lib/tenantGuard.ts before use.`
  );
}

/**
 * The scoping decision, pure and exported so the tests run the real thing.
 *
 * The previous version's tests reimplemented this logic, which is why they
 * passed while the mechanism was broken. A test that mirrors its subject
 * drifts away from it.
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: Record<string, unknown>,
  contractorId: string
): Record<string, unknown> {
  const a = args ?? {};

  // ---- derived ownership, ADR-010 ---------------------------------------
  //
  // The filter is a relation path rather than a scalar, so `create` cannot be
  // stamped — there is no column to stamp. A direct create must instead PROVE
  // its parent belongs to this contractor, and the extension has no client to
  // check that with, so it refuses rather than guessing.
  //
  // This is not a limitation being worked around. A create that invented an
  // owner would be the denormalization this class exists to avoid, arriving
  // through the back door.
  //
  // Nested creates beneath an already-scoped parent are unaffected: Prisma
  // never fires the extension for them, and ownership is structural.
  const derivedPath = DERIVED_TENANT_MODELS.get(model);
  if (derivedPath) {
    const owner = derivedOwnerFilter(derivedPath, contractorId);

    if (UNIQUE_WHERE_OPS.has(operation)) {
      // Merged, not ANDed: the unique field must stay at the TOP level or the
      // argument stops being a valid WhereUniqueInput. Same reason as the
      // scalar case below.
      return { ...a, where: { ...((a.where as object) ?? {}), ...owner } };
    }
    if (FILTER_WHERE_OPS.has(operation)) {
      return { ...a, where: andScoped(a.where, contractorId, owner) };
    }
    if (operation === "create" || operation === "createMany" ||
        operation === "createManyAndReturn" || operation === "upsert") {
      throw new DerivedCreateError(
        `${model}.${operation} cannot be scoped: ${model} derives its owner ` +
          `through ${derivedPath.join(".")}, so there is no contractorId to ` +
          `stamp. Create it through its parent, or validate the parent ` +
          `belongs to this contractor and use the unguarded client.`
      );
    }
    throw new UnclassifiedModelError(
      `Operation "${operation}" on derived model "${model}" is not handled.`
    );
  }

  // Naming another contractor explicitly is refused outright rather than
  // quietly ANDed into an impossible query. The caller has done something
  // deliberate and should be told, not silently given nothing.
  for (const named of findContractorIds(a.where)) {
    if (named !== contractorId) {
      throw new CrossTenantError(
        `${model}.${operation} filtered on contractor ${named} while the ` +
          `current context is ${contractorId}`
      );
    }
  }

  if (UNIQUE_WHERE_OPS.has(operation)) {
    return { ...a, where: mergeScoped(a.where, contractorId) };
  }

  if (FILTER_WHERE_OPS.has(operation)) {
    return { ...a, where: andScoped(a.where, contractorId) };
  }

  if (operation === "create") {
    return { ...a, data: { ...((a.data as object) ?? {}), contractorId } };
  }

  if (operation === "createMany" || operation === "createManyAndReturn") {
    const data = a.data;
    return {
      ...a,
      data: Array.isArray(data)
        ? data.map((d) => ({ ...(d as object), contractorId }))
        : { ...((data as object) ?? {}), contractorId },
    };
  }

  if (operation === "upsert") {
    // Unique where, so merge — same reason as UNIQUE_WHERE_OPS above.
    return {
      ...a,
      where: mergeScoped(a.where, contractorId),
      create: { ...((a.create as object) ?? {}), contractorId },
    };
  }

  throw new UnclassifiedModelError(
    `Operation "${operation}" on "${model}" is not handled by the tenant ` +
      `guard. Add it to lib/tenantGuard.ts rather than letting it run unscoped.`
  );
}

/**
 * The extension itself.
 *
 * Defined at module scope with `Prisma.defineExtension`, which is the shape
 * `$extends` actually accepts. An earlier version declared the parameter as
 * `{ $extends: (ext: unknown) => unknown }` — an invented shape. Prisma's
 * `$extends` takes a specific extension type, and a function accepting a
 * specific type is not assignable to one accepting `unknown`, because
 * parameters are contravariant. That is the fourth type error this file has
 * produced, and the fix is to stop describing Prisma's API and use it.
 */
export const tenantGuardExtension = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // WHY THE CAST
        //
        // With $allModels + $allOperations, Prisma types this callback's
        // parameters as a union across every (model, operation) pair.
        // TypeScript calls a union of function types by intersecting their
        // parameters, and when those object types are mutually incompatible
        // the intersection collapses to `never` — so `query` is not callable
        // at any arity. That is the "Type 'never' has no call signatures"
        // error, and it is a limitation of union-of-function-types rather
        // than a sign the call is wrong.
        //
        // The runtime contract is exactly `query(args)`.
        const run = query as (a: unknown) => Promise<unknown>;

        // No model means a raw or client-level call. Nothing to scope, and
        // nothing this can protect — see the note at the top.
        if (!model) return run(args);

        // Throws for pending and unclassified models; "derived" and "tenant"
        // both continue to scopeArgs, which knows the difference.
        if (classifyModel(model) === "platform") return run(args);

        const { contractorId } = requireTenant(
          `${model}.${operation} ran outside a contractor context`
        );

        return run(
          scopeArgs(
            model,
            operation,
            (args ?? {}) as Record<string, unknown>,
            contractorId
          )
        );
      },
    },
  },
});

/**
 * Wrap a client so every tenant-scoped query is filtered.
 *
 *   const guarded = withTenantGuard(new PrismaClient());
 *
 * Deliberately a factory rather than a mutation of `lib/prisma.ts`. Attaching
 * this to the application client today would break every page, because
 * nothing opens a tenant context yet — the guard would throw on the first
 * query. Adoption is per-route, after the context exists.
 */
export function withTenantGuard(client: PrismaClient) {
  return client.$extends(tenantGuardExtension);
}
