/**
 * Choosing which purchased product satisfies a canonical role.
 *
 * Nothing in the product wrote `activeSupplierLinkId` before this: links could
 * be created but never selected, so the field a takeoff reads had no supported
 * way to be set.
 *
 * TENANT SCOPING IS THE WHOLE RISK HERE. A supplier link belongs to a
 * ContractorMaterial, which belongs to a contractor. Selecting a link that
 * hangs off somebody else's material would point this contractor's takeoff at
 * another tenant's product and price. So the link is re-read and its ownership
 * checked against BOTH the caller's contractor and the target material before
 * anything is written — the guarded client alone is not relied on for this,
 * because the failure would be silent and cross-tenant.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: "select" | "clear";
    contractorMaterialId?: string;
    supplierLinkId?: string | null;
  };
  const { contractorMaterialId } = body;
  if (!contractorMaterialId) {
    return NextResponse.json({ error: "contractorMaterialId required" }, { status: 400 });
  }

  return withAdminContractor(async (db, ctx) => {
    const material = await db.contractorMaterial.findFirst({
      where: { id: contractorMaterialId, contractorId: ctx.contractorId },
      select: { id: true, canonicalMaterial: { select: { key: true } } },
    });
    if (!material) {
      return NextResponse.json(
        { error: "No such material for this contractor." }, { status: 404 },
      );
    }

    if (body.action === "clear") {
      await db.contractorMaterial.update({
        where: { id: material.id }, data: { activeSupplierLinkId: null },
      });
      return NextResponse.json({ ok: true, role: material.canonicalMaterial.key, selected: null });
    }

    const linkId = body.supplierLinkId;
    if (!linkId) return NextResponse.json({ error: "supplierLinkId required" }, { status: 400 });

    // Both checks, not either: the link must belong to this contractor AND to
    // this material. A link owned by the right tenant but a different role
    // would select a receptacle as the product for raceway channel.
    const link = await db.materialSupplierLink.findFirst({
      where: {
        id: linkId,
        contractorMaterialId: material.id,
        contractorMaterial: { contractorId: ctx.contractorId },
      },
      select: { id: true, productName: true, packageQuantity: true,
                packageUnit: true, packagePriceCents: true },
    });
    if (!link) {
      return NextResponse.json(
        { error: "That supplier link does not belong to this contractor's material." },
        { status: 403 },
      );
    }

    await db.contractorMaterial.update({
      where: { id: material.id },
      data: {
        activeSupplierLinkId: link.id,
        // Package truth follows the selected product. Leaving the old geometry
        // behind would price seven 5-ft sticks of a product sold in 8-ft ones.
        packageQuantity: link.packageQuantity,
        packageUnit: link.packageUnit,
        packagePriceCents: link.packagePriceCents,
      },
    });
    return NextResponse.json({
      ok: true, role: material.canonicalMaterial.key,
      selected: { id: link.id, productName: link.productName,
                  packageQuantity: link.packageQuantity, packageUnit: link.packageUnit,
                  packagePriceCents: link.packagePriceCents },
    });
  });
}
