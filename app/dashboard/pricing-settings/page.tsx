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
    })
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Pricing Settings</h1>
      <p className="mt-1 text-sm text-slate">
        One labor rate drives every service that has validated labor-unit data on file.
        Changing the rate here doesn't touch any price until you click Recalculate.
      </p>

      <div className="mt-2 flex gap-4 text-xs text-slate">
        <span>
          <strong className="text-navy">{withData}</strong> services have labor-unit data (will
          recalculate)
        </span>
        <span>
          <strong className="text-navy">{withoutData}</strong> don't yet (will be skipped)
        </span>
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
