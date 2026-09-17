"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatCents } from "@/lib/flow-types";
import type { CatalogRow } from "@/lib/materialCatalog";
import { shortUnit, purchasingUnit } from "./format";
import { StatusBadge } from "./StatusBadge";

/**
 * The one focused editor MaterialRow.tsx's "Edit"/"Add cost" now opens,
 * replacing the inline MaterialCostEditor it used to mount directly inside
 * a row. Same two real actions ("cost" for an existing ContractorMaterial,
 * "create" for a missing-price role), the same real preview-package call
 * for the derived unit cost, and the same success-message wording — nothing
 * here computes a price or owns any write path of its own; see
 * lib/materialCost.ts for what actually happens on save.
 *
 * Rendered exactly once, lifted to MaterialsCatalogClient, not once per
 * row — a drawer is page-level chrome, and lifting the state up is also
 * what makes "only one material editable at a time" true structurally
 * rather than by convention: there is exactly one `editingRow` to be.
 *
 * ACCESSIBILITY, matching the established pattern in
 * components/admin/questions/GuidedPricingWorkspace.tsx's unsaved-changes
 * dialog (onKeyDown Tab-trap, capture-then-restore focus in a useEffect
 * keyed on the open state) rather than inventing a new one:
 *   - role="dialog"/aria-modal + aria-labelledby the material's own name.
 *   - Focus moves into the panel on open and is trapped there (Tab/Shift+Tab
 *     never reach the page underneath); the trap is a Tab keydown handler
 *     on the panel itself, not a document-level listener, since focus never
 *     leaves the panel in the first place once it holds it.
 *   - Escape and the backdrop both route through requestClose(), the same
 *     function Cancel and the header's Close button use — one path, one
 *     dirty check, so "the same confirmation" (the task's own wording) is
 *     true by construction rather than by keeping two copies in sync.
 *   - Whatever had focus before the drawer opened (the row's own Edit
 *     button) gets it back once the drawer unmounts, on every exit path.
 *   - document.body.style.overflow is hidden for the drawer's lifetime and
 *     restored on unmount, so the page behind it cannot scroll.
 */
