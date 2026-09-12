import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { resolveAdminContractor } from "@/lib/adminContext";
import { JOBBER_AUTH_URL, jobberRedirectUri } from "@/lib/jobber";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";

// Redirects the admin's browser to Jobber's own consent screen — this is
// the ONE step where you log in with your REAL contractor Jobber account
// (not the Developer Center login), to grant this app access.
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.redirect(new URL("/sign-in", jobberRedirectUri()));
  }

  const clientId = process.env.JOBBER_CLIENT_ID;
  if (!clientId) {
    console.error("Jobber OAuth cannot start: JOBBER_CLIENT_ID is not configured.");
    return NextResponse.redirect(new URL("/dashboard/jobber?error=not_configured", jobberRedirectUri()));
  }

  // Bind the OAuth attempt to the contractor that STARTED it, not whichever
  // contractor context happens to exist when Jobber redirects back. A random
  // state alone protects against CSRF, but without the owner binding an admin
  // switching contractor context in another tab mid-flow could attach the
  // returned Jobber account to the wrong business.
  const { contractorId } = await resolveAdminContractor();
  const state = randomUUID();
  cookies().set("jobber_oauth_state", `${state}:${contractorId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const url = new URL(JOBBER_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", jobberRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
