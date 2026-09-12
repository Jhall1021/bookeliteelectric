import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { connectReadiness } from "@/lib/stripeConnect";
import StripeConnectionActions from "./StripeConnectionActions";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  return withAdminContractor(async (db, ctx) => {
    const c = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: {
        depositAmountCents: true,
        depositOnEveryBooking: true,
        depositSubtotalThresholdCents: true,
        depositDurationThresholdMinutes: true,
        stripeAccountId: true,
        stripeMerchantConfigured: true,
        stripeCardPaymentsStatus: true,
        stripeOnboardingBlocked: true,
        stripeReadinessCheckedAt: true,
      },
    });
    const readiness = connectReadiness(c);

    // Checkout does not read the deprecated Service.depositCents field. There
    // is one contractor deposit amount per booking; each service either always
    // requires it, never requires it, or participates in these company rules.
    const offered = await db.service.findMany({
      where: { contractorId: ctx.contractorId, offered: true },
      select: { slug: true, name: true, depositRule: true, active: true },
      orderBy: { name: "asc" },
    });

    const companyRuleActive =
      c.depositOnEveryBooking ||
      c.depositSubtotalThresholdCents !== null ||
      c.depositDurationThresholdMinutes !== null;
    const companyPolicyServices = offered.filter((service) => service.depositRule === "USE_COMPANY_POLICY");
    const alwaysRequire = offered.filter((service) => service.depositRule === "ALWAYS_REQUIRE");
    const canTriggerDeposit =
      alwaysRequire.length > 0 || (companyRuleActive && companyPolicyServices.length > 0);
    const amountConfigured = (c.depositAmountCents ?? 0) > 0;
    const needed = canTriggerDeposit && amountConfigured;
    const policyMissingAmount = canTriggerDeposit && !amountConfigured;
    const livePotential = offered.filter(
      (service) => service.active && (
        service.depositRule === "ALWAYS_REQUIRE" ||
        (service.depositRule === "USE_COMPANY_POLICY" && companyRuleActive)
      )
    ).length;

    return (
      <div className="mx-auto w-full max-w-5xl">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate">
          <Link href="/dashboard/settings" className="font-medium transition hover:text-electric hover:underline">
            Settings
          </Link>
          <span aria-hidden="true" className="text-cardline">/</span>
          <span>Payments</span>
        </nav>

        <header className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-electric">Payments</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Your Stripe connection</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              Deposits are taken on your own Stripe account. You remain the merchant of record,
              and homeowner money goes to you rather than through a Price2Book balance.
            </p>
          </div>
          <Link
            href="/dashboard/billing"
            className="inline-flex shrink-0 items-center justify-center rounded-pill border border-cardline bg-white px-4 py-2.5 text-sm font-semibold text-navy shadow-sm transition hover:border-electric hover:text-electric"
          >
            Review tax &amp; deposit rules
          </Link>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Summary
            label="Stripe status"
            value={readiness.ready ? "Ready" : c.stripeAccountId ? "Needs attention" : "Not connected"}
            tone={readiness.ready ? "success" : needed ? "attention" : "calm"}
          />
          <Summary
            label="Company deposit"
            value={amountConfigured ? `$${((c.depositAmountCents ?? 0) / 100).toFixed(2)}` : "Not set"}
            tone={policyMissingAmount ? "attention" : "calm"}
          />
          <Summary label="Live work that may collect" value={String(livePotential)} />
        </div>

        {policyMissingAmount && (
          <div className="mt-5 rounded-card border border-p2b-amber-ink/30 bg-p2b-amber-tint px-4 py-3 text-sm leading-relaxed text-p2b-amber-ink">
            <p className="font-semibold text-navy">Your deposit rules can require a deposit, but no company deposit amount is set.</p>
            <p className="mt-1">Checkout will collect $0 when those rules match until you set the amount under Tax &amp; Deposits.</p>
            <Link href="/dashboard/billing" className="mt-2 inline-flex font-semibold text-electric hover:underline">Set deposit amount</Link>
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
          <div className="flex flex-col gap-4 border-b border-cardline bg-warmwhite/55 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold text-navy">Stripe readiness</h2>
                <StatusPill ready={readiness.ready} needed={needed} connected={Boolean(c.stripeAccountId)} />
              </div>
              <p className={`mt-1 text-sm leading-relaxed ${readiness.ready ? "text-success" : "text-slate"}`}>
                {readiness.ready ? "Ready to take deposits." : readiness.reason}
              </p>
            </div>
            {c.stripeReadinessCheckedAt && (
              <div className="shrink-0 rounded-card border border-cardline bg-white px-3 py-2 text-xs text-slate">
                Last checked<br />
                <span className="font-medium text-navy">
                  {new Date(c.stripeReadinessCheckedAt).toLocaleString("en-US")}
                </span>
              </div>
            )}
          </div>

          <div className="border-b border-cardline px-5 py-4 sm:px-6">
            <StripeConnectionActions connected={Boolean(c.stripeAccountId)} ready={readiness.ready} />
          </div>

          <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-3">
            <ReadinessFact label="Stripe account" value={c.stripeAccountId ? "Connected" : "Not connected"} ready={Boolean(c.stripeAccountId)} />
            <ReadinessFact label="Merchant setup" value={c.stripeMerchantConfigured ? "Configured" : "Not complete"} ready={c.stripeMerchantConfigured} />
            <ReadinessFact
              label="Card payments"
              value={c.stripeCardPaymentsStatus ?? "Not checked"}
              ready={c.stripeCardPaymentsStatus === "active" && !c.stripeOnboardingBlocked}
            />
          </div>

          {!c.stripeAccountId && (
            <div className={`mx-5 mb-5 rounded-card border p-4 text-sm leading-relaxed sm:mx-6 sm:mb-6 ${needed ? "border-red-200 bg-red-50 text-red-800" : "border-cardline bg-warmwhite/60 text-slate"}`}>
              <p className="font-semibold text-navy">No Stripe account is connected yet.</p>
              <p className="mt-1">
                {needed
                  ? "Your current deposit policy can collect money at booking, so Stripe must be connected before those bookings can complete online."
                  : "Your current booking rules do not collect a deposit. Stripe is optional until you configure a deposit that can apply."}
              </p>
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
          <div className="border-b border-cardline bg-warmwhite/55 px-5 py-4 sm:px-6">
            <h2 className="font-display text-lg font-bold text-navy">What can trigger a deposit?</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate">
              One company deposit is evaluated for the whole booking. Services can override whether that company deposit applies; they do not carry a separate deposit amount.
            </p>
          </div>

          <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
            <div className="rounded-card border border-cardline bg-warmwhite/35 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">Company rules</p>
              {companyRuleActive ? (
                <ul className="mt-3 space-y-2 text-sm text-navy">
                  {c.depositOnEveryBooking && <li>• Every online booking</li>}
                  {c.depositSubtotalThresholdCents !== null && <li>• Pre-tax subtotal at or above ${ (c.depositSubtotalThresholdCents / 100).toFixed(2) }</li>}
                  {c.depositDurationThresholdMinutes !== null && <li>• Booking reserves at least { (c.depositDurationThresholdMinutes / 60).toFixed(1) } hours</li>}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate">No company-wide trigger is enabled.</p>
              )}
            </div>

            <div className="rounded-card border border-cardline bg-warmwhite/35 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">Service overrides</p>
              <p className="mt-2 text-sm text-navy">
                {alwaysRequire.length} offered service{alwaysRequire.length === 1 ? "" : "s"} always require{alwaysRequire.length === 1 ? "s" : ""} the company deposit.
              </p>
              <p className="mt-1 text-sm text-slate">
                {companyPolicyServices.length} offered service{companyPolicyServices.length === 1 ? "" : "s"} use{companyPolicyServices.length === 1 ? "s" : ""} the company rules.
              </p>
            </div>
          </div>

          {alwaysRequire.length > 0 && (
            <ul className="divide-y divide-cardline border-t border-cardline">
              {alwaysRequire.map((service) => (
                <li key={service.slug} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0">
                    <span className="font-medium text-navy">{service.name}</span>
                    <code className="mt-0.5 block break-all text-[11px] text-slate">{service.slug}</code>
                  </div>
                  <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${service.active ? "bg-success/10 text-success" : "bg-warmwhite text-slate"}`}>
                    {service.active ? "Live · always deposit" : "Always deposit"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-cardline bg-warmwhite/40 px-5 py-3 text-xs leading-relaxed text-slate sm:px-6">
            Company amount and thresholds live under Tax &amp; Deposits. Per-service behavior is edited on each service under Site visit &amp; deposit. {" "}
            <Link href="/dashboard/services" className="font-semibold text-electric hover:underline">Open Services &amp; Pricing</Link>
          </div>
        </section>

        <div className="mt-6 rounded-card border border-cardline bg-warmwhite/55 px-4 py-3 text-xs leading-relaxed text-slate">
          Price2Book intentionally does not duplicate Stripe&apos;s payout, refund, dispute, or transaction reporting here. Those remain in Stripe, where the contractor&apos;s payment account is authoritative.
        </div>
      </div>
    );
  });
}

function Summary({ label, value, tone = "calm" }: { label: string; value: string; tone?: "calm" | "success" | "attention" }) {
  const shell = tone === "success"
    ? "border-success/25 bg-success/[0.04]"
    : tone === "attention"
      ? "border-p2b-amber-ink/30 bg-p2b-amber-tint"
      : "border-cardline bg-white";
  return (
    <div className={`rounded-card border px-4 py-3 shadow-sm ${shell}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-navy">{value}</div>
    </div>
  );
}

function StatusPill({ ready, needed, connected }: { ready: boolean; needed: boolean; connected: boolean }) {
  const label = ready ? "Ready" : connected ? "Needs attention" : needed ? "Required" : "Optional";
  const tone = ready
    ? "bg-success/10 text-success"
    : needed
      ? "bg-p2b-amber-tint text-p2b-amber-ink"
      : "bg-warmwhite text-slate";
  return <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

function ReadinessFact({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="rounded-card border border-cardline bg-warmwhite/35 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ready ? "bg-success" : "bg-slate/35"}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate">{label}</span>
      </div>
      <div className="mt-2 break-words text-sm font-semibold capitalize text-navy">{value.replaceAll("_", " ")}</div>
    </div>
  );
}
