import { NextResponse, type NextRequest } from "next/server";
import { RESERVED_HOSTED_SLUGS } from "@/lib/reservedHostedSlugs";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_ATTRS } from "@/lib/sessionCookieConfig";

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

/**
 * Root-level routes that sit beside `app/[site]/` but aren't in
 * RESERVED_HOSTED_SLUGS, because that list exists to keep a CONTRACTOR from
 * claiming these words as a hosted slug, not to describe every non-storefront
 * path Next itself already serves at the root.
 *
 * `platform`, `start` and `invite` are real top-level routes
 * (app/platform/, app/start/, app/(auth)/invite/) that RESERVED_HOSTED_SLUGS
 * does not list — a pre-existing gap in that set, unrelated to this fix and
 * not corrected here (narrowing/widening which slugs a contractor may
 * register is a separate decision). Listed here only so this middleware's
 * own scoping doesn't inherit that gap.
 */
const NON_STOREFRONT_TOP_SEGMENTS = new Set([
  "robots.txt", "sitemap.xml", "icon.png", "embed.js",
  "platform", "start", "invite",
]);

/**
 * Anonymous session bootstrap — docs/design/anonymous-session-bootstrap.md.
 *
 * True only for a real `app/[site]/**` homeowner storefront page: the one
 * place `elite_session_id` needs to exist before client-side code runs,
 * because Header.tsx and GuidedFlowEngine.tsx both fire their own requests
 * that depend on it as soon as they mount.
 *
 * `/embed/<publicId>/...` is excluded even though it eventually serves the
 * same storefront pages: that rewrite (next.config.mjs) happens AFTER
 * middleware runs, so at this point the path still reads "embed", and an
 * embed never uses this cookie anyway (lib/session.ts — SameSite=Lax cannot
 * reach a cross-origin iframe; the embed carries its own header token).
 *
 * Everything reserved against a contractor's OWN hosted slug
 * (RESERVED_HOSTED_SLUGS — /admin, /dashboard, /api, marketing, auth, …) is
 * excluded for the same reason it's reserved: those paths are never a real
 * `[site]` segment, so they're never where a homeowner client fetch depending
 * on this cookie originates.
 */
function isHomeownerStorefrontPath(pathname: string): boolean {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return false; // "/" itself — resolved by a redirect, not a [site] page.
  if (first === "embed") return false;
  if (NON_STOREFRONT_TOP_SEGMENTS.has(first)) return false;
  return !RESERVED_HOSTED_SLUGS.has(first);
}

export async function middleware(req: NextRequest) {
  if (!frozen() || READ_ONLY.has(req.method)) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", await framePolicy(req));

    // Issue the anonymous session cookie here, before React hydrates and
    // Header/GuidedFlowEngine can independently race to mint their own —
    // see docs/design/anonymous-session-bootstrap.md. Mint-only-if-absent:
    // an existing identity, including one Device Handoff just assigned this
    // browser, is never touched.
    if (isHomeownerStorefrontPath(req.nextUrl.pathname) && !req.cookies.has(SESSION_COOKIE_NAME)) {
      res.cookies.set(SESSION_COOKIE_NAME, crypto.randomUUID(), SESSION_COOKIE_ATTRS);
    }

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
