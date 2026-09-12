"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type DepositRule = "USE_COMPANY_POLICY" | "ALWAYS_REQUIRE" | "NEVER_REQUIRE";

type Props = {
  serviceId: string;
  requiresPreWorkVisit: boolean;
  preWorkVisitMinutes: number | null;
  depositRule: DepositRule;
  companyDepositAmountCents: number | null;
  depositCreditsToJob: boolean;
  ctaLabel: string | null;
  preWorkCustomerNote: string | null;
  /** Shown, never enforced here — checkout is authoritative. */
  stripeReady: boolean;
};

const money = (cents: number | null) =>
  cents && cents > 0 ? `$${(cents / 100).toFixed(2)}` : "No amount set";

export default function PreWorkDepositPanel(p: Props) {
  const router = useRouter();
  const [requiresVisit, setRequiresVisit] = useState(p.requiresPreWorkVisit);
  const [minutes, setMinutes] = useState(p.preWorkVisitMinutes?.toString() ?? "");
  const [depositRule, setDepositRule] = useState<DepositRule>(p.depositRule);
  const [credits, setCredits] = useState(p.depositCreditsToJob);
  const [cta, setCta] = useState(p.ctaLabel ?? "");
  const [note, setNote] = useState(p.preWorkCustomerNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  const field = "mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";
  const visitMinutes = minutes.trim() === "" ? null : Number(minutes);
  const canCollectDeposit = (p.companyDepositAmountCents ?? 0) > 0;
  const serviceCanRequireDeposit = depositRule !== "NEVER_REQUIRE";

  function changed(fn: () => void) {
    fn();
    setSaved(false);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (uncertain) return;
    setError(null);
    setSaved(false);

    if (requiresVisit && (visitMinutes === null || !Number.isInteger(visitMinutes) || visitMinutes <= 0)) {
      setError("Enter how long the required site visit takes before saving.");
      return;
    }

    if (visitMinutes !== null && (!Number.isInteger(visitMinutes) || visitMinutes < 0)) {
      setError("Visit length must be a whole number of minutes.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/services/${p.serviceId}/pre-work`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requiresPreWorkVisit: requiresVisit,
          preWorkVisitMinutes: visitMinutes === null ? "" : visitMinutes,
          depositRule,
          depositCreditsToJob: credits,
          ctaLabel: cta,
          preWorkCustomerNote: note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save site visit and deposit settings. Nothing was changed.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      // The request may already have committed before the browser lost the
      // response. Do not invite another write until the authoritative state is
      // loaded again.
      setUncertain(true);
      setError("Price2Book could not confirm whether that save completed. Reload this service before making more changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-8 max-w-xl rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-lg font-bold text-navy">Site visit &amp; deposit</h2>
      <p className="mt-1 text-sm text-slate">
        Decide whether this work needs an on-site check first and how it participates in your company deposit policy.
      </p>

      <label className="mt-5 flex items-start gap-3">
        <input
          type="checkbox" checked={requiresVisit}
          onChange={(e) => changed(() => setRequiresVisit(e.target.checked))}
          className="mt-1"
        />
        <span className="text-sm">
          <span className="font-medium text-navy">This job needs a site visit first</span>
          <span className="block text-slate">
            You&rsquo;ll verify the job on site before the installation is scheduled.
          </span>
        </span>
      </label>

      {requiresVisit && (
        <div className="mt-4">
          <label className="text-sm font-medium text-navy">How long is that visit?</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min="1" step="5" value={minutes}
              onChange={(e) => changed(() => setMinutes(e.target.value))}
              placeholder="30"
              className={`${field} max-w-[8rem]`}
            />
            <span className="mt-1 text-sm text-slate">minutes</span>
          </div>
          <p className="mt-1 text-xs text-slate">The check-the-job visit — not how long the installation takes.</p>
        </div>
      )}

      <div className="mt-5 border-t border-cardline pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="text-sm font-medium text-navy" htmlFor={`deposit-rule-${p.serviceId}`}>Deposit rule</label>
            <p className="mt-1 text-xs leading-relaxed text-slate">
              Checkout takes one company deposit per booking. This service chooses when that deposit applies; it does not set a second amount.
            </p>
          </div>
          <Link href="/dashboard/billing" className="text-xs font-semibold text-electric hover:underline">
            Edit company deposit policy
          </Link>
        </div>

        <select
          id={`deposit-rule-${p.serviceId}`}
          value={depositRule}
          onChange={(e) => changed(() => setDepositRule(e.target.value as DepositRule))}
          className={`${field} mt-3`}
        >
          <option value="USE_COMPANY_POLICY">Use company deposit rules</option>
          <option value="ALWAYS_REQUIRE">Always require the company deposit</option>
          <option value="NEVER_REQUIRE">Never require a deposit for this service</option>
        </select>

        <div className="mt-3 rounded-card border border-cardline bg-warmwhite/45 px-4 py-3 text-xs leading-relaxed text-slate">
          <span className="font-semibold text-navy">Company deposit amount: {money(p.companyDepositAmountCents)}</span>
          {depositRule === "USE_COMPANY_POLICY" && (
            <span className="mt-1 block">Your every-booking, subtotal and duration rules decide whether it is collected.</span>
          )}
          {depositRule === "ALWAYS_REQUIRE" && (
            <span className="mt-1 block">This service requires the company deposit regardless of the company thresholds.</span>
          )}
          {depositRule === "NEVER_REQUIRE" && (
            <span className="mt-1 block">This service opts out. If every service on a booking opts out, no deposit is collected.</span>
          )}
        </div>

        {serviceCanRequireDeposit && !canCollectDeposit && (
          <div className="mt-3 rounded-card bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            A deposit rule can apply here, but your company deposit amount is not set. Checkout will collect $0 until you set an amount under Tax &amp; Deposits.
          </div>
        )}
        {serviceCanRequireDeposit && canCollectDeposit && !p.stripeReady && (
          <div className="mt-3 rounded-card bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <p>Stripe isn&rsquo;t ready to take the company deposit yet. Any booking that requires one will be blocked until payment setup is complete.</p>
            <Link href="/dashboard/payments" className="mt-1.5 inline-flex font-semibold text-electric hover:underline">
              Finish payment setup
            </Link>
          </div>
        )}

        {serviceCanRequireDeposit && canCollectDeposit && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={credits} onChange={(e) => changed(() => setCredits(e.target.checked))} />
            <span className="text-slate">Deposit counts toward the project total</span>
          </label>
        )}
      </div>

      <div className="mt-5 border-t border-cardline pt-5">
        <label className="text-sm font-medium text-navy">
          Booking button <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          type="text" value={cta} onChange={(e) => changed(() => setCta(e.target.value))}
          placeholder="Add to My Visit"
          className={field}
        />
        <p className="mt-1 text-xs text-slate">
          For bigger jobs, &ldquo;Book My Panel Replacement&rdquo; reads better than adding a line to a cart.
        </p>
      </div>

      {requiresVisit && (
        <div className="mt-5">
          <label className="text-sm font-medium text-navy">
            What happens next <span className="font-normal text-slate">(optional)</span>
          </label>
          <textarea
            value={note} onChange={(e) => changed(() => setNote(e.target.value))} rows={4}
            placeholder="Once booked, we'll schedule a brief on-site visit to..."
            className={field}
          />
          <p className="mt-1 text-xs text-slate">
            Shown on the confirmation page after any payment message. Keep this specific to what happens with this job.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {uncertain && (
            <button type="button" onClick={() => window.location.reload()} className="mt-2 font-semibold text-electric hover:underline">
              Reload service status
            </button>
          )}
        </div>
      )}
      {saved && <div className="mt-4 text-sm text-success">Saved.</div>}

      <button
        type="submit" disabled={busy || uncertain}
        className="mt-6 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
      >
        {busy ? "Saving..." : uncertain ? "Reload before saving" : "Save"}
      </button>
    </form>
  );
}
