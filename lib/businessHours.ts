import type { PrismaClient } from "@prisma/client";

/**
 * When this website may offer an appointment.
 *
 * Three assumptions used to be hardcoded in three different places: the
 * arrival windows in lib/jobber, a 4:30 PM cutoff beside them, and a
 * Monday-to-Friday filter in the schedule page. They agreed with each other
 * by luck rather than by construction, and changing the working week meant
 * finding all three.
 *
 * They now come from one record. A contractor who starts working Saturdays
 * ticks a box; the arrival windows, the end-of-day cutoff and the
 * "two full business days" lead time all follow.
 *
 * NOT DERIVED FROM THE FSM, DELIBERATELY
 *
 * Jobber knows a great deal about when people are working — shifts, on-call,
 * personal calendars, jobs booked by the office. None of that answers the
 * question this record answers, which is when a HOMEOWNER may pick a slot on
 * the website. Those are different, and conflating them would mean a
 * contractor changing their booking availability by editing their FSM.
 *
 * Jobber's role stays what it was: telling us who is already busy inside
 * hours we have decided to offer.
 */

export type BusinessHoursConfig = {
  workingDays: number[];
  dayStart: string;
  dayEnd: string;
  windowMinutes: number;
  minWindowMinutes: number;
};

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  // POLICY[workday.days]: MON_TO_FRI
  // POLICY[workday.start]: 08:00
  // POLICY[workday.end]: 16:30
  workingDays: [1, 2, 3, 4, 5],
  dayStart: "08:00",
  dayEnd: "16:30",
  windowMinutes: 180,
  minWindowMinutes: 60,
};

export async function loadBusinessHours(prisma: PrismaClient): Promise<BusinessHoursConfig> {
  const row = await prisma.businessHours.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_BUSINESS_HOURS;
  return {
    // An empty list would mean no bookable days at all, which is far more
    // likely to be a mistake than an intention. Fall back rather than
    // silently closing the business.
    workingDays: row.workingDays.length ? row.workingDays : DEFAULT_BUSINESS_HOURS.workingDays,
    dayStart: row.dayStart,
    dayEnd: row.dayEnd,
    windowMinutes: row.windowMinutes,
    minWindowMinutes: row.minWindowMinutes,
  };
}

/** "08:00" -> 480 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 480 -> "8:00 AM", matching how windows are displayed and stored. */
export function toDisplay(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * The arrival windows for a working day.
 *
 * Blocks of windowMinutes from the start, with the remainder as the last
 * window — so 8:00-16:30 in three-hour blocks gives 8-11, 11-2 and 2-4:30,
 * which is exactly what was hardcoded before.
 *
 * A remainder shorter than minWindowMinutes is folded into the previous
 * window instead of being offered alone. Otherwise a day ending at 4:45
 * would produce a fifteen-minute arrival window, which is not a promise
 * anyone can keep.
 */
export function generateArrivalWindows(
  cfg: BusinessHoursConfig
): { start: string; end: string }[] {
  const start = toMinutes(cfg.dayStart);
  const end = toMinutes(cfg.dayEnd);
  if (end <= start) return [];

  const windows: { start: number; end: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(cursor + cfg.windowMinutes, end);
    windows.push({ start: cursor, end: next });
    cursor = next;
  }

  if (windows.length > 1) {
    const last = windows[windows.length - 1];
    if (last.end - last.start < cfg.minWindowMinutes) {
      windows[windows.length - 2].end = last.end;
      windows.pop();
    }
  }

  return windows.map((w) => ({ start: toDisplay(w.start), end: toDisplay(w.end) }));
}

/** Is this date a day the contractor works? */
export function isWorkingDay(date: Date, cfg: BusinessHoursConfig): boolean {
  return cfg.workingDays.includes(date.getDay());
}

/** The next `count` working days, starting tomorrow. */
export function nextWorkingDays(count: number, cfg: BusinessHoursConfig, from = new Date()): Date[] {
  const days: Date[] = [];
  const cursor = new Date(from);
  // Guarded rather than while(true): a misconfigured empty working week
  // would otherwise spin forever.
  for (let i = 0; i < 60 && days.length < count; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor, cfg)) days.push(new Date(cursor));
  }
  return days;
}

/**
 * The earliest bookable date when a job needs checking first.
 *
 * "Two full business days" — book on Friday and the earliest is Wednesday,
 * because Saturday and Sunday aren't business days. Book on Monday and it's
 * Thursday. Both come out of the same rule rather than being special-cased.
 *
 * Business days come from workingDays, so a contractor who works Saturdays
 * gets a shorter wait automatically.
 */
export function earliestAfterFullBusinessDays(
  fullDays: number,
  cfg: BusinessHoursConfig,
  from = new Date()
): Date {
  const cursor = new Date(from);
  let elapsed = 0;
  for (let i = 0; i < 90 && elapsed < fullDays; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor, cfg)) elapsed++;
  }
  // Then the first working day after those have passed.
  for (let i = 0; i < 30; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor, cfg)) return cursor;
  }
  return cursor;
}
