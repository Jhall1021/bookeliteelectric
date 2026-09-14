/**
 * THE SERVICE DATE — the one representation of "which day" in scheduling.
 *
 * A service date is a CALENDAR DAY in the scheduling time zone: the day a
 * homeowner picks and a crew works. It is not an instant. Arrival times within
 * it ("8:00 AM") are wall-clock times in that zone, converted to instants only
 * where instants are compared (lib/jobber windowToDateRange).
 *
 * TWO FORMS, AND ONLY TWO
 *
 *   ServiceDate  "YYYY-MM-DD"  — what the schedule page, /api/availability,
 *                                checkout and native capacity pass around.
 *   stored       that day at 00:00:00.000Z — ArrivalWindow.date. A date-only
 *                                value in a timestamp column: its UTC calendar
 *                                date IS the service date. It is never
 *                                converted through a time zone; display
 *                                formats it as UTC for exactly that reason.
 *
 * WHY THIS EXISTS
 *
 * Checkout stored `new Date(date)` where `date` was the schedule page's
 * timestamp for the day (now + N days, time of day included), while native
 * capacity counted bookings whose date EQUALS the day's midnight. No storefront
 * booking was ever counted, a one-job window stayed bookable after it was
 * booked, and @@unique([date, startTime, endTime, serviceAreaId]) could not
 * deduplicate rows whose dates differed by the time of page load.
 *
 * The days themselves came from the SERVER's local calendar (Date#setDate,
 * getDay), and their labels from the BROWSER's. A homeowner in New York at 10pm
 * talking to a UTC server was offered a tab that read one day and scheduled
 * another. "Today" is now the scheduling zone's today, and every label is the
 * service date itself.
 */

/** Where the contractor's day is. The same zone arrival times are read in. */
export const SCHEDULING_TIME_ZONE = "America/New_York";

export type ServiceDate = string;

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written exactly as YYYY-MM-DD. Timestamps and 2026-02-30 are not. */
export function isServiceDate(value: unknown): value is ServiceDate {
  if (typeof value !== "string") return false;
  const m = SHAPE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function assertServiceDate(value: unknown): asserts value is ServiceDate {
  if (!isServiceDate(value)) throw new Error(`not a service date (YYYY-MM-DD): ${JSON.stringify(value)}`);
}

/** The value ArrivalWindow.date holds for this service date. */
export function serviceDateToStored(serviceDate: ServiceDate): Date {
  assertServiceDate(serviceDate);
  return new Date(`${serviceDate}T00:00:00.000Z`);
}

/**
 * The service date an ArrivalWindow.date names. Its UTC calendar date — which
 * is also what checkout used as the scheduling day for rows written before this
 * existed, so historical bookings read back as the day they were scheduled on.
 */
export function serviceDateFromStored(stored: Date): ServiceDate {
  return stored.toISOString().slice(0, 10);
}

/** The service date in the scheduling zone at this instant. */
export function serviceDateAt(instant: Date, timeZone: string = SCHEDULING_TIME_ZONE): ServiceDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar arithmetic on the date itself — no instants, so no DST or zone drift. */
export function addServiceDays(serviceDate: ServiceDate, days: number): ServiceDate {
  const d = serviceDateToStored(serviceDate);
  d.setUTCDate(d.getUTCDate() + days);
  return serviceDateFromStored(d);
}

/** 0 = Sunday … 6 = Saturday, of the calendar day. */
export function serviceWeekday(serviceDate: ServiceDate): number {
  return serviceDateToStored(serviceDate).getUTCDay();
}

/** A label for the day, the same wherever it is rendered (server, browser, email). */
export function formatServiceDate(serviceDate: ServiceDate, options: Omit<Intl.DateTimeFormatOptions, "timeZone">): string {
  return serviceDateToStored(serviceDate).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
