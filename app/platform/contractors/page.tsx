import Link from "next/link";
import { platformOverview } from "@/lib/platformReadModel";
import { ContractorTable } from "@/components/platform/ContractorTable";
import { HiddenFixturesNote } from "@/components/platform/HiddenFixturesNote";

export const dynamic = "force-dynamic";

/** The directory: every contractor, with the facts that exist. No lifecycle column exists yet, so none is shown. */
export default async function PlatformContractorsPage() {
  const o = await platformOverview();
  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
        <h1 className="font-display text-2xl font-bold text-navy">Contractors</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          {o.contractors.total} in total. Enabled is <code>Contractor.active</code>; everything else is
          read from inside each contractor&rsquo;s own boundary. There is no lifecycle state yet, so none is invented.
        </p>
        </div>
        <Link href="/platform/onboarding" className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90">Onboard a contractor</Link>
      </header>
      <HiddenFixturesNote hidden={o.fixtures.hidden} />
      <ContractorTable rows={o.rows} />
    </div>
  );
}
