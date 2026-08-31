"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Review, then choose what goes live.
 *
 * NO BULK ACTIVATION ENGINE. Each service is activated through the same
 * per-service admin route the Services screen uses, one call each, so every
 * one passes the identical guard — materials resolved, and no unapproved price
 * on a service that can quote one. A wizard that activated in bulk would be a
 * second activation path, and the one that skipped a check would be the one
 * nobody noticed.
 *
 * Failures are reported per service rather than collapsed. "3 of 7 went live"
 * with the reasons is the truth; a single red banner is not.
 */

export type Launchable = {
  id: string;
  name: string;
  active: boolean;
  ready: boolean;
  reason: string | null;
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
  const [results, setResults] = useState<{ name: string; ok: boolean; message?: string }[]>([]);

  const eligible = services.filter((s) => !s.active && s.ready);
  const live = services.filter((s) => s.active);

  function toggle(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChosen(next);
  }

  async function launch() {
    setBusy(true); setResults([]);
    const out: { name: string; ok: boolean; message?: string }[] = [];
    for (const s of eligible.filter((x) => chosen.has(x.id))) {
      // The existing per-service route, with its existing guard.
      const res = await fetch(`/api/admin/services/${s.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, active: true }),
      });
      const data = await res.json().catch(() => ({}));
      out.push({ name: s.name, ok: res.ok, message: data.message ?? data.error });
    }
    setResults(out);
    setChosen(new Set());
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section
        className={`rounded-card border p-5 ${
          canLaunch ? "border-success/40 bg-success/5" : "border-cardline bg-warmwhite"
        }`}
      >
        <h2 className="font-display text-lg font-bold text-navy">
          {canLaunch
            ? "A homeowner can price and book with you"
            : `${blockerCount} thing${blockerCount === 1 ? "" : "s"} still in the way`}
        </h2>
        <p className="mt-1 text-sm text-slate">
          {canLaunch
            ? "Everything a booking depends on is in place. Choose what you want live."
            : "Until these are sorted, a homeowner cannot complete a booking."}
        </p>
      </section>

      {live.length > 0 && (
        <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
          <h3 className="font-display text-lg font-bold text-navy">Live now</h3>
          <ul className="mt-3 space-y-1 text-sm">
            {live.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-b border-cardline pb-2 last:border-0">
                <span className="text-navy">{s.name}</span>
                <span className="text-xs text-success">Live</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h3 className="font-display text-lg font-bold text-navy">Ready to go live</h3>
        {eligible.length === 0 ? (
          <p className="mt-1 text-sm text-slate">
            {services.some((s) => !s.active)
              ? "None of the services you offer are ready yet — the stages above say what each one needs."
              : "Everything you offer is already live."}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate">
              Pick what you want customers to see. You can leave the rest for later — finishing
              setup does not mean everything has to go live.
            </p>
            <ul className="mt-4 space-y-1">
              {eligible.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-card px-3 py-2 text-sm hover:bg-warmwhite">
                    <input
                      type="checkbox" checked={chosen.has(s.id)} disabled={busy || !canLaunch}
                      onChange={() => toggle(s.id)}
                    />
                    <span className="text-navy">{s.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button" onClick={launch} disabled={busy || chosen.size === 0 || !canLaunch}
              className="mt-5 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
            >
              {busy ? "Publishing..." : `Put ${chosen.size || ""} service${chosen.size === 1 ? "" : "s"} live`.replace("  ", " ")}
            </button>
            {!canLaunch && (
              <p className="mt-2 text-xs text-slate">
                Sort the blockers above first — they apply to every booking, not just one service.
              </p>
            )}
          </>
        )}

        {results.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-cardline pt-4 text-sm">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? "text-success" : "text-red-700"}>
                {r.ok ? `${r.name} is live.` : `${r.name} — ${r.message ?? "could not go live."}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h3 className="font-display text-lg font-bold text-navy">Your storefront</h3>
        <p className="mt-1 text-sm text-slate">
          {live.length === 0
            ? "Nothing is live yet, so a visitor would find an empty catalog."
            : `A homeowner sees ${live.length} service${live.length === 1 ? "" : "s"} today.`}
        </p>
        <Link href="/dashboard/services" className="mt-3 inline-block text-sm font-semibold text-electric hover:underline">
          Open your services
        </Link>
      </section>
    </div>
  );
}
