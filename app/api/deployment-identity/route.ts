import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jobberRedirectUri } from "@/lib/jobber";

export const dynamic = "force-dynamic";

/**
 * What deployment is this, actually?
 *
 * The host counterpart to `verify-database-identity`. A Vercel project named
 * "price2book" proves nothing about which deployment serves traffic, which
 * database it holds a URL for, or where its OAuth callback points — exactly as
 * a Neon branch named "production" proved nothing, three separate times.
 *
 * PROTECTED. Which database a deployment talks to is not public, so the
 * request must carry the Vercel automation bypass secret. Without it this is a
 * 404, indistinguishable from the route not existing.
 *
 * NOT under `_identity`: the App Router treats a leading underscore as a
 * PRIVATE folder and excludes it from routing entirely, so that version
 * answered 404 to a correct secret and looked exactly like a rejected one.
 *
 * NO SECRETS ARE RETURNED. Connection strings, keys and tokens never appear —
 * only the HOST of the database and the identity marker stamped inside it,
 * which is the thing that actually settles "is this the right database".
 */
export async function GET(req: Request) {
  const expected = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const given = req.headers.get("x-vercel-protection-bypass")
    ?? new URL(req.url).searchParams.get("bypass");
  if (!expected || given !== expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Host only. A connection string carries credentials and must never leave.
  let dbHost: string | null = null;
  try {
    dbHost = new URL(process.env.DATABASE_URL ?? "").host || null;
  } catch { dbHost = null; }

  // The marker ADR-013 stamped into the database itself. This is the claim
  // that cannot be faked by naming a project or a branch.
  let identity: { key: string; neonProject: string; neonEndpoint: string; stampedAt: string } | null = null;
  try {
    const row = await prisma.databaseIdentity.findFirst({
      select: { key: true, neonProject: true, neonEndpoint: true, stampedAt: true },
      orderBy: { stampedAt: "desc" },
    });
    identity = row
      ? { key: row.key, neonProject: row.neonProject, neonEndpoint: row.neonEndpoint,
          stampedAt: row.stampedAt.toISOString() }
      : null;
  } catch { identity = null; }

  const authBase = process.env.BETTER_AUTH_URL
    ?? (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : null);

  return NextResponse.json({
    deployment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      branchUrl: process.env.VERCEL_BRANCH_URL ?? null,
      deploymentUrl: process.env.VERCEL_URL ?? null,
      writeFreeze: process.env.WRITE_FREEZE ?? null,
    },
    database: {
      host: dbHost,
      // WRITTEN OUT, NOT SHORTHAND. The release verifier refuses any property
      // form it cannot evaluate, and `identity,` hides which value it carries:
      // a secret aliased to an allow-listed name would read identically.
      identity: identity,
      expectedIdentity: process.env.EXPECTED_DATABASE_IDENTITY ?? null,
      matches: identity && process.env.EXPECTED_DATABASE_IDENTITY
        ? identity.key === process.env.EXPECTED_DATABASE_IDENTITY
        : null,
    },
    // Where links and callbacks will actually land, resolved the same way the
    // application resolves them rather than restated.
    destinations: {
      authBaseUrl: authBase,
      appOrigin: process.env.APP_ORIGIN ?? null,
      storefrontOrigin: process.env.STOREFRONT_ORIGIN ?? null,
      platformOrigin: process.env.PLATFORM_WEB_ORIGIN ?? null,
      // Retired by ADR-019. Reported so its LINGERING PRESENCE is visible:
      // one variable feeding three audiences is what that ADR split apart.
      legacySiteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      jobberCallback: (() => { try { return jobberRedirectUri(); } catch (e) { return `ERROR: ${(e as Error).message}`; } })(),
    },
    configured: {
      // Presence only. Never a value.
      betterAuthSecret: !!process.env.BETTER_AUTH_SECRET,
      platformResend: !!process.env.PLATFORM_RESEND_API_KEY,
      transactionalResend: !!process.env.RESEND_API_KEY,
      jobber: !!process.env.JOBBER_CLIENT_ID && !!process.env.JOBBER_CLIENT_SECRET,
      r2: !!process.env.R2_ACCOUNT_ID && !!process.env.R2_BUCKET_NAME,
      // Should be absent. Present means legacy config was cloned wholesale.
      stripeLegacy: !!process.env.STRIPE_SECRET_KEY || !!process.env.STRIPE_PUBLISHABLE_KEY,
    },
  });
}
