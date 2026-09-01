import { NextResponse, type NextRequest } from "next/server";

/**
 * Second layer of the write freeze — ADR-013 Phase 4.
 *
 * The Prisma extension in lib/writeFreeze.ts is the one that actually
 * guarantees nothing is written; this turns an attempted mutation into a
 * clean 503 with a Retry-After instead of a 500 from a thrown error, so a
 * customer mid-checkout sees a maintenance response rather than a crash.
 *
 * Deliberately the weaker layer, and deliberately not the only one: it can
 * only see HTTP verbs, so a GET route that writes, or a server action, would
 * pass straight through it. That is exactly what the Prisma extension is for.
 * Neither layer is trusted alone.
 */
const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

function frozen(): boolean {
  const v = (process.env.WRITE_FREEZE ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Who may frame what — Embed V1.
 *
 * There was no `frame-ancestors` and no `X-Frame-Options` anywhere, so every
 * page including the dashboard could be framed by anyone. Shipping an embed
 * makes that a decision rather than an oversight, and the decision is: nothing
 * may be framed except an embedded storefront, and that only by the origins
 * its contractor registered.
 *
 * The embed's policy is per-contractor and this runs on the Edge, where Prisma
 * is unavailable in Next 14 — so it asks the internal resolver. An unknown
 * identifier, an inactive site and a contractor with no registered domain all
 * answer `'none'`, which fails closed and tells a prober nothing.
 */
async function framePolicy(req: NextRequest): Promise<string> {
  const m = req.nextUrl.pathname.match(/^\/embed\/(site_[0-9a-f]+)/);
  if (!m) return "frame-ancestors 'none'";
  try {
    const res = await fetch(
      new URL(`/api/internal/embed-policy?publicId=${encodeURIComponent(m[1])}`, req.nextUrl.origin),
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) return "frame-ancestors 'none'";
    const body = (await res.json()) as { policy?: string };
    return typeof body.policy === "string" ? body.policy : "frame-ancestors 'none'";
  } catch {
    // A resolver that cannot be reached must not open the frame. An embed that
    // stops working is a contractor calling support; an embed anyone can frame
    // is a homeowner handing their address to a stranger.
    return "frame-ancestors 'none'";
  }
}

export async function middleware(req: NextRequest) {
  if (!frozen() || READ_ONLY.has(req.method)) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", await framePolicy(req));
    return res;
  }

  return NextResponse.json(
    {
      error: "WRITE_FROZEN",
      message:
        "We're briefly read-only while we complete a planned maintenance window. " +
        "Nothing has been lost — please try again in a few minutes.",
    },
    { status: 503, headers: { "Retry-After": "300" } }
  );
}

export const config = {
  // Everything except Next's own assets and the auth endpoints, which must
  // keep working so an admin can still sign in and watch the window.
  // The internal policy resolver is excluded, or asking it would ask it again.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|api/internal/embed-policy).*)"],
};
