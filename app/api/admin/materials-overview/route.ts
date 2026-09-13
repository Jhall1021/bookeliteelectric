/**
 * The read model behind a future "Materials & Costs" screen.
 *
 * NOT A SECOND MATERIAL DATABASE. This is a view over
 * `canonical role → contractor material selection → supplier/custom cost`.
 * `ContractorMaterial` is unique per (contractor, canonicalMaterial), so the
 * single-source property is enforced by the schema rather than by this file
 * remembering to be careful: there cannot be fifteen copies of the 12/2 price,
 * because the database permits exactly one row per role per contractor.
 *
 * Writes stay where they already are — `/api/admin/materials` remains the one
 * cost-writing route, `/api/admin/material-product` selects products, and
 * `/api/admin/material-system` carries system configuration. Nothing is
 * duplicated here.
 *
 * USED-BY is derived from three different links, because a role reaches a
 * service by three different routes: a direct ServiceMaterial, an answer
 * option's material, and a component recipe pulled in by an answer option.
 * Reporting only the first would tell a contractor that changing the channel
 * price affects nothing, which is exactly backwards.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { MATERIAL_CATEGORIES } from "@/lib/materialCategories";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter");
  const category = searchParams.get("category");
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const wantUsedBy = searchParams.get("usedBy") === "1";

  return withAdminContractor(async (db, ctx) => {
    const contractorId = ctx.contractorId;

    const rows = await db.contractorMaterial.findMany({
      where: { contractorId, active: true },
      select: {
        id: true, unitCostCents: true, costSource: true, costConfidence: true,
        costStatus: true, costUpdatedAt: true, nameOverride: true,
        packageQuantity: true, packageUnit: true, packagePriceCents: true,
        activeSupplierLinkId: true,
        canonicalMaterial: { select: { id: true, key: true, name: true, unit: true, displayCategory: true } },
        activeSupplierLink: {
          select: { id: true, supplier: true, productName: true, productUrl: true,
                    storeLabel: true, lastSyncedAt: true, lastSyncStatus: true },
        },
        supplierLinks: { select: { id: true } },
      },
    });

    // Used-by, in three queries rather than N: one per link shape, then indexed
    // by role. A per-row query would be 112 round trips to render one screen.
    const usedBy = new Map<string, Set<string>>();
    if (wantUsedBy) {
      const add = (roleId: string, label: string) => {
        const s = usedBy.get(roleId) ?? new Set<string>();
        s.add(label); usedBy.set(roleId, s);
      };
      for (const sm of await db.serviceMaterial.findMany({
        where: { service: { contractorId } },
        select: { canonicalMaterialId: true, service: { select: { name: true } } } })) {
        if (sm.canonicalMaterialId) add(sm.canonicalMaterialId, sm.service.name);
      }
      for (const aom of await db.answerOptionMaterial.findMany({
        where: { answerOption: { question: { service: { contractorId } } } },
        select: { canonicalMaterialId: true,
                  answerOption: { select: { question: { select: { service: { select: { name: true } } } } } } } })) {
        if (aom.canonicalMaterialId) add(aom.canonicalMaterialId, aom.answerOption.question.service.name);
      }
      // The recipe path: role → canonical component → answer option → service.
      //
      // ROOTED AT THE TENANT SIDE. The first version started from
      // CanonicalComponentMaterial (a shared, platform model) and traversed
      // into contractors' answer options, filtering by contractorId inside
      // the traversal. The tenant guard cannot scope a query whose root is a
      // platform model, so that filter was the only thing keeping other
      // contractors' services out — exactly the ADR-007 shape
      // audit-platform-tenant-relations refuses. Now the tenant-derived
      // AnswerOptionComponent rows are read first (guard-scoped), and the
      // platform recipe table is read on its own, joined in memory.
      const usedComponents = await db.answerOptionComponent.findMany({
        where: { canonicalComponentId: { not: null }, answerOption: { question: { service: { contractorId } } } },
        select: { canonicalComponentId: true,
                  answerOption: { select: { question: { select: { service: { select: { name: true } } } } } } },
      });
      const servicesByComponent = new Map<string, Set<string>>();
      for (const uc of usedComponents) {
        if (!uc.canonicalComponentId) continue;
        const set = servicesByComponent.get(uc.canonicalComponentId) ?? new Set<string>();
        set.add(uc.answerOption.question.service.name);
        servicesByComponent.set(uc.canonicalComponentId, set);
      }
      const recipeLines = await db.canonicalComponentMaterial.findMany({
        where: { canonicalComponentId: { in: [...servicesByComponent.keys()] } },
        select: { canonicalMaterialId: true, canonicalComponentId: true },
      });
      for (const line of recipeLines) {
        for (const name of servicesByComponent.get(line.canonicalComponentId) ?? []) add(line.canonicalMaterialId, name);
      }
    }

    /** Configuration status, reusing the existing provenance vocabulary. */
    const statusOf = (r: (typeof rows)[number]): string => {
      if (r.unitCostCents === 0 && r.packagePriceCents === null) return "MISSING_COST";
      if (r.supplierLinks.length > 0 && r.activeSupplierLinkId === null) return "MISSING_PRODUCT";
      if (r.costStatus !== "OK") return `COST_${r.costStatus}`;
      if (r.packageQuantity === null) return "MISSING_PACKAGE_BASIS";
      return "CURRENT";
    };

    let out = rows.map((r) => {
      const cm = r.canonicalMaterial;
      return {
        contractorMaterialId: r.id,
        canonicalMaterialId: cm.id,
        // The key is NOT for display. It is here so a write call can name the
        // role it means without the client guessing.
        roleKey: cm.key,
        name: r.nameOverride ?? cm.name,
        category: cm.displayCategory ?? "Other",
        unit: cm.unit,
        purchaseBasis:
          r.packageQuantity !== null
            ? `${r.packageQuantity} ${r.packageUnit ?? cm.unit}`
            : null,
        unitCostCents: r.unitCostCents,
        packagePriceCents: r.packagePriceCents,
        // Derived for display only — never a pricing input, which always uses
        // the package figures directly.
        derivedPerUnitCents:
          r.packagePriceCents !== null && r.packageQuantity
            ? r.packagePriceCents / r.packageQuantity
            : null,
        costSource: r.costSource,
        costConfidence: r.costConfidence,
        costStatus: r.costStatus,
        costUpdatedAt: r.costUpdatedAt,
        selectedProduct: r.activeSupplierLink,
        availableProductCount: r.supplierLinks.length,
        status: statusOf(r),
        usedBy: wantUsedBy ? [...(usedBy.get(cm.id) ?? [])].sort() : undefined,
      };
    });

    if (category) out = out.filter((r) => r.category === category);
    if (search) out = out.filter((r) => r.name.toLowerCase().includes(search));
    if (filter === "missing-cost") out = out.filter((r) => r.status === "MISSING_COST");
    if (filter === "missing-product") out = out.filter((r) => r.status === "MISSING_PRODUCT");
    if (filter === "supplier-linked") out = out.filter((r) => r.selectedProduct !== null);
    if (filter === "custom") out = out.filter((r) => r.costSource === "CUSTOM");
    if (filter === "used-by-active") out = out.filter((r) => (r.usedBy?.length ?? 0) > 0);

    out.sort((a, b) => (a.category === b.category
      ? a.name.localeCompare(b.name)
      : MATERIAL_CATEGORIES.indexOf(a.category as never) - MATERIAL_CATEGORIES.indexOf(b.category as never)));

    const configured = out.filter((r) => r.status === "CURRENT").length;
    return NextResponse.json({
      materials: out,
      categories: MATERIAL_CATEGORIES,
      // The onboarding denominator is COMPUTED from this contractor's own
      // catalog, never hard-coded: a contractor with four services does not
      // owe costs for a hundred roles.
      summary: { total: out.length, configured, outstanding: out.length - configured },
    });
  });
}
