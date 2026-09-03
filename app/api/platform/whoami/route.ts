import { withPlatformRoute } from "@/lib/platformContext";

/**
 * The API-side proof: who the platform thinks the caller is.
 *
 *   401  not signed in
 *   403  signed in, not platform staff (contractor owners included)
 *   200  the actor, from PlatformAccess and nothing else
 *
 * Reads no contractor data. Exists so the boundary can be exercised over HTTP
 * exactly as a future platform read model will be.
 */
export async function GET() {
  return withPlatformRoute(async (_db, actor) =>
    Response.json({
      userId: actor.userId,
      email: actor.email,
      role: actor.role,
      grantedAt: actor.grantedAt.toISOString(),
    })
  );
}
