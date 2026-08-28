import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { JOBBER_AUTH_URL, jobberRedirectUri } from "@/lib/jobber";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";

// Redirects the admin's browser to Jobber's own consent screen — this is
// the ONE step where you log in with your REAL Elite Electric Jobber
// account (not the Developer Center login), to grant this app access.
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.redirect(new URL("/sign-in", jobberRedirectUri()));
  }

  // A random state value, checked on the way back in the callback, to
  // confirm the redirect genuinely came from an authorization we started
  // (basic CSRF protection for the OAuth flow).
  const state = randomUUID();
  cookies().set("jobber_oauth_state", state, { httpOnly: true, maxAge: 600, path: "/" });

  const url = new URL(JOBBER_AUTH_URL);
  url.searchParams.set("client_id", process.env.JOBBER_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", jobberRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
