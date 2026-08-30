/**
 * Resolving a Connect event to a tenant.
 *
 * THE ACCOUNT IS THE AUTHORITY. `event.account` is set by Stripe on
 * connected-account activity and identifies whose account acted. Metadata is
 * set by us, travels with the object, and is influenceable in ways an account
 * id is not — so it may CONFIRM what the account established and may never
 * establish it.
 *
 * This is the same rule the storefront already states: "The site identifier
 * the caller carries decides the tenant. Resolving it from the requested
 * resource would authorise access to that resource using itself." A contractor
 * id read out of metadata is exactly that shape.
 *
 * Separated from the route so the rule can be proved without HTTP, a signature
 * or a live event.
 */

import type { PrismaClient } from "@prisma/client";

export type ResolvedTenant =
  | { ok: true; contractorId: string; stripeAccountId: string }
  | { ok: false; reason: string };

/**
 * Which contractor does this event belong to?
 *
 * Takes the account and the metadata separately, on purpose: a signature that
 * accepted one blob would make it easy to reach for the wrong field.
 */
export async function tenantForConnectEvent(
  db: PrismaClient,
  args: { account: string | null | undefined; metadata?: Record<string, string> }
): Promise<ResolvedTenant> {
  if (!args.account) {
    // A platform-account event, not connected-account activity. Homeowner
    // money never lives here, so there is no tenant to find and nothing to do.
    return { ok: false, reason: "event carries no connected account" };
  }

  const contractor = await db.contractor.findFirst({
    where: { stripeAccountId: args.account },
    select: { id: true },
  });
  if (!contractor) {
    // Logged and dropped rather than guessed at. An account we do not know is
    // not an invitation to search metadata for something we do.
    return { ok: false, reason: `no contractor is connected to ${args.account}` };
  }

  // Metadata may DISAGREE — a stale object, a copied fixture, or an attempt.
  // The account still wins; the disagreement is worth surfacing, never
  // resolving in metadata's favour.
  const claimed = args.metadata?.price2book_contractor_id;
  if (claimed && claimed !== contractor.id) {
    console.warn(
      `[stripe] metadata claims contractor ${claimed} but account ${args.account} ` +
        `belongs to ${contractor.id}. Using the account.`
    );
  }

  return { ok: true, contractorId: contractor.id, stripeAccountId: args.account };
}
