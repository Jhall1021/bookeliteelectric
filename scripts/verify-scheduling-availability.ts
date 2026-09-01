/**
 * Pricing fails open. Scheduling fails closed, gracefully.
 *
 *   npx tsx scripts/verify-scheduling-availability.ts
 *
 * A Jobber outage must never stop a homeowner answering the decision tree or
 * seeing a price — that is pricing, and it does not depend on anyone's
 * calendar. But once a real arrival window is at stake, Price2Book must not
 * show or accept availability it could not verify.
 *
 * WHAT THIS REPLACED
 *
 * The same outage produced two different answers. `getWindowAvailabilityForDay`
 * swallowed it and returned EVERY window as available, so the schedule step
 * offered slots nobody had checked. `pickCrewForWindow` let it escape as a 500
 * with an empty body, so checkout died without explanation. One screen
 * fabricated a yes; the next gave a blank error; and between them sat a
 * deposit.
 *
 * HOW THE OUTAGE IS PRODUCED, AND WHY IT CHANGED
 *
 * These checks used to run against the REAL Jobber integration and rely on a
 * developer machine's OAuth credentials not matching an application — "the
 * outage is genuine rather than simulated" was the argument. It was not a
 * test. It asserted a property of the ambient environment, so it passed
 * locally, failed in the Vercel build where the credentials work, and blocked
 * a production deployment with two checks reporting `(undefined)` — which was
 * the truthful report that nothing had gone wrong.
 *
 * The fetch is now injected (lib/jobber's VisitFetcher). Both directions are
 * proved deterministically and neither depends on credentials, on the network,
 * or on which environment this runs in:
 *
 *   unavailable   a fetcher that throws  -> SchedulingUnavailableError, and no
 *                 window is offered
 *   available     a fetcher returning a fixed day of visits -> real
 *                 availability, with the busy crew's window closed
 *
 * Production passes no fetcher and gets the real one. Nothing about the
 * shipped behavior depends on any of this.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import {
  getWindowAvailabilityForDay,
  pickCrewForWindow,
  SchedulingUnavailableError,
  type VisitFetcher,
} from "../lib/jobber";

/**
 * A fixed date, so the run is identical every day.
 *
 * It was "2026-09-01", which was the day the check was written and is now the
 * day it broke — a hardcoded present tense that quietly becomes the past.
 */
const DAY = "2030-06-05";

