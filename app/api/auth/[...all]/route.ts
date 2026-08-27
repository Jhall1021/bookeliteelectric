/**
 * Better Auth's HTTP surface.
 *
 * Everything identity: requesting a magic link, verifying one, reading the
 * session, signing out. Better Auth owns all of it — this file exists only to
 * mount it.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Authorization. This endpoint establishes WHO someone is; it says nothing
 * about which contractor they may act for. That is ContractorMembership, and
 * it is resolved at the admin boundary in lib/adminContext.ts.
 *
 * Keeping them apart is the point. A valid session is not access to a
 * contractor, and an admin route that only checked "is there a session" would
 * hand any authenticated person every contractor's pricing.
 */

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
