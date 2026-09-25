import { loadBusinessHours, generateArrivalWindows } from "@/lib/businessHours";
import BusinessHoursForm from "@/components/admin/BusinessHoursForm";
import NativeCrewCalendar from "@/components/admin/NativeCrewCalendar";
import { withAdminContractor } from "@/lib/adminContext";
import { addServiceDays, serviceDateAt, serviceDateToStored, serviceWeekday } from "@/lib/serviceDate";

export const dynamic = "force-dynamic";

export default async function BusinessHoursPage() {
  const today = serviceDateAt(new Date());
  const weekday = serviceWeekday(today);
  const weekStart = addServiceDays(today, weekday === 0 ? -6 : 1 - weekday);
  const weekEnd = addServiceDays(weekStart, 6);
  // Working hours and native crew data belong to the signed-in contractor.
  const { hours, authority, legacyCapacity, crews, blocks } = await withAdminContractor(async (db, ctx) => {
    const [loadedHours, contractor, nativeCrews, nativeBlocks] = await Promise.all([
      loadBusinessHours(db, ctx.contractorId),
      db.contractor.findUnique({ where: { id: ctx.contractorId }, select: { schedulingAuthority: true, nativeConcurrentJobs: true } }),
      db.nativeCrew.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
      db.nativeCrewBlock.findMany({
        where: { date: { gte: serviceDateToStored(weekStart), lte: serviceDateToStored(weekEnd) } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);
    return {
      hours: loadedHours,
      authority: contractor?.schedulingAuthority ?? null,
      legacyCapacity: contractor?.nativeConcurrentJobs ?? null,
      crews: nativeCrews.map(({ id, name, active }) => ({ id, name, active })),
      blocks: nativeBlocks.map(({ id, crewId, date, startTime, endTime, note }) => ({
        id, crewId, date: date.toISOString().slice(0, 10), startTime, endTime, note,
      })),
    };
  });
  const windows = generateArrivalWindows(hours);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="border-b border-cardline pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Scheduling</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-navy">Working Hours</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
          Set the hours Price2Book can schedule work. Customer arrival windows come from this schedule,
          and a job is never offered if there is not enough time left to finish it before your day ends.
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Your calendar</p>
          <p className="mt-1 text-sm font-semibold text-navy">Company working hours</p>
          <p className="mt-1 text-xs leading-5 text-slate">These are the boundaries Price2Book uses before it offers a customer a time.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Customer view</p>
          <p className="mt-1 text-sm font-semibold text-navy">Arrival windows</p>
          <p className="mt-1 text-xs leading-5 text-slate">Customers choose from the windows generated from the hours you set below.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Built-in guard</p>
          <p className="mt-1 text-sm font-semibold text-navy">Enough time to finish</p>
          <p className="mt-1 text-xs leading-5 text-slate">Longer jobs disappear from late-day choices when they would run past closing.</p>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-bold text-navy">Weekly availability</h2>
          <p className="mt-1 text-sm text-slate">Choose the days and hours you normally take bookable work.</p>
        </div>
        <div className="p-5 sm:p-6">
          <BusinessHoursForm initial={hours} initialWindows={windows} />
        </div>
      </section>

      {authority === "NATIVE" ? (
        <NativeCrewCalendar initialCrews={crews} initialBlocks={blocks} initialWeek={weekStart} legacyCapacity={legacyCapacity} />
      ) : (
        <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card sm:p-6">
          <h2 className="font-display text-lg font-bold text-navy">Crew calendar</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            {authority === "EXTERNAL"
              ? "Your connected scheduling system controls crew availability, so blocked time should be managed there. Price2Book checks that calendar before offering a time."
              : "Choose whether Price2Book or an integrated scheduling system controls availability during guided setup. The native crew calendar appears here when Price2Book is selected."}
          </p>
        </section>
      )}
    </div>
  );
}
