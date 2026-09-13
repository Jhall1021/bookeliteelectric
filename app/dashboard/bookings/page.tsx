import { formatCents } from "@/lib/flow-types";
import PushToJobberButton from "@/components/admin/PushToJobberButton";
import { withAdminContractor } from "@/lib/adminContext";

export default async function AdminBookingsPage() {
  const bookings = await withAdminContractor((db) =>
    db.booking.findMany({
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
    })
  );

  const upcoming = bookings.filter((b) => b.status === "SCHEDULED");
  const completed = bookings.filter((b) => b.status !== "SCHEDULED");

  function BookingCard({ b, muted = false }: { b: (typeof bookings)[number]; muted?: boolean }) {
    const primaryService = b.visit.lineItems.find((li) => li.isPrimary)?.service.name ?? b.visit.lineItems[0]?.service.name ?? "Service visit";
    const addOnCount = Math.max(0, b.visit.lineItems.length - 1);
    const dateLabel = new Date(b.arrivalWindow.date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    return (
      <article className={`overflow-hidden rounded-card border border-cardline bg-white shadow-sm ${muted ? "opacity-90" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-cardline bg-warmwhite/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words font-display text-base font-bold leading-snug text-navy sm:truncate">{primaryService}</h3>
              {addOnCount > 0 && (
                <span className="rounded-pill border border-electric/20 bg-electric/5 px-2 py-0.5 text-[11px] font-semibold text-electric">
                  +{addOnCount} add-on{addOnCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-navy">{b.customer.name}</p>
          </div>

          <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:justify-start sm:text-right">
            <div className="text-left sm:text-right">
              <div className="text-sm font-semibold text-navy">{dateLabel}</div>
              <div className="mt-0.5 text-xs text-slate">{b.arrivalWindow.startTime} – {b.arrivalWindow.endTime}</div>
            </div>
            <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${b.status === "SCHEDULED" ? "bg-electric/10 text-electric" : "bg-slate-100 text-slate"}`}>
              {b.status}
            </span>
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[1fr_auto] lg:gap-5">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate">Customer & visit</div>
            <div className="mt-2 space-y-1 text-sm">
              <p className="break-words text-navy">{b.address} {b.zipCode}</p>
              <p className="break-all text-slate sm:break-words">{b.customer.email}{b.customer.phone && ` · ${b.customer.phone}`}</p>
            </div>

            <div className="mt-4 border-t border-cardline pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate">Services</div>
              <div className="mt-2 space-y-1.5">
                {b.visit.lineItems.map((li) => (
                  <div key={li.id} className="flex items-start gap-2 text-sm text-navy">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${li.isPrimary ? "bg-electric" : "bg-slate-300"}`} />
                    <span className="min-w-0 break-words">{li.service.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full rounded-card border border-cardline bg-warmwhite/50 p-4 lg:min-w-[210px] lg:w-auto">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate">Booking total</span>
              <span className="font-display text-xl font-bold text-navy">{formatCents(b.totalCents)}</span>
            </div>
            <div className="mt-2 border-t border-cardline pt-2 text-xs leading-relaxed text-slate">
              {b.paymentModel === "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION" && "Card on file — captured after completion"}
              {" · "}{b.paymentStatus}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-cardline px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate">Booking ID <span className="font-mono text-navy">{b.id.slice(0, 8)}</span></p>
          <div className="w-full sm:w-auto">
            <PushToJobberButton bookingId={b.id} alreadySent={!!b.jobberJobId} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Customer work</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-navy">Bookings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            See what is coming up, who is scheduled, and what each customer booked.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
          <div className="rounded-card border border-cardline bg-white px-4 py-3 text-center shadow-sm">
            <div className="font-display text-2xl font-bold text-navy">{upcoming.length}</div>
            <div className="mt-0.5 text-xs text-slate">Upcoming</div>
          </div>
          <div className="rounded-card border border-cardline bg-white px-4 py-3 text-center shadow-sm">
            <div className="font-display text-2xl font-bold text-navy">{completed.length}</div>
            <div className="mt-0.5 text-xs text-slate">Past</div>
          </div>
        </div>
      </div>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-navy">Upcoming visits</h2>
            <p className="mt-0.5 text-xs text-slate">Scheduled work in arrival-window order.</p>
          </div>
        </div>
        <div className="space-y-4">
          {upcoming.length === 0 && (
            <div className="rounded-card border border-dashed border-cardline bg-white px-5 py-9 text-center sm:px-6 sm:py-10">
              <div className="text-sm font-semibold text-navy">Nothing scheduled yet</div>
              <p className="mt-1 text-xs text-slate">New customer bookings will appear here automatically.</p>
            </div>
          )}
          {upcoming.map((b) => <BookingCard key={b.id} b={b} />)}
        </div>
      </section>

      {completed.length > 0 && (
        <section className="mt-10 border-t border-cardline pt-8">
          <div className="mb-3">
            <h2 className="font-display text-lg font-bold text-navy">Past bookings</h2>
            <p className="mt-0.5 text-xs text-slate">Completed, canceled, and otherwise closed visits.</p>
          </div>
          <div className="space-y-4">
            {completed.map((b) => <BookingCard key={b.id} b={b} muted />)}
          </div>
        </section>
      )}
    </div>
  );
}
