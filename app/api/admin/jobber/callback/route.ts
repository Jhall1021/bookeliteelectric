import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, saveJobberTokens } from "@/lib/jobber";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies().get("jobber_oauth_state")?.value;

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/admin/jobber?error=invalid_state", url.origin));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveJobberTokens(tokens);
  } catch (err) {
    console.error("Jobber OAuth exchange failed:", err);
    return NextResponse.redirect(new URL("/admin/jobber?error=exchange_failed", url.origin));
  }

  cookies().delete("jobber_oauth_state");
  return NextResponse.redirect(new URL("/admin/jobber?connected=1", url.origin));
}
