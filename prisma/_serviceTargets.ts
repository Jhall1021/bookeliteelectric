/**
 * WHICH CONTRACTOR'S COPY.
 *
 * A slug is not an identity. Four contractors own a service called
 * `new-120v-outlet`, and `findFirst({ where: { slug } })` returns whichever
 * one Postgres reaches first — with no ordering, that is undefined behaviour
 * dressed up as a lookup.
 *
 * It cost a whole round of work. The Routing V2 outlet migration and its
 * acceptance suite both resolved the service that way, both landed on
 * BrightPath's copy rather than Elite's, and the suite then reported
 * BrightPath's empty economics as a Routing V2 blocker. Elite's outlet — the
 * one carrying the actual V1 assembly the migration exists to retire — was
 * never touched. Every structural proof in that run was sound and every
 * conclusion drawn from it was about the wrong tenant.
 *
 * The same shape had already been paid for twice elsewhere in this codebase:
 * `recomputeServicesUsingRole` takes named arguments and checks that both ids
 * resolve, because two positional cuids matched nothing and read as "no
 * service uses this role"; `eliteContractorId` throws rather than inventing a
 * contractor, because a singleton lookup quietly builds a second tenant.
 *
 * So there is no function here that takes a slug alone. Every lookup names a
 * contractor, and every lookup that expects one row PROVES it found one row —
 * a second copy is an error, not a coin toss.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { eliteContractorId } from "./_componentHelpers";

type Db = PrismaClient | Prisma.TransactionClient;

export class ServiceTargetError extends Error {}

export type ServiceTarget = {
  id: string;
  slug: string;
  contractorId: string;
  contractorSlug: string;
};

const SELECT = {
  id: true,
  slug: true,
  contractorId: true,
  contractor: { select: { slug: true } },
} as const;

type Row = {
  id: string;
  slug: string;
  contractorId: string | null;
  contractor: { slug: string } | null;
};

function toTarget(r: Row): ServiceTarget {
  if (!r.contractorId || !r.contractor) {
    // A service with no owner cannot be targeted, for the same reason it
    // cannot have its material costs resolved: there is nobody to resolve it
    // against. Fail rather than reach for "the only contractor".
    throw new ServiceTargetError(
      `Service ${r.slug} (${r.id}) has no contractor. Run ` +
        `prisma/backfill-service-contractor-2026-08-25.ts.`
    );
  }
  return { id: r.id, slug: r.slug, contractorId: r.contractorId, contractorSlug: r.contractor.slug };
}

/**
 * One named contractor's copy of a slug.
 *
 * Throws when there is no copy AND when there is more than one. The second
 * case should be impossible — but "should be impossible" is exactly what the
 * unscoped lookup was relying on, so it is checked rather than assumed.
 */
export async function serviceFor(
  db: Db,
  contractorId: string,
  slug: string
): Promise<ServiceTarget> {
  const rows = (await db.service.findMany({
    where: { contractorId, slug },
    select: SELECT,
  })) as Row[];

  if (rows.length === 0) {
    // TENANT-SCOPE-EXEMPT: naming who DOES own the slug is the whole value of
    // this error message — it is what turns "not found" into "you meant Elite".
    const owners = (await db.service.findMany({
      where: { slug },
      select: { contractor: { select: { slug: true } } },
    })) as { contractor: { slug: string } | null }[];
    const names = owners.map((o) => o.contractor?.slug ?? "(unowned)").sort();
    throw new ServiceTargetError(
      `No service "${slug}" for contractor ${contractorId}. ` +
        (names.length
          ? `That slug belongs to: ${names.join(", ")}.`
          : `No contractor has that slug.`)
    );
  }
  if (rows.length > 1) {
    throw new ServiceTargetError(
      `Contractor ${contractorId} has ${rows.length} services with slug "${slug}" ` +
        `(${rows.map((r) => r.id).join(", ")}). A slug is unique per contractor; ` +
        `this is a data defect and must not be resolved by picking one.`
    );
  }
  return toTarget(rows[0]);
}

/**
 * Elite's copy.
 *
 * Elite is the proving tenant: the only contractor carrying real component
 * economics, and the one whose catalog these seeds have always described.
 * Routing V2's real-service proofs run here, and say so in their own source
 * rather than discovering it at runtime.
 */
export async function eliteService(db: PrismaClient, slug: string): Promise<ServiceTarget> {
  return serviceFor(db, await eliteContractorId(db), slug);
}

/**
 * Every contractor's copy, ordered by contractor slug.
 *
 * For an estate-wide migration, where operating on all of them is the point.
 * Ordered so two runs agree, and non-empty so a migration that matches nothing
 * fails instead of reporting success over an empty list — the failure mode
 * `recomputeServicesUsingRole` was built to prevent.
 */
export async function everyServiceNamed(db: Db, slug: string): Promise<ServiceTarget[]> {
  // TENANT-SCOPE-EXEMPT: enumerating every contractor's copy is this
  // function's entire purpose, and the result is a LIST — there is no single
  // row to pick wrongly.
  const rows = (await db.service.findMany({
    where: { slug },
    select: SELECT,
    orderBy: { contractor: { slug: "asc" } },
  })) as Row[];
  if (rows.length === 0) {
    throw new ServiceTargetError(`No contractor has a service with slug "${slug}".`);
  }
  return rows.map(toTarget);
}

/**
 * Contractors that exist ONLY to rehearse a configuration.
 *
 * Suites that assert about SEEDED state — "no Routing V2 component has labor",
 * "nothing was invented" — are making a claim about what provisioning
 * produces, not about every row in the database. A rehearsal fixture whose
 * whole purpose is to hold a deliberate configuration is not a
 * counter-example to that claim, and letting it read as one would push the
 * next person to weaken the assertion instead of scoping it.
 *
 * Excluding them is therefore narrowing the claim to what it always meant, not
 * making it easier to pass.
 */
export const REHEARSAL_FIXTURE_SLUGS = [
  "rv2-rehearsal-surface-system",
  "rv2-lifecycle-derived-pricing",
  "rv2-onboarding-pilot",
];
