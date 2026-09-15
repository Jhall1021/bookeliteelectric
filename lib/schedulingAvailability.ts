/**
 * Which arrival windows a contractor can honor — whoever keeps their calendar.
 *
 * ONE implementation, called by the schedule page and by the availability API.
 * Both used to read a Jobber crew list directly and hand it to the Jobber
 * availability function, which meant every scheduling rule existed twice and a
 * contractor who does not use Jobber was answered by Jobber's code anyway.
 * BrightPath is NATIVE and has never had a Jobber connection; it was shown
 * three bookable windows because an empty crew list meant "no constraints" to
 * a function whose only constraints come from crews.
 *
 * The mode decides who is asked:
 *
 *   EXTERNAL — the provider is authoritative. Their calendar, their crews,
 *              their outages. A missing provider or no bookable resource is a
 *              configuration failure, not an empty day.
 *   NATIVE   — Price2Book is authoritative. There is no calendar to ask, so
 *              the contractor's declared concurrent-job capacity is the whole
 *              answer, counted against bookings we already hold.
 *
 * Neither mode may invent a window. Both report the same retriable condition
 * so the storefront does not have to know which one it is talking to.
 */

import type { PrismaClient } from "@prisma/client";
import {
  getWindowAvailabilityForDay,
  SchedulingUnavailableError,
  jobFitsWorkday,
} from "./jobber";
import {
  nativeWindowAvailability,
  nativeWindowHasRoom,
  NativeCapacityUnconfiguredError,
  type WindowAvailability,
  type WindowSlot,
} from "./nativeScheduling";

export type DaySchedule = { windows: WindowSlot[]; dayEndDisplay: string };

/**
 * Why a window cannot be booked, so the homeowner is told the true reason.
 *
 *   NOT_ENOUGH_TIME  this job, started at this window, would run past the end
 *                    of the working day (jobFitsWorkday)
 *   FULL             the job fits, but the calendar has no room
 *
 * A window withheld for length used to read "Fully booked", which says the
 * contractor is busy when the real answer is that the day is too short.
 */
export type WindowUnavailableReason = "NOT_ENOUGH_TIME" | "FULL";
export type ScheduleWindow = WindowAvailability & { unavailableReason?: WindowUnavailableReason };

/**
 * The job's length, from the visit's own lines: the sum of each line's
 * snapshotted `estimatedMinutes` (for a derived service, its priced crew-hours
 * over its crew — set when the line was resolved), or null when any line has
 * none or there are no lines, so an incomplete total is never mistaken for a
 * short job.
 *
 * The one reading of "how long is this visit" for the schedule page, the
 * availability route and checkout. Nothing here prices or re-resolves.
 */
export function visitJobDurationMinutes(lineItems: { estimatedMinutes: number | null }[]): number | null {
  if (lineItems.length === 0 || lineItems.some((li) => li.estimatedMinutes === null)) return null;
  return lineItems.reduce((sum, li) => sum + (li.estimatedMinutes ?? 0), 0);
}

/**
 * A contractor whose scheduling is not set up cannot be scheduled against.
 *
 * Distinct from SchedulingUnavailableError, which means "ask again in a
 * moment". This one will not fix itself, and readiness names it as a blocker
 * rather than letting a storefront keep failing at checkout.
 */
export class SchedulingNotConfiguredError extends Error {
  constructor(readonly contractorId: string, readonly why: string) {
    super(why);
    this.name = "SchedulingNotConfiguredError";
  }
}

async function modeOf(db: PrismaClient, contractorId: string) {
  const c = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { schedulingAuthority: true },
  });
  return c?.schedulingAuthority ?? null;
}

/**
 * Does the job still finish before the working day ends?
 *
 * Owned by neither mode, because it is a fact about the day and the job — and
 * by nobody here either: jobFitsWorkday is the same rule checkout enforces.
 */
function fitsInTheDay(
  dateISO: string,
  schedule: DaySchedule,
  estimatedDurationMinutes?: number | null
) {
  return (w: WindowSlot) => jobFitsWorkday(dateISO, w, schedule.dayEndDisplay, estimatedDurationMinutes);
}

