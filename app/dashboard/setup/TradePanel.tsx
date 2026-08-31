"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Choose a trade, then install its catalog.
 *
 * The trade list comes from published catalogs, so Plumbing appears the day
 * its catalog is published and nothing here changes. Enrolment is durable
 * contractor configuration and version-independent: you enrol in Electrical,
 * not Electrical v1.
 *
 * Installing writes structure only. It does not price anything, does not mark
 * anything as offered, and does not put anything on a storefront — so the
 * confirmation says exactly that, because dozens of services appearing at once
 * is alarming if you think they just went live.
 */

type Preview = {
  trade: string; version: number; services: number;
  questions: number; options: number; policies: number;
  unresolvedMaterialRoles: string[];
};

export default function TradePanel({
  availableTrades, enrolled, installedCount, preview, previewError,
}: {
  availableTrades: string[];
  enrolled: string | null;
  installedCount: number;
  preview: Preview | null;
  previewError: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function enrol(tradeKey: string) {
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/business-profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeKey }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.message ?? "Could not save."); return; }
    router.refresh();
  }

  async function install() {
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/setup/install-catalog", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setConfirming(false);
    if (!res.ok) { setError(data.message ?? "Could not install your catalog."); return; }
    router.refresh();
  }

  const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Your trade</h2>
        <p className="mt-1 text-sm text-slate">
          This decides which catalog of work we set you up with.
        </p>
        <div className="mt-4 space-y-2">
          {availableTrades.map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-3 rounded-card border p-4 ${
                enrolled === t ? "border-electric bg-electric/5" : "border-cardline"
              } ${installedCount > 0 && enrolled !== t ? "opacity-50" : ""}`}
            >
              <input
                type="radio" name="trade" checked={enrolled === t}
                disabled={busy || installedCount > 0}
                onChange={() => enrol(t)}
              />
              <span className="text-sm font-medium text-navy">{label(t)}</span>
            </label>
          ))}
        </div>
        {installedCount > 0 && (
          <p className="mt-3 text-xs text-slate">
            Your catalog is installed, so your trade is settled here. Changing it would leave
            those {installedCount} services behind — talk to us if you need that.
          </p>
        )}
      </section>

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Your catalog</h2>

        {installedCount > 0 ? (
          <p className="mt-1 text-sm text-slate">
            <span className="font-medium text-navy">{installedCount} services</span> installed.
            Next you&rsquo;ll choose which of them you offer, then price them.
          </p>
        ) : !enrolled ? (
          <p className="mt-1 text-sm text-slate">Choose your trade first.</p>
        ) : previewError ? (
          <p className="mt-1 text-sm text-amber-800">{previewError}</p>
        ) : preview ? (
          <>
            <p className="mt-1 text-sm text-slate">
              {label(preview.trade)} — {preview.services} services, {preview.questions} scope
              questions, {preview.options} answers.
            </p>
            <div className="mt-4 rounded-card bg-warmwhite p-4 text-sm text-slate">
              <p className="font-medium text-navy">What this does, and what it doesn&rsquo;t</p>
              <p className="mt-1">
                It adds {preview.services} services with their scope questions and rules.
                <span className="font-medium text-navy"> Nothing is priced, nothing is
                offered and nothing goes live.</span>{" "}
                What each job costs you and what you charge stays yours to decide — that&rsquo;s the
                next two steps.
              </p>
              {preview.unresolvedMaterialRoles.length > 0 && (
                <p className="mt-2">
                  You&rsquo;ll need to tell us what {preview.unresolvedMaterialRoles.length} materials
                  cost you before anything can be priced.
                </p>
              )}
            </div>

            {!confirming ? (
              <button
                type="button" onClick={() => setConfirming(true)} disabled={busy}
                className="mt-5 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
              >
                Install the {label(preview.trade)} catalog
              </button>
            ) : (
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button" onClick={install} disabled={busy}
                  className="rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
                >
                  {busy ? "Installing..." : `Yes, add ${preview.services} services`}
                </button>
                <button
                  type="button" onClick={() => setConfirming(false)} disabled={busy}
                  className="text-sm font-medium text-slate hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        ) : null}

        {error && <div className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      </section>
    </div>
  );
}
