/**
 * Choosing which purchased product satisfies a canonical role.
 *
 * Nothing wrote `activeSupplierLinkId` before this, so the field a takeoff
 * reads had no supported way to be set. Tenant scoping is the whole risk: the
 * link's ownership is checked against both the caller's contractor and the
 * target material in lib/admin/onboardingActions, which is where the
 * behaviour and its proof both live.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { selectMaterialProduct } from "@/lib/admin/onboardingActions";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  return withAdminContractor(async (db, ctx) => {
    const r = await selectMaterialProduct(db, ctx, body);
    return r.ok
      ? NextResponse.json({ ok: true, ...r.data })
      : NextResponse.json({ error: r.error }, { status: r.status });
  });
}
