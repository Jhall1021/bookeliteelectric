/**
 * The contractor-facing Materials Catalog read model.
 *
 * ONE function, TWO callers: `/api/admin/materials` (the catalog-page branch
 * of GET, when no `serviceId` is given) and the `/dashboard/materials` server
 * component's initial render. Same pattern as `lib/materialCost.ts` — one
 * implementation shared rather than two call sites drifting apart.
 *
 * This is a READ model only. It derives a contractor-facing category and
 * status from existing fields (see lib/materialCategory.ts for why category
 * is computed rather than stored) and reshapes existing rows; it writes
 * nothing and does not call any cost-changing function.
 *
 * N+1 AVOIDANCE: three queries total, regardless of catalog size — the active
 * ContractorMaterial rows, the inactive ones, and ONE `serviceMaterial`
 * findMany covering every role any of this contractor's services reference.
 * That third query is also what makes a "missing price" row possible: a role
 * a recipe reaches but this contractor has never costed has a usage entry and
 * no catalog entry, which is exactly the gap `assessMaterialReadiness` already
 * tracks per-service (see lib/materialResolution.ts) — this just surfaces the
 * same gap catalog-wide instead of one service at a time.
 */

import type { PrismaClient, MaterialCostSource, MaterialCostConfidence, MaterialCostStatus } from "@prisma/client";
import { categorizeMaterial, type MaterialCategory } from "./materialCategory";

export type MaterialStatus = "Confirmed" | "Needs confirmation" | "Missing price" | "Supplier linked";
export type StatusFilterBucket = "confirmed" | "needs_attention" | "supplier_linked";

export type UsingService = { id: string; name: string; slug: string };

export type SupplierLinkSummary = {
  id: string;
  supplier: string;
  productName: string;
  productUrl: string | null;
  storeLabel: string | null;
  packagePriceCents: number;
  packageQuantity: number;
  packageUnit: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string;
};

export type CatalogRow = {
  /** Null only for a synthetic "missing price" row — there is no cost row yet. */
  contractorMaterialId: string | null;
  canonicalMaterialId: string;
  key: string;
  name: string;
  unit: string;
  category: MaterialCategory;
  unitCostCents: number | null;
  costSource: MaterialCostSource | null;
  costConfidence: MaterialCostConfidence | null;
  costStatus: MaterialCostStatus | null;
  costUpdatedAt: string | null;
  packagePriceCents: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  activeSupplierLink: SupplierLinkSummary | null;
  status: MaterialStatus;
  statusBucket: StatusFilterBucket;
  usageCount: number;
  usingServices: UsingService[];
};

export type MaterialCatalog = {
  active: CatalogRow[];
  /** Retired — ContractorMaterial.active === false. Hidden by default in the UI. */
  inactive: CatalogRow[];
  /** A canonical role a recipe reaches with no ContractorMaterial for this contractor. */
  missing: CatalogRow[];
};

type UsageEntry = { services: UsingService[] };

/**
 * Exported so the per-service read shape (app/api/admin/materials/route.ts's
 * GET ?serviceId= branch, for the service-level recipe panel) can derive the
 * exact same status a catalog row would show for the same material — one
 * definition of "Confirmed" / "Needs confirmation" / "Missing price" /
 * "Supplier linked", not two that could quietly drift apart.
 */
export function deriveStatus(args: {
  hasCost: boolean;
  costStatus: MaterialCostStatus | null;
  costConfidence: MaterialCostConfidence | null;
  hasSupplierLink: boolean;
}): { status: MaterialStatus; statusBucket: StatusFilterBucket } {
  if (!args.hasCost) return { status: "Missing price", statusBucket: "needs_attention" };
  if (args.hasSupplierLink) return { status: "Supplier linked", statusBucket: "supplier_linked" };
  if (args.costStatus === "STALE" || args.costStatus === "ERROR" || args.costConfidence === "ASSUMED") {
    return { status: "Needs confirmation", statusBucket: "needs_attention" };
  }
  return { status: "Confirmed", statusBucket: "confirmed" };
}

const CONTRACTOR_MATERIAL_INCLUDE = {
  canonicalMaterial: { select: { id: true, key: true, name: true, unit: true } },
  activeSupplierLink: {
    select: {
      id: true,
      supplier: true,
      productName: true,
      productUrl: true,
      storeLabel: true,
      packagePriceCents: true,
      packageQuantity: true,
      packageUnit: true,
      lastSyncedAt: true,
      lastSyncStatus: true,
    },
  },
} as const;

type ContractorMaterialWithIncludes = {
  id: string;
  canonicalMaterialId: string;
  canonicalMaterial: { id: string; key: string; name: string; unit: string };
  nameOverride: string | null;
  unitCostCents: number;
  costSource: MaterialCostSource;
  costConfidence: MaterialCostConfidence;
  costStatus: MaterialCostStatus;
  costUpdatedAt: Date | null;
  packagePriceCents: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  activeSupplierLink: {
    id: string;
    supplier: string;
    productName: string;
    productUrl: string | null;
    storeLabel: string | null;
    packagePriceCents: number;
    packageQuantity: number;
    packageUnit: string;
    lastSyncedAt: Date | null;
    lastSyncStatus: string;
  } | null;
};

