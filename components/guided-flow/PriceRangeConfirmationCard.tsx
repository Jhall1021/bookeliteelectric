"use client";

import { formatCents } from "@/lib/flow-types";

type Props = {
  serviceName: string;
  lowPriceCents: number;
  highPriceCents: number;
  busy?: boolean;
  onAddToVisit: () => void;
};

export default function PriceRangeConfirmationCard({ serviceName, lowPriceCents, highPriceCents, busy = false, onAddToVisit }: Props) {
  return (
    <div className="rounded-card border border-cardline bg-white p-8 shadow-card">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Your estimated price range</p>
      <h2 className="mt-1 font-display text-xl font-bold text-navy">{serviceName}</h2>
      <p className="mt-3 font-display text-4xl font-bold text-navy">
        {formatCents(lowPriceCents)}–{formatCents(highPriceCents)}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-bold text-emerald-900">Toward the lower end</h3>
          <p className="mt-1 text-sm leading-6 text-slate">Most of the wire can run through an accessible unfinished attic, basement, or crawlspace.</p>
        </section>
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-900">Toward the higher end</h3>
          <p className="mt-1 text-sm leading-6 text-slate">Most of the wire must be fished through finished walls and ceilings.</p>
        </section>
      </div>

      <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-6 text-slate">
        If the route combines open and finished space, the final price will normally fall between these amounts. Your electrician will confirm the route and final price before starting work.
      </p>
      <p className="mt-3 text-xs leading-5 text-slate">
        The higher end is used as the maximum when this is added to your visit. Masonry, outdoor trenching, panel upgrades, and other work outside the measured route require separate review. Patching and painting are not included.
      </p>

      <button type="button" onClick={onAddToVisit} disabled={busy} className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">
        {busy ? "Adding…" : `Add to My Visit — up to ${formatCents(highPriceCents)}`}
      </button>
    </div>
  );
}
