import PricingSettingsForm from "@/components/admin/PricingSettingsForm";
import { withAdminContractor } from "@/lib/adminContext";

export default async function PricingSettingsPage() {
  // GUARD-ADOPTED (ADR-007a). These counts describe THIS contractor's catalog
  // readiness; unscoped they would have counted everyone's. The settings read
  // used `where: { id: "default" }` — the pre-tenant singleton row — so with
  // two contractors it would have shown the same rate to both.
  const { settings, withData, withoutData } = await withAdminContractor(async (db, ctx) => ({
    settings: await db.pricingSettings.findUnique({
      where: { contractorId: ctx.contractorId },
    }),
    withData: await db.service.count({ where: { primaryLaborUnits: { not: null } } }),
    withoutData: await db.service.count({ where: { primaryLaborUnits: null } }),
  }));

  const total = withData + withoutData;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex flex-col gap-4 border-b border-cardline pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Pricing foundation</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy">Pricing Settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
            Set the few company-wide numbers Price2Book uses when it builds a service price from labor and materials.
            Saving these settings does not change a published customer price.
          </p>
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Catalog services</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy">{total}</p>
          <p className="mt-1 text-xs text-slate">Services currently in your catalog.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Model-ready</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy">{withData}</p>
          <p className="mt-1 text-xs text-slate">Have validated labor-unit data and can be checked against the model.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Not modeled yet</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy">{withoutData}</p>
          <p className="mt-1 text-xs text-slate">Will be skipped by the comparison check.</p>
        </div>
      </div>

      <div className="mt-6 rounded-card border border-electric/20 bg-electric/5 px-4 py-3 text-sm text-slate">
        <span className="font-semibold text-navy">Your published prices stay under your control.</span>{" "}
        Use these settings to define the model, then review differences before deciding whether to change any individual service.
      </div>

      <PricingSettingsForm
        settings={
          settings
            ? {
                crewHourRateCents: settings.crewHourRateCents,
                primaryMinimumCents: settings.primaryMinimumCents,
                roundingIncrementCents: settings.roundingIncrementCents,
                defaultPermitAdminCents: settings.defaultPermitAdminCents,
              }
            : null
        }
      />
    </div>
  );
}
