/**
 * No imports, no side effects: read by the auth instance (lib/auth.ts) AND by
 * /api/deployment-identity, so the diagnostic reports the base URL auth
 * actually uses instead of restating the rule — the restated copy used `??`
 * and reported an empty BETTER_AUTH_URL as "" where auth treats it as unset.
 * verify-release-provenance holds this file to the env names it may read.
 */

/**
 * Where this deployment lives, resolved rather than pinned.
 *
 * A magic link must return to the deployment that ISSUED it. A single
 * BETTER_AUTH_URL environment variable cannot do that: set it to production
 * and every preview deployment mails links that land on production; set it per
 * environment and it silently rots the first time a variable is copied between
 * them. The failure is quiet either way — the mail sends, the link works, and
 * it signs you in to the wrong place.
 *
 * So Vercel's own deployment host wins when present. VERCEL_BRANCH_URL is
 * preferred over VERCEL_URL because it is the stable branch alias rather than
 * the per-commit URL, which changes on every push and would invalidate links
 * already in someone's inbox.
 *
 * An explicit BETTER_AUTH_URL still overrides everything, for a custom domain.
 */
export function resolveBaseUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;

  // On production the deployment must identify itself by its PRODUCTION
  // domain, not by the git-main alias. VERCEL_URL is per-commit and
  // VERCEL_BRANCH_URL is the branch alias; neither is the address a person
  // types or that a magic link should return to.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (host) return `https://${host}`;
  return undefined; // local dev: Better Auth infers from the request
}
