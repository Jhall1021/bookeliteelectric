import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { publishSuggestedPrice } from "@/lib/pricePublication";
import { withAdminContractor } from "@/lib/adminContext";


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
  if (!(await isAdminAuthenticated())) {
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

  return withAdminContractor(async (db, ctx) => {
  const contractorId = ctx.contractorId;
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

  // Inputs are saved first, so the derivation publishes what the contractor
  // just entered rather than what was there before.
  if (action === "publish") {
    try {
      await db.service.update({ where: { id: params.serviceId }, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown database error";
      return NextResponse.json({ error: `Could not save: ${message}` }, { status: 500 });
    }

    // The single publication authority — see lib/pricePublication.ts. This
    // route says WHICH service; it does not decide what the price is.
    const published = await publishSuggestedPrice(db, contractorId, params.serviceId);
    if (!published.ok) {
      // THE SENTENCE IN `error`, THE CODE BESIDE IT.
      //
      // These were the other way round, and the panel — which renders `error`,
      // like every other admin form — showed a contractor the literal word
      // POLICY_UNRESOLVED where a refusal had been written for them to read.
      // The authority's message names the undecided policy and says what the
      // homeowner would otherwise see; the code is for logs and tests.
      return NextResponse.json(
        { error: published.refusal.message, code: published.refusal.code },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, basePrice: published.basePrice });
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
