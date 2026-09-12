"use client";

import Link from "next/link";
import type { Finding } from "@/lib/onboardingReadiness";

type DepositService = {
  name: string;
  source: "always" | "company";
};

export default function PaymentsPanel({
  depositing, depositAmountCents, stripeReady, stripeReason, findings,
}: {
  depositing: DepositService[];
  depositAmountCents: number | null;
  stripeReady: boolean;
  stripeReason: string;
  findings: Finding[];
}) {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const amountConfigured = (depositAmountCents ?? 0) > 0;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
        <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-bold text-navy">Payments & deposits</h2>
          <p className="mt-1 text-sm text-slate">Payment setup is only required when one of the services you offer can collect a deposit before the visit.</p>
        </div>

        <div className="p-5 sm:p-6">
          {depositing.length === 0 ? (
            <div className="rounded-card border border-success/20 bg-success/5 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-sm font-bold text-success">✓</span>
                <div>
                  <h3 className="text-sm font-semibold text-navy">No payment setup needed right now</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate">None of the services you currently offer can require a deposit under your company rules or a service override. Customers can still price and book without connecting Stripe.</p>
                  <p className="mt-2 text-xs text-slate">If you turn on a deposit rule later, Price2Book will bring payment setup back into this checklist.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!amountConfigured ? (
                <div className="rounded-card border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Deposit amount</div>
                      <div className="mt-1 text-sm font-semibold text-navy">Your rules can require a deposit, but no amount is set</div>
                      <p className="mt-1 text-sm text-slate">Set the one company deposit amount before connecting payments. Price2Book never invents an amount for you.</p>
                    </div>
                    <Link href="/dashboard/settings/billing" className="rounded-pill border border-cardline bg-white px-4 py-2 text-sm font-semibold text-electric transition hover:border-electric">
                      Set deposit rules
                    </Link>
                  </div>
                </div>
              ) : (
                <div className={`rounded-card border p-4 ${stripeReady ? "border-success/20 bg-success/5" : "border-cardline bg-warmwhite/50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className={`text-xs font-semibold uppercase tracking-wide ${stripeReady ? "text-success" : "text-slate"}`}>Payment account</div>
                      <div className="mt-1 text-sm font-semibold text-navy">{stripeReady ? "Ready to collect deposits" : "Stripe setup needs attention"}</div>
                      <p className="mt-1 text-sm text-slate">{stripeReady ? `Your company deposit is ${money(depositAmountCents!)} per booking when a rule matches.` : stripeReason}</p>
                    </div>
                    <Link href="/dashboard/payments" className="rounded-pill border border-cardline bg-white px-4 py-2 text-sm font-semibold text-electric transition hover:border-electric">
                      {stripeReady ? "Manage payments" : "Finish setup"}
                    </Link>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-navy">Services that can require the company deposit</h3>
                    <p className="mt-0.5 text-xs text-slate">Price2Book takes one deposit per booking, not one deposit for every service in the cart.</p>
                  </div>
                  <span className="text-xs font-medium text-slate">{depositing.length} {depositing.length === 1 ? "service" : "services"}</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-card border border-cardline">
                  {depositing.map((d, i) => (
                    <div key={`${d.name}-${i}`} className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${i > 0 ? "border-t border-cardline" : ""}`}>
                      <span className="font-medium text-navy">{d.name}</span>
                      <span className="shrink-0 rounded-pill bg-warmwhite px-2.5 py-1 text-xs font-semibold text-navy">
                        {d.source === "always" ? "Always require" : "Company rules"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate">
                  A service marked “Never require” does not trigger a deposit on its own, but it also does not waive a deposit triggered by another service in the same booking.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {findings.length > 0 && (
        <section className="rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-navy">Before customers can book these services</h3>
              <p className="mt-1 text-xs text-slate">Price2Book is showing the remaining payment-related items from your setup checks.</p>
            </div>
            <span className="rounded-pill bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{findings.length} to review</span>
          </div>
          <ul className="mt-4 space-y-2">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-3 rounded-card border border-cardline bg-warmwhite/40 p-3 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.severity === "blocker" ? "bg-red-500" : "bg-amber-400"}`} />
                <span className="text-slate">
                  {f.message}
                  {f.href && <Link href={f.href} className="ml-1 font-semibold text-electric hover:underline">Fix this</Link>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
