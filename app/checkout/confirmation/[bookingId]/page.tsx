import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/flow-types";
import { notFound } from "next/navigation";

export default async function ConfirmationPage({ params }: { params: { bookingId: string } }) {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: { arrivalWindow: true, customer: true },
  });

  if (!booking) return notFound();

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <div className="ray-accent mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl text-success">
        ✓
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold text-navy">You're All Set!</h1>
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
      </div>

      <p className="mt-6 text-sm text-slate">
        A confirmation email and text are on their way to {booking.customer.email}.
      </p>
    </main>
  );
}
