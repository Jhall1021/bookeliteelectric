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
    <div className="mx-auto w-full max-w-5xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate">
        <Link href="/dashboard/settings" className="font-medium transition hover:text-electric hover:underline">Settings</Link>
        <span aria-hidden="true" className="text-cardline">/</span>
        <span>Integrations</span>
      </nav>

      <header className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Operations</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Integrations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate">
            Keep running your business in the software you already use. Price2Book handles the customer-facing pricing and booking flow, then hands booked work across to Jobber for the operational side.
          </p>
        </div>
        <div className={`w-fit rounded-pill px-3 py-1.5 text-xs font-semibold ${connection ? "bg-success/10 text-success" : "bg-white text-slate ring-1 ring-cardline"}`}>
          Jobber · {connection ? "connected" : "not connected"}
        </div>
      </header>

      <section className="mt-6">
        <JobberConnectionPanel
          isConnected={!!connection}
          connectedAt={connection?.connectedAt.toISOString() ?? null}
          justConnected={searchParams.connected === "1"}
          error={searchParams.error}
        />
      </section>

      <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Availability</p>
            <h2 className="mt-1 font-display text-lg font-bold text-navy">Crew eligibility</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate">
              Choose which synced Jobber users should count when Price2Book checks customer-facing booking capacity. This affects availability only; it does not assign or dispatch work.
            </p>
          </div>
          {connection ? (
            <Link href="/dashboard/jobber/crews" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-pill border border-cardline px-4 py-2.5 text-sm font-semibold text-electric transition hover:border-electric hover:bg-electric/5">
              Manage crew eligibility
            </Link>
          ) : (
            <span className="shrink-0 rounded-pill bg-warmwhite px-3 py-1.5 text-xs font-semibold text-slate">Connect Jobber first</span>
          )}
        </div>
      </section>

      <div className="mt-6 rounded-card border border-cardline bg-warmwhite/60 px-4 py-3 text-xs leading-relaxed text-slate">
        Price2Book does not become a dispatch system when Jobber is connected. Jobber remains authoritative for external scheduling and day-to-day field operations.
      </div>
    </div>
  );
}
