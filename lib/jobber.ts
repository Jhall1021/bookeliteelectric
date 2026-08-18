import { prisma } from "@/lib/prisma";

const TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_AUTH_URL = "https://api.getjobber.com/api/oauth/authorize";
export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";

export function jobberRedirectUri(): string {
  // Must exactly match the Redirect URI entered when the app was created
  // in Jobber's Developer Center.
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://bookeliteelectric.vercel.app"}/api/admin/jobber/callback`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.JOBBER_CLIENT_ID ?? "",
      client_secret: process.env.JOBBER_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: jobberRedirectUri(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Jobber token exchange failed: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function refreshTokens(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.JOBBER_CLIENT_ID ?? "",
      client_secret: process.env.JOBBER_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Jobber token refresh failed: ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function saveJobberTokens(tokens: { access_token: string; refresh_token: string; expires_in: number }) {
  await prisma.jobberConnection.upsert({
    where: { id: "default" },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    create: {
      id: "default",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

// Always call this before making a Jobber API request — it transparently
// refreshes an expired access token so nothing else has to think about it.
export async function getValidJobberAccessToken(): Promise<string | null> {
  const conn = await prisma.jobberConnection.findUnique({ where: { id: "default" } });
  if (!conn) return null;

  // Refresh a bit early (2 min buffer) rather than right at the expiry instant.
  if (conn.expiresAt.getTime() > Date.now() + 2 * 60 * 1000) {
    return conn.accessToken;
  }

  const fresh = await refreshTokens(conn.refreshToken);
  await saveJobberTokens(fresh);
  return fresh.access_token;
}
