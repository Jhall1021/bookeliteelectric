import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import {
  acceptMaterialBaselineVersion, overrideUnresolvedMaterialCost, MaterialCostError,
} from "@/lib/materialCost";

/**
 * Resolving a role this contractor has never costed — batch-accept a
 * platform Material Baseline, or override it with the contractor's own
 * figure. Both land as a brand-new ContractorMaterial row; see
 * lib/materialCost.ts's "MATERIAL BASELINE PRICING" section for the shared
 * write path both actions go through.
 *
 * TWO ACTIONS, never conflated with `/api/portal/estimates`'s save/approve
 * split — there is nothing to approve here. A resolved material cost is a
 * pricing INPUT the moment it lands, same as any other cost edit; nothing
 * customer-facing moves until a person separately approves a PRICE.
 *
 * accept   batch: every baselineVersionId the contractor selected in the
 *          review screen, resolved server-side from that exact version.
 * override one role, one figure the contractor typed themselves.
 *
 * A role simply left off the batch (skipped) reaches neither action and
 * therefore stays unresolved — there is no third "skip" case to handle here.
 */
export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const { action } = (body ?? {}) as { action?: string };

    if (action === "accept") {
      const { baselineVersionIds } = body as { baselineVersionIds?: unknown };
      if (!Array.isArray(baselineVersionIds) || baselineVersionIds.length === 0 ||
          !baselineVersionIds.every((id) => typeof id === "string")) {
        return NextResponse.json({ error: "baselineVersionIds must be a non-empty array of strings." }, { status: 400 });
      }

      let accepted = 0;
      const problems: { baselineVersionId: string; code: string }[] = [];
      for (const baselineVersionId of baselineVersionIds as string[]) {
        const result = await acceptMaterialBaselineVersion(
          db,
          { contractorId: ctx.contractorId, baselineVersionId },
          { reason: "accepted Material Baseline", actor: "admin" }
        );
        if (result.ok) accepted++;
        else problems.push({ baselineVersionId, code: result.code });
      }
      return NextResponse.json({ ok: true, accepted, problems });
    }

    if (action === "override") {
      const { canonicalMaterialId, unitCostCents } = body as { canonicalMaterialId?: unknown; unitCostCents?: unknown };
      if (typeof canonicalMaterialId !== "string" || !canonicalMaterialId) {
        return NextResponse.json({ error: "canonicalMaterialId is required." }, { status: 400 });
      }
      if (typeof unitCostCents !== "number" || !Number.isFinite(unitCostCents) || unitCostCents < 0) {
        return NextResponse.json({ error: "unitCostCents must be zero or more." }, { status: 400 });
      }

      try {
        const result = await overrideUnresolvedMaterialCost(
          db,
          { contractorId: ctx.contractorId, canonicalMaterialId, unitCostCents },
          { reason: "entered instead of the offered baseline", actor: "admin" }
        );
        if (!result.ok) {
          return NextResponse.json({ error: "That role already has a cost — refresh and try again." }, { status: 409 });
        }
        return NextResponse.json({ ok: true, contractorMaterialId: result.contractorMaterialId, unitCostCents: result.unitCostCents });
      } catch (e) {
        if (e instanceof MaterialCostError) return NextResponse.json({ error: e.message }, { status: 400 });
        throw e;
      }
    }

    return NextResponse.json({ error: `Unknown action: ${String(action)}` }, { status: 400 });
  });
}
