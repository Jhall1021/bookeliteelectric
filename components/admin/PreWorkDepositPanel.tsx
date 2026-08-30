"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Whether this service needs a look before the work, and what the homeowner
 * pays to book it.
 *
 * Beside Pricing rather than inside it, because these are different
 * decisions. A price is derived from crew hours and materials and published
 * as an approval. A deposit is a booking term the contractor sets — closer to
 * business hours than to a price — so it does not go through the publish
 * boundary and cannot move `basePrice`.
 *
 * Dollars and minutes here; cents on the wire. A contractor should never have
 * to know the storage representation to set a deposit.
 */

type Props = {
  serviceId: string;
  requiresPreWorkVisit: boolean;
  preWorkVisitMinutes: number | null;
  depositCents: number | null;
  depositCreditsToJob: boolean;
  ctaLabel: string | null;
  preWorkCustomerNote: string | null;
  /** Shown, never enforced here — checkout already refuses an unready account. */
  stripeReady: boolean;
};

const centsToDollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

export default function PreWorkDepositPanel(p: Props) {
  const router = useRouter();
  const [requiresVisit, setRequiresVisit] = useState(p.requiresPreWorkVisit);
  const [minutes, setMinutes] = useState(p.preWorkVisitMinutes?.toString() ?? "");
  const [deposit, setDeposit] = useState(centsToDollars(p.depositCents));
  const [credits, setCredits] = useState(p.depositCreditsToJob);
  const [cta, setCta] = useState(p.ctaLabel ?? "");
  const [note, setNote] = useState(p.preWorkCustomerNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const field = "mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";
  const depositDollars = deposit.trim() === "" ? null : Number(deposit);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);

    if (depositDollars !== null && (!Number.isFinite(depositDollars) || depositDollars < 0)) {
      setBusy(false);
      setError("Enter the deposit as an amount of money, or leave it blank for none.");
      return;
    }

    const res = await fetch(`/api/admin/services/${p.serviceId}/pre-work`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requiresPreWorkVisit: requiresVisit,
        preWorkVisitMinutes: minutes.trim() === "" ? "" : Number(minutes),
        // Dollars in the UI, cents on the wire.
        depositCents: depositDollars === null ? "" : Math.round(depositDollars * 100),
        depositCreditsToJob: credits,
        ctaLabel: cta,
        preWorkCustomerNote: note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Could not save."); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-8 max-w-xl rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-lg font-bold text-navy">Site visit &amp; deposit</h2>
      <p className="mt-1 text-sm text-slate">
        For work you need to see before you schedule it, and the deposit a customer pays to book.
      </p>

      <label className="mt-5 flex items-start gap-3">
        <input
          type="checkbox" checked={requiresVisit}
          onChange={(e) => setRequiresVisit(e.target.checked)}
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
              type="number" min="0" step="5" value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="30"
              className={`${field} max-w-[8rem]`}
            />
            <span className="mt-1 text-sm text-slate">minutes</span>
          </div>
          <p className="mt-1 text-xs text-slate">
            The check-the-job visit — not how long the installation takes.
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-cardline pt-5">
        <label className="text-sm font-medium text-navy">Deposit to book</label>
        <div className="flex items-center gap-2">
          <span className="mt-1 text-sm text-slate">$</span>
          <input
            type="number" min="0" step="0.01" value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            placeholder="Leave blank for no deposit"
            className={`${field} max-w-[10rem]`}
          />
        </div>
        {depositDollars !== null && depositDollars > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={credits} onChange={(e) => setCredits(e.target.checked)} />
            <span className="text-slate">Counts toward the total, rather than being an extra fee</span>
          </label>
        )}
        {depositDollars !== null && depositDollars > 0 && !p.stripeReady && (
          <p className="mt-2 rounded-card bg-amber-50 p-3 text-xs text-amber-900">
            Your Stripe account isn&rsquo;t ready to take payments yet, so customers won&rsquo;t be
            able to book this online until it is. You can still set the deposit now.
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-cardline pt-5">
        <label className="text-sm font-medium text-navy">
          Booking button{" "}
          <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          type="text" value={cta} onChange={(e) => setCta(e.target.value)}
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
            What happens next{" "}
            <span className="font-normal text-slate">(optional)</span>
          </label>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={4}
            placeholder="Once booked, we'll schedule a brief on-site visit to..."
            className={field}
          />
          {/* The deposit sentence is shared by every service that takes one and
              is not editable here. This is the part that differs by job —
              promising a permit process for work that may not need one is the
              kind of thing that should be said per service, by the person who
              knows. */}
          <p className="mt-1 text-xs text-slate">
            Shown on the confirmation page, after the deposit line
            {p.depositCents ? ` ("A $${(p.depositCents / 100).toFixed(0)} deposit is required when booking and will be applied toward your project.")` : ""}.
          </p>
        </div>
      )}

      {error && <div className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {saved && <div className="mt-4 text-sm text-success">Saved.</div>}

      <button
        type="submit" disabled={busy}
        className="mt-6 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
