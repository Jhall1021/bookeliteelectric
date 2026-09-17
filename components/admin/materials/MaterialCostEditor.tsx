"use client";

import { useState } from "react";
import { formatCents } from "@/lib/flow-types";
import type { CatalogRow } from "@/lib/materialCatalog";
import { shortUnit } from "./format";

const field = "mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";

/**
 * The inline cost editor — same two real actions the catalog page has always
 * used ("cost" for an existing ContractorMaterial, "create" for a
 * missing-price role) and the same real `preview-package` call for the
 * derived unit cost. Nothing here computes a price; it only presents the
 * same fields with real labels instead of a row of undifferentiated inputs.
 */
export function MaterialCostEditor({
  row,
  onCancel,
  onSaved,
  onError,
}: {
  row: CatalogRow;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"flat" | "package">(row.packagePriceCents != null ? "package" : "flat");
  const [unitCost, setUnitCost] = useState(row.unitCostCents != null ? (row.unitCostCents / 100).toFixed(2) : "");
  const [packagePrice, setPackagePrice] = useState(row.packagePriceCents != null ? (row.packagePriceCents / 100).toFixed(2) : "");
  const [packageQty, setPackageQty] = useState(row.packageQuantity != null ? String(row.packageQuantity) : "");
  const [packageUnit, setPackageUnit] = useState(row.packageUnit ?? row.unit);
  const [preview, setPreview] = useState<{ unitCostCents: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Read-only preview via the existing preview-package action — no local
  // reimplementation of the package -> unit-cost math.
  async function loadPreview(priceStr: string, qtyStr: string) {
    const packagePriceCents = Math.round(parseFloat(priceStr || "0") * 100);
    const packageQuantity = parseFloat(qtyStr || "0");
    if (!Number.isFinite(packagePriceCents) || !packageQuantity || packageQuantity <= 0) {
      setPreview(null);
      return;
    }
    try {
      const res = await fetch("/api/admin/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview-package", packagePriceCents, packageQuantity }),
      });
      if (res.ok) setPreview(await res.json());
      else setPreview(null);
    } catch {
      setPreview(null);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const basis: Record<string, unknown> =
        mode === "package"
          ? {
              packagePriceCents: Math.round(parseFloat(packagePrice || "0") * 100),
              packageQuantity: parseFloat(packageQty || "0"),
              packageUnit: packageUnit.trim() || row.unit,
            }
          : { unitCostCents: Math.round(parseFloat(unitCost || "0") * 100) };

      const body: Record<string, unknown> = row.contractorMaterialId
        ? { action: "cost", contractorMaterialId: row.contractorMaterialId, ...basis }
        : { action: "create", key: row.key, name: row.name, unit: row.unit, ...basis };

      const res = await fetch("/api/admin/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data?.error ?? `${res.status} ${res.statusText}`);
        return;
      }

      if (row.contractorMaterialId) {
        const n = data.servicesMoved ?? data.affectedServices ?? 0;
        onSaved(
          n === 0
            ? `${row.name} saved. No services needed to recalculate.`
            : `${row.name} updated. ${n} ${n === 1 ? "service was" : "services were"} recalculated.`
        );
      } else {
        const n = data.recomputed ?? 0;
        onSaved(
          n === 0
            ? `${row.name} priced. No services needed it yet.`
            : `${row.name} priced. ${n} ${n === 1 ? "service" : "services"} can now use it.`
        );
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong saving that cost.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-card border border-cardline bg-warmwhite p-4">
      <div className="text-sm font-semibold text-navy">Update cost</div>

      <div className="mt-3 inline-flex rounded-pill border border-cardline bg-white p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode("flat")}
          className={`rounded-pill px-3 py-1.5 font-medium transition ${
            mode === "flat" ? "bg-navy text-white" : "text-slate hover:text-navy"
          }`}
        >
          Per unit
        </button>
        <button
          type="button"
          onClick={() => setMode("package")}
          className={`rounded-pill px-3 py-1.5 font-medium transition ${
            mode === "package" ? "bg-navy text-white" : "text-slate hover:text-navy"
          }`}
        >
          By package
        </button>
      </div>

      <div className="mt-3">
        {mode === "flat" ? (
          <label className="block max-w-[10rem] text-xs font-medium text-slate">
            Cost per {shortUnit(row.unit)}
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className={field}
              aria-label={`Cost per ${row.unit}`}
            />
          </label>
        ) : (
          <div className="flex flex-wrap gap-3">
            <label className="w-32 text-xs font-medium text-slate">
              Package price
              <input
                type="number"
                step="0.01"
                min="0"
                value={packagePrice}
                onChange={(e) => {
                  setPackagePrice(e.target.value);
                  loadPreview(e.target.value, packageQty);
                }}
                className={field}
                aria-label="Package price"
              />
            </label>
            <label className="w-24 text-xs font-medium text-slate">
              Quantity
              <input
                type="number"
                step="0.01"
                min="0"
                value={packageQty}
                onChange={(e) => {
                  setPackageQty(e.target.value);
                  loadPreview(packagePrice, e.target.value);
                }}
                className={field}
                aria-label="Package quantity"
              />
            </label>
            <label className="w-36 text-xs font-medium text-slate">
              Package unit
              <input
                value={packageUnit}
                onChange={(e) => setPackageUnit(e.target.value)}
                placeholder="e.g. ft roll"
                className={field}
                aria-label="Package description"
              />
            </label>
          </div>
        )}

        {mode === "package" && preview && (
          <p className="mt-2 text-xs text-slate">
            Price2Book unit cost:{" "}
            <span className="font-semibold text-success">
              {formatCents(preview.unitCostCents)} / {shortUnit(row.unit)}
            </span>
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-pill bg-electric px-4 py-2 text-xs font-semibold text-white hover:bg-electric-hover disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save cost"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-medium text-slate hover:text-navy">
          Cancel
        </button>
      </div>
    </div>
  );
}
