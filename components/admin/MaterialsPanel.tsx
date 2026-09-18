"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateMaterialSellCents, effectiveMaterialMarkup } from "@/lib/pricing";
import type { MaterialStatus } from "@/lib/materialCatalog";
import type { MaterialCategory } from "@/lib/materialCategory";
import { formatMoney } from "./materials/format";
import { MaterialCostDrawer, type MaterialCostDrawerRow } from "./materials/MaterialCostDrawer";
import { AddMaterialDialog, type AddMaterialCatalogEntry } from "./materials/AddMaterialDialog";

type CatalogEntry = AddMaterialCatalogEntry;

type Item = {
  id: string;
  canonicalMaterialId: string | null;
  contractorMaterialId: string | null;
  key: string | null;
  name: string | null;
  unit: string | null;
  category: MaterialCategory;
  quantity: number | null;
  quantityIsPolicy: boolean;
  unitCostCents: number | null;
  lineTotalCents: number | null;
  unpriced: boolean;
  packagePriceCents: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  status: MaterialStatus;
  usageCount: number;
};

/**
 * The recipe workspace for a single service: what it's made of, what each
 * part costs, and whether the recipe is complete enough to price.
 *
 * Costs shown here are contractor costs. The shared pricing rule applies the
 * material markup downstream to the assembled package once; this screen never
 * publishes a customer price by itself.
 *
 * Two write paths, both pre-existing (see app/api/admin/materials/route.ts) —
 * this redesign adds no new one:
 *   - Recipe shape (add/quantity/remove) — local to this service.
 *   - Cost (via MaterialCostDrawer's "cost"/"create" actions) — shared: it
 *     changes what every service using that material pays, which is why the
 *     drawer, not this panel, owns that write and its own confirmation copy.
 */
