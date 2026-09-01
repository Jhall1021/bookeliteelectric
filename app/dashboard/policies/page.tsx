import { withAdminContractor } from "@/lib/adminContext";
import { policiesFor } from "@/lib/policyResolution";
import PolicyList from "@/components/admin/PolicyList";

export const dynamic = "force-dynamic";

/**
 * Where a contractor answers the questions the catalog cannot answer for them.
 *
 * The trade knows every electrician charges more for a long run; only this
 * electrician knows how long a run has to be. Those numbers were collected at
 * install as unresolved rows and there was nowhere to fill them in, so the
 * band answers a homeowner reads stayed as patterns: "{b1} feet or less".
 */
export default async function PoliciesPage() {
  const policies = await withAdminContractor((db, ctx) => policiesFor(db, ctx.contractorId));

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold text-navy">Your pricing policies</h1>
      <p className="mt-2 text-sm text-slate">
        These are the judgment calls that are yours, not the trade&apos;s. Your answers
        become the choices a homeowner picks from, so a job is priced the way you
        would price it.
      </p>
      <div className="mt-8">
        <PolicyList policies={policies} />
      </div>
    </div>
  );
}
