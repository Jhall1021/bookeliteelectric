"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    setBusy(false); setConfirming(false);
    if (!res.ok) { setError(data.message ?? "Could not install your catalog."); return; }
    router.refresh();
  }

  const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-electric">Step 1</p>
          <h2 className="mt-1 font-display text-lg font-bold text-navy">Choose your trade</h2>
          <p className="mt-1 text-sm text-slate">We use this to start you with the right service catalog and homeowner questions.</p>
        </div>
        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {availableTrades.map((t) => {
              const selected = enrolled === t;
              const locked = installedCount > 0 && !selected;
              return (
                <label key={t} className={`relative flex cursor-pointer items-start gap-3 rounded-card border p-4 transition ${selected ? "border-electric bg-electric/5 ring-1 ring-electric/10" : "border-cardline hover:border-electric/50"} ${locked ? "cursor-not-allowed opacity-45" : ""}`}>
                  <input type="radio" name="trade" checked={selected} disabled={busy || installedCount > 0} onChange={() => enrol(t)} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-navy">{label(t)}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate">Start with Price2Book&apos;s prepared {label(t).toLowerCase()} services, scope questions, and rules.</span>
                  </span>
                  {selected && <span className="ml-auto rounded-pill bg-electric/10 px-2 py-1 text-[11px] font-semibold text-electric">Selected</span>}
                </label>
              );
            })}
          </div>
          {installedCount > 0 && (
            <div className="mt-4 rounded-card border border-cardline bg-warmwhite p-3 text-xs leading-relaxed text-slate">
              Your catalog is already installed with <span className="font-semibold text-navy">{installedCount} services</span>, so the trade is locked here to protect the work you have already configured.
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-electric">Step 2</p>
              <h2 className="mt-1 font-display text-lg font-bold text-navy">Add your prepared catalog</h2>
            </div>
            {installedCount > 0 && <span className="rounded-pill bg-success/10 px-3 py-1 text-xs font-semibold text-success">Catalog installed</span>}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {installedCount > 0 ? (
            <div className="rounded-card border border-success/20 bg-success/5 p-4">
              <p className="text-sm font-semibold text-navy">{installedCount} services are ready for you to personalize.</p>
              <p className="mt-1 text-sm text-slate">Next you choose which services you actually offer, then review your costs and prices. Nothing is published just because the catalog is installed.</p>
            </div>
          ) : !enrolled ? (
            <div className="rounded-card border border-dashed border-cardline bg-warmwhite/50 p-5 text-center">
              <p className="text-sm font-medium text-navy">Choose your trade first</p>
              <p className="mt-1 text-xs text-slate">Your catalog preview will appear here.</p>
            </div>
          ) : previewError ? (
            <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{previewError}</div>
          ) : preview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-card border border-cardline bg-warmwhite/50 p-4"><p className="text-2xl font-bold text-navy">{preview.services}</p><p className="mt-1 text-xs font-medium text-slate">Prepared services</p></div>
                <div className="rounded-card border border-cardline bg-warmwhite/50 p-4"><p className="text-2xl font-bold text-navy">{preview.questions}</p><p className="mt-1 text-xs font-medium text-slate">Customer questions</p></div>
                <div className="rounded-card border border-cardline bg-warmwhite/50 p-4"><p className="text-2xl font-bold text-navy">{preview.options}</p><p className="mt-1 text-xs font-medium text-slate">Prepared answers</p></div>
              </div>

              <div className="mt-4 rounded-card border border-electric/15 bg-electric/[0.035] p-4">
                <p className="text-sm font-semibold text-navy">You are not turning anything on yet.</p>
                <p className="mt-1 text-sm leading-relaxed text-slate">Installing the {label(preview.trade)} catalog gives you a prepared starting point. <span className="font-medium text-navy">Nothing is priced, offered, or live.</span> You will review the services, your material costs, labor, and customer-facing prices before anything can be published.</p>
              </div>

              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)} disabled={busy} className="mt-5 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">
                  Add the {label(preview.trade)} catalog
                </button>
              ) : (
                <div className="mt-5 rounded-card border border-cardline bg-warmwhite p-4">
                  <p className="text-sm font-semibold text-navy">Add {preview.services} prepared services to your account?</p>
                  <p className="mt-1 text-xs text-slate">You can choose which ones you actually offer on the next step.</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={install} disabled={busy} className="rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">{busy ? "Adding catalog..." : `Yes, add ${preview.services} services`}</button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-pill border border-cardline bg-white px-5 py-2.5 text-sm font-semibold text-navy hover:border-electric">Cancel</button>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {error && <div className="mt-4 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </div>
      </section>
    </div>
  );
}
