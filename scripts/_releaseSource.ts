/**
 * What the CURRENT production deployment is, read from the API's own response.
 *
 * This file once also held an origin-trust apparatus — verifiedOrigin,
 * ORIGIN_TRUST_BASIS, basisCovers, ORIGIN_DECISION_FIELDS, BuildEvidence,
 * evidenceRefusal, resolveEffectiveBuildCommand — which decided whether a
 * deployment's record could be believed about its own origin. That design is
 * gone. An origin-trust observation established that every origin-bearing field
 * on a deployment record is writable by the caller that creates it, so no
 * amount of reading a record establishes where it came from. The release
 * CREATES the deployment and keeps the id from its own request instead.
 *
 * What remains is the one thing that was never about attestation: reading the
 * incumbent production deployment, so a rollback target exists.
 */

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

export type CurrentProduction = {
  deploymentId: string;
  aliases: readonly string[];
  readyState: string;
};

export type CurrentProductionResult =
  | { ok: true; current: CurrentProduction }
  | { ok: false; reason: "unreadable" | "malformed"; detail: string };

/**
 * Validate the API's ACTUAL response before any trusted value exists.
 *
 * The earlier version took an already-constructed `{ok:true, ...}` and inspected
 * its discriminant, so `{ok:true, deploymentId:"", aliases:[], readyState:"ERROR"}`
 * passed — the caller had already asserted the thing being checked. Validation
 * has to happen where the untrusted data enters.
 *
 * FAILS CLOSED. An unreadable current production is never "no current
 * production": that conflation makes a broken API call indistinguishable from a
 * first deploy, and it is the difference between a rollback target and none.
 */
export function parseCurrentProduction(
  raw: unknown,
  fetchError?: unknown
): CurrentProductionResult {
  if (fetchError) return { ok: false, reason: "unreadable", detail: String(fetchError).slice(0, 200) };
  if (typeof raw !== "object" || raw === null)
    return { ok: false, reason: "unreadable", detail: "no response body" };

  const d = raw as Record<string, unknown>;
  const id = str(d.uid) ?? str(d.id) ?? str(d.deploymentId);
  if (!id) return { ok: false, reason: "malformed", detail: "no deployment id" };

  const rs = str(d.readyState) ?? str(d.state);
  if (!rs) return { ok: false, reason: "malformed", detail: "no readyState" };
  if (rs !== "READY")
    return { ok: false, reason: "malformed", detail: `current production is ${rs}, not READY` };

  const rawAliases = d.alias ?? d.aliases;
  if (!Array.isArray(rawAliases) || rawAliases.length === 0)
    return { ok: false, reason: "malformed", detail: "no aliases on current production" };
  const aliases = rawAliases.map(str).filter((a): a is string => a !== null);
  if (aliases.length !== rawAliases.length)
    return { ok: false, reason: "malformed", detail: "alias list contains empty or non-string entries" };

  return { ok: true, current: { deploymentId: id, aliases, readyState: rs } };
}
