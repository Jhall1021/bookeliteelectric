import Link from "next/link";
import JobberConnectionPanel from "@/components/admin/JobberConnectionPanel";
import { withAdminContractor } from "@/lib/adminContext";

export default async function JobberPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  // ADR-007a: keyed by contractor, not the pre-tenant "default" row. Every
  // contractor connects their OWN Jobber account; a shared row would have
  // pushed one contractor's bookings into another's dispatch.
  const connection = await withAdminContractor((db, ctx) =>
    db.jobberConnection.findUnique({ where: { contractorId: ctx.contractorId } })
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Jobber Integration</h1>
      <p className="mt-1 text-sm text-slate">
        Connect your Elite Electric Jobber account so completed bookings can be pushed there for
        dispatch and scheduling.
      </p>

      <JobberConnectionPanel
        isConnected={!!connection}
        connectedAt={connection?.connectedAt.toISOString() ?? null}
        justConnected={searchParams.connected === "1"}
        error={searchParams.error}
      />

      {connection && (
        <Link href="/admin/jobber/crews" className="mt-4 inline-block text-sm font-medium text-electric">
          Manage Crew Eligibility →
        </Link>
      )}
    </div>
  );
}
