import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import BillingPolicyForm from "@/components/admin/BillingPolicyForm";

export const dynamic = "force-dynamic";

/**
 * Tax and deposits — two contractor decisions that change what a homeowner pays.
 *
 * Both had a route and no screen, which made them developer-only steps in a
 * product whose whole claim is that a contractor configures it themselves.
 */
export default async function BillingPage() {
  const c = await withAdminContractor((db, ctx) =>
    db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: {
        salesTaxEnabled: true, salesTaxRatePpm: true,
        depositAmountCents: true, depositOnEveryBooking: true,
        depositSubtotalThresholdCents: true, depositDurationThresholdMinutes: true,
      },
    })
  );

  const depositRules = [
    c.depositOnEveryBooking,
    c.depositSubtotalThresholdCents !== null,
    c.depositDurationThresholdMinutes !== null,
  ].filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav aria-label="Breadcrumb" className="text-sm text-slate">
        <Link href="/dashboard/settings" className="font-medium transition hover:text-electric hover:underline">
          Settings
        </Link>
        <span className="mx-1.5 text-cardline">/</span>
        <span>Tax &amp; Deposits</span>
      </nav>

      <header className="mt-3 flex flex-col gap-5 rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-electric">Pricing settings</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Tax &amp; deposits</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            Control the charges that sit around the service price itself. These settings affect what a homeowner sees and pays at checkout.
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:min-w-[280px]">
          <Summary label="Sales tax" value={c.salesTaxEnabled ? "On" : "Off"} />
          <Summary label="Deposit rules" value={String(depositRules)} />
        </div>
      </header>

      <div className="mt-6">
        <BillingPolicyForm settings={c} />
      </div>

      <p className="mt-6 rounded-card border border-cardline bg-warmwhite/60 px-4 py-3 text-xs leading-relaxed text-slate">
        Price2Book applies the rules you set here; it does not decide whether your work is taxable or what deposit policy your business should use.
      </p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-cardline bg-warmwhite/55 px-4 py-3 text-center">
      <div className="font-display text-xl font-bold text-navy">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-slate">{label}</div>
    </div>
  );
}
