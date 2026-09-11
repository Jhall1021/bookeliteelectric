/**
 * Approving the economics a derived service prices from.
 *
 * A contractor cannot approve "derived pricing" in the abstract, because a
 * derived price is not a thing that sits still. What they approve is a
 * FINGERPRINT of the inputs, and the approval stops matching the moment one of
 * those inputs moves — see lib/electrical/derivedPricingBasis.ts for exactly
 * what participates.
 *
 * The client does not compute or choose the fingerprint. It sends the one it
 * was shown; the server recomputes and refuses if they differ, so a stale
 * screen cannot approve numbers that changed while somebody was reading them.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { fingerprintBasis } from "@/lib/electrical/derivedPricingBasis";
import { loadDerivedPricingBasis } from "@/lib/electrical/loadDerivedScope";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: "approve" | "withdraw";
    serviceId?: string;
    componentKeys?: string[];
    expectedFingerprint?: string;
    totalCents?: number;
    laborCents?: number;
    materialCents?: number;
  };
  if (!body.serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 });

  return withAdminContractor(async (db, ctx) => {
    const service = await db.service.findFirst({
      where: { id: body.serviceId, contractorId: ctx.contractorId },
      select: { id: true, pricingMethod: true, name: true },
    });
    if (!service) return NextResponse.json({ error: "No such service for this contractor." }, { status: 404 });

    if (body.action === "withdraw") {
      await db.contractorDerivedPricingApproval.deleteMany({
        where: { contractorId: ctx.contractorId, serviceId: service.id } });
      return NextResponse.json({ ok: true, approved: false });
    }

    if (service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") {
      return NextResponse.json(
        { error: `${service.name} is priced by ${service.pricingMethod}; there is nothing derived to approve.` },
        { status: 400 },
      );
    }
    if (!body.componentKeys?.length) {
      return NextResponse.json({ error: "componentKeys required" }, { status: 400 });
    }

    const basis = await loadDerivedPricingBasis(db, ctx.contractorId, body.componentKeys);
    const current = fingerprintBasis(basis);

    // A stale screen must not approve. The client's figure is checked, never
    // trusted — the one on the server is what gets stored either way.
    if (body.expectedFingerprint && body.expectedFingerprint !== current) {
      return NextResponse.json(
        {
          error: "The economics changed while this was on screen. Review the current figures and approve again.",
          expected: body.expectedFingerprint, current,
        },
        { status: 409 },
      );
    }

    const row = await db.contractorDerivedPricingApproval.upsert({
      where: { contractorId_serviceId: { contractorId: ctx.contractorId, serviceId: service.id } },
      update: {
        approvedBasisFingerprint: current,
        approvedTotalCents: body.totalCents ?? 0,
        approvedLaborCents: body.laborCents ?? 0,
        approvedMaterialCents: body.materialCents ?? 0,
        approvedAt: new Date(),
        approvedByUserId: ctx.userId ?? null,
      },
      create: {
        contractorId: ctx.contractorId, serviceId: service.id,
        approvedBasisFingerprint: current,
        approvedTotalCents: body.totalCents ?? 0,
        approvedLaborCents: body.laborCents ?? 0,
        approvedMaterialCents: body.materialCents ?? 0,
        approvedAt: new Date(),
        approvedByUserId: ctx.userId ?? null,
      },
      select: { approvedBasisFingerprint: true, approvedAt: true, approvedTotalCents: true },
    });
    return NextResponse.json({ ok: true, approved: true, ...row });
  });
}
