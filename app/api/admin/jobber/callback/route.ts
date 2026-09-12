import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, jobberRedirectUri, saveJobberTokens } from "@/lib/jobber";
import { resolveAdminContractor } from "@/lib/adminContext";

function jobberPage(path: string): URL {
  // Never derive a post-OAuth redirect from the callback request's Host header.
  // jobberRedirectUri() is built from the configured contractor-app origin, so
  // every success/refusal lands back inside the Price2Book app we registered
  // with Jobber rather than on an origin supplied by the inbound request.
  return new URL(path, jobberRedirectUri());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = cookies().get("jobber_oauth_state")?.value;

  // The cookie carries BOTH the random CSRF state and the contractor that
  // initiated OAuth. State proves this callback belongs to a flow we started;
  // the contractor id proves it is still being completed for the same business.
  const separator = stateCookie?.indexOf(":") ?? -1;
  const expectedState = separator > 0 ? stateCookie!.slice(0, separator) : null;
  const initiatingContractorId = separator > 0 ? stateCookie!.slice(separator + 1) : null;

  if (!code || !state || !expectedState || !initiatingContractorId || state !== expectedState) {
    cookies().delete("jobber_oauth_state");
    return NextResponse.redirect(jobberPage("/dashboard/jobber?error=invalid_state"));
  }

  // Consume the state before any external call. A failed token exchange is
  // retried by starting a NEW OAuth attempt, never by replaying this callback.
  cookies().delete("jobber_oauth_state");

  try {
    const { contractorId } = await resolveAdminContractor();
    if (contractorId !== initiatingContractorId) {
      console.error("Jobber OAuth contractor context changed before callback completion.");
      return NextResponse.redirect(jobberPage("/dashboard/jobber?error=contractor_changed"));
    }

    const tokens = await exchangeCodeForTokens(code);
    await saveJobberTokens(tokens, contractorId);
  } catch (err) {
    console.error("Jobber OAuth exchange failed:", err);
    return NextResponse.redirect(jobberPage("/dashboard/jobber?error=exchange_failed"));
  }

  return NextResponse.redirect(jobberPage("/dashboard/jobber?connected=1"));
}