export default function MaterialsPanel({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const editTriggerRef = useRef<HTMLElement | null>(null);

  const [addingOpen, setAddingOpen] = useState(false);
  const addTriggerRef = useRef<HTMLElement | null>(null);

  const [removingItem, setRemovingItem] = useState<Item | null>(null);
  const removeTriggerRef = useRef<HTMLElement | null>(null);

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

  async function addMaterial(canonicalMaterialId: string): Promise<boolean> {
    const saved = await send({ action: "add", serviceId, canonicalMaterialId, quantity: 1 });
    return saved !== null;
  }

  async function commitQuantity(item: Item, quantity: number) {
    await send({ action: "quantity", id: item.id, quantity });
  }

  function openCostEditor(item: Item, trigger: HTMLButtonElement) {
    if (!item.canonicalMaterialId || !item.name || !item.unit) return;
    editTriggerRef.current = trigger;
    setEditingItem(item);
  }

  function openAddDialog(trigger: HTMLButtonElement) {
    addTriggerRef.current = trigger;
    setAddingOpen(true);
  }

  function requestRemove(item: Item, trigger: HTMLButtonElement) {
    removeTriggerRef.current = trigger;
    setRemovingItem(item);
  }

  async function confirmRemove() {
    if (!removingItem) return;
    const item = removingItem;
    setRemovingItem(null);
    await send({ action: "remove", id: item.id });
  }

  const excludeCanonicalIds = useMemo(
    () => new Set(items.map((i) => i.canonicalMaterialId).filter((id): id is string => id !== null)),
    [items],
  );

  const resolvedItems = items.filter((i) => i.lineTotalCents !== null);
  const directTotal = resolvedItems.reduce((sum, item) => sum + (item.lineTotalCents ?? 0), 0);
  const unpricedCount = items.filter((i) => i.unpriced || i.lineTotalCents === null).length;
  const hasUnpriced = unpricedCount > 0;
  const missingCost = items.filter((i) => i.unpriced);
  const missingQuantity = items.filter((i) => i.quantityIsPolicy && i.quantity === null);
  const markup = !hasUnpriced && directTotal > 0 ? effectiveMaterialMarkup(directTotal) : null;
  const sellTotal = !hasUnpriced ? calculateMaterialSellCents(directTotal) : null;

  if (loading) {
    return (
      <div className="mt-8 max-w-3xl rounded-card border border-cardline bg-white p-6 shadow-card">
        <p className="text-sm text-slate">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-3xl rounded-card border border-cardline bg-white p-6 shadow-card">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-navy">Materials for this service</h2>
          <p className="mt-1 text-sm text-slate">
            Parts and quantities used to calculate this service&rsquo;s material cost.
          </p>
          <Link href="/dashboard/materials" className="mt-1 inline-block text-xs font-medium text-electric hover:underline">
            Manage all material costs
          </Link>
        </div>
        <button
          type="button"
          onClick={(e) => openAddDialog(e.currentTarget)}
          className="shrink-0 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white hover:bg-electric-hover"
        >
          Add material
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-card bg-warmwhite p-4 text-sm text-slate">
          <p>
            Not itemized yet — this service uses a single material figure. Adding your first material
            replaces it with a real, itemized list, and clears any imported markup so the standard rule
            applies.
          </p>
          <button
            type="button"
            onClick={(e) => openAddDialog(e.currentTarget)}
            className="mt-3 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white hover:bg-electric-hover"
          >
            Add first material
          </button>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="mt-4 rounded-card border border-cardline bg-warmwhite p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate">Direct material cost</div>
                <div className="text-lg font-semibold text-navy">
                  {hasUnpriced ? "Incomplete" : formatMoney(directTotal)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate">Material markup</div>
                <div className="text-lg font-semibold text-navy">
                  {markup ? `${(markup * 100 - 100).toFixed(0)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate">Material amount in price</div>
                <div className="text-lg font-semibold text-navy">
                  {sellTotal !== null ? formatMoney(sellTotal) : "Incomplete"}
                </div>
              </div>
            </div>
            {hasUnpriced && (
              <p className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                {missingCost.length > 0 && <>Missing cost: {missingCost.map((i) => i.name ?? i.key).join(", ")}. </>}
                {missingQuantity.length > 0 && <>Missing allowance: {missingQuantity.map((i) => i.name ?? i.key).join(", ")}. </>}
                Complete these materials before this service is ready.
              </p>
            )}
          </div>

          {/* Recipe list */}
          <div className="mt-4 rounded-card border border-cardline">
            <div className="hidden items-center gap-x-4 border-b border-cardline bg-warmwhite/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate sm:flex">
              <div className="min-w-0 flex-1">Material</div>
              <div className="w-24 shrink-0">Quantity</div>
              <div className="w-28 shrink-0">Unit cost</div>
              <div className="w-24 shrink-0">Line total</div>
              <div className="w-40 shrink-0" aria-hidden="true" />
            </div>
            <div className="divide-y divide-cardline">
              {items.map((item) => (
                <RecipeRow
                  key={item.id}
                  item={item}
                  busy={busy}
                  onCommitQuantity={commitQuantity}
                  onEditCost={openCostEditor}
                  onRemove={requestRemove}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {notice && <p className="mt-4 rounded-card bg-electric/5 p-3 text-sm text-navy">{notice}</p>}
      {error && (
        <p role="alert" className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {editingItem && editingItem.canonicalMaterialId && (
        <MaterialCostDrawer
          key={editingItem.contractorMaterialId ?? editingItem.canonicalMaterialId}
          row={itemToDrawerRow(editingItem)}
          triggerRef={editTriggerRef}
          onClose={() => setEditingItem(null)}
          onSaved={(msg) => {
            setNotice(msg);
            load();
            router.refresh();
            setEditingItem(null);
          }}
        />
      )}

      {addingOpen && (
        <AddMaterialDialog
          catalog={catalog}
          excludeCanonicalIds={excludeCanonicalIds}
          onAdd={addMaterial}
          onClose={() => setAddingOpen(false)}
          triggerRef={addTriggerRef}
        />
      )}

      {removingItem && (
        <RemoveConfirmDialog
          item={removingItem}
          triggerRef={removeTriggerRef}
          onCancel={() => setRemovingItem(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

function itemToDrawerRow(item: Item): MaterialCostDrawerRow {
  return {
    contractorMaterialId: item.contractorMaterialId,
    canonicalMaterialId: item.canonicalMaterialId!,
    name: item.name!,
    unit: item.unit!,
    category: item.category,
    unitCostCents: item.unitCostCents,
    packagePriceCents: item.packagePriceCents,
    packageQuantity: item.packageQuantity,
    packageUnit: item.packageUnit,
    status: item.status,
    usageCount: item.usageCount,
  };
}

function RecipeRow({
  item,
  busy,
  onCommitQuantity,
  onEditCost,
  onRemove,
}: {
  item: Item;
  busy: boolean;
  onCommitQuantity: (item: Item, quantity: number) => void;
  onEditCost: (item: Item, trigger: HTMLButtonElement) => void;
  onRemove: (item: Item, trigger: HTMLButtonElement) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [qtyError, setQtyError] = useState<string | null>(null);
  const displayName = item.name ?? item.key ?? "Material";
  const canEditCost = !!item.canonicalMaterialId && !!item.name && !!item.unit;

  function commitQuantity() {
    const el = inputRef.current;
    if (!el) return;
    if (el.value.trim() === "") { setQtyError(null); return; }
    const q = Number(el.value);
    if (!Number.isFinite(q) || q < 0) {
      setQtyError("Enter a quantity of 0 or more.");
      el.value = String(item.quantity ?? "");
      return;
    }
    setQtyError(null);
    if (q !== item.quantity) onCommitQuantity(item, q);
  }

  const costLabel = item.unitCostCents != null ? `${formatMoney(item.unitCostCents)} / ${item.unit ?? "unit"}` : "Not priced";
  const editLabel = item.contractorMaterialId ? "Edit cost" : "Set cost";

  return (
    <div className={`p-3 ${item.unpriced ? "bg-amber-50/40" : ""}`}>
      {/* Desktop row */}
      <div className="hidden items-center gap-x-4 sm:flex">
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-medium text-navy">{displayName}</div>
        </div>
        <div className="w-24 shrink-0">
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.quantity ?? ""}
            onBlur={commitQuantity}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitQuantity();
              }
            }}
            className="w-full rounded-card border border-cardline px-2 py-1.5 text-right text-sm focus:border-electric"
            aria-label={`Quantity of ${displayName}`}
            aria-invalid={qtyError ? true : undefined}
          />
          {qtyError && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {qtyError}
            </p>
          )}
        </div>
        <div className={`w-28 shrink-0 text-sm ${item.unitCostCents != null ? "text-navy" : "text-amber-700"}`}>
          {costLabel}
        </div>
        <div className="w-24 shrink-0 text-sm font-medium text-navy">
          {item.lineTotalCents === null ? "—" : formatMoney(item.lineTotalCents)}
        </div>
        <div className="flex w-40 shrink-0 items-center justify-end gap-2">
          {canEditCost && (
            <button
              type="button"
              onClick={(e) => onEditCost(item, e.currentTarget)}
              className="rounded-pill border border-cardline px-2.5 py-1 text-xs font-semibold text-electric transition hover:border-electric hover:bg-electric/5"
            >
              {editLabel}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => onRemove(item, e.currentTarget)}
            disabled={busy}
            aria-label={`Remove ${displayName}`}
            className="shrink-0 rounded-pill border border-cardline px-2.5 py-1 text-xs font-semibold text-slate hover:border-red-300 hover:text-red-600 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Mobile stacked row */}
      <div className="space-y-2 sm:hidden">
        <div className="break-words text-sm font-medium text-navy">{displayName}</div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate">
            Qty
            <input
              type="number"
              step="0.01"
              min="0"
              defaultValue={item.quantity ?? ""}
              onBlur={(e) => {
                if (e.target.value.trim() === "") { setQtyError(null); return; }
                const q = Number(e.target.value);
                if (!Number.isFinite(q) || q < 0) {
                  setQtyError("Enter a quantity of 0 or more.");
                  e.target.value = String(item.quantity ?? "");
                  return;
                }
                setQtyError(null);
                if (q !== item.quantity) onCommitQuantity(item, q);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-16 rounded-card border border-cardline px-2 py-1 text-right text-sm focus:border-electric"
              aria-label={`Quantity of ${displayName}`}
            />
          </label>
          <div className={`text-xs ${item.unitCostCents != null ? "text-slate" : "text-amber-700"}`}>{costLabel}</div>
          <div className="text-sm font-medium text-navy">
            {item.lineTotalCents === null ? "—" : formatMoney(item.lineTotalCents)}
          </div>
        </div>
        {qtyError && (
          <p role="alert" className="text-xs text-red-600">
            {qtyError}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          {canEditCost && (
            <button
              type="button"
              onClick={(e) => onEditCost(item, e.currentTarget)}
              className="flex-1 rounded-pill border border-cardline px-2.5 py-1.5 text-xs font-semibold text-electric hover:border-electric hover:bg-electric/5"
            >
              {editLabel}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => onRemove(item, e.currentTarget)}
            disabled={busy}
            aria-label={`Remove ${displayName}`}
            className="flex-1 rounded-pill border border-cardline px-2.5 py-1.5 text-xs font-semibold text-slate hover:border-red-300 hover:text-red-600 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmed removal — same accessible-dialog conventions as
 * MaterialCostDrawer's own "Discard your changes?" alertdialog (focus
 * capture/restore, Escape closes it), because this is the same kind of
 * interruption: a destructive action a contractor didn't explicitly ask
 * to confirm yet. Removing only ever detaches this ONE service's recipe
 * line — the material's shared cost is untouched, which the copy below
 * says explicitly since "remove" reads ambiguous otherwise.
 */
function RemoveConfirmDialog({
  item,
  triggerRef,
  onCancel,
  onConfirm,
}: {
  item: Item;
  triggerRef: React.RefObject<HTMLElement>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const displayName = item.name ?? item.key ?? "this material";

  useEffect(() => {
    confirmRef.current?.focus();
    const trigger = triggerRef.current;
    return () => {
      trigger?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-navy/40" aria-hidden="true" onClick={onCancel} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-card bg-white p-6 text-center shadow-raised outline-none"
      >
        <h3 id={titleId} className="font-display text-base font-bold text-navy">
          Remove {displayName}?
        </h3>
        <p className="mt-2 text-sm text-slate">
          This only removes {displayName} from this service&rsquo;s recipe. Its cost stays in your catalog for
          every other service that uses it.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-pill border border-cardline px-4 py-2 text-sm font-medium text-navy hover:border-electric"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-pill bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
