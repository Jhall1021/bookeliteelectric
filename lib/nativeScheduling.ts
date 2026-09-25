/**
 * Availability when Price2Book itself is the scheduling authority.
 *
 * The counterpart to lib/jobber.ts, and deliberately not part of it. An
 * EXTERNAL contractor's capacity is a question for their provider; a NATIVE
 * contractor's capacity is a number they told us. Neither should be able to
 * answer for the other, which is exactly what went wrong: availability read a
 * Jobber crew list for a contractor who has no Jobber, found it empty, and
 * offered three arrival windows anyway.
 *
 * This is still not a dispatch system. Named crews are capacity labels, not
 * employee records, and native bookings remain unassigned. Blocks merely say
 * that one unit of capacity is unavailable because the contractor already has
 * work (or another commitment) outside Price2Book.
 */

import type { PrismaClient } from "@prisma/client";
import { serviceDateToStored } from "./serviceDate";

/** Native scheduling with no declared capacity. Never guess a number. */
export class NativeCapacityUnconfiguredError extends Error {
  constructor(readonly contractorId: string) {
    super("Native scheduling is selected but no concurrent-job capacity is configured.");
    this.name = "NativeCapacityUnconfiguredError";
  }
}

export type WindowSlot = { start: string; end: string };
export type WindowAvailability = WindowSlot & { available: boolean };

/**
 * How many jobs may run at once, or null when the contractor has not said.
 *
 * Null is not zero and not "some". A contractor who has not answered has not
 * told us they can take no work.
 */
export async function nativeCapacity(
  db: PrismaClient,
  contractorId: string
): Promise<number | null> {
  const [c, rosterSize, rosterRows] = await Promise.all([
    db.contractor.findUnique({
      where: { id: contractorId },
      select: { nativeConcurrentJobs: true },
    }),
    db.nativeCrew.count({ where: { contractorId, active: true } }),
    db.nativeCrew.count({ where: { contractorId } }),
  ]);
  // Once a contractor creates a roster, its active crews are the honest
  // capacity. The old number remains a compatibility fallback only for native
  // contractors who have not adopted named crews yet.
  if (rosterRows > 0) return rosterSize > 0 ? rosterSize : null;
  const n = c?.nativeConcurrentJobs ?? null;
  return n !== null && n > 0 ? n : null;
}

function overlaps(blockStart: string, blockEnd: string, windowStart: string, windowEnd: string) {
  return blockStart < windowEnd && blockEnd > windowStart;
}

/** Active named crews blocked during each candidate window. */
async function blockedPerWindow(
  db: PrismaClient,
  contractorId: string,
  dateISO: string,
  windows: WindowSlot[]
): Promise<Map<string, number>> {
  const blocks = await db.nativeCrewBlock.findMany({
    where: {
      contractorId,
      date: serviceDateToStored(dateISO),
      crew: { active: true },
    },
    select: { crewId: true, startTime: true, endTime: true },
  });

  const counts = new Map<string, number>();
  for (const window of windows) {
    const blockedCrews = new Set(
      blocks
        .filter((block) => overlaps(block.startTime, block.endTime, window.start, window.end))
        .map((block) => block.crewId)
    );
    counts.set(`${window.start}|${window.end}`, blockedCrews.size);
  }
  return counts;
}

/**
 * How many bookings this contractor already holds in each of the day's windows.
 *
 * Counted from OUR OWN bookings, which for a native contractor is the whole
 * truth — there is no other calendar that could disagree. Keyed by the
 * window's display times because that is what an ArrivalWindow stores and what
 * a homeowner picked.
 */
async function bookedPerWindow(
  db: PrismaClient,
  contractorId: string,
  dateISO: string
): Promise<Map<string, number>> {
  const rows = await db.booking.findMany({
    where: {
      visit: { contractorId },
      status: { not: "CANCELED" },
      // The canonical stored service date — the value checkout writes.
      arrivalWindow: { date: serviceDateToStored(dateISO) },
    },
    select: { arrivalWindow: { select: { startTime: true, endTime: true } } },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.arrivalWindow) continue;
    const k = `${r.arrivalWindow.startTime}|${r.arrivalWindow.endTime}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Which of the day's windows a native contractor can still honor.
 *
 * `fits` is applied by the caller and passed in, because whether a job runs
 * past the end of the working day is a property of the day and the job, not of
 * who keeps the calendar — and both scheduling modes owe the homeowner the
 * same answer about it.
 *
 * Throws rather than returning everything-unavailable when capacity is
 * undeclared, so an unconfigured contractor is a loud condition the caller
 * reports as a scheduling failure, not a silently empty day that reads like
 * being fully booked.
 */
export async function nativeWindowAvailability(
  db: PrismaClient,
  contractorId: string,
  dateISO: string,
  windows: WindowSlot[],
  fits: (w: WindowSlot) => boolean
): Promise<WindowAvailability[]> {
  const capacity = await nativeCapacity(db, contractorId);
  if (capacity === null) throw new NativeCapacityUnconfiguredError(contractorId);

  const [booked, blocked] = await Promise.all([
    bookedPerWindow(db, contractorId, dateISO),
    blockedPerWindow(db, contractorId, dateISO, windows),
  ]);
  return windows.map((w) => ({
    ...w,
    available: fits(w) &&
      (booked.get(`${w.start}|${w.end}`) ?? 0) + (blocked.get(`${w.start}|${w.end}`) ?? 0) < capacity,
  }));
}

/**
 * May this native contractor accept one more job in this window?
 *
 * Asked again at checkout rather than trusted from the schedule screen, for
 * the same reason the external path re-asks its provider: the customer picked
 * that window on an earlier screen and somebody else may have taken the last
 * slot since.
 */
export async function nativeWindowHasRoom(
  db: PrismaClient,
  contractorId: string,
  dateISO: string,
  windowStart: string,
  windowEnd: string
): Promise<boolean> {
  const capacity = await nativeCapacity(db, contractorId);
  if (capacity === null) throw new NativeCapacityUnconfiguredError(contractorId);
  const [booked, blocked] = await Promise.all([
    bookedPerWindow(db, contractorId, dateISO),
    blockedPerWindow(db, contractorId, dateISO, [{ start: windowStart, end: windowEnd }]),
  ]);
  const key = `${windowStart}|${windowEnd}`;
  return (booked.get(key) ?? 0) + (blocked.get(key) ?? 0) < capacity;
}
