"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Which services this contractor offers — ONE control, two places.
 *
 * The Services area owns this setting permanently; Guided Setup walks a
 * contractor through it the first time. Both render this component, so there
 * is no onboarding-only list that can drift from the portal, and
 * `Service.offered` stays the single source of truth.
 *
 * WHAT SELECTING DOES NOT DO
 *
 * It does not price anything and does not put anything on the storefront.
 * provisioned -> offered -> ready -> active are four separate states, and this
 * control moves exactly one of them. Deselecting something already live is
 * refused by the server (SERVICE_IS_LIVE): taking a service off a storefront
 * belongs to the deactivation lifecycle, not to a checkbox.
 */

export type SelectableService = {
  id: string;
  name: string;
  categoryName: string | null;
  offered: boolean;
  active: boolean;
  /** From the same promise logic readiness uses. Not a lookalike rule. */
  promisesFixedPrice: boolean;
};

export default function ServiceSelectionList({ services }: { services: SelectableService[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byCategory = services.reduce<Record<string, SelectableService[]>>((acc, s) => {
    const key = s.categoryName ?? "Other";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});
  const offeredCount = services.filter((s) => s.offered).length;

  async function toggle(s: SelectableService, offered: boolean) {
    setBusy(s.id); setError(null);
    const res = await fetch(`/api/admin/services/${s.id}/offered`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offered }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.message ?? data.error ?? "Could not save."); return; }
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm text-slate">
        <span className="font-medium text-navy">{offeredCount} of {services.length} selected.</span>{" "}
        Choosing a service tells us what to check — it does not price it or put it on your
        storefront.
      </p>

      {error && <div className="mt-3 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4 space-y-5">
        {Object.entries(byCategory).map(([category, items]) => (
          <section key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">{category}</h3>
            <ul className="mt-2 space-y-1">
              {items.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-card px-3 py-2 text-sm hover:bg-warmwhite">
                    <input
                      type="checkbox"
                      checked={s.offered}
                      disabled={busy !== null}
                      onChange={(e) => toggle(s, e.target.checked)}
                    />
                    <span className="text-navy">{s.name}</span>
                    <span className="ml-auto flex items-center gap-3 text-xs">
                      {/* Read from the same logic that decides readiness, so a
                          preview can never contradict the verdict. */}
                      <span className="text-slate">
                        {s.promisesFixedPrice ? "Needs a price" : "Quote only — nothing to price"}
                      </span>
                      {s.active && <span className="text-success">Live</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
