"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/flow-types";
import { calculateMaterialSellCents, effectiveMaterialMarkup } from "@/lib/pricing";

type CatalogEntry = {
  id: string;
  canonicalMaterialId: string;
  key: string;
  name: string;
  unit: string;
  unitCostCents: number;
};

type Item = {
  id: string;
  canonicalMaterialId: string | null;
  contractorMaterialId: string | null;
  key: string | null;
  name: string | null;
  unit: string | null;
  quantity: number;
  unitCostCents: number | null;
  lineTotalCents: number | null;
  unpriced: boolean;
};

/**
 * What a service is actually made of.
 *
 * Costs shown here are contractor costs. The shared pricing rule applies the
 * material markup downstream to the assembled package once; this screen never
 * publishes a customer price by itself.
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
    try {
      const res = await fetch(`/api/admin/materials?serviceId=${serviceId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not load materials.");
        return;
      }
      setItems(data.items ?? []);
      setCatalog(data.catalog ?? []);
    } catch {
      setError("Could not reach Price2Book to load materials. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save that material change. Nothing was changed.");
        return null;
      }
      await load();
      router.refresh();
      return data;
    } catch {
      setError("Could not reach Price2Book. Check your connection and try again; nothing was changed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const resolvedItems = items.filter((i) => i.lineTotalCents !== null);
  const directTotal = resolvedItems.reduce((sum, item) => sum + (item.lineTotalCents ?? 0), 0);
  const hasUnpriced = items.some((i) => i.unpriced || i.lineTotalCents === null);
  const markup = !hasUnpriced && directTotal > 0 ? effectiveMaterialMarkup(directTotal) : null;
  const sellTotal = !hasUnpriced ? calculateMaterialSellCents(directTotal) : null;

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
        What you pay. Markup is added on top — 30% of the first $750, 20% above
        that — and applied to the whole package at once. Customers never see this.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-card bg-warmwhite p-3 text-sm text-slate">
          Not itemized yet — this service uses a single material figure. Adding parts below
          replaces it with a real list, and clears any imported markup so the standard
          rule applies.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-cardline rounded-card border border-cardline">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-navy">{i.name ?? i.key ?? "Material"}</div>
                <div className={`text-xs ${i.unpriced ? "text-amber-700" : "text-slate"}`}>
                  {i.unitCostCents === null
                    ? "Cost not set for your company"
                    : `${formatCents(i.unitCostCents)} per ${i.unit ?? "unit"}`}
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                defaultValue={i.quantity}
                onBlur={(e) => {
                  const q = Number(e.target.value);
                  if (!Number.isFinite(q) || q < 0) {
                    setError("Quantity must be zero or more.");
                    e.target.value = String(i.quantity);
                    return;
                  }
                  if (q !== i.quantity) send({ action: "quantity", id: i.id, quantity: q });
                }}
                className={`${field} w-20 text-right`}
                aria-label={`Quantity of ${i.name ?? "material"}`}
              />
              <div className="w-20 shrink-0 text-right text-sm font-medium text-navy">
                {i.lineTotalCents === null ? "—" : formatCents(i.lineTotalCents)}
              </div>
              <button
                onClick={() => send({ action: "remove", id: i.id })}
                disabled={busy}
                aria-label={`Remove ${i.name ?? "material"}`}
                className="shrink-0 px-1 text-slate hover:text-red-600 disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between bg-warmwhite p-3">
            <div className="text-sm text-slate">
              Direct cost
              {markup && <span className="ml-2 text-xs">{(markup * 100 - 100).toFixed(0)}% markup</span>}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-navy">
                {hasUnpriced ? "Incomplete" : formatCents(directTotal)}
              </div>
              {sellTotal !== null && markup !== null && (
                <div className="text-xs text-success">sells at {formatCents(sellTotal)}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {hasUnpriced && (
        <p className="mt-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          At least one part does not have a cost for your company. Price2Book will not treat this material package as fully priced until every item has a cost.
        </p>
      )}

      {!hasUnpriced && directTotal > 75000 && sellTotal !== null && (
        <p className="mt-2 rounded-card border border-cardline bg-warmwhite p-3 text-xs text-slate">
          Above $750 the markup steps down to 20% on the excess, so this package
          sells at {formatCents(sellTotal)} — a blended {markup ? (markup * 100 - 100).toFixed(1) : "0"}%.
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
            .filter((c) => !items.some((i) => i.canonicalMaterialId === c.canonicalMaterialId))
            .map((c) => (
              <option key={c.id} value={c.canonicalMaterialId}>
                {c.name} — {formatCents(c.unitCostCents)}/{c.unit}
              </option>
            ))}
        </select>
        <button
          onClick={async () => {
            if (!adding) return;
            const saved = await send({ action: "add", serviceId, canonicalMaterialId: adding, quantity: 1 });
            if (saved) setAdding("");
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
              const costDollars = Number(newMaterial.cost);
              if (!newMaterial.name.trim()) {
                setError("Enter a name for the new material.");
                return;
              }
              if (newMaterial.cost.trim() === "" || !Number.isFinite(costDollars) || costDollars < 0) {
                setError("Enter a valid material cost of zero or more.");
                return;
              }
              if (!newMaterial.unit.trim()) {
                setError("Enter the unit this material is bought by, such as each, ft, or box.");
                return;
              }
              const created = await send({
                action: "create",
                key: newMaterial.name,
                name: newMaterial.name,
                unitCostCents: Math.round(costDollars * 100),
                unit: newMaterial.unit,
              });
              const canonicalMaterialId = created?.canonicalMaterial?.id;
              if (canonicalMaterialId) {
                const added = await send({ action: "add", serviceId, canonicalMaterialId, quantity: 1 });
                if (added) {
                  setNewMaterial({ name: "", cost: "", unit: "each" });
                  setCreating(false);
                }
              }
            }}
            disabled={busy || !newMaterial.name.trim()}
            className="w-full rounded-pill bg-electric py-2 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-40"
          >
            Add to the catalog and this service
          </button>
        </div>
      )}

      {items.some((i) => i.contractorMaterialId) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-electric">Change what a part costs</summary>
          <p className="mt-2 text-xs text-slate">
            Costs are shared. Changing one here reprices every service using it — which is the point, but it isn&rsquo;t only this service.
          </p>
          <div className="mt-2 space-y-2">
            {items.filter((i) => i.contractorMaterialId).map((i) => (
              <div key={`cost-${i.id}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-navy">{i.name ?? i.key ?? "Material"}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={i.unitCostCents === null ? "" : (i.unitCostCents / 100).toFixed(2)}
                  onBlur={async (e) => {
                    const dollars = Number(e.target.value);
                    if (!Number.isFinite(dollars) || dollars < 0) {
                      setError("Material cost must be zero or more.");
                      e.target.value = i.unitCostCents === null ? "" : (i.unitCostCents / 100).toFixed(2);
                      return;
                    }
                    const cents = Math.round(dollars * 100);
                    if (cents !== i.unitCostCents) {
                      const r = await send({
                        action: "cost",
                        contractorMaterialId: i.contractorMaterialId,
                        unitCostCents: cents,
                      });
                      if (r?.affectedServices > 1) {
                        setNotice(`${i.name ?? "Material"} updated — ${r.affectedServices} services use it and were all repriced.`);
                      }
                    }
                  }}
                  className={`${field} w-24 text-right`}
                  aria-label={`Cost of ${i.name ?? "material"}`}
                />
              </div>
            ))}
          </div>
        </details>
      )}

      {notice && <p className="mt-4 rounded-card bg-electric/5 p-3 text-sm text-navy">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
