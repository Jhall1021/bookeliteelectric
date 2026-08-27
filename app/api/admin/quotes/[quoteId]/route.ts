import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { sendQuoteReadyEmail } from "@/lib/email";

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  // Independently checked here, not just at the page level — API routes
  // can be called directly, bypassing whatever page rendered the button.
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { quotedPriceCents, depositRequired } = await req.json();

  if (typeof quotedPriceCents !== "number" || quotedPriceCents <= 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  const quote = await prisma.quote.update({
    where: { id: params.quoteId },
    data: {
      quotedPriceCents,
      depositRequired: !!depositRequired,
      status: "PRICED",
      quotedAt: new Date(),
    },
    include: {
      customer: { select: { name: true, email: true } },
      service: { select: { name: true } },
    },
  });

  // Tell the customer.
  //
  // This used to say the email vendor hadn't been chosen and that the
  // customer would "find out by checking their bookmarked status page" —
  // which nobody does, and which the site never asked them to. Meanwhile the
  // flow promises "we'll email you when your price is ready", and they can't
  // schedule until they approve. Silence here leaves them stuck with no
  // reason to look again.
  //
  // Resend was already in use for booking confirmations, so there was nothing
  // to choose.
  //
  // Deliberately AFTER the update and outside any transaction: the price is
  // set either way. A mail failure must not undo the office's work, so it's
  // logged loudly and reported in the response rather than thrown.
  let emailed = false;
  let emailError: string | null = null;

  // Both fields are nullable on Customer. An address is the whole point of
  // this send, so a missing one isn't an error to swallow — it means the
  // customer genuinely can't be told, and the office needs to know that
  // rather than assume a message went out.
  if (!quote.customer.email) {
    emailError = "No email address on file for this customer.";
    console.error(`[quotes] priced ${quote.id} but the customer has no email address`);
    return NextResponse.json({ ok: true, emailed: false, emailError });
  }

  try {
    await sendQuoteReadyEmail({
      id: quote.id,
      quotedPriceCents,
      serviceName: quote.service.name.trim(),
      customer: {
        // A name is nice to have; the greeting reads fine without one.
        name: quote.customer.name ?? "there",
        email: quote.customer.email,
      },
    });
    emailed = true;
  } catch (err) {
    emailError = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[quotes] priced ${quote.id} but the email to ${quote.customer.email} failed: ${emailError}`
    );
  }

  return NextResponse.json({
    ok: true,
    emailed,
    // Surfaced so the admin can see the customer wasn't told and pick up the
    // phone, rather than assuming it went out.
    emailError,
  });
}
