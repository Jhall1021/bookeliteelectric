import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { generateArrivalWindows, DEFAULT_BUSINESS_HOURS } from "@/lib/businessHours";

/** "08:00" or "8:00" — reject anything else rather than storing nonsense. */
function validTime(v: unknown): v is string {
  return typeof v === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);
}

export async function PATCH(req: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    workingDays?: number[];
    dayStart?: string;
    dayEnd?: string;
    windowMinutes?: number;
    minWindowMinutes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const days = Array.isArray(body.workingDays)
    ? [...new Set(body.workingDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : undefined;

  if (days && days.length === 0) {
    // Every rule downstream — windows, the end-of-day cutoff, the
    // verification lead time — assumes at least one working day exists.
    return NextResponse.json(
      { error: "Pick at least one working day, or nobody can book at all." },
      { status: 400 }
    );
  }
  if (body.dayStart !== undefined && !validTime(body.dayStart)) {
    return NextResponse.json({ error: "Start time should look like 08:00." }, { status: 400 });
  }
  if (body.dayEnd !== undefined && !validTime(body.dayEnd)) {
    return NextResponse.json({ error: "End time should look like 16:30." }, { status: 400 });
  }

  const current =
    (await prisma.businessHours.findUnique({ where: { id: "default" } })) ??
    DEFAULT_BUSINESS_HOURS;

  const next = {
    workingDays: days ?? current.workingDays,
    dayStart: body.dayStart ?? current.dayStart,
    dayEnd: body.dayEnd ?? current.dayEnd,
    windowMinutes: body.windowMinutes ?? current.windowMinutes,
    minWindowMinutes: body.minWindowMinutes ?? current.minWindowMinutes,
  };

  const [sh, sm] = next.dayStart.split(":").map(Number);
  const [eh, em] = next.dayEnd.split(":").map(Number);
  if (eh * 60 + em <= sh * 60 + sm) {
    return NextResponse.json(
      { error: "The day has to end after it starts." },
      { status: 400 }
    );
  }

  const saved = await prisma.businessHours.upsert({
    where: { id: "default" },
    update: next,
    create: { id: "default", ...next },
  });

  // Returned so the admin sees the windows these hours produce, rather than
  // saving and hoping. The generation rule isn't obvious from the inputs.
  return NextResponse.json({
    ok: true,
    hours: saved,
    windows: generateArrivalWindows(next),
  });
}
