import { prisma } from "@/lib/prisma";
import CrewEligibilityPanel from "@/components/admin/CrewEligibilityPanel";

export default async function JobberCrewsPage() {
  const crewMembers = await prisma.jobberCrewMember.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Crew Eligibility</h1>
      <p className="mt-1 text-sm text-slate">
        Mark which of your Jobber users count as available capacity for website bookings — e.g.
        your electrician crews, but not carpenters or office staff. This is the foundation for
        checking real availability before a customer can pick an arrival window.
      </p>

      <CrewEligibilityPanel
        crewMembers={crewMembers.map((c) => ({
          id: c.id,
          name: c.name,
          eligibleForWebsiteBookings: c.eligibleForWebsiteBookings,
        }))}
      />
    </div>
  );
}
