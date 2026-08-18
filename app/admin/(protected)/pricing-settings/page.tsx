import { prisma } from "@/lib/prisma";
import PricingSettingsForm from "@/components/admin/PricingSettingsForm";

export default async function PricingSettingsPage() {
  const settings = await prisma.pricingSettings.findUnique({ where: { id: "default" } });
  const withData = await prisma.service.count({ where: { primaryLaborUnits: { not: null } } });
  const withoutData = await prisma.service.count({ where: { primaryLaborUnits: null } });

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
                targetRateCents: settings.targetRateCents,
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
