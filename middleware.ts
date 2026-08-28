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

export function middleware(req: NextRequest) {
  if (!frozen() || READ_ONLY.has(req.method)) return NextResponse.next();

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
