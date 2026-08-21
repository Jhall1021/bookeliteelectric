"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/flow-types";
import { materialMultiplierFor } from "@/lib/pricing";

type CatalogEntry = {
  id: string;
  key: string;
  name: string;
  unit: string;
  unitCostCents: number;
};

type Item = CatalogEntry & {
  materialId: string;
  quantity: number;
  lineTotalCents: number;
};

/**
 * What a service is actually made of.
 *
 * A service used to carry one materialCostCents — the exterior GFCI held
 * 5244, with the breakdown living only in a code comment. Nobody could see
 * what that covered, and a price rise on receptacles meant hunting through
 * seeds for which totals silently included one.
 *
 * Costs here are what Elite PAYS. The markup is applied downstream by the
 * tier rule, to the assembled total rather than per part — six cheap items
 * shouldn't each be marked up as though bought alone.
 */
export default function MaterialsPanel({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [creating, setCreating] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: "", cost: "", unit: "each" });

  async function load() {
    const res = await fetch(`/api/admin/materials?serviceId=${serviceId}`);
    if (res.ok) {
      const d = await res.json();
      setItems(d.items ?? []);
      setCatalog(d.catalog ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const d = await res.json();
        if (d?.error) detail = d.error;
      } catch {}
      setError(detail);
      return null;
    }
    const data = await res.json();
    await load();
    router.refresh();
    return data;
  }

  const directTotal = items.reduce((s, i) => s + i.lineTotalCents, 0);
  const tier = directTotal > 0 ? materialMultiplierFor(directTotal) : null;
  const sellTotal = tier ? Math.round(directTotal * tier) : 0;

  const field = "rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";

  if (loading) {
    return (
      <div className="mt-8 max-w-xl rounded-card border border-cardline bg-white p-6 shadow-card">
        <p className="text-sm text-slate">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-xl rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-lg font-bold text-navy">Materials</h2>
      <p className="mt-1 text-sm text-slate">
        What Elite pays. Markup is added by the tier rule, not stored here. Customers never
        see this.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-card bg-warmwhite p-3 text-sm text-slate">
          Not itemized yet — this service uses a single material figure. Adding parts below
          replaces it with a real list, and clears any imported markup so the current tier
          applies.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-cardline rounded-card border border-cardline">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-navy">{i.name}</div>
                <div className="text-xs text-slate">
                  {formatCents(i.unitCostCents)} per {i.unit}
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                defaultValue={i.quantity}
                onBlur={(e) => {
                  const q = parseFloat(e.target.value);
                  if (!Number.isNaN(q) && q !== i.quantity) {
                    send({ action: "quantity", id: i.id, quantity: q });
                  }
                }}
                className={`${field} w-20 text-right`}
                aria-label={`Quantity of ${i.name}`}
              />
              <div className="w-20 shrink-0 text-right text-sm font-medium text-navy">
                {formatCents(i.lineTotalCents)}
              </div>
              <button
                onClick={() => send({ action: "remove", id: i.id })}
                disabled={busy}
                aria-label={`Remove ${i.name}`}
                className="shrink-0 px-1 text-slate hover:text-red-600 disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between bg-warmwhite p-3">
            <div className="text-sm text-slate">
              Direct cost
              {tier && (
                <span className="ml-2 text-xs">
                  × {tier.toFixed(2)} tier
                </span>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-navy">{formatCents(directTotal)}</div>
              {tier && (
                <div className="text-xs text-success">sells at {formatCents(sellTotal)}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* The tier boundary bites hardest just under $10, where a $9 package
          sells for $27 and a $10.50 one for $13.65. Worth flagging rather
          than letting it look like a bug. */}
      {directTotal > 0 && directTotal < 1000 && (
        <p className="mt-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Under $10 the markup is 3.00×, so this sells for {formatCents(sellTotal)}. Just above
          $10 the tier drops to 1.30× — a slightly larger package can sell for less.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <select
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          className={`${field} flex-1`}
        >
          <option value="">Add a part...</option>
          {catalog
            .filter((c) => !items.some((i) => i.materialId === c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {formatCents(c.unitCostCents)}/{c.unit}
              </option>
            ))}
        </select>
        <button
          onClick={async () => {
            if (!adding) return;
            await send({ action: "add", serviceId, materialId: adding, quantity: 1 });
            setAdding("");
          }}
          disabled={busy || !adding}
          className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <button
        onClick={() => setCreating(!creating)}
        className="mt-3 text-xs font-medium text-electric"
      >
        {creating ? "Cancel" : "Something not on the list? Add a new part →"}
      </button>

      {creating && (
        <div className="mt-2 space-y-2 rounded-card border border-cardline p-3">
          <input
            value={newMaterial.name}
            onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
            placeholder="What is it? e.g. Weather-resistant GFCI receptacle"
            className={`${field} w-full`}
          />
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={newMaterial.cost}
              onChange={(e) => setNewMaterial({ ...newMaterial, cost: e.target.value })}
              placeholder="Cost"
              className={`${field} flex-1`}
            />
            <input
              value={newMaterial.unit}
              onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })}
              placeholder="each / ft / box"
              className={`${field} w-28`}
            />
          </div>
          <button
            onClick={async () => {
              const cost = Math.round(parseFloat(newMaterial.cost || "0") * 100);
              const created = await send({
                action: "create",
                key: newMaterial.name,
                name: newMaterial.name,
                unitCostCents: cost,
                unit: newMaterial.unit,
              });
              if (created?.material) {
                await send({
                  action: "add",
                  serviceId,
                  materialId: created.material.id,
                  quantity: 1,
                });
                setNewMaterial({ name: "", cost: "", unit: "each" });
                setCreating(false);
              }
            }}
            disabled={busy || !newMaterial.name.trim()}
            className="w-full rounded-pill bg-electric py-2 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-40"
          >
            Add to the catalog and this service
          </button>
        </div>
      )}

      {items.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-electric">
            Change what a part costs
          </summary>
          <p className="mt-2 text-xs text-slate">
            Costs are shared. Changing one here reprices every service using it — which is the
            point, but it isn&rsquo;t only this service.
          </p>
          <div className="mt-2 space-y-2">
            {items.map((i) => (
              <div key={`cost-${i.id}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-navy">{i.name}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(i.unitCostCents / 100).toFixed(2)}
                  onBlur={async (e) => {
                    const c = Math.round(parseFloat(e.target.value) * 100);
                    if (!Number.isNaN(c) && c !== i.unitCostCents) {
                      const r = await send({
                        action: "cost",
                        materialId: i.materialId,
                        unitCostCents: c,
                      });
                      if (r?.affectedServices > 1) {
                        setNotice(
                          `${i.name} updated — ${r.affectedServices} services use it and were all repriced.`
                        );
                      }
                    }
                  }}
                  className={`${field} w-24 text-right`}
                  aria-label={`Cost of ${i.name}`}
                />
              </div>
            ))}
          </div>
        </details>
      )}

      {notice && (
        <p className="mt-4 rounded-card bg-electric/5 p-3 text-sm text-navy">{notice}</p>
      )}
      {error && <p className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
