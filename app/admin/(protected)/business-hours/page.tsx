import { prisma } from "@/lib/prisma";
import { loadBusinessHours, generateArrivalWindows } from "@/lib/businessHours";
import BusinessHoursForm from "@/components/admin/BusinessHoursForm";

export const dynamic = "force-dynamic";

export default async function BusinessHoursPage() {
  const hours = await loadBusinessHours(prisma);
  const windows = generateArrivalWindows(hours);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Working Hours</h1>
      <p className="mt-1 text-sm text-slate">
        When customers can book. Arrival windows are generated from these hours, and
        jobs too long to finish before the day ends aren&rsquo;t offered.
      </p>
      <BusinessHoursForm initial={hours} initialWindows={windows} />
    </div>
  );
}
