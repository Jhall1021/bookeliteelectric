import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { sendQuoteReadyEmail } from "@/lib/email";
import { loadIdentity } from "@/lib/storefrontIdentity";
import { pricingCopy } from "@/lib/pricingCopy";

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  // Authentication AND tenancy in one step. Being a signed-in admin somewhere
  // is not authority to price a quote belonging to another contractor — and a
  // quote id in a URL is not authority either. Quote derives its owner through
  // Service (ADR-011), so a foreign id matches nothing.
  return withAdminRoute(async (db, ctx) => {
  const { quotedPriceCents, depositRequired } = await req.json();

  if (typeof quotedPriceCents !== "number" || quotedPriceCents <= 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  // updateMany, not update: a guarded `update` on a row that does not match
  // throws Prisma's "record not found", which is a 500. This yields a count
  // we can turn into an honest 404 instead.
  const touched = await db.quote.updateMany({
    where: { id: params.quoteId },
    data: {
      quotedPriceCents,
      depositRequired: !!depositRequired,
      status: "PRICED",
      quotedAt: new Date(),
    },
  });

  if (touched.count === 0) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = await db.quote.findUniqueOrThrow({
    where: { id: params.quoteId },
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
    // ctx already resolved which contractor this admin is acting for.
    const sender = await loadIdentity(db, ctx.contractorId);
    const strategy = (await db.contractor.findUnique({
      where: { id: ctx.contractorId }, select: { pricingStrategy: true },
    }))?.pricingStrategy;
    // The quote link is homeowner-facing, so it needs the contractor's
    // STOREFRONT, not the application this admin is signed in to.
    const site = await db.contractorSite.findFirst({
      where: { contractorId: ctx.contractorId, active: true },
      select: { hostedSlug: true },
    });
    if (!site) {
      emailError = "This contractor has no active storefront, so a quote link cannot be built.";
      console.error(`[quotes] priced ${quote.id} but the contractor has no active site`);
      return NextResponse.json({ ok: true, emailed: false, emailError });
    }
    await sendQuoteReadyEmail({
      identity: sender.identity,
      site,
      copy: pricingCopy(strategy),
      fromAddress: sender.fromAddress,
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
  });
}
