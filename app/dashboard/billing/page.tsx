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

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold text-navy">Tax &amp; deposits</h1>
      <p className="mt-2 text-sm text-slate">
        What a homeowner is asked to pay, beyond the price of the work itself.
      </p>
      <div className="mt-8">
        <BillingPolicyForm settings={c} />
      </div>
    </div>
  );
}
