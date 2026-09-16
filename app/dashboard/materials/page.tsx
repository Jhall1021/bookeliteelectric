import { withAdminContractor } from "@/lib/adminContext";
import { loadMaterialCatalog } from "@/lib/materialCatalog";
import MaterialsCatalogClient from "@/components/admin/MaterialsCatalogClient";

export const dynamic = "force-dynamic";

/**
 * The contractor's central place for material costs.
 *
 * Deliberately a catalog-LEVEL view, not a replacement for the per-service
 * Materials panel (components/admin/MaterialsPanel.tsx) — that panel still
 * owns adding/removing a part from one service's recipe. This page reuses the
 * same cost-editing domain path (lib/materialCost.ts via
 * /api/admin/materials) so a cost changed here behaves identically to one
 * changed from a service.
 */
export default async function MaterialsCatalogPage() {
  const catalog = await withAdminContractor((db, ctx) => loadMaterialCatalog(db, ctx.contractorId));

  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-bold text-navy">Materials</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          Keep your material costs in one place. Update an item here and Price2Book uses that
          cost anywhere the material appears.
        </p>
      </header>

      <MaterialsCatalogClient initialCatalog={catalog} />
    </div>
  );
}
