import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Defaults to Resend's own testing address — real customers won't
// actually receive anything until a real domain is verified with Resend
// and RESEND_FROM_EMAIL is set to use it (e.g. "Elite Electric
// <bookings@bookeliteelectric.com>"). Switching later is just this one
// env var, no code change needed.
//
// Uses || not ?? deliberately: an env var saved in Vercel with an EMPTY
// value is still "set" (a real empty string, not undefined/null), so ??
// would never fall back to the default — || correctly treats an empty
// string the same as genuinely unset.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Elite Electric <onboarding@resend.dev>";

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function sendBookingConfirmationEmail(booking: {
  address: string;
  zipCode: string;
  totalCents: number;
  customer: { name: string | null; email: string | null };
  arrivalWindow: { date: Date; startTime: string; endTime: string };
  lineItems: { isPrimary: boolean; serviceName: string }[];
}) {
  console.log(`=== sendBookingConfirmationEmail called ===`);

  if (!booking.customer.email) {
    console.log(`=== No customer email — skipping send ===`);
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

  const lineItemsHtml = booking.lineItems
    .map((li) => `<li>${li.isPrimary ? "" : "+ "}${li.serviceName}</li>`)
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; color: #0F1E3C;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">You're all set${booking.customer.name ? `, ${booking.customer.name}` : ""}!</h1>
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

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: booking.customer.email,
    subject: "Your appointment is confirmed — Elite Electric & Lighting",
    html,
  });

  // Resend's SDK returns errors as a normal { error } response object
  // rather than throwing — checking only for a thrown exception (as this
  // code used to) meant a rejected send could look identical to a
  // successful one. This is what actually surfaces the real failure.
  if (result.error) {
    throw new Error(`Resend rejected the email: ${JSON.stringify(result.error)}`);
  }
  console.log(`=== resend.emails.send() succeeded, id: ${result.data?.id} ===`);
}
