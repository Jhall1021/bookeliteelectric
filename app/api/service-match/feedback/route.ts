import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalize } from "@/lib/serviceMatch";

/**
 * Did the customer take the suggestion?
 *
 * The single most useful signal here. A service suggested often and accepted
 * rarely is named in words nobody recognises — which is a content problem the
 * matching can't fix, and one nothing else would surface.
 *
 * Fire-and-forget: the customer is already navigating, and a failure here
 * must never interrupt that.
 */
export async function POST(req: Request) {
  try {
    const { text, accepted } = await req.json();
    if (typeof text !== "string") return NextResponse.json({ ok: true });

    await prisma.serviceQuery.updateMany({
      where: { normalizedText: normalize(text) },
      data: accepted
        ? { timesAccepted: { increment: 1 } }
        : { timesRejected: { increment: 1 } },
    });
  } catch {
    // Deliberately silent.
  }
  return NextResponse.json({ ok: true });
}
