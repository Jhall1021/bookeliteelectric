"use client";

import Link from "next/link";
import type { Finding } from "@/lib/onboardingReadiness";

/**
 * Deposits, and only if the contractor actually takes them.
 *
 * A contractor who charges nothing up front needs no Stripe account, and
 * saying otherwise — even as a warning — would invent a requirement their
 * business does not have. So this stage is genuinely finished for them.
 */
export default function PaymentsPanel({
  depositing, stripeReady, stripeReason, findings,
}: {
  depositing: { name: string; depositCents: number }[];
  stripeReady: boolean;
  stripeReason: string;
  findings: Finding[];
}) {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Deposits</h2>

        {depositing.length === 0 ? (
          <>
            <p className="mt-1 text-sm text-success">
              None of the services you offer asks for a deposit, so there is nothing to set up here.
            </p>
            <p className="mt-2 text-sm text-slate">
              That is a perfectly normal way to run. If you later decide to take a deposit on a
              job, you&rsquo;ll set it on that service and connect Stripe then.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate">
              {depositing.length} of the services you offer ask{depositing.length === 1 ? "s" : ""} for a
              deposit, so you&rsquo;ll need to be able to take one.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {depositing.map((d) => (
                <li key={d.name} className="flex justify-between border-b border-cardline pb-2 last:border-0">
                  <span className="text-navy">{d.name}</span>
                  <span className="font-medium text-navy">{money(d.depositCents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-card bg-warmwhite p-4">
              <span className={`text-sm ${stripeReady ? "text-success" : "text-slate"}`}>
                {stripeReady ? "Stripe is ready to take deposits." : stripeReason}
              </span>
              <Link href="/dashboard/payments" className="shrink-0 text-sm font-semibold text-electric hover:underline">
                Open
              </Link>
            </div>
          </>
        )}
      </section>

      {findings.length > 0 && (
        <section className="rounded-card border border-cardline bg-warmwhite p-5">
          <h3 className="text-sm font-semibold text-navy">Before a homeowner can book</h3>
          <ul className="mt-3 space-y-2">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  f.severity === "blocker" ? "bg-red-500" : "bg-amber-400"}`} />
                <span className="text-slate">
                  {f.message}
                  {f.href && (
                    <Link href={f.href} className="ml-1 font-medium text-electric hover:underline">Fix</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
