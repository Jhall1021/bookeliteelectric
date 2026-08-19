import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

// Defaults to Resend's own testing address — real customers won't
// actually receive anything until a real domain is verified with Resend
// and RESEND_FROM_EMAIL is set to use it (e.g. "Elite Electric
// <bookings@bookeliteelectric.com>"). Switching later is just this one
// env var, no code change needed.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "Elite Electric <onboarding@resend.dev>";

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function sendBookingConfirmationEmail(bookingId: string) {
  console.log(`=== sendBookingConfirmationEmail called for booking ${bookingId} ===`);
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      customer: true,
      arrivalWindow: true,
      visit: { include: { lineItems: { include: { service: { select: { name: true } } } } } },
    },
  });

  if (!booking.customer.email) {
    console.log(`=== No customer email on booking ${bookingId} — skipping send ===`);
    return;
  }
  console.log(`=== Sending to ${booking.customer.email} from ${FROM_EMAIL} ===`);

  const dateLabel = booking.arrivalWindow.date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

  const lineItemsHtml = booking.visit.lineItems
    .map((li) => `<li>${li.isPrimary ? "" : "+ "}${li.service.name}</li>`)
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; color: #0F1E3C;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">You're all set, ${booking.customer.name}!</h1>
      <p style="margin: 0 0 16px;">Your appointment with Elite Electric &amp; Lighting is confirmed.</p>

      <div style="background: #F7F5F0; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
        <p style="margin: 0 0 8px; font-weight: 600;">${dateLabel}</p>
        <p style="margin: 0 0 12px;">Arrival window: ${booking.arrivalWindow.startTime} – ${booking.arrivalWindow.endTime}</p>
        <ul style="margin: 0 0 12px; padding-left: 20px;">${lineItemsHtml}</ul>
        <p style="margin: 0; font-weight: 600;">Total: ${formatDollars(booking.totalCents)}</p>
      </div>

      <p style="font-size: 14px; color: #55606E; margin: 0 0 8px;">
        ${booking.address}, ${booking.zipCode}<br/>
        Your card is on file and will be charged after the work is completed — not before.
      </p>

      <p style="font-size: 14px; color: #55606E; margin: 16px 0 0;">
        Questions? Call us at 732-204-7003.
      </p>
    </div>
  `;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: booking.customer.email,
    subject: "Your appointment is confirmed — Elite Electric & Lighting",
    html,
  });
  console.log(`=== resend.emails.send() completed without throwing for booking ${bookingId} ===`);
}
