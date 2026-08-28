import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, saveJobberTokens } from "@/lib/jobber";
import { resolveAdminContractor } from "@/lib/adminContext";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies().get("jobber_oauth_state")?.value;

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/dashboard/jobber?error=invalid_state", url.origin));
  }

  try {
    // Whose Jobber account this is: the admin who started the flow. Not
    // inferred from the tokens and not defaulted — an OAuth callback that
    // guessed an owner would attach one contractor's integration to another.
    const { contractorId } = await resolveAdminContractor();
    const tokens = await exchangeCodeForTokens(code);
    await saveJobberTokens(tokens, contractorId);
  } catch (err) {
    console.error("Jobber OAuth exchange failed:", err);
    return NextResponse.redirect(new URL("/dashboard/jobber?error=exchange_failed", url.origin));
  }

  cookies().delete("jobber_oauth_state");
  return NextResponse.redirect(new URL("/dashboard/jobber?connected=1", url.origin));
}
