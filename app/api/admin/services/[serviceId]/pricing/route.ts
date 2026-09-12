import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { publishSuggestedPrice } from "@/lib/pricePublication";
import { withAdminContractor } from "@/lib/adminContext";
import { saveServicePricingInputs } from "@/lib/servicePricingInputs";

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

  if (body.action !== "save" && body.action !== "publish") {
    return NextResponse.json({ error: "Pricing action must be save or publish." }, { status: 400 });
  }

  return withAdminContractor(async (db, ctx) => {
    const contractorId = ctx.contractorId;
    const service = await db.service.findUnique({ where: { id: params.serviceId } });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    const action = body.action;

    // Blank and null mean "not established". Anything else must be a finite
    // number in the range the contractor UI promises. Invalid text must never
    // collapse to null, because null is a real instruction to clear a value.
    const optionalNumber = (
      key: string,
      options: { min?: number; integer?: boolean } = {},
    ): { ok: true; value: number | null } | { ok: false; error: string } => {
      const raw = body[key];
      if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
      const value = Number(raw);
      if (!Number.isFinite(value)) return { ok: false, error: `${key} must be a valid number.` };
      if (options.integer && !Number.isInteger(value)) {
        return { ok: false, error: `${key} must be a whole number.` };
      }
      if (options.min !== undefined && value < options.min) {
        return { ok: false, error: `${key} must be ${options.min} or greater.` };
      }
      return { ok: true, value };
    };

    const fieldLaborHours = optionalNumber("fieldLaborHours", { min: 0 });
    const wwtLaborHours = optionalNumber("wwtLaborHours", { min: 0 });
    const materialCostCents = optionalNumber("materialCostCents", { min: 0, integer: true });
    const materialMultiplier = optionalNumber("materialMultiplier", { min: 1 });
    const permitAdminCents = optionalNumber("permitAdminCents", { min: 0, integer: true });
    const otherDirectCostCents = optionalNumber("otherDirectCostCents", { min: 0, integer: true });
    const estimatedMinutes = optionalNumber("estimatedMinutes", { min: 0, integer: true });
    const requiresTechCount = optionalNumber("requiresTechCount", { min: 1, integer: true });

    for (const parsed of [
      fieldLaborHours,
      wwtLaborHours,
      materialCostCents,
      materialMultiplier,
      permitAdminCents,
      otherDirectCostCents,
      estimatedMinutes,
      requiresTechCount,
    ]) {
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    if (typeof body.isPrimaryEligible !== "boolean") {
      return NextResponse.json({ error: "isPrimaryEligible must be true or false." }, { status: 400 });
    }
    if (typeof body.estimatedMinutesReviewed !== "boolean") {
      return NextResponse.json({ error: "estimatedMinutesReviewed must be true or false." }, { status: 400 });
    }
    if (
      typeof body.photoState !== "string" ||
      !["NONE", "PREPARATION", "REVIEW_REQUIRED"].includes(body.photoState)
    ) {
      return NextResponse.json({ error: "Choose a valid customer-photo setting." }, { status: 400 });
    }

    const overrides = {
      fieldLaborHours: fieldLaborHours.value,
      wwtLaborHours: wwtLaborHours.value,
      materialCostCents: materialCostCents.value,
      materialMultiplier: materialMultiplier.value,
      permitAdminCents: permitAdminCents.value,
      otherDirectCostCents: otherDirectCostCents.value,
      estimatedMinutes: estimatedMinutes.value,
      requiresTechCount: requiresTechCount.value ?? service.requiresTechCount,
      isPrimaryEligible: body.isPrimaryEligible,
      estimatedMinutesReviewed: body.estimatedMinutesReviewed,
      photoState: body.photoState as "NONE" | "PREPARATION" | "REVIEW_REQUIRED",
    };

    // Inputs are saved first, so the derivation publishes what the contractor
    // just entered rather than what was there before.
    if (action === "publish") {
      try {
        await saveServicePricingInputs(db, params.serviceId, overrides);
      } catch (err) {
        console.error("[pricing PATCH save-before-publish]", params.serviceId, err);
        return NextResponse.json(
          { error: "Could not save the pricing inputs. Nothing was published." },
          { status: 500 }
        );
      }

      const published = await publishSuggestedPrice(db, contractorId, params.serviceId);
      if (!published.ok) {
        return NextResponse.json(
          { error: published.refusal.message, code: published.refusal.code },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, basePrice: published.basePrice });
    }

    try {
      await saveServicePricingInputs(db, params.serviceId, overrides);
    } catch (err) {
      console.error("[pricing PATCH]", params.serviceId, err);
      return NextResponse.json(
        { error: "Could not save the pricing inputs. Nothing was changed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, action });
  });
}
