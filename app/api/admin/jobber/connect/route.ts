import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { resolveAdminContractor } from "@/lib/adminContext";
import { JOBBER_AUTH_URL, jobberRedirectUri } from "@/lib/jobber";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";

// Redirects the admin's browser to Jobber's own consent screen — this is
// the ONE step where you log in with your REAL contractor Jobber account
// (not the Developer Center login), to grant this app access.
export async function GET() {
  let redirectUri: string;
  try {
    redirectUri = jobberRedirectUri();
  } catch (err) {
    console.error("Jobber OAuth cannot start: application origin is not configured.", err);
    return NextResponse.json(
      { error: "Jobber is not configured for this Price2Book environment." },
      { status: 503 }
    );
  }

  if (!(await isAdminAuthenticated())) {
    return NextResponse.redirect(new URL("/sign-in", redirectUri));
  }

  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      `Jobber OAuth cannot start: ${!clientId ? "JOBBER_CLIENT_ID" : "JOBBER_CLIENT_SECRET"} is not configured.`
    );
    return NextResponse.redirect(new URL("/dashboard/jobber?error=not_configured", redirectUri));
  }

  const { contractorId } = await resolveAdminContractor();

  // Re-authorizing over an existing connection is unsafe because the OAuth
  // credentials may belong to a DIFFERENT Jobber account while the cached crew
  // list still belongs to the old one. The dashboard's Disconnect action is the
  // one sanctioned account-switch path: it deletes the connection and its crew
  // cache atomically, so a newly connected account starts with zero booking
  // capacity until its own roster is synced and explicitly enabled.
  //
  // The UI already hides Connect while connected, but this guard is the rule;
  // a copied/direct URL must not be able to bypass the lifecycle.
  const existingConnection = await prisma.jobberConnection.findUnique({
    where: { contractorId },
    select: { id: true },
  });
  if (existingConnection) {
    return NextResponse.redirect(
      new URL("/dashboard/jobber?error=already_connected", redirectUri)
    );
  }

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
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
