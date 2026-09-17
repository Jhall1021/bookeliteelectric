"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MaterialStatus } from "@/lib/materialCatalog";
import { purchasingUnit, formatMoney } from "./format";
import { StatusBadge } from "./StatusBadge";

/** The subset of a catalog entry this picker actually shows — never a canonical id on screen. */
export type AddMaterialCatalogEntry = {
  canonicalMaterialId: string;
  name: string;
  unit: string;
  unitCostCents: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  status: MaterialStatus;
};

/**
 * "Add material" opens this — a searchable dialog on desktop, a full-screen
 * sheet on mobile (the same component; only the panel's positioning classes
 * change at the sm breakpoint). It lists ACTIVE catalog materials only, and
 * only the ones not already in this recipe — `excludeCanonicalIds` is owned
 * by the caller (MaterialsPanel), computed from its own live `items`, so the
 * list updates the instant an add lands without this dialog re-deriving
 * recipe membership itself.
 *
 * Stays open after a successful add so a contractor can add several
 * materials in one visit — onAdd resolves to whether it worked, and the
 * caller's own state update (which removes that material from `catalog`/
 * adds it to `items`) is what actually drops the row from this list; this
 * component owns no "added" bookkeeping of its own.
 *
 * Never creates a material and never shows a canonical id — Add resolves an
 * EXISTING role via the same POST /api/admin/materials "add" action the
 * panel already used before this dialog existed.
 */
export function AddMaterialDialog({
  catalog,
  excludeCanonicalIds,
  onAdd,
  onClose,
  triggerRef,
}: {
  catalog: AddMaterialCatalogEntry[];
  excludeCanonicalIds: Set<string>;
  onAdd: (canonicalMaterialId: string) => Promise<boolean>;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const available = useMemo(
    () => catalog.filter((c) => !excludeCanonicalIds.has(c.canonicalMaterialId)),
    [catalog, excludeCanonicalIds],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) => c.name.toLowerCase().includes(q));
  }, [available, search]);

  useEffect(() => {
    searchRef.current?.focus();
    const trigger = triggerRef.current;
    return () => {
      trigger?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const list = Array.from(focusables);
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function handleAdd(entry: AddMaterialCatalogEntry) {
    setAddingId(entry.canonicalMaterialId);
    setRowError(null);
    try {
      const ok = await onAdd(entry.canonicalMaterialId);
      if (!ok) {
        setRowError({ id: entry.canonicalMaterialId, message: "Could not add that material. Try again." });
      }
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-navy/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        className="fixed inset-0 flex flex-col bg-white shadow-raised outline-none sm:inset-y-10 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-card"
      >
        <header className="flex items-start justify-between gap-3 border-b border-cardline p-5">
          <h2 id={titleId} className="font-display text-lg font-bold text-navy">
            Add material
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-lg leading-none text-slate hover:bg-warmwhite hover:text-navy"
          >
            ×
          </button>
        </header>

        <div className="border-b border-cardline p-4">
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials…"
            aria-label="Search materials"
            className="w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {available.length === 0 ? (
            <p className="rounded-card bg-warmwhite p-4 text-sm text-slate">
              Every active material in your catalog is already in this recipe.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-card bg-warmwhite p-4 text-sm text-slate">
              No materials match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-cardline">
              {filtered.map((c) => (
                <li key={c.canonicalMaterialId} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-medium text-navy">{c.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate">
                      <span>{purchasingUnit(c)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.unitCostCents != null ? formatMoney(c.unitCostCents) : "Not priced"}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    {rowError?.id === c.canonicalMaterialId && (
                      <p role="alert" className="mt-1 text-xs text-red-600">
                        {rowError.message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdd(c)}
                    disabled={addingId === c.canonicalMaterialId}
                    className="shrink-0 rounded-pill bg-electric px-3 py-1.5 text-xs font-semibold text-white hover:bg-electric-hover disabled:opacity-50"
                  >
                    {addingId === c.canonicalMaterialId ? "Adding…" : "Add"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-cardline p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-pill border border-cardline py-2.5 text-sm font-semibold text-navy hover:border-electric"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
