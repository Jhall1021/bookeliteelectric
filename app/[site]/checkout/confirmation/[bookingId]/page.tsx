import { formatCents } from "@/lib/flow-types";
import { DEPOSIT_SENTENCE } from "@/lib/preWorkVisit";
import { notFound } from "next/navigation";
import { requireHostedSite, withSite } from "@/lib/siteRouting";

export default async function ConfirmationPage({
  params,
}: {
  params: { site: string; bookingId: string };
}) {
  // ADR §2.2 / ADR-011. The storefront in the URL decides the tenant, and the
  // booking id decides nothing. This page shows a customer's name, address and
  // total; unscoped, any booking id pasted into any storefront's URL rendered
  // it. Booking derives its owner through Visit, so a foreign id is null here
  // and takes the same notFound() path as one that does not exist.
  const site = await requireHostedSite(params.site);
  const booking = await withSite(site, (db) =>
    db.booking.findUnique({
      where: { id: params.bookingId },
      include: {
        arrivalWindow: true,
        customer: true,
        // What the customer is owed an answer about: did a deposit get taken,
        // and does a pre-work visit come next.
        visit: { include: { lineItems: { include: { service: {
          select: {
            requiresPreWorkVisit: true, depositCreditsToJob: true,
            preWorkCustomerNote: true,
          },
        } } } } },
      },
    })
  );

  if (!booking) return notFound();

  const services = booking.visit.lineItems.map((li) => li.service);
  const preWorkRequired = services.some((s) => s.requiresPreWorkVisit);
  // Each service says its own. Deduplicated so a visit carrying two of them
  // does not repeat a paragraph back at the customer.
  const preWorkNotes = [...new Set(
    services.filter((s) => s.requiresPreWorkVisit && s.preWorkCustomerNote)
            .map((s) => s.preWorkCustomerNote as string)
  )];
  const creditsToJob = services.every((s) => s.depositCreditsToJob);
  // The STATE decides, not the amount: a booking whose capture failed has a
  // deposit due and no money taken, and must not be told it paid one.
  const depositPaid = booking.paymentState === "DEPOSIT_CAPTURED";

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <div className="ray-accent mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl text-success">
        ✓
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold text-navy">You&rsquo;re All Set!</h1>
      <p className="mt-2 text-slate">We look forward to seeing you.</p>

      <div className="mt-8 rounded-card border border-cardline bg-white p-6 shadow-card">
        <div className="font-display text-lg font-bold text-navy">
          {new Date(booking.arrivalWindow.date).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
        <div className="mt-1 text-slate">
          {booking.arrivalWindow.startTime} – {booking.arrivalWindow.endTime}
        </div>
        <div className="mt-4 border-t border-cardline pt-4 text-sm text-slate">
          Total: <span className="font-semibold text-navy">{formatCents(booking.totalCents)}</span>
        </div>
        {/* Deposit bookings now say what actually moved. A page that says
            "nothing to pay" to someone whose card was just charged $249 is
            the same broken promise as the reverse, pointing the other way. */}
        {depositPaid ? (
          <>
            <div className="mt-3 flex justify-between text-sm text-slate">
              <span>Deposit paid today</span>
              <span className="font-semibold text-navy">{formatCents(booking.depositDueCents ?? 0)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-slate">
              <span>{creditsToJob ? "Remaining, applied to your project" : "Remaining"}</span>
              <span className="font-semibold text-navy">
                {formatCents(booking.totalCents - (booking.depositDueCents ?? 0))}
              </span>
            </div>
            {/* Price2Book collects the DEPOSIT. It does not collect the
                balance, and must not imply it will — BALANCE_DUE and SETTLED
                have no production transition, by design. */}
            <div className="mt-3 text-xs text-slate">
              The remaining balance is arranged directly with your contractor.
            </div>
          </>
        ) : (
          <div className="mt-3 text-sm text-slate">Nothing to pay until the work is done.</div>
        )}
      </div>

      {/* The next step, for a service that cannot go straight to installation.
          Without this the customer is told they are "all set" and then, days
          later, asked for a site visit nobody mentioned. */}
      {preWorkRequired && (
        <div className="mt-6 rounded-card border border-cardline bg-warmwhite p-5 text-left text-sm text-slate">
          <div className="font-semibold text-navy">What happens next</div>
          <p className="mt-2">{DEPOSIT_SENTENCE(booking.depositDueCents ?? 0)}</p>
          {preWorkNotes.map((note) => (
            <p key={note} className="mt-2">{note}</p>
          ))}
        </div>
      )}

      {/* Was "a confirmation email and text are on their way". Only the email
          is real — SMS was deliberately deferred — and promising a text that
          never arrives is the sort of small broken promise that makes someone
          doubt the rest of it. */}
      <p className="mt-6 text-sm text-slate">
        A confirmation email is on its way to {booking.customer.email}.
      </p>
    </main>
  );
}