export async function windowAvailabilityForDay(
  db: PrismaClient,
  contractorId: string,
  dateISO: string,
  schedule: DaySchedule,
  estimatedDurationMinutes?: number | null
): Promise<ScheduleWindow[]> {
  const fits = fitsInTheDay(dateISO, schedule, estimatedDurationMinutes);
  // Whichever authority answered, an unavailable window is named by the one
  // fact that does not depend on it: a window the job cannot finish in is
  // NOT_ENOUGH_TIME; any other refusal is the calendar's.
  const withReasons = (windows: WindowAvailability[]): ScheduleWindow[] =>
    windows.map((w) => (w.available ? w : { ...w, unavailableReason: fits(w) ? "FULL" : "NOT_ENOUGH_TIME" }));
  const mode = await modeOf(db, contractorId);

  if (mode === "NATIVE") {
    try {
      return withReasons(await nativeWindowAvailability(
        db, contractorId, dateISO, schedule.windows, fits
      ));
    } catch (err) {
      if (err instanceof NativeCapacityUnconfiguredError) {
        throw new SchedulingNotConfiguredError(contractorId,
          "Native scheduling is selected but no concurrent-job capacity is configured.");
      }
      throw err;
    }
  }

  // EXTERNAL, or undeclared — which is itself a configuration failure rather
  // than a reason to guess. An undeclared contractor has not said whose
  // calendar is authoritative, so nothing here can honestly answer.
  if (mode === null) {
    throw new SchedulingNotConfiguredError(contractorId,
      "No scheduling authority has been declared for this contractor.");
  }

  const eligible = await db.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  if (eligible.length === 0) {
    // NO LONGER FAILS OPEN.
    //
    // getWindowAvailabilityForDay returns every window as available when the
    // eligible list is empty, which reads as "no crew constraints" when what
    // it means is "no crew". Checkout refuses these windows outright, so
    // offering them sends a homeowner all the way through their details to be
    // told the slot was just taken. It was not taken; there was nobody to send.
    throw new SchedulingNotConfiguredError(contractorId,
      "External scheduling is selected but no crew is marked bookable from the website.");
  }

  return withReasons(await getWindowAvailabilityForDay(
    contractorId, dateISO, eligible.map((c) => c.jobberUserId),
    estimatedDurationMinutes, schedule
  ));
}

/**
 * Can this contractor still take this exact window, checked at the last moment?
 *
 * Returns the crew id for EXTERNAL (the provider names who goes) and null for
 * NATIVE (nobody is named, and that is legitimate) — so a caller must
 * distinguish "refused" from "accepted, unassigned" by the boolean, never by
 * the presence of an id.
 */
export async function reserveWindow(
  db: PrismaClient,
  contractorId: string,
  dateISO: string,
  windowStart: string,
  windowEnd: string,
  windowStartDate: Date,
  windowEndDate: Date
): Promise<{ ok: boolean; assignedCrewId: string | null }> {
  const mode = await modeOf(db, contractorId);

  if (mode === "NATIVE") {
    try {
      const room = await nativeWindowHasRoom(db, contractorId, dateISO, windowStart, windowEnd);
      return { ok: room, assignedCrewId: null };
    } catch (err) {
      if (err instanceof NativeCapacityUnconfiguredError) {
        throw new SchedulingNotConfiguredError(contractorId,
          "Native scheduling is selected but no concurrent-job capacity is configured.");
      }
      throw err;
    }
  }

  if (mode === null) {
    throw new SchedulingNotConfiguredError(contractorId,
      "No scheduling authority has been declared for this contractor.");
  }

  const eligible = await db.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  if (eligible.length === 0) {
    throw new SchedulingNotConfiguredError(contractorId,
      "External scheduling is selected but no crew is marked bookable from the website.");
  }

  const { pickCrewForWindow } = await import("./jobber");
  const assigned = await pickCrewForWindow(
    contractorId, dateISO, windowStartDate, windowEndDate,
    eligible.map((c) => c.jobberUserId)
  );
  return { ok: assigned !== null, assignedCrewId: assigned };
}

export { SchedulingUnavailableError };
