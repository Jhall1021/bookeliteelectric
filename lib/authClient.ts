"use client";

/**
 * Better Auth's browser client.
 *
 * No baseURL: it resolves relative to the page it runs on, so a sign-in
 * started on a preview deployment talks to that deployment. Pinning it would
 * reintroduce the problem lib/auth.ts's resolveBaseUrl() exists to avoid.
 */

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
