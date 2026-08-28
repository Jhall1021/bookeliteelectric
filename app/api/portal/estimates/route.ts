import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { validateEstimateBounds } from "@/lib/pricingReadiness";

/**
 * Set and approve TIME_AND_MATERIALS estimate bounds — ADR-018.
 *
 * TWO SEPARATE ACTIONS, on purpose.
 *
 *   save     record the numbers. Entered, not published.
 *   approve  release them for customer estimates.
 *
 * Saving two numbers must not quietly mean "publish this to homeowners".
 * That is the same distinction `publishedPriceApprovedAt` draws for a fixed
 * price, and it exists because a contractor typing into a form is thinking
 * about their business, not about what a stranger will be shown tonight.
 *
 * Bulk is supported because setting 56 services one at a time is how
 * onboarding dies — but bulk APPROVAL is still an explicit action the
 * contractor takes, never a side effect of saving or of switching strategy.
 */
type Item = { serviceId: string; low: number | null; high: number | null };

export async function PUT(req: Request) {
  return withAdminRoute(async (db) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const { items, action } = (body ?? {}) as { items?: Item[]; action?: string };

    if (action !== "save" && action !== "approve") {
      return NextResponse.json({ error: 'action must be "save" or "approve".' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items is required." }, { status: 400 });
    }

    // Validated BEFORE anything is written, and the whole request is refused
    // on any bad row. A partial bulk save would leave the contractor unable to
    // tell which of fifty services took.
    const problems: { serviceId: string; message: string }[] = [];
    for (const it of items) {
      if (!it || typeof it.serviceId !== "string") {
        problems.push({ serviceId: String(it?.serviceId), message: "Missing service." });
        continue;
      }
      for (const b of validateEstimateBounds(it.low, it.high)) {
        // Unset is allowed on save — a contractor may clear a row they are not
        // ready to answer. It is never allowed on approve.
        if (b.code === "unset" && action === "save") continue;
        problems.push({ serviceId: it.serviceId, message: b.message });
      }
    }
    if (problems.length) return NextResponse.json({ error: "Some rows are not valid.", problems }, { status: 400 });

    // The guarded client scopes every write to this contractor, so a service
    // id from another tenant updates nothing rather than someone else's row.
    let written = 0;
    for (const it of items) {
      const res = await db.service.updateMany({
        where: { id: it.serviceId },
        data: {
          estimateLowCrewHours: it.low,
          estimateHighCrewHours: it.high,
          // Saving CLEARS any previous approval: numbers a human has not seen
          // since they changed are not numbers a human has approved.
          estimateApprovedAt: action === "approve" ? new Date() : null,
        },
      });
      written += res.count;
    }

    return NextResponse.json({ ok: true, action, written });
  });
}
