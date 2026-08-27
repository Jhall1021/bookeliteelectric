/**
 * TEMPORARY. Delete after the auth cutover is verified.
 *
 * Reports whether specific environment variables are PRESENT. Never their
 * values, never a prefix, never a length that could narrow a secret — only a
 * boolean, and only for a fixed list of names that are checked in.
 *
 * It exists because a magic-link send returns a 500 with an empty body when a
 * platform credential is missing, and Vercel's logs are not readable from
 * here. Guessing which of three variables is absent, one redeploy at a time,
 * is worse than measuring it once.
 *
 * The deployment is behind Vercel protection, so reaching this at all requires
 * the bypass token.
 *
 * NOT named _diag: App Router treats an underscore-prefixed folder as private
 * and excludes it from routing entirely, so that version 404'd everywhere and
 * looked exactly like a deployment that had not built yet.
 */

const NAMES = [
  "BETTER_AUTH_SECRET",
  "PLATFORM_RESEND_API_KEY",
  "PLATFORM_FROM_EMAIL",
  "BETTER_AUTH_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "DATABASE_URL",
] as const;

export async function GET() {
  const present: Record<string, boolean> = {};
  for (const n of NAMES) present[n] = Boolean(process.env[n]);

  // These two are not secrets — they are the deployment's own identity, and
  // seeing them is how we confirm the magic link would return to the right
  // host rather than to production or localhost.
  return Response.json({
    present,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    branchUrl: process.env.VERCEL_BRANCH_URL ?? null,
  });
}
