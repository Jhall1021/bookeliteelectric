/**
 * Which DATABASE is this, really — by lineage, not by hostname.
 *
 * WHY THE HOSTNAME GUARD FAILED
 *
 * scripts/contract-branch-rehearsal.sh refused a rehearsal target whose URL
 * contained `ep-icy-hill-axkgrsjb`. That endpoint stopped being production on
 * 28 August 2026. From that day the guard protected nothing: it accepted any
 * host that merely was not the OLD one, including current production.
 *
 * A denylist of one hostname is not a safety property. It answers "is this the
 * database I was worried about last month", when the question is "is this
 * safe to destroy".
 *
 * WHAT REPLACES IT
 *
 * Neon's `system_identifier` is IDENTICAL across every branch of a project and
 * differs between projects — measured, not assumed, in
 * scripts/verify-database-identity.ts. So it names the LINEAGE: which family
 * of databases this belongs to.
 *
 *   production lineage  7679066014247993703
 *   archive lineage     7674717396095314125   (BookElite, frozen)
 *
 * That alone is not enough, because a branch of production shares production's
 * lineage — which is exactly what a rehearsal target should be. The second
 * fact separates them: the DatabaseIdentity marker records the endpoint it was
 * STAMPED for, and branch data carries the marker unchanged. So a database
 * whose marker names the endpoint we are connected to IS the stamped original;
 * one whose marker names a different endpoint is a copy of it.
 *
 *   right lineage + marker endpoint MATCHES connected   ->  the original. REFUSE.
 *   right lineage + marker endpoint DIFFERS             ->  a branch. ACCEPT.
 *   archive lineage                                      ->  REFUSE.
 *   no marker, or unreadable                             ->  REFUSE.
 *
 * THE CONSTANTS BELOW ARE A TRIPWIRE, NOT THE AUTHORITY.
 *
 * Hardcoding a lineage is the same mistake as hardcoding a hostname, one level
 * up. So production's lineage is MEASURED from DATABASE_URL at run time, and
 * the frozen constant is checked against that measurement. If the world moves
 * — a re-branch, a migration, a new project — the mismatch is reported and
 * everything refuses, rather than a stale constant quietly approving the wrong
 * database. Fail closed, loudly.
 */
import { PrismaClient } from "@prisma/client";

/** Frozen 1 September 2026. Tripwires — see the note above. */
export const PRODUCTION_LINEAGE = "7679066014247993703";
export const ARCHIVE_LINEAGE = "7674717396095314125";

/** The endpoint actually connected to. `-pooler` is the same endpoint. */
export function endpointOf(url: string): string {
  return new URL(url).hostname.replace("-pooler", "").split(".")[0];
}

export type Probe = {
  endpoint: string;
  /** Neon's per-project identifier. Null when it could not be read. */
  lineage: string | null;
  /** DatabaseIdentity.key, or null when the database carries no marker. */
  markerKey: string | null;
  /** The endpoint the marker was stamped for. */
  markerEndpoint: string | null;
};

export async function probe(url: string): Promise<Probe> {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const out: Probe = { endpoint: endpointOf(url), lineage: null, markerKey: null, markerEndpoint: null };
  try {
    const r = await db.$queryRawUnsafe<{ id: string }[]>(
      "select system_identifier::text as id from pg_control_system()");
    out.lineage = r[0]?.id ?? null;
  } catch { /* left null; the caller refuses on null */ }
  try {
    const r = await db.$queryRawUnsafe<{ key: string; neonEndpoint: string }[]>(
      'select key, "neonEndpoint" from database_identity limit 1');
    if (r.length) { out.markerKey = r[0].key; out.markerEndpoint = r[0].neonEndpoint; }
  } catch { /* left null; the caller refuses on null */ }
  await db.$disconnect();
  return out;
}

export type Verdict =
  | { ok: true; reason: string; probe: Probe }
  | { ok: false; code: string; reason: string; probe: Probe };

/**
 * Is this URL safe to use as a DESTRUCTIVE rehearsal target?
 *
 * Positive test throughout. Nothing is accepted for failing to match a
 * denylist; a target is accepted only once it has been shown to be a branch of
 * the current production lineage.
 */
export async function classifyRehearsalTarget(
  targetUrl: string,
  productionUrl: string | undefined
): Promise<Verdict> {
  const p = await probe(targetUrl);

  if (!productionUrl)
    return { ok: false, code: "NO_PRODUCTION_REFERENCE", probe: p,
      reason: "DATABASE_URL is not set, so production's lineage cannot be measured." };

  // Measure production rather than trusting the constant.
  const prod = await probe(productionUrl);
  if (!prod.lineage)
    return { ok: false, code: "PRODUCTION_UNREADABLE", probe: p,
      reason: "Could not read production's lineage, so no target can be judged against it." };
  if (prod.lineage !== PRODUCTION_LINEAGE)
    return { ok: false, code: "STALE_LINEAGE_CONSTANT", probe: p,
      reason: `DATABASE_URL's lineage is ${prod.lineage}, but PRODUCTION_LINEAGE says ${PRODUCTION_LINEAGE}. ` +
        `Production moved, or DATABASE_URL is not production. Refusing everything until scripts/_lineage.ts is updated deliberately.` };

  if (!p.lineage)
    return { ok: false, code: "UNREADABLE", probe: p,
      reason: `Could not read the lineage of ${p.endpoint}. An unidentified database is never a rehearsal target.` };
  if (p.lineage === ARCHIVE_LINEAGE)
    return { ok: false, code: "ARCHIVE_LINEAGE", probe: p,
      reason: `${p.endpoint} is in the BookElite archive lineage (${ARCHIVE_LINEAGE}). The archive is frozen and must not be written to.` };
  if (p.lineage !== prod.lineage)
    return { ok: false, code: "FOREIGN_LINEAGE", probe: p,
      reason: `${p.endpoint} has lineage ${p.lineage}, which is neither production (${prod.lineage}) nor a known archive. ` +
        `A rehearsal must mirror production, so an unrelated database is refused rather than guessed at.` };

  if (!p.markerKey)
    return { ok: false, code: "NO_MARKER", probe: p,
      reason: `${p.endpoint} carries no DatabaseIdentity marker. A branch of production inherits one; its absence means this is not that.` };

  // The original, not a branch of it. The marker was stamped for this endpoint.
  if (p.markerEndpoint === p.endpoint)
    return { ok: false, code: "IS_THE_ORIGINAL", probe: p,
      reason: `${p.endpoint} is the database the "${p.markerKey}" marker was stamped for — this IS that database, not a branch of it.` };

  return { ok: true, probe: p,
    reason: `${p.endpoint} is a branch of "${p.markerKey}" (stamped for ${p.markerEndpoint}), production lineage ${p.lineage}.` };
}
