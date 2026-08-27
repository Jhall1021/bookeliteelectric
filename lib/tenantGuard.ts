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
  "Service",
  "ContractorMaterial",
  "ContractorComponent",
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
  "Contractor",
  "CanonicalMaterial",
  /// A component ROLE is trade knowledge shared by every contractor — the
  /// same basis as CanonicalMaterial. Its economics live on
  /// ContractorComponent, which is tenant-scoped.
  "CanonicalComponent",
  "ZipCode",
  /// Deprecated pre-split models, awaiting removal in the contract phase.
  "Material",
  "JobComponent",
]);

/**
 * Models that SHOULD be tenant-scoped and have no `contractorId` column yet.
 *
 * These throw rather than passing through. It would be easy to let them run
 * unscoped until the schema catches up — and that is exactly how a leak ships
 * quietly. A loud failure keeps the remaining work visible, and this list is
 * the to-do list for the tenant schema work.
 */
export const PENDING_TENANT_SCOPE = new Set<string>([
  "ServiceCategory",
  "ServiceQuery",
  "BusinessHours",
  "MaterialSupplierLink",
  "MaterialCostEvent",
  "ContractorMaterialSettings",
  "ServiceMaterial",
  "PhotoGroup",
  "AnswerOptionPhotoGroup",
  "ConditionalDisclaimer",
  "QuestionDisclaimer",
  "AnswerOptionDisclaimer",
  "AnswerOptionComponent",
  "Question",
  "AnswerOption",
  "PricingRule",
  "Customer",
  "Visit",
  "LineItem",
  "Booking",
  "Quote",
  "Photo",
  "ServiceArea",
  "ArrivalWindow",
  "TroubleshootingSession",
  "PricingSettings",
  "JobberConnection",
  "JobberCrewMember",
]);

export class UnclassifiedModelError extends Error {}
export class NotYetTenantScopedError extends Error {}

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
function andScoped(where: unknown, contractorId: string) {
  return where && typeof where === "object"
    ? { AND: [where, { contractorId }] }
    : { contractorId };
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

export function classifyModel(model: string): "platform" | "tenant" {
  if (PLATFORM_MODELS.has(model)) return "platform";
  if (TENANT_SCOPED_MODELS.has(model)) return "tenant";
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
