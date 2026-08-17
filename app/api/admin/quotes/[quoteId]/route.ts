import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  // Independently checked here, not just at the page level — API routes
  // can be called directly, bypassing whatever page rendered the button.
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { quotedPriceCents, depositRequired } = await req.json();

  if (typeof quotedPriceCents !== "number" || quotedPriceCents <= 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  await prisma.quote.update({
    where: { id: params.quoteId },
    data: {
      quotedPriceCents,
      depositRequired: !!depositRequired,
      status: "PRICED",
      quotedAt: new Date(),
    },
  });

  // Real "Your price is ready" email/text is Phase 6 (SMS/email vendor
  // not yet chosen) — for now the customer finds out by checking their
  // bookmarked /quote/[id] status page.
  return NextResponse.json({ ok: true });
}
