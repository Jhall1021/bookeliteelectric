/**
 * The ONE shared comparison both `verify-remote-launch-readiness.ts` and
 * `verify-integration-manual-routing-storefront-browser-flow.ts` use to
 * decide whether a deployed candidate (`app/api/deployment-identity`'s own
 * response) is genuinely the verified target — replacing two separate,
 * previously-diverging copies.
 *
 * NORMALIZATION, ONE RULE FOR BOTH SIDES. `app/api/deployment-identity`
 * reports the RAW `URL.host` (port included, `-pooler` suffix intact if
 * that is the connection Prisma actually holds) — deliberately transparent,
 * not pre-normalized, so the route stays a dumb, honest mirror of what the
 * server is actually connected to. The comparison, not the route, is where
 * "a pooled and a direct connection to the SAME branch must read equal"
 * belongs — `init-preview-database.ts`'s own exported `fullEndpoint()`
 * strips `-pooler`, and `normalizeReportedHost()` below applies the exact
 * same rule (plus stripping a port, which a bare `.host` can carry and a
 * connection-string `.hostname` never does) to the ROUTE's raw value,
 * before either side is compared.
 *
 * DATABASE NAME, NOT JUST HOST. A host can serve more than one database —
 * `app/api/deployment-identity`'s `database.name` (a path segment, never a
 * credential) is required and compared too.
 *
 * A MISSING FIELD REFUSES. `configured.transactionalResend`/
 * `platformResend` being anything other than an explicit boolean — absent,
 * null, a malformed response — is treated as "cannot confirm," never as
 * "must be false." An incomplete response is not evidence of safety.
 *
 * `describeTargetForLog()` — REVIEW OF c687467: the two callers' success
 * logs used to print the raw `targetUrl`, a full connection string
 * including its password. This exposes only the nonsecret host/database
 * pair a caller would need to recognize which target passed, computed the
 * exact same way the comparison above already does — never the connection
 * string itself.
 */
import { fullEndpoint } from "./init-preview-database";

export type DeploymentIdentityResponse = {
  database?: { host?: unknown; name?: unknown };
  configured?: { transactionalResend?: unknown; platformResend?: unknown };
};

export type IdentityCheckResult = { ok: true } | { ok: false; reason: string };

/** Strips a `:port` suffix and the `-pooler` marker from a raw `URL.host` value — the counterpart to `fullEndpoint()`'s treatment of a full connection string. */
export function normalizeReportedHost(host: string): string {
  return host.split(":")[0].toLowerCase().replace(/-pooler(?=\.|$)/, "");
}

export function targetDatabaseName(targetUrl: string): string {
  return new URL(targetUrl).pathname.replace(/^\//, "");
}

/** The nonsecret host/database pair for a success/refusal log — never the raw connection string (which carries its password). */
export function describeTargetForLog(targetUrl: string): string {
  return `${fullEndpoint(targetUrl)}/${targetDatabaseName(targetUrl)}`;
}

export function checkDeploymentIdentityResponse(body: unknown, targetUrl: string): IdentityCheckResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "deployment-identity returned no usable body" };
  }
  const b = body as DeploymentIdentityResponse;

  if (typeof b.database?.host !== "string") {
    return { ok: false, reason: "deployment-identity response is missing database.host" };
  }
  if (typeof b.database?.name !== "string") {
    return { ok: false, reason: "deployment-identity response is missing database.name" };
  }

  const expectedHost = fullEndpoint(targetUrl).toLowerCase();
  const observedHost = normalizeReportedHost(b.database.host);
  if (observedHost !== expectedHost) {
    return {
      ok: false,
      reason: `deployed database host "${observedHost}" (raw "${b.database.host}") does not match the expected "${expectedHost}" (pooled/direct normalized)`,
    };
  }

  const expectedName = targetDatabaseName(targetUrl);
  if (b.database.name !== expectedName) {
    return { ok: false, reason: `deployed database name "${b.database.name}" does not match the expected "${expectedName}"` };
  }

  if (typeof b.configured?.transactionalResend !== "boolean" || typeof b.configured?.platformResend !== "boolean") {
    return {
      ok: false,
      reason: "deployment-identity response is missing configured.transactionalResend/platformResend as explicit booleans — cannot confirm no real send is possible",
    };
  }
  if (b.configured.transactionalResend || b.configured.platformResend) {
    return {
      ok: false,
      reason: `the deployed app has a Resend key configured (transactionalResend=${b.configured.transactionalResend}, platformResend=${b.configured.platformResend})`,
    };
  }

  return { ok: true };
}
