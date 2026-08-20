import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/session";

/**
 * Whether this visitor already has something in their visit.
 *
 * Once they do, every additional service is priced at its While We're There
 * rate — the technician is coming out regardless, so the visit fee is
 * already covered. Browse pages use this to show the price the customer
 * would actually pay right now rather than the standalone price, which is
 * the promise the homepage makes: "everything you add after that costs less,
 * because we're already there."
 *
 * Read-only on purpose: safe to call from a Server Component, and returns
 * false for a visitor with no session cookie yet.
 */
export async function hasOpenVisit(): Promise<boolean> {
  const sessionId = getSessionId();
  if (!sessionId) return false;

  const count = await prisma.lineItem.count({
    where: { visit: { sessionId, status: "OPEN" } },
  });
  return count > 0;
}
