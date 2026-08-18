import { prisma } from "@/lib/prisma";
import Link from "next/link";
import JobberConnectionPanel from "@/components/admin/JobberConnectionPanel";

export default async function JobberPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const connection = await prisma.jobberConnection.findUnique({ where: { id: "default" } });

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
