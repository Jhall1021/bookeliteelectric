"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/flow-types";
import type { CatalogRow, MaterialStatus } from "@/lib/materialCatalog";
import { shortUnit, supplierDisplayName, formatShortDate } from "./format";
import { MaterialCostEditor } from "./MaterialCostEditor";

export function MaterialRow({
  row,
  onSaved,
  onError,
  readOnly = false,
}: {
  row: CatalogRow;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  /** Retired materials are historical/reference — no Edit/Add cost action, and `active` is never touched from here. */
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isMissingPrice = row.status === "Missing price";
  const editLabel = row.contractorMaterialId ? "Edit" : "Add cost";

  function closeEdit() {
    setEditing(false);
  }
  function handleSaved(message: string) {
    onSaved(message);
    setEditing(false);
  }

  const cost = <CostCell row={row} />;
  const usageButton = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="text-left text-xs text-electric hover:text-electric-hover hover:underline"
    >
      {row.usageCount} {row.usageCount === 1 ? "service" : "services"}
    </button>
  );
  const editButton = readOnly ? null : (
    <button
      type="button"
      onClick={() => setEditing((v) => !v)}
      className="shrink-0 rounded-pill border border-cardline px-2.5 py-1 text-xs font-semibold text-electric transition hover:border-electric hover:bg-electric/5"
    >
      {editing ? "Cancel" : editLabel}
    </button>
  );

  return (
    <div className={`p-3 ${isMissingPrice ? "bg-amber-50/40" : ""}`}>
      {/* Desktop row */}
      <div className="hidden items-center gap-x-4 sm:flex">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-navy">{row.name}</div>
        </div>
        <div className="w-32 shrink-0">{cost}</div>
        <div className="w-40 shrink-0">
          <StatusCell row={row} />
        </div>
        <div className="w-24 shrink-0">{usageButton}</div>
        {editButton}
      </div>

      {/* Mobile stack — a deliberate compact card, not a reflow of the desktop row */}
      <div className="space-y-1.5 sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-navy">{row.name}</div>
          </div>
          <StatusBadge status={row.status} />
        </div>
        {cost}
        <div className="flex items-center justify-between pt-1">
          {usageButton}
          {editButton}
        </div>
      </div>

      {expanded && (
        <div className="mt-2">
          {row.usingServices.length === 0 ? (
            <p className="text-xs text-slate">Not used by any of your services yet.</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-xs text-slate">Used by</span>
              {row.usingServices.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/services/${s.id}`}
                  className="rounded-pill bg-warmwhite px-2 py-1 text-xs text-slate hover:text-electric"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {!readOnly && editing && <MaterialCostEditor row={row} onCancel={closeEdit} onSaved={handleSaved} onError={onError} />}
    </div>
  );
}

function CostCell({ row }: { row: CatalogRow }) {
  return (
    <div>
      <div className={`text-sm font-semibold ${row.unitCostCents != null ? "text-navy" : "text-slate"}`}>
        {row.unitCostCents != null ? `${formatCents(row.unitCostCents)} / ${shortUnit(row.unit)}` : "Not priced"}
      </div>
      {row.packagePriceCents != null && row.packageQuantity != null && (
        <div className="text-xs text-slate">
          Bought as {formatCents(row.packagePriceCents)} / {row.packageQuantity} {row.packageUnit}
        </div>
      )}
    </div>
  );
}

/** Status badge plus a secondary source caption underneath — no dedicated source column. */
function StatusCell({ row }: { row: CatalogRow }) {
  return (
    <div>
      <StatusBadge status={row.status} />
      <SourceCaption row={row} />
    </div>
  );
}

function StatusBadge({ status }: { status: MaterialStatus }) {
  const dotColor =
    status === "Confirmed" ? "bg-success" : status === "Supplier linked" ? "bg-electric" : "bg-amber-500"; // Needs confirmation and Missing price are both amber — work to do, not an error.
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-navy">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
      {status}
    </span>
  );
}

function SourceCaption({ row }: { row: CatalogRow }) {
  if (!row.contractorMaterialId) return null;
  // A supplier link can stay attached after a manual edit — setContractorMaterialCost
  // always resolves an edit to CUSTOM (see lib/materialCost.ts), so the link's
  // presence and the cost's actual source can legitimately disagree.
  let text: string;
  if (row.activeSupplierLink) {
    const supplierName = supplierDisplayName(row.activeSupplierLink.supplier);
    const sync = row.activeSupplierLink.lastSyncedAt
      ? `synced ${formatShortDate(row.activeSupplierLink.lastSyncedAt)}`
      : "not yet synced";
    text = row.costSource === "SUPPLIER" ? `${supplierName} · ${sync}` : `${supplierName} product · cost overridden`;
  } else if (row.costSource === "SUPPLIER") {
    text = "Supplier";
  } else if (row.costSource === "BASELINE") {
    text = row.costUpdatedAt ? `Baseline · ${formatShortDate(row.costUpdatedAt)}` : "Baseline";
  } else {
    text = row.costUpdatedAt ? `Manual · ${formatShortDate(row.costUpdatedAt)}` : "Manual";
  }
  return <div className="mt-0.5 text-xs text-slate">{text}</div>;
}
