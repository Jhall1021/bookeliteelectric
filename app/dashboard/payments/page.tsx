import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { connectReadiness } from "@/lib/stripeConnect";
import StripeConnectionActions from "./StripeConnectionActions";

export const dynamic = "force-dynamic";

/**
 * Payments configuration — connection status and what it means.
 *
 * DELIBERATELY SMALL. Guided Setup's payment findings needed a destination and
 * were pointing at a route that did not exist, so a "Fix" button led to a 404.
 * This is the durable page that answers those findings and nothing else.
 *
 * NOT here, on purpose: ledger reporting, payouts, refunds, transaction
 * history, accounting. Price2Book collects a deposit on the contractor's own
 * Stripe account — they are the merchant of record, and their money lives in
 * their Stripe dashboard rather than in a reporting surface we would have to
 * keep true.
 */
export default async function PaymentsPage() {
  return withAdminContractor(async (db, ctx) => {
    const c = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: {
        stripeAccountId: true,
        stripeMerchantConfigured: true,
        stripeCardPaymentsStatus: true,
        stripeOnboardingBlocked: true,
        stripeReadinessCheckedAt: true,
      },
    });
    const readiness = connectReadiness(c);

    // Which of this contractor's services actually ask for money up front.
    const depositing = await db.service.findMany({
      where: { contractorId: ctx.contractorId, offered: true, depositCents: { gt: 0 } },
      select: { slug: true, name: true, depositCents: true, active: true },
      orderBy: { name: "asc" },
    });

    const needed = depositing.length > 0;
    const liveDepositing = depositing.filter((service) => service.active).length;

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
          <Summary label="Services using deposits" value={String(depositing.length)} />
          <Summary label="Live with deposits" value={String(liveDepositing)} />
        </div>

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
            <ReadinessFact
              label="Stripe account"
              value={c.stripeAccountId ? "Connected" : "Not connected"}
              ready={Boolean(c.stripeAccountId)}
            />
            <ReadinessFact
              label="Merchant setup"
              value={c.stripeMerchantConfigured ? "Configured" : "Not complete"}
              ready={c.stripeMerchantConfigured}
            />
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
                  ? "At least one offered service asks for a deposit, so Stripe must be connected before that work can be booked online."
                  : "Nothing currently requires a Stripe connection. You only need one if you decide to collect deposits through Price2Book."}
              </p>
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
          <div className="border-b border-cardline bg-warmwhite/55 px-5 py-4 sm:px-6">
            <h2 className="font-display text-lg font-bold text-navy">Services that ask for a deposit</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate">
              This list comes from your offered services. A service-level deposit remains that service&apos;s decision; company-wide deposit rules are managed separately under Tax &amp; Deposits.
            </p>
          </div>

          {depositing.length === 0 ? (
            <div className="p-6 sm:p-8">
              <div className="rounded-card border border-dashed border-cardline bg-warmwhite/35 px-5 py-8 text-center">
                <p className="font-medium text-navy">No offered service currently asks for a service-level deposit.</p>
                <p className="mt-1 text-sm text-slate">That is a valid setup. Stripe is not required unless another deposit rule makes it necessary.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-cardline">
              {depositing.map((service) => (
                <li key={service.slug} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-navy">{service.name}</span>
                      <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${service.active ? "bg-success/10 text-success" : "bg-warmwhite text-slate"}`}>
                        {service.active ? "Live" : "Not live"}
                      </span>
                    </div>
                    <code className="mt-1 block break-all text-[11px] text-slate">{service.slug}</code>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <div className="font-display text-lg font-bold tabular-nums text-navy">
                      ${((service.depositCents ?? 0) / 100).toFixed(2)}
                    </div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate">service deposit</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-cardline bg-warmwhite/40 px-5 py-3 text-xs leading-relaxed text-slate sm:px-6">
            Service-level deposits are edited on the service itself under Site visit &amp; deposit. {" "}
            <Link href="/dashboard/services" className="font-semibold text-electric hover:underline">
              Open Services &amp; Pricing
            </Link>
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
