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
 * The behavioral checks below run against the REAL Jobber integration. On a
 * developer machine its OAuth credentials do not match an application, so the
 * outage is genuine rather than simulated — which is the only reason this can
 * be proved without a stub.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import {
  getWindowAvailabilityForDay,
  pickCrewForWindow,
  SchedulingUnavailableError,
} from "../lib/jobber";

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

  // ── behavior, against a real unreachable Jobber ────────────────────────
  let availErr: unknown;
  try {
    await getWindowAvailabilityForDay(c.id, "2026-09-01", ids);
  } catch (e) { availErr = e; }
  ok(`1. the schedule step refuses to invent availability`,
    availErr instanceof SchedulingUnavailableError,
    availErr instanceof Error ? availErr.name : String(availErr));
  ok(`   and says the condition is temporary`,
    (availErr as SchedulingUnavailableError)?.retriable === true);

  let pickErr: unknown;
  try {
    await pickCrewForWindow(c.id, "2026-09-01",
      new Date("2026-09-01T12:00:00Z"), new Date("2026-09-01T15:00:00Z"), ids);
  } catch (e) { pickErr = e; }
  ok(`2. checkout's revalidation raises the SAME condition`,
    pickErr instanceof SchedulingUnavailableError,
    pickErr instanceof Error ? pickErr.name : String(pickErr));
  ok(`   so one screen cannot fail open while the other fails closed`,
    availErr instanceof SchedulingUnavailableError && pickErr instanceof SchedulingUnavailableError);

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
