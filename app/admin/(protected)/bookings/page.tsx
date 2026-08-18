import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/flow-types";
import PushToJobberButton from "@/components/admin/PushToJobberButton";

export default async function AdminBookingsPage() {
  const bookings = await prisma.booking.findMany({
    orderBy: { arrivalWindow: { date: "asc" } },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      arrivalWindow: { select: { date: true, startTime: true, endTime: true } },
      visit: {
        include: {
          lineItems: { include: { service: { select: { name: true } } } },
        },
      },
    },
  });

  const upcoming = bookings.filter((b) => b.status === "SCHEDULED");
  const completed = bookings.filter((b) => b.status !== "SCHEDULED");

  function BookingCard({ b }: { b: (typeof bookings)[number] }) {
    return (
      <div className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-display text-base font-bold text-navy">{b.customer.name}</div>
            <div className="mt-1 text-sm text-slate">
              {b.customer.email}
              {b.customer.phone && ` · ${b.customer.phone}`}
            </div>
            <div className="mt-1 text-sm text-slate">{b.address} {b.zipCode}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-navy">
              {new Date(b.arrivalWindow.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
            <div className="text-xs text-slate">
              {b.arrivalWindow.startTime} – {b.arrivalWindow.endTime}
            </div>
            <div className="mt-1 rounded-pill bg-electric/10 px-2 py-0.5 text-xs font-semibold text-electric">
              {b.status}
            </div>
          </div>
        </div>

        <div className="mt-3 border-t border-cardline pt-3">
          {b.visit.lineItems.map((li) => (
            <div key={li.id} className="text-sm text-navy">
              {li.isPrimary ? "" : "+ "}
              {li.service.name}
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-slate">Total</span>
            <span className="font-semibold text-navy">{formatCents(b.totalCents)}</span>
          </div>
          <div className="mt-1 text-xs text-slate">
            {b.paymentModel === "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION" && "Card on file — captured after completion"}
            {" · "}{b.paymentStatus}
          </div>
        </div>

        <div className="mt-3 border-t border-cardline pt-3">
          <PushToJobberButton bookingId={b.id} alreadySent={!!b.jobberJobId} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Bookings</h1>
      <p className="mt-1 text-sm text-slate">
        {upcoming.length} upcoming, {completed.length} completed or cancelled.
      </p>

      <div className="mt-6 space-y-4">
        {upcoming.length === 0 && <p className="text-slate">Nothing scheduled yet.</p>}
        {upcoming.map((b) => <BookingCard key={b.id} b={b} />)}
      </div>

      {completed.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-lg font-bold text-navy">Completed / Cancelled</h2>
          <div className="mt-4 space-y-4">
            {completed.map((b) => <BookingCard key={b.id} b={b} />)}
          </div>
        </div>
      )}
    </div>
  );
}
