import { withAdminContractor } from "@/lib/adminContext";
import { connectReadiness } from "@/lib/stripeConnect";
import Link from "next/link";

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
        stripeAccountId: true, stripeMerchantConfigured: true, stripeCardPaymentsStatus: true,
        stripeOnboardingBlocked: true, stripeReadinessCheckedAt: true,
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

    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-2xl font-bold text-navy">Payments</h1>
        <p className="mt-1 text-sm text-slate">
          Deposits are taken on your own Stripe account. You are the merchant of record, and the
          money reaches you directly.
        </p>

        <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-navy">Stripe</h2>
              <p className={`mt-1 text-sm ${readiness.ready ? "text-success" : "text-slate"}`}>
                {readiness.ready ? "Ready to take deposits." : readiness.reason}
              </p>
              {c.stripeReadinessCheckedAt && (
                <p className="mt-1 text-xs text-slate">
                  Last checked with Stripe {new Date(c.stripeReadinessCheckedAt).toLocaleString("en-US")}.
                </p>
              )}
            </div>
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                readiness.ready ? "bg-success" : needed ? "bg-red-500" : "bg-slate/40"
              }`}
            />
          </div>

          {!c.stripeAccountId && (
            <p className="mt-4 rounded-card bg-warmwhite p-4 text-sm text-slate">
              No Stripe account is connected yet.{" "}
              {needed
                ? "One of your services asks for a deposit, so this has to be connected before anyone can book it."
                : "You don't need one unless you decide to take deposits."}
            </p>
          )}
        </section>

        <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Deposits you ask for</h2>
          {depositing.length === 0 ? (
            <p className="mt-1 text-sm text-slate">
              None of the services you offer asks for a deposit. That is a perfectly normal way to
              run — nothing here is required of you.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {depositing.map((s) => (
                <li key={s.slug} className="flex items-center justify-between border-b border-cardline pb-2 text-sm last:border-0">
                  <span className="text-navy">
                    {s.name}
                    {s.active && <span className="ml-2 text-xs text-success">Live</span>}
                  </span>
                  <span className="font-medium text-navy">
                    ${((s.depositCents ?? 0) / 100).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate">
            A deposit is set on the service itself, under Site visit &amp; deposit.{" "}
            <Link href="/dashboard/services" className="text-electric hover:underline">
              Open your services
            </Link>
          </p>
        </section>
      </div>
    );
  });
}
