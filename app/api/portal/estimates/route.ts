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

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export async function PUT(req: Request) {
  return withAdminRoute(async (db) => {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }

    const { items, action } = parsed as { items?: unknown; action?: unknown };
    if (action !== "save" && action !== "approve") {
      return NextResponse.json({ error: 'action must be "save" or "approve".' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items is required." }, { status: 400 });
    }

    // Validate the payload shape before pricing-readiness validation. A cast is
    // not a runtime boundary: malformed objects, arrays, booleans or numeric
    // strings must never be allowed to become pricing configuration by
    // JavaScript coercion or a helper receiving a type it did not promise.
    const rows: Item[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ error: "Each item must be an object." }, { status: 400 });
      }
      const row = raw as { serviceId?: unknown; low?: unknown; high?: unknown };
      if (typeof row.serviceId !== "string" || row.serviceId.trim() === "") {
        return NextResponse.json({ error: "Each item needs a serviceId." }, { status: 400 });
      }
      if (!nullableNumber(row.low) || !nullableNumber(row.high)) {
        return NextResponse.json(
          { error: "Estimate low and high values must be numbers or null." },
          { status: 400 }
        );
      }
      rows.push({ serviceId: row.serviceId.trim(), low: row.low, high: row.high });
    }

    const seen = new Set<string>();
    const duplicateIds = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.serviceId)) duplicateIds.add(row.serviceId);
      seen.add(row.serviceId);
    }
    if (duplicateIds.size > 0) {
      return NextResponse.json(
        { error: `Each service may appear once per request. Duplicate service id(s): ${[...duplicateIds].join(", ")}` },
        { status: 400 }
      );
    }

    // Validated BEFORE anything is written, and the whole request is refused
    // on any bad row. A partial bulk save would leave the contractor unable to
    // tell which of fifty services took.
    const problems: { serviceId: string; message: string }[] = [];
    for (const it of rows) {
      for (const b of validateEstimateBounds(it.low, it.high)) {
        // Unset is allowed on save — a contractor may clear a row they are not
        // ready to answer. It is never allowed on approve.
        if (b.code === "unset" && action === "save") continue;
        problems.push({ serviceId: it.serviceId, message: b.message });
      }
    }
    if (problems.length) {
      return NextResponse.json({ error: "Some rows are not valid.", problems }, { status: 400 });
    }

    try {
      const written = await db.$transaction(async (tx) => {
        // Resolve every submitted id through the guarded tenant client before
        // writing. A stale, missing or cross-tenant id makes the entire bulk
        // request fail instead of reporting success with a smaller written
        // count and leaving the contractor to guess which rows changed.
        const owned = await tx.service.findMany({
          where: { id: { in: rows.map((row) => row.serviceId) } },
          select: { id: true },
        });
        if (owned.length !== rows.length) {
          throw new Error("ESTIMATE_SERVICE_SET_CHANGED");
        }

        for (const it of rows) {
          await tx.service.update({
            where: { id: it.serviceId },
            data: {
              estimateLowCrewHours: it.low,
              estimateHighCrewHours: it.high,
              // Saving CLEARS any previous approval: numbers a human has not seen
              // since they changed are not numbers a human has approved.
              estimateApprovedAt: action === "approve" ? new Date() : null,
            },
          });
        }
        return rows.length;
      });

      return NextResponse.json({ ok: true, action, written });
    } catch (error) {
      if ((error as Error).message === "ESTIMATE_SERVICE_SET_CHANGED") {
        return NextResponse.json(
          { error: "One or more services are no longer available for this account. Nothing was saved; refresh and try again." },
          { status: 409 }
        );
      }
      throw error;
    }
  });
}
