"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type Launchable = {
  id: string;
  name: string;
  active: boolean;
  ready: boolean;
  reason: string | null;
};

type LaunchResult = {
  name: string;
  ok: boolean;
  message?: string;
  uncertain?: boolean;
};

export default function LaunchPanel({
  services, canLaunch, blockerCount,
}: {
  services: Launchable[];
  canLaunch: boolean;
  blockerCount: number;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<LaunchResult[]>([]);

  const eligible = services.filter((s) => !s.active && s.ready);
  const waiting = services.filter((s) => !s.active && !s.ready);
  const live = services.filter((s) => s.active);

  function toggle(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChosen(next);
  }

  async function launch() {
    if (busy || chosen.size === 0 || !canLaunch) return;

    setBusy(true);
    setResults([]);
    const out: LaunchResult[] = [];

    try {
      for (const s of eligible.filter((x) => chosen.has(x.id))) {
        try {
          const res = await fetch(`/api/admin/services/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: s.name, active: true }),
          });
          const data = await res.json().catch(() => ({}));
          out.push({
            name: s.name,
            ok: res.ok,
            message: typeof data.message === "string"
              ? data.message
              : typeof data.error === "string"
                ? data.error
                : undefined,
          });
        } catch {
          // A lost browser response is ambiguous: the request may have reached
          // Price2Book and activated the service before the connection failed.
          // Stop the sequence rather than guessing and publishing dependent
          // services behind a prerequisite whose state we no longer know.
          out.push({
            name: s.name,
            ok: false,
            uncertain: true,
            message: "Price2Book lost the response. This service may have gone live; refresh and confirm its status before publishing anything else.",
          });
          break;
        }
      }
    } finally {
      setResults(out);
      setChosen(new Set());
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <section className={`overflow-hidden rounded-card border shadow-sm ${canLaunch ? "border-success/30 bg-success/[0.04]" : "border-cardline bg-white"}`}>
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${canLaunch ? "bg-success/10 text-success" : "bg-amber-50 text-amber-700"}`}>
              {canLaunch ? "✓" : "!"}
            </span>
            <div className="min-w-0">
              <div className={`text-xs font-semibold uppercase tracking-wide ${canLaunch ? "text-success" : "text-amber-700"}`}>Launch readiness</div>
              <h2 className="mt-1 font-display text-xl font-bold text-navy">
                {canLaunch ? "You’re ready to choose what goes live" : `${blockerCount} setup ${blockerCount === 1 ? "item is" : "items are"} still blocking launch`}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
                {canLaunch
                  ? "Price2Book has everything it needs for a customer to complete a booking. You can publish only the services you want to start with."
                  : "Finish the blocking setup items first. Price2Book will keep every service protected until the shared booking requirements are satisfied."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm"><div className="text-2xl font-bold text-navy">{live.length}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate">Live now</div></div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm"><div className="text-2xl font-bold text-electric">{eligible.length}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate">Ready to publish</div></div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm"><div className="text-2xl font-bold text-slate">{waiting.length}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate">Still needs work</div></div>
      </div>

      {live.length > 0 && (
        <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
          <div className="flex items-end justify-between gap-3 border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
            <div><h3 className="font-display text-lg font-bold text-navy">Already live</h3><p className="mt-1 text-sm text-slate">Customers can already see and book these services.</p></div>
            <span className="rounded-pill bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">{live.length} live</span>
          </div>
          <div className="divide-y divide-cardline">
            {live.map((s) => <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6"><span className="text-sm font-medium text-navy">{s.name}</span><span className="text-xs font-semibold text-success">Live</span></div>)}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
        <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-navy">Choose your launch services</h3>
              <p className="mt-1 text-sm text-slate">Start small if you want. You can publish more services anytime after launch.</p>
            </div>
            {eligible.length > 0 && <span className="text-xs font-medium text-slate">{chosen.size} selected</span>}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {eligible.length === 0 ? (
            <div className="rounded-card border border-dashed border-cardline bg-warmwhite/40 p-5 text-sm text-slate">
              {services.some((s) => !s.active)
                ? "No unpublished services are ready yet. The setup checks on this page will tell you what still needs attention."
                : "Everything you currently offer is already live."}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {eligible.map((s) => {
                  const selected = chosen.has(s.id);
                  return (
                    <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-card border px-4 py-3 transition ${selected ? "border-electric bg-electric/[0.04]" : "border-cardline hover:border-electric/50"}`}>
                      <input type="checkbox" checked={selected} disabled={busy || !canLaunch} onChange={() => toggle(s.id)} className="h-4 w-4 accent-electric" />
                      <span className="flex-1 text-sm font-medium text-navy">{s.name}</span>
                      <span className="text-xs text-slate">Ready</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-cardline pt-5">
                <button type="button" onClick={() => void launch()} disabled={busy || chosen.size === 0 || !canLaunch} className="rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">
                  {busy ? "Publishing..." : chosen.size > 0 ? `Put ${chosen.size} service${chosen.size === 1 ? "" : "s"} live` : "Select services to publish"}
                </button>
                {!canLaunch && <span className="text-xs text-slate">Complete the launch blockers first.</span>}
              </div>
            </>
          )}

          {results.length > 0 && (
            <div className="mt-5 border-t border-cardline pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate">Publish results</div>
              <ul className="mt-2 space-y-2 text-sm">
                {results.map((r, i) => (
                  <li key={i} className={`rounded-card p-3 ${r.ok ? "bg-success/5 text-success" : r.uncertain ? "bg-p2b-amber-tint text-p2b-amber-ink" : "bg-red-50 text-red-700"}`}>
                    {r.ok ? `${r.name} is live.` : `${r.name} — ${r.message ?? "could not go live."}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {waiting.length > 0 && (
        <section className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
          <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6"><h3 className="text-sm font-semibold text-navy">Not ready yet</h3><p className="mt-1 text-xs text-slate">These services stay protected until their own pricing or setup requirements are satisfied.</p></div>
          <div className="divide-y divide-cardline">
            {waiting.map((s) => <div key={s.id} className="flex items-start justify-between gap-4 px-5 py-3.5 sm:px-6"><span className="text-sm font-medium text-navy">{s.name}</span><span className="max-w-xs text-right text-xs text-slate">{s.reason ?? "Needs attention"}</span></div>)}
          </div>
        </section>
      )}

      <section className="rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h3 className="text-sm font-semibold text-navy">Your storefront</h3><p className="mt-1 text-sm text-slate">{live.length === 0 ? "Nothing is public yet." : `Customers can currently see ${live.length} live service${live.length === 1 ? "" : "s"}.`}</p></div>
          <Link href="/dashboard/services" className="rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-electric transition hover:border-electric">Open Services & Pricing</Link>
        </div>
      </section>
    </div>
  );
}
