import { withAdminContractor } from "@/lib/adminContext";
import { policiesFor } from "@/lib/policyResolution";
import { pendingContractorDisclaimers } from "@/lib/disclaimerAuthoring";
import PolicyList from "@/components/admin/PolicyList";
import DisclaimerList from "@/components/admin/DisclaimerList";

export const dynamic = "force-dynamic";

/**
 * Where a contractor answers the questions the catalog cannot answer for them.
 *
 * The trade knows every electrician charges more for a long run; only this
 * electrician knows how long a run has to be. Those numbers were collected at
 * install as unresolved rows and there was nowhere to fill them in, so the
 * band answers a homeowner reads stayed as patterns: "{b1} feet or less".
 *
 * Disclaimers are the same shape of gap, one section down: a canonical
 * concept — an exterior wall may need an opening, an existing fixture on a
 * finished ceiling needs two — arrives structurally at install, but the
 * actual sentence a homeowner reads is this contractor's own words
 * (ADR-009), and nothing wrote it for them.
 */
export default async function PoliciesPage() {
  const [policies, disclaimers] = await withAdminContractor((db, ctx) =>
    Promise.all([policiesFor(db, ctx.contractorId), pendingContractorDisclaimers(db, ctx.contractorId)])
  );
  const unresolved = policies.filter((p) => !p.resolved).length;
  const resolved = policies.length - unresolved;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="border-b border-cardline pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Pricing rules</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-navy">Your pricing policies</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
          These are the judgment calls only you can make — the point where a standard job becomes a longer run,
          a harder install, or another pricing band. Your answers become the choices homeowners see.
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Policy decisions</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy">{policies.length}</p>
          <p className="mt-1 text-xs text-slate">Contractor-specific pricing choices in your catalog.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Answered</p>
          <p className="mt-1 font-display text-2xl font-bold text-success">{resolved}</p>
          <p className="mt-1 text-xs text-slate">Already have your company rule on file.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Still need you</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy">{unresolved}</p>
          <p className="mt-1 text-xs text-slate">Need an answer before those paths are fully defined.</p>
        </div>
      </div>

      <div className="mt-6 rounded-card border border-electric/20 bg-electric/5 px-4 py-3 text-sm leading-6 text-slate">
        <span className="font-semibold text-navy">Think of these like the questions your estimator already answers automatically.</span>{" "}
        Price2Book needs the same company-specific rule so it can make the same decision consistently online.
      </div>

      <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-bold text-navy">Policy decisions</h2>
          <p className="mt-1 text-sm text-slate">Review the items below and fill in only the choices that belong to your business.</p>
        </div>
        <div className="p-5 sm:p-6">
          <PolicyList policies={policies} />
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-bold text-navy">Disclaimers</h2>
          <p className="mt-1 text-sm text-slate">
            Some answers need a sentence explaining what applies — written by you, not assumed. Nothing shows to a
            homeowner until you write it.
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <DisclaimerList disclaimers={disclaimers} />
        </div>
      </section>
    </div>
  );
}