const prisma = new PrismaClient();
let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function main() {
  console.log(`\nSCHEDULING AVAILABILITY — fails closed, and says so\n`);

  if (process.env.JOBBER_LOCAL_STUB === "1") {
    console.error(`  JOBBER_LOCAL_STUB is set. These checks need the real integration.\n`);
    process.exit(2);
  }

  const c = await prisma.contractor.findFirstOrThrow({
    where: { slug: "elite-electric" }, select: { id: true },
  });
  const crews = await prisma.jobberCrewMember.findMany({
    where: { contractorId: c.id, eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  const ids = crews.map((x) => x.jobberUserId);
  if (ids.length === 0) { console.error(`  No eligible crew — cannot exercise the Jobber path.\n`); process.exit(2); }

  // ── behavior, against an injected provider ─────────────────────────────
  //
  // The failing fetcher stands in for any way the provider can be unreachable
  // — expired token, outage, rate limit. What matters to the caller is that it
  // threw, not why.
  const OUTAGE = () => Promise.reject(new Error("Jobber unreachable (injected)"));

  /**
   * A day the fixture decides: the first eligible crew is busy 8am-noon.
   *
   * Deliberately real-shaped rather than empty. An empty day proves only that
   * nothing crashed; a day with one busy crew proves availability is actually
   * computed from what came back.
   */
  const BUSY_VISIT = {
    id: "fixture-visit-1",
    startAt: `${DAY}T12:00:00.000Z`,
    endAt: `${DAY}T16:00:00.000Z`,
    allDay: false,
    assignedUserIds: [ids[0]],
  };
  const AVAILABLE: VisitFetcher = async () => [BUSY_VISIT];

  let availErr: unknown;
  try {
    await getWindowAvailabilityForDay(c.id, DAY, ids, undefined, undefined, OUTAGE);
  } catch (e) { availErr = e; }
  ok(`1. the schedule step refuses to invent availability`,
    availErr instanceof SchedulingUnavailableError,
    availErr instanceof Error ? availErr.name : String(availErr));
  ok(`   and says the condition is temporary`,
    (availErr as SchedulingUnavailableError)?.retriable === true);

  let pickErr: unknown;
  try {
    await pickCrewForWindow(c.id, DAY,
      new Date(`${DAY}T12:00:00Z`), new Date(`${DAY}T15:00:00Z`), ids, OUTAGE);
  } catch (e) { pickErr = e; }
  ok(`2. checkout's revalidation raises the SAME condition`,
    pickErr instanceof SchedulingUnavailableError,
    pickErr instanceof Error ? pickErr.name : String(pickErr));
  ok(`   so one screen cannot fail open while the other fails closed`,
    availErr instanceof SchedulingUnavailableError && pickErr instanceof SchedulingUnavailableError);

  // The success path, so "fails closed" cannot be satisfied by failing always.
  const windows = await getWindowAvailabilityForDay(c.id, DAY, ids, undefined, undefined, AVAILABLE);
  ok(`   a reachable provider produces real availability instead`,
    Array.isArray(windows) && windows.length > 0, `${windows?.length} window(s)`);

  const crew = await pickCrewForWindow(c.id, DAY,
    new Date(`${DAY}T12:00:00Z`), new Date(`${DAY}T15:00:00Z`), ids, AVAILABLE);
  ok(`   and the crew the fixture says is busy is not offered for that window`,
    crew !== ids[0], `picked ${crew ?? "nobody"}`);

  // ── the answers each surface gives ─────────────────────────────────────
  const availRoute = strip(readFileSync("app/api/availability/[dateISO]/route.ts", "utf8"));
  const checkout = strip(readFileSync("app/api/checkout/route.ts", "utf8"));
  const client = strip(readFileSync("components/checkout/ScheduleClient.tsx", "utf8"));
  const jobber = strip(readFileSync("lib/jobber.ts", "utf8"));
  const scheduling = strip(readFileSync("lib/schedulingAvailability.ts", "utf8"));

  ok(`3. availability answers 503 SCHEDULING_UNAVAILABLE, not a 500`,
    /SCHEDULING_UNAVAILABLE/.test(availRoute) && /status:\s*503/.test(availRoute));
  ok(`4. checkout answers with the same named condition`,
    /SCHEDULING_UNAVAILABLE/.test(checkout) && /status:\s*503/.test(checkout));
  ok(`   and marks it retriable on both`,
    /retriable:\s*true/.test(availRoute) && /retriable:\s*true/.test(checkout));

  // ── nothing irreversible happens on that path ──────────────────────────
  //
  // FOLLOWS THE CALL, which moved. Checkout used to ask Jobber directly via
  // pickCrewForWindow; it now asks reserveWindow, the authority that decides
  // which calendar is even relevant — Jobber's for an EXTERNAL contractor,
  // Price2Book's declared capacity for a NATIVE one. The ORDERING claim is
  // unchanged and is the whole point: whatever answers, it answers before a
  // card is touched and before a booking row exists.
  const revalidateAt = checkout.indexOf("reserveWindow(");
  const depositAt = checkout.indexOf("if (depositDueCents > 0)");
  const writeAt = checkout.indexOf("writeCheckout(");
  ok(`5. availability is revalidated BEFORE the deposit is authorized`,
    revalidateAt > 0 && depositAt > revalidateAt, `${revalidateAt} < ${depositAt}`);
  ok(`   and before the booking is written`, revalidateAt > 0 && writeAt > revalidateAt);
  ok(`   and the authority it calls asks a real calendar, not a default`,
    /pickCrewForWindow\(/.test(scheduling) && /nativeWindowHasRoom\(/.test(scheduling) &&
      !/return\s*\{\s*ok:\s*true/.test(scheduling.split("export async function reserveWindow")[1]?.split("if (mode === null)")[0] ?? ""));
  ok(`6. the refusal returns rather than falling through to a booking`,
    /SCHEDULING_UNAVAILABLE[\s\S]{0,200}status:\s*503\s*\)\s*;\s*\}/.test(checkout) ||
    /return NextResponse\.json\(\s*\{\s*error:\s*"SCHEDULING_UNAVAILABLE"/.test(checkout));

  // ── no fabrication anywhere ────────────────────────────────────────────
  ok(`7. availability no longer falls back to offering every window`,
    !/failing open/i.test(jobber));
  ok(`8. the customer is shown a temporary state instead of slots`,
    /unavailable/.test(client) && /Try again/.test(client));
  ok(`   and windows are cleared rather than left stale`,
    /setWindows\(\[\]\)/.test(client));

  // ── the local stub cannot reach production ─────────────────────────────
  ok(`9. the local stub is gated on the flag AND on not being production`,
    /NODE_ENV\s*!==\s*"production"\s*&&\s*process\.env\.JOBBER_LOCAL_STUB\s*===\s*"1"/.test(jobber));

  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  An outage costs a retry, never a booking or a charge.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