export function MaterialCostDrawer({
  row,
  triggerRef,
  onClose,
  onSaved,
}: {
  row: CatalogRow;
  /** The exact DOM button that opened this drawer — focus returns to it on close. */
  triggerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Captured once, at open — the SAME values the fields below start from —
  // so "changed" means "differs from what's actually saved", not "differs
  // from empty".
  const initialRef = useRef({
    mode: (row.packagePriceCents != null ? "package" : "flat") as "flat" | "package",
    unitCost: row.unitCostCents != null ? (row.unitCostCents / 100).toFixed(2) : "",
    packagePrice: row.packagePriceCents != null ? (row.packagePriceCents / 100).toFixed(2) : "",
    packageQty: row.packageQuantity != null ? String(row.packageQuantity) : "",
  });
  const initial = initialRef.current;

  const [mode, setMode] = useState<"flat" | "package">(initial.mode);
  const [unitCost, setUnitCost] = useState(initial.unitCost);
  const [packagePrice, setPackagePrice] = useState(initial.packagePrice);
  const [packageQty, setPackageQty] = useState(initial.packageQty);
  const [preview, setPreview] = useState<{ unitCostCents: number } | null>(
    row.packagePriceCents != null && row.packageQuantity != null && row.unitCostCents != null
      ? { unitCostCents: row.unitCostCents }
      : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const isDirty =
    mode !== initial.mode ||
    unitCost !== initial.unitCost ||
    packagePrice !== initial.packagePrice ||
    packageQty !== initial.packageQty;
  const isValid =
    mode === "flat"
      ? unitCost.trim() !== "" && Number.isFinite(Number(unitCost)) && Number(unitCost) >= 0
      : preview !== null;

  // Focus in, focus back out. One effect, runs once on mount/unmount —
  // there is nothing else this drawer's identity changes on (a fresh `row`
  // means MaterialsCatalogClient unmounted this instance and mounted a new
  // one, via the `key` it renders the drawer with).
  useEffect(() => {
    panelRef.current?.focus();
    const trigger = triggerRef.current;
    return () => {
      trigger?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Keep editing" unmounts the confirm sub-view's own button — its being
  // the focused element — and a browser drops focus to document.body when
  // that happens, which is OUTSIDE the panel. Left alone, every Escape/Tab
  // handler below (both wired to the panel itself) would silently go dead
  // for the rest of this open drawer, since they only ever see events that
  // bubble through it. Re-claim focus back into the panel every time this
  // flips back to false — including the initial mount, where it is a no-op
  // alongside the effect above.
  useEffect(() => {
    if (!confirmingClose) panelRef.current?.focus();
  }, [confirmingClose]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  function requestClose() {
    if (isDirty) setConfirmingClose(true);
    else onClose();
  }

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
    setError(null);
    try {
      const basis: Record<string, unknown> =
        mode === "package"
          ? {
              packagePriceCents: Math.round(parseFloat(packagePrice || "0") * 100),
              packageQuantity: parseFloat(packageQty || "0"),
              // No package-description field in this drawer (see the task
              // report) — an existing description survives an edit; a
              // material priced by package for the first time here gets
              // none, same as leaving it blank always did.
              packageUnit: row.packageUnit ?? row.unit,
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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `${res.status} ${res.statusText}`);
        return;
      }

      const message = row.contractorMaterialId
        ? (() => {
            const n = data.servicesMoved ?? data.affectedServices ?? 0;
            return n === 0
              ? `${row.name} saved. No services needed to recalculate.`
              : `${row.name} updated. ${n} ${n === 1 ? "service was" : "services were"} recalculated.`;
          })()
        : (() => {
            const n = data.recomputed ?? 0;
            return n === 0
              ? `${row.name} priced. No services needed it yet.`
              : `${row.name} priced. ${n} ${n === 1 ? "service" : "services"} can now use it.`;
          })();
      // The whole point of leaving error/field state alone on failure: only
      // a genuine success ever reaches here, so this is the one path that
      // is allowed to hand control back to the parent (which closes us).
      onSaved(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving that cost.");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";
  const label = "block text-xs font-medium text-slate";

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-navy/40" aria-hidden="true" onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        className="fixed inset-y-0 right-0 flex w-full flex-col bg-white shadow-raised outline-none sm:w-[460px]"
      >
        {confirmingClose ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-discard`}
            className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
          >
            <h3 id={`${titleId}-discard`} className="font-display text-base font-bold text-navy">
              Discard your changes?
            </h3>
            <p className="max-w-xs text-sm text-slate">
              Your changes to {row.name} haven&rsquo;t been saved. Closing now discards them.
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingClose(false)}
                className="rounded-pill border border-cardline px-4 py-2 text-sm font-medium text-navy hover:border-electric"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-pill bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Discard changes
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-cardline p-5">
              <div className="min-w-0">
                <h2 id={titleId} className="truncate font-display text-lg font-bold text-navy">
                  {row.name}
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate">
                  {row.category} · {purchasingUnit(row)}
                </p>
                <div className="mt-2">
                  <StatusBadge status={row.status} />
                </div>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="shrink-0 rounded-full p-1.5 text-lg leading-none text-slate hover:bg-warmwhite hover:text-navy"
              >
                ×
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              <div>
                <span className={label}>Cost method</span>
                <div className="mt-1.5 inline-flex rounded-pill border border-cardline bg-warmwhite p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode("flat")}
                    aria-pressed={mode === "flat"}
                    className={`rounded-pill px-3 py-1.5 font-medium transition ${
                      mode === "flat" ? "bg-navy text-white" : "text-slate hover:text-navy"
                    }`}
                  >
                    Per item
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("package")}
                    aria-pressed={mode === "package"}
                    className={`rounded-pill px-3 py-1.5 font-medium transition ${
                      mode === "package" ? "bg-navy text-white" : "text-slate hover:text-navy"
                    }`}
                  >
                    By package
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {mode === "flat" ? (
                  <label className={`${label} max-w-[10rem]`}>
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
                  <div className="space-y-3">
                    <label className={label}>
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
                    <label className={label}>
                      Items per package
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={packageQty}
                        onChange={(e) => {
                          setPackageQty(e.target.value);
                          loadPreview(packagePrice, e.target.value);
                        }}
                        className={field}
                        aria-label="Items per package"
                      />
                    </label>
                    <div className="rounded-card border border-cardline bg-warmwhite p-3">
                      <div className="text-xs font-medium text-slate">Your cost per {shortUnit(row.unit)}</div>
                      <div className={`mt-0.5 text-lg font-semibold ${preview ? "text-success" : "text-slate"}`}>
                        {preview ? formatCents(preview.unitCostCents) : "—"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-card bg-warmwhite p-3 text-xs text-slate">
                <p>
                  {row.usageCount > 0
                    ? `Saving this cost updates the material totals for ${row.usageCount} ${
                        row.usageCount === 1 ? "service" : "services"
                      }.`
                    : "This material is not currently used by a service."}
                </p>
                <p className="mt-1">Customer prices are never published automatically.</p>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-card border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>

            <footer className="sticky bottom-0 flex gap-3 border-t border-cardline bg-white p-4">
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                className="flex-1 rounded-pill border border-cardline py-2.5 text-sm font-semibold text-navy hover:border-electric disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!isValid || !isDirty || busy}
                className="flex-1 rounded-pill bg-electric py-2.5 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save cost"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
