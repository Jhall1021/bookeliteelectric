/**
 * Pure display-only formatting for the Materials Catalog. Nothing here
 * computes a cost, a status, or any other domain fact — it only reshapes
 * real fields already on `CatalogRow` for reading, the same way `formatCents`
 * already does for money. See lib/materialCatalog.ts for where those fields
 * actually come from.
 */

/** "each" reads as a unit price suffix better abbreviated — "$18.50 / ea", not "$18.50 / each". */
export function shortUnit(unit: string): string {
  return unit === "each" ? "ea" : unit;
}

const SUPPLIER_NAMES: Record<string, string> = { LOWES: "Lowe's" };

/** A supplier enum value ("LOWES") shown the way a contractor actually refers to the store ("Lowe's"). */
export function supplierDisplayName(supplier: string): string {
  return SUPPLIER_NAMES[supplier] ?? supplier.charAt(0) + supplier.slice(1).toLowerCase();
}

/** Short "Sep 15" form — enough to say "recently" without the row competing for attention with a full date. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
