import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { ELECTRICAL_LABOR_TASKS, resolveTaskEligibility } from "@/lib/laborWizard";
import { saveServicePricingInputs } from "@/lib/servicePricingInputs";

/**
 * Accept reviewed elapsed-task-time proposals from the labor wizard.
 *
 * ELIGIBILITY IS RE-RESOLVED HERE, NOT TRUSTED FROM THE CLIENT. A checkbox
 * existing only for an eligible service in the review screen is a UI
 * convenience; the actual guarantee is this route independently rebuilding
 * each task's eligible set (lib/laborWizard.ts's resolveTaskEligibility —
 * the canonical mapping, recipe unchanged since provisioning) and refusing
 * outright if a submitted service id for that task is not in it. A
 * cross-tenant id, an unrelated service, or a service whose recipe has
 * since diverged from its template are all refused the same way: nothing
 * is written, and the response says exactly which ids were rejected.
 *
 * WRITES THROUGH THE SHARED PRICING-INPUT AUTHORITY
 * (lib/servicePricingInputs.ts), not a bespoke update — the same function
 * app/api/admin/services/[serviceId]/pricing/route.ts's "save" action uses.
 * Passing only `{ fieldLaborHours }` as the override means every OTHER
 * pricing input on that service (wwtLaborHours, requiresTechCount,
 * materialCostCents, ...) keeps its current value untouched — never
 * requiresTechCount, never wwtLaborHours, never any PricingSettings field.
 * Never publishes: this only ever reaches the "save" behavior, exactly like
 * a contractor typing a number into the Pricing Composition panel and NOT
 * clicking Publish.
 */
export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    // fieldLaborHours governs FLAT_RATE pricing only — a T&M contractor's
    // price comes entirely from estimateLowCrewHours/estimateHighCrewHours,
    // resolved through its own review-and-approve path. Refusing here too,
    // not just omitting the panel, means that path can never be reached by
    // a stale page or a direct call — the guarantee holds at the write
    // boundary, not just in the UI.
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: { pricingStrategy: true },
    });
    if (contractor.pricingStrategy !== "FLAT_RATE") {
      return NextResponse.json(
        { error: "Labor time calibration is not used by time-and-materials estimating." },
        { status: 409 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
    }
    const { acceptances } = (body ?? {}) as { acceptances?: unknown };
    const valid =
      Array.isArray(acceptances) &&
      acceptances.length > 0 &&
      acceptances.every(
        (a) =>
          a && typeof a === "object" &&
          typeof (a as { taskKey?: unknown }).taskKey === "string" &&
          typeof (a as { minutes?: unknown }).minutes === "number" &&
          Number.isFinite((a as { minutes: number }).minutes) &&
          (a as { minutes: number }).minutes > 0 &&
          Array.isArray((a as { serviceIds?: unknown }).serviceIds) &&
          (a as { serviceIds: unknown[] }).serviceIds.every((id) => typeof id === "string")
      );
    if (!valid) {
      return NextResponse.json(
        { error: "acceptances must be a non-empty array of { taskKey: string, minutes: number > 0, serviceIds: string[] }." },
        { status: 400 }
      );
    }
    const rows = acceptances as { taskKey: string; minutes: number; serviceIds: string[] }[];

    const knownKeys = new Set(ELECTRICAL_LABOR_TASKS.map((t) => t.key));
    const unknownKeys = rows.map((r) => r.taskKey).filter((k) => !knownKeys.has(k));
    if (unknownKeys.length > 0) {
      return NextResponse.json({ error: `Unknown task key(s): ${unknownKeys.join(", ")}` }, { status: 400 });
    }

    const eligibility = await resolveTaskEligibility(db, ctx.contractorId, ELECTRICAL_LABOR_TASKS);
    const eligibleIdsByTask = new Map(
      eligibility.map((e) => [e.task.key, new Set(e.eligible.map((s) => s.id))])
    );

    const rejected: string[] = [];
    for (const row of rows) {
      const eligibleIds = eligibleIdsByTask.get(row.taskKey) ?? new Set<string>();
      for (const id of row.serviceIds) {
        if (!eligibleIds.has(id)) rejected.push(`${id} (not eligible for ${row.taskKey})`);
      }
    }
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: `Refused — not eligible: ${rejected.join(", ")}` },
        { status: 400 }
      );
    }

    const results: { taskKey: string; servicesUpdated: number }[] = [];
    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const hours = row.minutes / 60;
        for (const id of row.serviceIds) {
          await saveServicePricingInputs(tx, id, { fieldLaborHours: hours });
        }
        results.push({ taskKey: row.taskKey, servicesUpdated: row.serviceIds.length });
      }
    });

    return NextResponse.json({ ok: true, results });
  });
}
