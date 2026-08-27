import type { PrismaClient } from "@prisma/client";
import { getSessionId } from "@/lib/session";

/**
 * Whether this visitor already has something in THIS contractor's visit.
 *
 * Once they do, every additional service is priced at its While We're There
 * rate — the technician is coming out regardless, so the visit fee is
 * already covered. Browse pages use this to show the price the customer
 * would actually pay right now rather than the standalone price, which is
 * the promise the homepage makes: "everything you add after that costs less,
 * because we're already there."
 *
 * ADR-011. Takes the guarded client and the contractor rather than reading
 * the session cookie alone. The old shape counted line items on ANY open
 * visit for the session, so a visitor with a cart on one storefront saw
 * discounted prices on a different contractor's storefront — a wrong price,
 * shown to a homeowner, decided by another business's cart.
 *
 * Read-only on purpose: safe to call from a Server Component, and returns
 * false for a visitor with no session cookie yet.
 */
export async function hasOpenVisit(
  guarded: PrismaClient,
  contractorId: string
): Promise<boolean> {
  const sessionId = getSessionId();
  if (!sessionId) return false;

  const count = await guarded.lineItem.count({
    where: { visit: { contractorId, sessionId, status: "OPEN" } },
  });
  return count > 0;
}
