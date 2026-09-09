import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { ELECTRICAL_LABOR_TASKS } from "@/lib/laborWizard";
import { saveServicePricingInputs } from "@/lib/servicePricingInputs";

/**
 * Accept reviewed elapsed-task-time proposals from the labor wizard.
 *
 * WHICH SERVICES CHANGE IS TRUSTED FROM THE CLIENT, DELIBERATELY, unlike
 * the material baseline batch route. There is no server-side rule left that
 * could re-derive it: lib/laborWizard.ts stopped inferring eligibility from
 * a recipe on purpose (see its header) — the contractor's own confirmation
 * in the review screen, over their own unfiltered candidate list, IS the
 * only "which services" a task has. What's still verified here, and never
 * trusted, is that every service id named actually belongs to THIS
 * contractor — a cross-tenant id is refused outright, the same guarantee
 * every other guarded write in this codebase gives.
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

    const allIds = [...new Set(rows.flatMap((r) => r.serviceIds))];
    if (allIds.length === 0) {
      return NextResponse.json({ error: "No services selected." }, { status: 400 });
    }
    const owned = await db.service.findMany({
      where: { id: { in: allIds }, contractorId: ctx.contractorId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));
    const foreign = allIds.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) {
      return NextResponse.json(
        { error: `Service id(s) not found on this contractor: ${foreign.join(", ")}` },
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
