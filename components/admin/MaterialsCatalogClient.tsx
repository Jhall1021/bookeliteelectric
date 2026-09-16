"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/flow-types";
import { MATERIAL_CATEGORIES, type MaterialCategory } from "@/lib/materialCategory";
import type { CatalogRow, MaterialCatalog, MaterialStatus, StatusFilterBucket } from "@/lib/materialCatalog";

const STATUS_FILTERS: { value: "all" | StatusFilterBucket; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "confirmed", label: "Confirmed" },
  { value: "supplier_linked", label: "Supplier linked" },
];

const field = "rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";

/**
 * The catalog-level view over the shared material architecture.
 *
 * Every mutation here goes through POST /api/admin/materials with the SAME
 * "cost" and "create" actions the per-service MaterialsPanel already uses —
 * this component owns no cost math and no recompute logic of its own. See
 * lib/materialCost.ts for what actually happens on save.
 */
export default function MaterialsCatalogClient({ initialCatalog }: { initialCatalog: MaterialCatalog }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"All" | MaterialCategory>("All");
  const [status, setStatus] = useState<"all" | StatusFilterBucket>("all");
  const [showRetired, setShowRetired] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/materials");
      if (res.ok) {
        const d = await res.json();
        setCatalog({ active: d.active, inactive: d.inactive, missing: d.missing });
      }
    } finally {
      setRefreshing(false);
    }
  }

  // The working catalog: costed roles plus the ones a recipe reaches with no
  // cost yet. Retired materials are a separate tab, not folded in here — an
  // inactive DUCT_CONNECTOR must not quietly reappear in the default list.
  const working = useMemo(() => [...catalog.active, ...catalog.missing], [catalog]);
  const rows = showRetired ? catalog.inactive : working;

  const categoriesPresent = useMemo(() => {
    const present = new Set(rows.map((r) => r.category));
    return MATERIAL_CATEGORIES.filter((c) => present.has(c));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "All" && r.category !== category) return false;
      if (status !== "all" && r.statusBucket !== status) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        (r.activeSupplierLink?.productName.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, category, status]);

  const grouped = useMemo(() => {
    const byCategory = new Map<MaterialCategory, CatalogRow[]>();
    for (const r of filtered) {
      const list = byCategory.get(r.category) ?? [];
      list.push(r);
      byCategory.set(r.category, list);
    }
    return MATERIAL_CATEGORIES.filter((c) => byCategory.has(c)).map((c) => ({
      category: c,
      rows: byCategory.get(c)!,
    }));
  }, [filtered]);

  const summary = useMemo(
    () => ({
      total: working.length,
      priced: catalog.active.length,
      needsAttention: working.filter((r) => r.statusBucket === "needs_attention").length,
      supplierLinked: working.filter((r) => r.statusBucket === "supplier_linked").length,
    }),
    [working, catalog.active.length]
  );

  return (
    <div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total materials" value={String(summary.total)} />
        <Stat label="Priced" value={String(summary.priced)} warn={summary.priced < summary.total} />
        <Stat label="Needs attention" value={String(summary.needsAttention)} warn={summary.needsAttention > 0} />
        <Stat label="Supplier-linked" value={String(summary.supplierLinked)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search materials..."
          className={`${field} min-w-[220px] flex-1`}
          aria-label="Search materials"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as "All" | MaterialCategory)}
          className={field}
          aria-label="Filter by category"
        >
          <option value="All">All categories</option>
          {categoriesPresent.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | StatusFilterBucket)}
          className={field}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex shrink-0 rounded-pill border border-cardline p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setShowRetired(false)}
            className={`rounded-pill px-3 py-1.5 font-medium transition ${
              !showRetired ? "bg-navy text-white" : "text-slate hover:text-navy"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setShowRetired(true)}
            className={`rounded-pill px-3 py-1.5 font-medium transition ${
              showRetired ? "bg-navy text-white" : "text-slate hover:text-navy"
            }`}
          >
            Retired ({catalog.inactive.length})
          </button>
        </div>
      </div>

      {refreshing && <p className="mt-3 text-xs text-slate">Updating…</p>}
      {notice && <p className="mt-4 rounded-card bg-electric/5 p-3 text-sm text-navy">{notice}</p>}
      {error && <p className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-8">
        {filtered.length === 0 && (
          <EmptyState>
            {rows.length === 0
              ? showRetired
                ? "No retired materials — everything in your catalog is active."
                : "No materials yet. They'll show up here once your services use one."
              : "No materials match your search or filters."}
          </EmptyState>
        )}

        {grouped.map((g) => (
          <div key={g.category}>
            <h2 className="font-display text-base font-bold text-navy">{g.category}</h2>
            <div className="mt-2 divide-y divide-cardline rounded-card border border-cardline bg-white">
              {g.rows.map((row) => (
                <MaterialRow
                  key={row.contractorMaterialId ?? row.canonicalMaterialId}
                  row={row}
                  onSaved={(msg) => {
                    setNotice(msg);
                    setError(null);
                    refresh();
                  }}
                  onError={(msg) => {
                    setError(msg);
                    setNotice(null);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialRow({
  row,
  onSaved,
  onError,
}: {
  row: CatalogRow;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"flat" | "package">("flat");
  const [unitCost, setUnitCost] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [packageQty, setPackageQty] = useState("");
  const [packageUnit, setPackageUnit] = useState(row.unit);
  const [preview, setPreview] = useState<{ unitCostCents: number } | null>(null);

  function openEdit() {
    setMode(row.packagePriceCents != null ? "package" : "flat");
    setUnitCost(row.unitCostCents != null ? (row.unitCostCents / 100).toFixed(2) : "");
    setPackagePrice(row.packagePriceCents != null ? (row.packagePriceCents / 100).toFixed(2) : "");
    setPackageQty(row.packageQuantity != null ? String(row.packageQuantity) : "");
    setPackageUnit(row.packageUnit ?? row.unit);
    setPreview(null);
    setEditing(true);
  }

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
      setEditing(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong saving that cost.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[180px] flex-1">
          <div className="truncate text-sm font-medium text-navy">{row.name}</div>
          <div className="truncate text-xs text-slate">{row.key}</div>
        </div>

        <div className="w-36 shrink-0 text-sm text-navy">
          {row.unitCostCents != null ? (
            <>
              {formatCents(row.unitCostCents)} / {row.unit}
              {row.packagePriceCents != null && row.packageQuantity != null && (
                <div className="text-xs text-slate">
                  {formatCents(row.packagePriceCents)} / {row.packageQuantity} {row.packageUnit}
                </div>
              )}
            </>
          ) : (
            <span className="text-slate">—</span>
          )}
        </div>

        <div className="w-36 shrink-0">
          <StatusBadge status={row.status} />
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-28 shrink-0 text-left text-xs font-medium text-electric"
        >
          {row.usageCount} {row.usageCount === 1 ? "service" : "services"}
        </button>

        <div className="hidden w-40 shrink-0 text-xs text-slate md:block">
          <SourceLabel row={row} />
        </div>

        <button
          type="button"
          onClick={() => (editing ? setEditing(false) : openEdit())}
          className="shrink-0 text-xs font-semibold text-electric"
        >
          {editing ? "Cancel" : row.contractorMaterialId ? "Edit cost" : "Add cost"}
        </button>
      </div>

      {expanded && (
        <div className="mt-2">
          {row.usingServices.length === 0 ? (
            <p className="text-xs text-slate">Not used by any of your services yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {row.usingServices.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/dashboard/services/${s.id}`}
                    className="rounded-pill bg-warmwhite px-2 py-1 text-xs text-slate hover:text-electric"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2 rounded-card border border-cardline bg-warmwhite p-3">
          <div className="flex items-center gap-4 text-xs text-slate">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "flat"} onChange={() => setMode("flat")} />
              Priced per {row.unit}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "package"} onChange={() => setMode("package")} />
              Bought as a package
            </label>
          </div>

          {mode === "flat" ? (
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder={`Cost per ${row.unit}`}
              className={`${field} w-32`}
              aria-label={`Cost per ${row.unit}`}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={packagePrice}
                onChange={(e) => {
                  setPackagePrice(e.target.value);
                  loadPreview(e.target.value, packageQty);
                }}
                placeholder="Package price"
                className={`${field} w-28`}
                aria-label="Package price"
              />
              <span className="text-xs text-slate">for</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={packageQty}
                onChange={(e) => {
                  setPackageQty(e.target.value);
                  loadPreview(packagePrice, e.target.value);
                }}
                placeholder="Quantity"
                className={`${field} w-20`}
                aria-label="Package quantity"
              />
              <input
                value={packageUnit}
                onChange={(e) => setPackageUnit(e.target.value)}
                placeholder="e.g. 250 ft roll"
                className={`${field} w-32`}
                aria-label="Package description"
              />
              {preview && (
                <span className="text-xs text-success">
                  → {formatCents(preview.unitCostCents)} / {row.unit}
                </span>
              )}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-pill bg-electric px-4 py-1.5 text-xs font-semibold text-white hover:bg-electric-hover disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save cost"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MaterialStatus }) {
  const cls =
    status === "Confirmed"
      ? "bg-success/10 text-success"
      : status === "Supplier linked"
      ? "bg-electric/10 text-electric"
      : status === "Needs confirmation"
      ? "bg-amber-50 text-amber-700"
      : "bg-red-50 text-red-700"; // Missing price
  return <span className={`inline-block rounded-pill px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

function SourceLabel({ row }: { row: CatalogRow }) {
  if (!row.contractorMaterialId) return null;
  // A supplier link can stay attached after a manual edit — setContractorMaterialCost
  // always resolves an edit to CUSTOM (see lib/materialCost.ts), so the link's
  // presence and the cost's actual source can legitimately disagree.
  if (row.activeSupplierLink) {
    return (
      <span>
        {row.costSource === "SUPPLIER" ? "Supplier" : "Supplier product · cost overridden"}
        {row.activeSupplierLink.lastSyncedAt
          ? ` · synced ${new Date(row.activeSupplierLink.lastSyncedAt).toLocaleDateString()}`
          : " · not yet synced"}
      </span>
    );
  }
  if (row.costSource === "SUPPLIER") return <span>Supplier</span>;
  if (row.costSource === "BASELINE") {
    return (
      <span>
        Baseline
        {row.costUpdatedAt ? ` · ${new Date(row.costUpdatedAt).toLocaleDateString()}` : ""}
      </span>
    );
  }
  return (
    <span>
      Manual
      {row.costUpdatedAt ? ` · ${new Date(row.costUpdatedAt).toLocaleDateString()}` : ""}
    </span>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-card border border-cardline bg-white p-3">
      <div className="text-xs text-slate">{label}</div>
      <div className={`mt-0.5 font-display text-lg font-bold ${warn ? "text-amber-700" : "text-navy"}`}>{value}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-cardline bg-white p-6 text-sm text-slate">{children}</div>
  );
}
