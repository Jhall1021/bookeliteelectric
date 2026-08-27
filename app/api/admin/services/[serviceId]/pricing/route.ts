import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { suggestPrimaryPrice, suggestWwtPrice } from "@/lib/pricing";
import { withContractor } from "@/lib/tenantRoute";
import { soleContractorId } from "@/lib/categories";

/**
 * Pricing composition for one service.
 *
 * Separate from the general service PATCH on purpose. Handoff §5 and §31 both
 * insist that a calculated price is a recommendation and must never silently
 * overwrite a published one, so the two live behind different actions:
 *
 *   action "save"    — store the inputs. Published price untouched.
 *   action "publish" — copy the suggested price onto the published price.
 *                      Only ever reached by an explicit click.
 *
 * Nothing here recalculates anything on a schedule or in the background.
 */
export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  // GUARD-ADOPTED (ADR-007a). This route PUBLISHES a customer-facing price,
  // and until now took a service id straight from the URL with no contractor
  // condition at all — so it would have published a price onto another
  // contractor's service on request. Moot at one contractor; a cross-tenant
  // price write at two.
  //
  // No hand-written ownership check: the guard enforces the same invariant
  // centrally, and the 404 below now covers "not yours" as well as "not
  // there". A cross-tenant probe should not be able to tell the difference.
  const contractorId = await soleContractorId(prisma, "the pricing admin");

  return withContractor(contractorId, "admin-session", async (db) => {
  const service = await db.service.findUnique({ where: { id: params.serviceId } });
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  const action = body.action === "publish" ? "publish" : "save";

  // Empty string and null both mean "not established" — which is a real,
  // meaningful state here, distinct from zero. A service with no field labor
  // hours must produce NO suggested price rather than a $0 one.
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const data: Record<string, unknown> = {
    fieldLaborHours: num(body.fieldLaborHours),
    wwtLaborHours: num(body.wwtLaborHours),
    materialCostCents: num(body.materialCostCents),
    // Null here means "use the tier derived from material cost" (handoff §4).
    // Only a deliberate departure stores a number.
    materialMultiplier: num(body.materialMultiplier),
    permitAdminCents: num(body.permitAdminCents),
    otherDirectCostCents: num(body.otherDirectCostCents),
    estimatedMinutes: num(body.estimatedMinutes),
    requiresTechCount: num(body.requiresTechCount) ?? service.requiresTechCount,
    isPrimaryEligible: body.isPrimaryEligible !== false,
    estimatedMinutesReviewed: body.estimatedMinutesReviewed === true,
  };

  if (typeof body.photoState === "string" &&
      ["NONE", "PREPARATION", "REVIEW_REQUIRED"].includes(body.photoState)) {
    data.photoState = body.photoState;
  }

  if (action === "publish") {
    const settings = await prisma.pricingSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      return NextResponse.json(
        { error: "Pricing settings not configured — cannot compute a price to publish." },
        { status: 400 }
      );
    }

    const inputs = {
      fieldLaborHours: data.fieldLaborHours as number | null,
      wwtLaborHours: data.wwtLaborHours as number | null,
      requiresTechCount: data.requiresTechCount as number,
      materialCostCents: data.materialCostCents as number | null,
      materialMultiplier: data.materialMultiplier as number | null,
      permitAdminCents: data.permitAdminCents as number | null,
      otherDirectCostCents: data.otherDirectCostCents as number | null,
      isPrimaryEligible: data.isPrimaryEligible as boolean,
    };

    const primary = suggestPrimaryPrice(inputs, settings);
    if (primary.totalCents === null) {
      return NextResponse.json(
        { error: primary.unavailableReason ?? "No suggested price to publish" },
        { status: 400 }
      );
    }

    data.basePrice = primary.totalCents;
    data.publishedPriceApprovedAt = new Date();

    // The While We're There price only moves when its own hours exist. A
    // service can legitimately have a published primary price and no add-on
    // price at all, so a null here must leave the existing value alone rather
    // than wiping it.
    const wwt = suggestWwtPrice(inputs, settings);
    if (wwt.totalCents !== null) data.whileWeThereBasePrice = wwt.totalCents;
  }

  try {
    await db.service.update({ where: { id: params.serviceId }, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    console.error("[pricing PATCH]", params.serviceId, err);
    return NextResponse.json({ error: `Could not save: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action });
  });
}
