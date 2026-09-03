import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which release is this? Public, tiny, never cached.
 *
 * After the September 2026 alias incident the question "what is actually
 * serving app.price2book.com" had to be answered by reading an alias table
 * with an account token. This answers it from the deployment itself, to
 * anyone, in three fields — the deployment id Vercel assigned, the commit SHA
 * it was built from, and the environment — so a release can be read back and
 * a wrong artifact recognized in one request.
 *
 * DELIBERATELY NOT MORE. No database host or identity, no origins, no
 * configuration presence, nothing about people. Those stay behind
 * /api/deployment-identity and its bypass secret, unchanged. A deployment id
 * and a public repository's commit SHA are not secrets.
 */
export async function GET() {
  return NextResponse.json(
    {
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      target: process.env.VERCEL_ENV ?? null,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