function toRow(cm: ContractorMaterialWithIncludes, usage: UsageEntry | undefined): CatalogRow {
  const { status, statusBucket } = deriveStatus({
    hasCost: true,
    costStatus: cm.costStatus,
    costConfidence: cm.costConfidence,
    hasSupplierLink: !!cm.activeSupplierLink,
  });
  return {
    contractorMaterialId: cm.id,
    canonicalMaterialId: cm.canonicalMaterialId,
    key: cm.canonicalMaterial.key,
    name: cm.nameOverride ?? cm.canonicalMaterial.name,
    unit: cm.canonicalMaterial.unit,
    category: categorizeMaterial(cm.canonicalMaterial.key),
    unitCostCents: cm.unitCostCents,
    costSource: cm.costSource,
    costConfidence: cm.costConfidence,
    costStatus: cm.costStatus,
    costUpdatedAt: cm.costUpdatedAt ? cm.costUpdatedAt.toISOString() : null,
    packagePriceCents: cm.packagePriceCents,
    packageQuantity: cm.packageQuantity,
    packageUnit: cm.packageUnit,
    activeSupplierLink: cm.activeSupplierLink
      ? {
          id: cm.activeSupplierLink.id,
          supplier: cm.activeSupplierLink.supplier,
          productName: cm.activeSupplierLink.productName,
          productUrl: cm.activeSupplierLink.productUrl,
          storeLabel: cm.activeSupplierLink.storeLabel,
          packagePriceCents: cm.activeSupplierLink.packagePriceCents,
          packageQuantity: cm.activeSupplierLink.packageQuantity,
          packageUnit: cm.activeSupplierLink.packageUnit,
          lastSyncedAt: cm.activeSupplierLink.lastSyncedAt
            ? cm.activeSupplierLink.lastSyncedAt.toISOString()
            : null,
          lastSyncStatus: cm.activeSupplierLink.lastSyncStatus,
        }
      : null,
    status,
    statusBucket,
    usageCount: usage?.services.length ?? 0,
    usingServices: usage?.services ?? [],
  };
}

export async function loadMaterialCatalog(db: PrismaClient, contractorId: string): Promise<MaterialCatalog> {
  const [activeRows, inactiveRows, usageRows] = await Promise.all([
    db.contractorMaterial.findMany({
      where: { contractorId, active: true },
      orderBy: { canonicalMaterial: { name: "asc" } },
      include: CONTRACTOR_MATERIAL_INCLUDE,
    }),
    db.contractorMaterial.findMany({
      where: { contractorId, active: false },
      orderBy: { canonicalMaterial: { name: "asc" } },
      include: CONTRACTOR_MATERIAL_INCLUDE,
    }),
    // One query for every role any of this contractor's services reference —
    // itemized or not, bookable or hidden. `@@unique([serviceId,
    // canonicalMaterialId])` on ServiceMaterial means each service contributes
    // at most one row per role, so a plain count of rows per group is already
    // a distinct-service count; no `distinct` needed.
    db.serviceMaterial.findMany({
      where: { service: { contractorId }, canonicalMaterialId: { not: null } },
      select: {
        canonicalMaterialId: true,
        canonicalMaterial: { select: { key: true, name: true, unit: true } },
        service: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  const usageByRole = new Map<string, UsageEntry & { key: string; name: string; unit: string }>();
  for (const row of usageRows) {
    if (!row.canonicalMaterialId || !row.canonicalMaterial) continue;
    const entry = usageByRole.get(row.canonicalMaterialId);
    const svc = { id: row.service.id, name: row.service.name, slug: row.service.slug };
    if (entry) {
      entry.services.push(svc);
    } else {
      usageByRole.set(row.canonicalMaterialId, {
        services: [svc],
        key: row.canonicalMaterial.key,
        name: row.canonicalMaterial.name,
        unit: row.canonicalMaterial.unit,
      });
    }
  }

  const active = activeRows.map((cm) => toRow(cm, usageByRole.get(cm.canonicalMaterialId)));
  const inactive = inactiveRows.map((cm) => toRow(cm, usageByRole.get(cm.canonicalMaterialId)));

  const costed = new Set([...activeRows, ...inactiveRows].map((cm) => cm.canonicalMaterialId));
  const missing: CatalogRow[] = [];
  for (const [canonicalMaterialId, entry] of usageByRole) {
    if (costed.has(canonicalMaterialId)) continue;
    const { status, statusBucket } = deriveStatus({
      hasCost: false,
      costStatus: null,
      costConfidence: null,
      hasSupplierLink: false,
    });
    missing.push({
      contractorMaterialId: null,
      canonicalMaterialId,
      key: entry.key,
      name: entry.name,
      unit: entry.unit,
      category: categorizeMaterial(entry.key),
      unitCostCents: null,
      costSource: null,
      costConfidence: null,
      costStatus: null,
      costUpdatedAt: null,
      packagePriceCents: null,
      packageQuantity: null,
      packageUnit: null,
      activeSupplierLink: null,
      status,
      statusBucket,
      usageCount: entry.services.length,
      usingServices: entry.services,
    });
  }
  missing.sort((a, b) => a.name.localeCompare(b.name));

  return { active, inactive, missing };
}
