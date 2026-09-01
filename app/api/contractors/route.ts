import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/adminContext";
import { createContractorForUser } from "@/lib/contractorCreation";

/**
 * A signed-in, verified account creating its own business.
 *
 * The one route that writes a membership outside invitation acceptance, and it
 * does nothing itself: lib/contractorCreation is the authority, and this says
 * only who is asking. Deliberately not under /api/admin — there is no
 * contractor to be an admin of yet, which is the whole point.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { name?: unknown; slug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const result = await createContractorForUser(prisma, user, {
    name: typeof body.name === "string" ? body.name : "",
    slug: typeof body.slug === "string" ? body.slug : undefined,
  });

  if (!result.ok) {
    // 403 for an unverified address — the request is well-formed and the
    // account simply may not do this yet.
    const status = result.refusal.code === "NOT_VERIFIED" ? 403 : 400;
    return NextResponse.json(
      { error: result.refusal.message, code: result.refusal.code },
      { status }
    );
  }

  return NextResponse.json({ ok: true, contractorId: result.contractorId, slug: result.slug });
}
