import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, saveJobberTokens } from "@/lib/jobber";
import { resolveAdminContractor } from "@/lib/adminContext";

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
    return NextResponse.redirect(new URL("/dashboard/jobber?error=invalid_state", url.origin));
  }

  // Consume the state before any external call. A failed token exchange is
  // retried by starting a NEW OAuth attempt, never by replaying this callback.
  cookies().delete("jobber_oauth_state");

  try {
    const { contractorId } = await resolveAdminContractor();
    if (contractorId !== initiatingContractorId) {
      console.error("Jobber OAuth contractor context changed before callback completion.");
      return NextResponse.redirect(new URL("/dashboard/jobber?error=contractor_changed", url.origin));
    }

    const tokens = await exchangeCodeForTokens(code);
    await saveJobberTokens(tokens, contractorId);
  } catch (err) {
    console.error("Jobber OAuth exchange failed:", err);
    return NextResponse.redirect(new URL("/dashboard/jobber?error=exchange_failed", url.origin));
  }

  return NextResponse.redirect(new URL("/dashboard/jobber?connected=1", url.origin));
}
