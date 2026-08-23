import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

/**
 * A customer accepting the price the office put on their quote.
 *
 * WHAT WAS WRONG
 *
 * This created a NEW line item. But /api/quotes already created one when the
 * quote was submitted — unpriced, holding that service's place in the visit.
 * So approving left two rows: the original still at computedPriceCents null,
 * and a new priced one beside it.
 *
 * The consequence wasn't cosmetic. The visit stays in awaitingQuote while any
 * line is unpriced, and scheduling is blocked while awaitingQuote is true. So
 * a customer could approve their quote and still be unable to book, looking at
 * their own service listed twice.
 *
 * It also forced isPrimary: true on the new row, overriding whether that
 * service was actually the visit's anchor — which changes what it costs.
 *
 * AND IT DIDN'T CHECK WHOSE QUOTE IT WAS
 *
 * Any quote ID would approve into whatever session was calling. Quote IDs
 * appear in URLs, get forwarded, sit in browser history. Someone else's
 * custom-priced job could be pulled into your visit.
 */
export async function POST(_req: Request, { params }: { params: { quoteId: string } }) {
  const sessionId = getOrCreateSessionId();

  const quote = await prisma.quote.findUnique({
    where: { id: params.quoteId },
    include: {
      lineItem: { include: { visit: true } },
      visit: true,
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "We couldn't find that quote." }, { status: 404 });
  }

  // Whose quote is this? It belongs to the session that created the visit it
  // was raised against. Checked before anything else, and the response says
  // the same thing whether it's missing or someone else's — a different
  // message would confirm that a given quote ID exists.
  const owningVisit = quote.lineItem?.visit ?? quote.visit;
  if (!owningVisit || owningVisit.sessionId !== sessionId) {
    console.warn(
      `[quotes] session ${sessionId.slice(0, 8)}… tried to approve quote ${quote.id} ` +
        `belonging to ${owningVisit?.sessionId?.slice(0, 8) ?? "no"} visit`
    );
    return NextResponse.json({ error: "We couldn't find that quote." }, { status: 404 });
  }

  if (quote.status === "APPROVED") {
    // Idempotent. A double-click or a back-button shouldn't be an error.
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }

  if (quote.status !== "PRICED" || quote.quotedPriceCents === null) {
    return NextResponse.json(
      { error: "This quote isn't ready to approve yet." },
      { status: 400 }
    );
  }

  if (!quote.lineItemId) {
    // Quotes raised before the line-item link existed. Rather than create a
    // second row, say so — the office can re-raise it.
    console.error(`[quotes] ${quote.id} has no line item to price`);
    return NextResponse.json(
      { error: "Something's not right with this quote — please give us a call." },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.lineItem.update({
      where: { id: quote.lineItemId },
      data: {
        // The price the office set. The line keeps its visit and keeps
        // whether it was the primary service — both were decided when it
        // was added, and approving a price doesn't change either.
        computedPriceCents: quote.quotedPriceCents,
      },
    }),
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    }),
  ]);

  // How many lines are still waiting, so the client knows whether scheduling
  // has just unlocked.
  const stillWaiting = await prisma.lineItem.count({
    where: { visitId: owningVisit.id, computedPriceCents: null },
  });

  return NextResponse.json({
    ok: true,
    lineItemId: quote.lineItemId,
    priceCents: quote.quotedPriceCents,
    awaitingQuote: stillWaiting,
  });
}
