/**
 * A contractor's whole resolution catalog, in a bounded number of queries.
 *
 * loadServiceForResolution reads one service at a time — about 7.4 statements
 * each: an owner read, one SELECT per non-empty level of the tree, the
 * contractor's own components, their material costs and a troubleshooting
 * lookup. Readiness and catalog promises called it once per service, which on
 * a 79-service catalog was ~1,000 statements and 18 seconds of round trips.
 *
 * Every service's tree has the same shape, so the same include over the
 * contractor's services costs about as many statements as a SINGLE service:
 * Prisma loads each relation level once, with `IN (…)` across every parent. The
 * per-contractor reads that were repeated per service run once, and are sliced
 * back out per service. On Elite's catalog: 573 statements -> 18.
 *
 * SAME SHAPE BY CONSTRUCTION. Both loaders read RESOLUTION_TREE_INCLUDE from
 * lib/serviceTreeQuery.ts, and questions come back in QUESTION_ORDER. Each
 * service is assembled exactly as loadServiceForResolution returns it, and
 * scripts/verify-catalog-resolution-equivalence.ts compares the two loaders —
 * trees, price promises and every answer path's resolved result — so they
 * cannot drift apart silently.
 *
 * TENANT SCOPE. Every query here names contractorId explicitly; relations are
 * reached only through that contractor's own services.
 *
 * REQUEST-LOCAL. The returned Map is a plain value owned by the caller and
 * dropped with the request. Nothing is memoized across calls, so there is
 * nothing to invalidate.
 *
 * The single-service loader is untouched and still serves the customer quote
 * and visit routes and the activation guard.
 */
import type { PrismaClient } from "@prisma/client";
import { RESOLUTION_TREE_INCLUDE, type ResolvedServiceTree, type ServiceTree } from "./serviceTreeQuery";
import { loadOwnComponents, canonicalComponentIdsIn, type OwnComponent } from "./contractorComponents";
import { findTroubleshootingService } from "./troubleshooting";
import { mapWithConcurrency } from "./concurrency";

export type ResolvedCatalog = ReadonlyMap<string, ResolvedServiceTree>;

/** At most this many troubleshooting lookups at once — one per routing trade. */
const TROUBLESHOOTING_LOOKUP_CONCURRENCY = 5;

const materialRoleIdsOf = (service: ServiceTree): string[] => [
  ...new Set(
    service.questions.flatMap((q) =>
      q.options.flatMap((o) =>
        o.components.flatMap((c) => (c.canonicalComponent?.materials ?? []).map((m) => m.canonicalMaterialId)),
      ),
    ),
  ),
];

const routesToTroubleshooting = (service: ServiceTree) =>
  service.questions.some((q) => q.options.some((o) => o.routeAction === "REROUTE_TROUBLESHOOTING"));

export async function loadCatalogForResolution(db: PrismaClient, contractorId: string): Promise<ResolvedCatalog> {
  if (!contractorId) throw new Error("loadCatalogForResolution called with no contractor — cannot resolve anything.");

  // Every service with its full tree.
  const services = await db.service.findMany({ where: { contractorId }, include: RESOLUTION_TREE_INCLUDE });

  // The contractor's own figures for the union of ids — two independent reads.
  const componentIds = [...new Set(services.flatMap((s) => canonicalComponentIdsIn(s)))];
  const roleIds = [...new Set(services.flatMap(materialRoleIdsOf))];
  const [ownAll, materialRows] = await Promise.all([
    loadOwnComponents(db as never, contractorId, componentIds),
    roleIds.length
      ? db.contractorMaterial.findMany({
          where: { contractorId, canonicalMaterialId: { in: roleIds }, active: true },
          select: { canonicalMaterialId: true, unitCostCents: true },
        })
      : Promise.resolve([] as { canonicalMaterialId: string; unitCostCents: number }[]),
  ]);
  const costAll = new Map(materialRows.map((m) => [m.canonicalMaterialId, m.unitCostCents]));

  // One troubleshooting lookup per trade that actually routes there.
  const trades = [...new Set(services.filter(routesToTroubleshooting).map((s) => s.tradeKey).filter((t): t is string => !!t))];
  const lookups = await mapWithConcurrency(trades, TROUBLESHOOTING_LOOKUP_CONCURRENCY, (t) =>
    findTroubleshootingService(db, contractorId, t),
  );
  const troubleshooting = new Map(trades.map((t, i) => [t, lookups[i]]));

  // Assemble each service exactly as loadServiceForResolution returns it.
  const out = new Map<string, ResolvedServiceTree>();
  for (const s of services) {
    const ownComponents = new Map<string, OwnComponent>();
    for (const id of new Set(canonicalComponentIdsIn(s))) {
      const hit = ownAll.get(id);
      if (hit) ownComponents.set(id, hit);
    }
    const ownMaterialCosts = new Map<string, number>();
    for (const id of materialRoleIdsOf(s)) {
      const cost = costAll.get(id);
      if (cost !== undefined) ownMaterialCosts.set(id, cost);
    }
    let troubleshootingServiceId: string | null = null;
    let troubleshootingProblem: string | null = null;
    if (routesToTroubleshooting(s)) {
      if (!s.tradeKey) {
        troubleshootingProblem = `${s.slug} has no tradeKey, so its diagnostic destination is not resolvable`;
      } else {
        const found = troubleshooting.get(s.tradeKey)!;
        if (found.ok) troubleshootingServiceId = found.service.id;
        else troubleshootingProblem = found.problem;
      }
    }
    out.set(s.id, { ...s, ownComponents, ownMaterialCosts, troubleshootingServiceId, troubleshootingProblem });
  }
  return out;
}

/**
 * One request's catalog: loaded at most once, and only if a reader asks for it.
 *
 * A page that runs both assessOnboarding and catalogPromises passes the same
 * loader to each. Whichever needs the trees first starts the one read; the
 * other reuses it, even when both run at once. A contractor with no pricing
 * settings needs no trees, so neither reader asks and nothing is read — as
 * before. The loader belongs to the request and is dropped with it.
 */
export function requestCatalog(db: PrismaClient, contractorId: string): () => Promise<ResolvedCatalog> {
  let pending: Promise<ResolvedCatalog> | null = null;
  return () => (pending ??= loadCatalogForResolution(db, contractorId));
}
