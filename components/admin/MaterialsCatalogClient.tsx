"use client";

import { useMemo, useRef, useState } from "react";
import { MATERIAL_CATEGORIES, type MaterialCategory } from "@/lib/materialCategory";
import type { CatalogRow, MaterialCatalog, StatusFilterBucket } from "@/lib/materialCatalog";
import { CatalogHealthStrip } from "./materials/CatalogHealthStrip";
import { CatalogToolbar } from "./materials/CatalogToolbar";
import { MaterialRow } from "./materials/MaterialRow";
import { MaterialCostDrawer } from "./materials/MaterialCostDrawer";

/**
 * The catalog-level view over the shared material architecture.
 *
 * Every mutation happens inside MaterialCostDrawer via POST
 * /api/admin/materials, using the SAME "cost" and "create" actions the
 * per-service MaterialsPanel already uses — nothing here owns cost math or
 * recompute logic. See lib/materialCost.ts for what actually happens on save.
 *
 * The drawer is rendered exactly ONCE here, not once per row — `editingRow`
 * is the one piece of state that decides whether it exists at all, which is
 * also what makes "only one material editable at a time" true structurally.
 * Its own validation/API errors stay inside it (see MaterialCostDrawer's own
 * header); this component only ever hears from it on an actual success, via
 * onSaved, which is also the one path that closes it.
 *
 * The four questions this page answers, in priority order: what is this
 * material, what do I pay for it, where does Price2Book use it, and how do I
 * change the cost. Everything else — category, source, search — is support
 * for getting to those four answers faster, not competing content.
 */
export default function MaterialsCatalogClient({ initialCatalog }: { initialCatalog: MaterialCatalog }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<CatalogRow | null>(null);
  const editTriggerRef = useRef<HTMLElement | null>(null);

  function openEditor(row: CatalogRow, trigger: HTMLButtonElement) {
    editTriggerRef.current = trigger;
    setEditingRow(row);
  }
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"All" | MaterialCategory>("All");
  // Unresolved active materials — a missing price or one still needing
  // confirmation — are the reason a contractor would open this page at all;
  // starting the view filtered to them surfaces the work instead of making
  // it a choice from a menu of equally-weighted options. A catalog with
  // nothing unresolved has no reason to start narrowed, so it opens to
  // everything active instead. Computed once, from the page's own initial
  // load — later filter changes are the contractor's own choice.
  const [status, setStatus] = useState<"all" | StatusFilterBucket>(() => {
    const startingWork = [...initialCatalog.active, ...initialCatalog.missing];
    return startingWork.some((r) => r.statusBucket === "needs_attention") ? "needs_attention" : "all";
  });
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

  const summary = useMemo(() => {
    // Distinct services, not a sum of usageCount — one service using three
    // materials from this catalog is still one service, not three.
    const serviceIds = new Set<string>();
    for (const r of working) for (const s of r.usingServices) serviceIds.add(s.id);
    const needsAttention = working.filter((r) => r.statusBucket === "needs_attention").length;
    // READY, not merely "has a cost entered" — an active material still
    // needing confirmation (statusBucket "needs_attention") already has a
    // real ContractorMaterial row, so `catalog.active.length` alone counted
    // it as done when it isn't. Ready is every working row whose bucket
    // ISN'T needs_attention — confirmed or supplier-linked — so it always
    // reconciles with needsAttention by construction (total - needsAttention),
    // the same partition the status filter already uses.
    return {
      total: working.length,
      ready: working.length - needsAttention,
      needsAttention,
      supplierLinked: working.filter((r) => r.statusBucket === "supplier_linked").length,
      usedInServices: serviceIds.size,
    };
  }, [working]);

  const isFiltering = search.trim() !== "" || category !== "All" || status !== "all";
  function clearFilters() {
    setSearch("");
    setCategory("All");
    setStatus("all");
  }

  return (
    <div>
      <CatalogHealthStrip
        total={summary.total}
        ready={summary.ready}
        needsAttention={summary.needsAttention}
        supplierLinked={summary.supplierLinked}
        usedInServices={summary.usedInServices}
      />

      {/* Active / Retired reads as a page-level mode, not another filter —
          an underline tab, not a pill toggle competing with the search bar. */}
      <div className="mt-6 flex items-center gap-6 border-b border-cardline">
        <button
          type="button"
          onClick={() => setShowRetired(false)}
          className={`-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-semibold transition ${
            !showRetired ? "border-electric text-navy" : "border-transparent text-slate hover:text-navy"
          }`}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => setShowRetired(true)}
          className={`-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-medium transition ${
            showRetired ? "border-electric text-navy" : "border-transparent text-slate hover:text-navy"
          }`}
        >
          Retired
        </button>
      </div>

      <CatalogToolbar
        search={search} onSearch={setSearch}
        category={category} onCategory={setCategory} categoriesPresent={categoriesPresent}
        status={status} onStatus={setStatus}
        isFiltering={isFiltering} onClear={clearFilters}
      />

      {refreshing && <p className="mt-3 text-xs text-slate">Updating…</p>}
      {notice && (
        <p className="mt-4 rounded-card border border-success/20 bg-success/10 p-3 text-sm text-navy">{notice}</p>
      )}

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState>
            {rows.length === 0
              ? showRetired
                ? "No retired materials — everything in your catalog is active."
                : "No materials yet. They'll show up here once your services use one."
              : "No materials match your search or filters."}
          </EmptyState>
        ) : (
          <div className="divide-y divide-cardline rounded-card border border-cardline bg-white">
            {/* Column header — desktop only, once for the whole table. The
                mobile stack (MaterialRow's own sm:hidden layout) labels each
                value inline instead, so it needs no header of its own. */}
            <div className="hidden items-center gap-x-4 border-b border-cardline bg-warmwhite/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate sm:flex">
              <div className="min-w-0 flex-1">Material</div>
              <div className="w-28 shrink-0">Current cost</div>
              <div className="w-20 shrink-0">Used in</div>
              <div className="w-28 shrink-0">Source</div>
              <div className="w-20 shrink-0">Updated</div>
              <div className="w-32 shrink-0">Status</div>
              <div className="w-20 shrink-0" aria-hidden="true" />
            </div>
            {grouped.map((g) => (
              <div key={g.category}>
                <div className="flex items-baseline gap-2 bg-warmwhite/70 px-4 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate">{g.category}</span>
                  <span className="text-xs text-slate/70">{g.rows.length}</span>
                </div>
                <div className="divide-y divide-cardline">
                  {g.rows.map((row) => (
                    <MaterialRow
                      key={row.contractorMaterialId ?? row.canonicalMaterialId}
                      row={row}
                      readOnly={showRetired}
                      onEdit={openEditor}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingRow && (
        <MaterialCostDrawer
          key={editingRow.contractorMaterialId ?? editingRow.canonicalMaterialId}
          row={editingRow}
          triggerRef={editTriggerRef}
          onClose={() => setEditingRow(null)}
          onSaved={(msg) => {
            setNotice(msg);
            refresh();
            setEditingRow(null);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-cardline bg-white p-6 text-sm text-slate">{children}</div>;
}
