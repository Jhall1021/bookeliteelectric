import { NextResponse } from "next/server";
import { generateArrivalWindows, DEFAULT_BUSINESS_HOURS } from "@/lib/businessHours";
import { withAdminRoute } from "@/lib/adminContext";

/** "08:00" or "8:00" — reject anything else rather than storing nonsense. */
function validTime(v: unknown): v is string {
  return typeof v === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);
}

function positiveInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v > 0;
}

export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }

    const body = parsed as Record<string, unknown>;

    let days: number[] | undefined;
    if (body.workingDays !== undefined) {
      if (!Array.isArray(body.workingDays)) {
        return NextResponse.json({ error: "Working days must be a list of days." }, { status: 400 });
      }
      if (
        body.workingDays.some(
          (day) => typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6
        )
      ) {
        return NextResponse.json({ error: "Working days must use day numbers from 0 through 6." }, { status: 400 });
      }
      days = [...new Set(body.workingDays as number[])].sort((a, b) => a - b);
      if (days.length === 0) {
        // Every rule downstream — windows, the end-of-day cutoff, the
        // verification lead time — assumes at least one working day exists.
        return NextResponse.json(
          { error: "Pick at least one working day, or nobody can book at all." },
          { status: 400 }
        );
      }
    }

    if (body.dayStart !== undefined && !validTime(body.dayStart)) {
      return NextResponse.json({ error: "Start time should look like 08:00." }, { status: 400 });
    }
    if (body.dayEnd !== undefined && !validTime(body.dayEnd)) {
      return NextResponse.json({ error: "End time should look like 16:30." }, { status: 400 });
    }
    if (body.windowMinutes !== undefined && !positiveInteger(body.windowMinutes)) {
      return NextResponse.json(
        { error: "Arrival window length must be a positive whole number of minutes." },
        { status: 400 }
      );
    }
    if (body.minWindowMinutes !== undefined && !positiveInteger(body.minWindowMinutes)) {
      return NextResponse.json(
        { error: "Minimum arrival window length must be a positive whole number of minutes." },
        { status: 400 }
      );
    }

    const current =
      (await db.businessHours.findUnique({ where: { contractorId: ctx.contractorId } })) ??
      DEFAULT_BUSINESS_HOURS;

    const next = {
      workingDays: days ?? current.workingDays,
      dayStart: (body.dayStart as string | undefined) ?? current.dayStart,
      dayEnd: (body.dayEnd as string | undefined) ?? current.dayEnd,
      windowMinutes: (body.windowMinutes as number | undefined) ?? current.windowMinutes,
      minWindowMinutes:
        (body.minWindowMinutes as number | undefined) ?? current.minWindowMinutes,
    };

    const [sh, sm] = next.dayStart.split(":").map(Number);
    const [eh, em] = next.dayEnd.split(":").map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      return NextResponse.json(
        { error: "The day has to end after it starts." },
        { status: 400 }
      );
    }

    // ADR-007a: keyed by contractor. `id: "default"` was one shared schedule
    // for every contractor — two businesses, one set of working hours.
    const saved = await db.businessHours.upsert({
      where: { contractorId: ctx.contractorId },
      update: next,
      create: { contractorId: ctx.contractorId, ...next },
    });

    // Returned so the admin sees the windows these hours produce, rather than
    // saving and hoping. The generation rule isn't obvious from the inputs.
    return NextResponse.json({
      ok: true,
      hours: saved,
      windows: generateArrivalWindows(next),
    });
  });
}
