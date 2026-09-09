import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { ELECTRICAL_LABOR_TASKS, matchLaborTasks } from "@/lib/laborWizard";

/**
 * Accept reviewed elapsed-task-time proposals from the labor wizard.
 *
 * SERVER-SIDE RESOLUTION, same discipline as the material baseline batch
 * route: the client sends a taskKey and a minutes figure it already showed
 * the contractor on the review screen, never a service id or a canonical
 * material id. Which services are affected is re-derived here from this
 * contractor's OWN current recipes — never trusted from the request body —
 * so a stale page (a recipe edited between page load and this click) can
 * never write a proposal against a service it no longer describes.
 *
 * WRITES fieldLaborHours ONLY. Never requiresTechCount, never
 * wwtLaborHours, never any PricingSettings field — see lib/laborWizard.ts's
 * header for why each of those is out of scope for this slice.
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
    if (
      !Array.isArray(acceptances) ||
      acceptances.length === 0 ||
      !acceptances.every(
        (a) =>
          a && typeof a === "object" &&
          typeof (a as { taskKey?: unknown }).taskKey === "string" &&
          typeof (a as { minutes?: unknown }).minutes === "number" &&
          Number.isFinite((a as { minutes: number }).minutes) &&
          (a as { minutes: number }).minutes > 0
      )
    ) {
      return NextResponse.json(
        { error: "acceptances must be a non-empty array of { taskKey: string, minutes: number > 0 }." },
        { status: 400 }
      );
    }
    const byKey = new Map((acceptances as { taskKey: string; minutes: number }[]).map((a) => [a.taskKey, a.minutes]));

    const matched = await matchLaborTasks(db, ctx.contractorId, ELECTRICAL_LABOR_TASKS);
    const unknown = [...byKey.keys()].filter((k) => !matched.some((m) => m.task.key === k));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Unknown task key(s): ${unknown.join(", ")}` }, { status: 400 });
    }

    const results: { taskKey: string; servicesUpdated: number }[] = [];
    await db.$transaction(async (tx) => {
      for (const m of matched) {
        const minutes = byKey.get(m.task.key);
        if (minutes === undefined) continue;
        const hours = minutes / 60;
        for (const svc of m.services) {
          await tx.service.update({ where: { id: svc.id }, data: { fieldLaborHours: hours } });
        }
        results.push({ taskKey: m.task.key, servicesUpdated: m.services.length });
      }
    });

    return NextResponse.json({ ok: true, results });
  });
}
