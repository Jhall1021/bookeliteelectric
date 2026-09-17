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

/** How this material is bought — shared by MaterialRow's Material column and the cost drawer's header. */
export function purchasingUnit(row: { unit: string; packageQuantity: number | null; packageUnit: string | null }): string {
  if (row.packageQuantity != null && row.packageUnit) return `${row.packageQuantity} ${row.packageUnit}`;
  return shortUnit(row.unit);
}

/**
 * Money, always to the cent — "$5.00", never lib/flow-types.ts's formatCents
 * ("$5"), which drops trailing zeros. That's fine for the whole-dollar
 * figures formatCents was built for elsewhere in the app; a materials
 * surface showing $0.72/ft next to $5/ea next to $18.00/ea reads as three
 * different levels of precision for the same kind of number. Every Materials
 * component uses this one instead, consistently — not lib/flow-types.ts's
 * formatCents.
 */
export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
