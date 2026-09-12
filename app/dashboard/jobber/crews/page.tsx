import Link from "next/link";
import CrewEligibilityPanel from "@/components/admin/CrewEligibilityPanel";
import { withAdminContractor } from "@/lib/adminContext";

export default async function JobberCrewsPage() {
  // Guarded: this contractor's crew, not every contractor's.
  const crewMembers = await withAdminContractor((db) =>
    db.jobberCrewMember.findMany({ orderBy: { name: "asc" } })
  );
  const eligible = crewMembers.filter((member) => member.eligibleForWebsiteBookings).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate">
        <Link href="/dashboard/settings" className="font-medium transition hover:text-electric hover:underline">Settings</Link>
        <span aria-hidden="true" className="text-cardline">/</span>
        <Link href="/dashboard/jobber" className="font-medium transition hover:text-electric hover:underline">Integrations</Link>
        <span aria-hidden="true" className="text-cardline">/</span>
        <span>Crew eligibility</span>
      </nav>

      <header className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Availability</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Crew eligibility</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate">
            Decide which synced Jobber users count as real capacity for bookings taken through Price2Book. Office staff, carpenters, or anyone who should not affect customer-facing availability can stay excluded.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[250px]">
          <Summary label="Synced users" value={crewMembers.length} />
          <Summary label="Eligible" value={eligible} tone="success" />
        </div>
      </header>

      <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric/10 text-sm font-bold text-electric">1</span>
          <div>
            <h2 className="font-display text-lg font-bold text-navy">Who should count toward capacity?</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate">
              This does not assign jobs or dispatch technicians. It only tells Price2Book which Jobber users are legitimate capacity when external scheduling is authoritative.
            </p>
          </div>
        </div>

        <CrewEligibilityPanel
          crewMembers={crewMembers.map((c) => ({
            id: c.id,
            name: c.name,
            eligibleForWebsiteBookings: c.eligibleForWebsiteBookings,
          }))}
        />
      </section>

      <div className="mt-6 rounded-card border border-cardline bg-warmwhite/60 px-4 py-3 text-xs leading-relaxed text-slate">
        Jobber remains the source of truth for whether those eligible users are actually free. Price2Book does not create availability from this list by itself.
      </div>
    </div>
  );
}

function Summary({ label, value, tone = "calm" }: { label: string; value: number; tone?: "calm" | "success" }) {
  return (
    <div className={`rounded-card border px-3 py-2.5 text-center shadow-sm ${tone === "success" ? "border-success/25 bg-success/[0.04]" : "border-cardline bg-white"}`}>
      <div className="font-display text-xl font-bold tabular-nums text-navy">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-slate">{label}</div>
    </div>
  );
}
