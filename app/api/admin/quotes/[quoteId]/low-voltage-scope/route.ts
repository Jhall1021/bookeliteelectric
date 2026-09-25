import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { calculateCircuitPackage } from "@/lib/electrical/circuitPackagePricing";

const SUPPORTED = new Set(["new-ethernet-line", "new-coax-line"]);

export async function POST(_req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (quote.status !== "SUBMITTED" && quote.status !== "IN_REVIEW") {
      return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    }
    const slug = quote.service.slug;
    if (!SUPPORTED.has(slug)) return NextResponse.json({ error: "This is not a supported low-voltage package." }, { status: 409 });

    const answers = quote.answersSnapshot as Record<string, string>;
    const calculated = await calculateCircuitPackage(
      db,
      { ...quote.service, contractorId: ctx.contractorId },
      answers,
      true,
      false,
    );
    if (calculated.kind !== "PRICED") {
      return NextResponse.json({
        error: calculated.kind === "REVIEW" ? calculated.reason : "This low-voltage route is not a bounded accessible package.",
        code: calculated.kind === "REVIEW" ? calculated.code : "NOT_APPLICABLE",
      }, { status: 409 });
    }

    const touched = await db.quote.updateMany({
      where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } },
      data: {
        reviewFactsSnapshot: {
          routeAccess: { value: "ACCESSIBLE", source: "HOMEOWNER_CONTEXT" },
          standardPackageFeet: { value: calculated.description, source: "HOMEOWNER_CONTEXT" },
        },
        reviewSuggestedPriceCents: calculated.totalCents,
        reviewBasisFingerprint: calculated.basisFingerprint,
        reviewedAt: new Date(),
        status: "IN_REVIEW",
      },
    });
    if (touched.count !== 1) return NextResponse.json({ error: "Quote changed while it was being reviewed. Reload and try again." }, { status: 409 });

    return NextResponse.json({
      ok: true,
      suggestedPriceCents: calculated.totalCents,
      laborHours: calculated.laborHours,
      materialCostCents: calculated.materialCostCents,
      packageFeet: calculated.description,
      basisFingerprint: calculated.basisFingerprint,
      sent: false,
    });
  });
}
