/**
 * ONE SERVICE DATE: THE DAY OFFERED IS THE DAY STORED, COUNTED AND SHOWN.
 *
 *   npx tsx scripts/verify-service-date.ts
 *
 * Checkout stored the schedule page's timestamp for a day on ArrivalWindow.date
 * while native capacity counted bookings whose date equals that day's midnight,
 * so no storefront booking was counted and @@unique([date, startTime, endTime,
 * serviceAreaId]) deduplicated nothing. lib/serviceDate is now the one
 * representation. This proves its semantics without a browser:
 *
 *   T  the helper: shape, round trip, calendar arithmetic, weekday, label
 *   Z  time-zone boundaries: "today" is New York's today near midnight and
 *      across both DST changes, and nothing depends on the server's zone
 *   G  day generation: the next working days from late evening, Friday night
 *      and a DST weekend are the right calendar days
 *   S  every reader and writer goes through the helper
 *   U  uniqueness: one ArrivalWindow row per service-date window (database)
 *
 * The real storefront path — a checkout-created booking consuming capacity —
 * is verify-derived-scheduling-browser.ts.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import {
  addServiceDays, formatServiceDate, isServiceDate, serviceDateAt, serviceDateFromStored,
  serviceDateToStored, serviceWeekday, SCHEDULING_TIME_ZONE,
} from "../lib/serviceDate";
import { DEFAULT_BUSINESS_HOURS, nextWorkingDays } from "../lib/businessHours";
import { windowToDateRange } from "../lib/jobber";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SLUG = `rv2-pilot-rehearsal-servicedate-${process.pid.toString(36)}`;

async function main() {
  console.log("\nSERVICE DATE — ONE REPRESENTATION\n");

  console.log("  T  THE HELPER\n");
  ok(SCHEDULING_TIME_ZONE === "America/New_York", "T  scheduling zone is the one arrival times are already read in");
  ok(isServiceDate("2026-09-15") && !isServiceDate("2026-9-15") && !isServiceDate("2026-02-30") && !isServiceDate("2026-09-15T21:24:21.606Z") && !isServiceDate(null),
    "T  a service date is exactly YYYY-MM-DD of a real day — no timestamps, no 30 Feb");
  ok(serviceDateToStored("2026-09-15").toISOString() === "2026-09-15T00:00:00.000Z" && serviceDateFromStored(serviceDateToStored("2026-09-15")) === "2026-09-15",
    "T  stored form is that day at 00:00Z, and reads back as the same day");
  let threw = false; try { serviceDateToStored("2026-09-15T21:24:21.606Z"); } catch { threw = true; }
  ok(threw, "T  a timestamp is refused, not truncated into a date");
  ok(serviceDateFromStored(new Date("2026-09-15T19:05:41.037Z")) === "2026-09-15", "T  a row written before this (Stage 1A's timestamp) reads back as the day it was scheduled on");
  ok(addServiceDays("2026-12-31", 1) === "2027-01-01" && addServiceDays("2028-02-28", 1) === "2028-02-29" && addServiceDays("2026-03-07", 2) === "2026-03-09" && addServiceDays("2026-10-31", 2) === "2026-11-02",
    "T  day arithmetic across year end, leap day and both DST weekends");
  ok(serviceWeekday("2026-09-15") === 2 && serviceWeekday("2026-09-19") === 6, "T  weekday of the calendar day (Tue 15 Sep, Sat 19 Sep 2026)");
  ok(formatServiceDate("2026-09-15", { weekday: "long", month: "long", day: "numeric" }) === "Tuesday, September 15", "T  label is the day itself");

  console.log("\n  Z  TIME-ZONE BOUNDARIES — NEW YORK'S CALENDAR, WHATEVER THE SERVER'S\n");
  const originalTZ = process.env.TZ;
  const cases: [string, string, string][] = [
    ["2026-09-15T03:59:00Z", "2026-09-14", "11:59 PM EDT Mon — still Monday in New York, already Tuesday in UTC"],
    ["2026-09-15T04:00:00Z", "2026-09-15", "12:00 AM EDT Tue"],
    ["2026-03-08T04:59:00Z", "2026-03-07", "11:59 PM EST Sat, the night clocks spring forward"],
    ["2026-03-08T05:00:00Z", "2026-03-08", "12:00 AM EST Sun, spring-forward day"],
    ["2026-11-01T03:59:00Z", "2026-10-31", "11:59 PM EDT Sat, the night clocks fall back"],
    ["2026-11-02T04:59:00Z", "2026-11-01", "11:59 PM EST Sun, fall-back day"],
    ["2026-11-02T05:00:00Z", "2026-11-02", "12:00 AM EST Mon"],
  ];
  const zones = ["UTC", "America/New_York", "America/Los_Angeles", "Pacific/Auckland"];
  const drift: string[] = [];
  for (const tz of zones) {
    process.env.TZ = tz;
    for (const [instant, expected] of cases) if (serviceDateAt(new Date(instant)) !== expected) drift.push(`${tz}: ${instant} → ${serviceDateAt(new Date(instant))}`);
    if (formatServiceDate("2026-09-15", { weekday: "short", month: "short", day: "numeric" }) !== "Tue, Sep 15") drift.push(`${tz}: label`);
    if (serviceWeekday("2026-09-15") !== 2) drift.push(`${tz}: weekday`);
  }
  process.env.TZ = originalTZ;
  for (const [instant, expected, why] of cases) ok(!drift.some((d) => d.includes(instant)), `Z  ${instant} → ${expected} (${why})`);
  ok(drift.length === 0, `Z  identical under server zones ${zones.join(", ")} — including the label and weekday`, drift.join("; "));
  const [start] = windowToDateRange("2026-09-15", "8:00 AM", "11:00 AM");
  const [winter] = windowToDateRange("2026-12-15", "8:00 AM", "11:00 AM");
  ok(start.toISOString() === "2026-09-15T12:00:00.000Z" && winter.toISOString() === "2026-12-15T13:00:00.000Z",
    "Z  the service date's 8:00 AM is 8:00 in New York (EDT and EST) — the day and the arrival time agree");

  console.log("\n  G  THE DAYS OFFERED\n");
  const hours = DEFAULT_BUSINESS_HOURS;
  const gen = (instant: string) => { const out: Record<string, string> = {};
    for (const tz of zones) { process.env.TZ = tz; out[tz] = nextWorkingDays(5, hours, new Date(instant)).join(","); }
    process.env.TZ = originalTZ; return out; };
  const same = (o: Record<string, string>) => new Set(Object.values(o)).size === 1;
  const lateMon = gen("2026-09-15T02:00:00Z");   // 10:00 PM EDT Monday 14 Sep
  ok(same(lateMon) && lateMon.UTC === "2026-09-15,2026-09-16,2026-09-17,2026-09-18,2026-09-21",
    "G  Monday 10 PM in New York: tomorrow is Tuesday 15 Sep — not skipped because UTC is already Tuesday", JSON.stringify(lateMon));
  const friNight = gen("2026-09-19T03:30:00Z");  // 11:30 PM EDT Friday 18 Sep
  ok(same(friNight) && friNight.UTC.startsWith("2026-09-21,2026-09-22"), "G  Friday 11:30 PM: the weekend is skipped, Monday 21 Sep first", JSON.stringify(friNight));
  const dst = gen("2026-10-30T15:00:00Z");       // Friday before fall-back
  ok(same(dst) && dst.UTC === "2026-11-02,2026-11-03,2026-11-04,2026-11-05,2026-11-06", "G  across the fall-back weekend, five consecutive weekdays", JSON.stringify(dst));
  const all = nextWorkingDays(5, hours, new Date("2026-09-15T02:00:00Z"));
  ok(all.every((d) => isServiceDate(d) && hours.workingDays.includes(serviceWeekday(d))), "G  every generated day is a service date on a working weekday");

  console.log("\n  S  EVERY READER AND WRITER USES IT\n");
  const checkout = code("app/api/checkout/route.ts");
  ok(/if \(!isServiceDate\(date\)\)[\s\S]{0,120}INVALID_SERVICE_DATE/.test(checkout) && /const dateISO = date;/.test(checkout) && !/new Date\(date\)/.test(checkout),
    "S  checkout accepts only a service date and never stores new Date(date)");
  ok((checkout.match(/date: storedServiceDate/g) ?? []).length === 2 && /const storedServiceDate = serviceDateToStored\(dateISO\);/.test(checkout),
    "S  checkout finds and creates the ArrivalWindow by the canonical stored date");
  ok(/arrivalWindow: \{ date: serviceDateToStored\(dateISO\) \}/.test(code("lib/nativeScheduling.ts")), "S  native capacity counts by the same canonical stored date");
  ok(/isServiceDate\(params\.dateISO\)/.test(code("app/api/availability/[dateISO]/route.ts")), "S  /api/availability refuses anything but a service date");
  ok(/nextWorkingDays\(5, businessHours\)\.map\(\(dateISO\) =>/.test(code("app/[site]/checkout/schedule/page.tsx")) && /label: formatServiceDate\(dateISO/.test(code("app/[site]/checkout/schedule/page.tsx")),
    "S  the schedule page offers service dates with server-rendered labels");
  const client = code("components/checkout/ScheduleClient.tsx");
  ok(/date: currentDay\.dateISO/.test(client) && !/toLocaleDateString/.test(client), "S  the client carries the service date to checkout and relabels nothing in the browser's zone");
  for (const f of ["lib/email.ts", "app/[site]/checkout/confirmation/[bookingId]/page.tsx", "app/dashboard/bookings/page.tsx"]) {
    const src = code(f);
    ok(/formatServiceDate\(serviceDateFromStored\(/.test(src) && !/arrivalWindow\.date\)?\.toLocaleDateString/.test(src), `S  ${f} labels the stored service date as a calendar day`);
  }
  ok(/serviceDateFromStored\(booking\.arrivalWindow\.date\)/.test(code("lib/jobber.ts")) && /SERVICE_AREA_TIMEZONE = SCHEDULING_TIME_ZONE/.test(code("lib/jobber.ts")),
    "S  the Jobber push reads the service date through the helper, and there is one scheduling zone");
  const { execFileSync } = await import("node:child_process");
  let adHoc = "";
  try { adHoc = execFileSync("git", ["grep", "-nE", "setUTCHours\\(0|toISOString\\(\\)\\.split\\(\"T\"\\)\\[0\\]", "--", "app", "components", "lib"], { encoding: "utf8" }).trim(); }
  catch (e) { if ((e as { status?: number }).status !== 1) throw e; }
  ok(adHoc === "", "S  no ad-hoc midnight or date-splitting copies left in app, components or lib", adHoc);

  console.log("\n  U  ONE ROW PER SERVICE-DATE WINDOW\n");
  await cleanup();
  const c = await prisma.contractor.create({ data: { slug: SLUG, name: "Service date uniqueness probe (TEST)" }, select: { id: true } });
  try {
    const area = await prisma.serviceArea.create({ data: { contractorId: c.id, name: "probe area", zipCodes: ["08201"], active: true }, select: { id: true } });
    const win = (date: Date) => prisma.arrivalWindow.create({ data: { date, startTime: "8:00 AM", endTime: "11:00 AM", serviceAreaId: area.id, capacityTotal: 4 } });
    await win(serviceDateToStored("2030-06-05"));
    let code2 = "";
    try { await win(serviceDateToStored("2030-06-05")); } catch (e) { code2 = (e as { code?: string }).code ?? String(e); }
    ok(code2 === "P2002", `U  a second row for the same service date and window is refused (${code2 || "created!"}) — checkout's retry then finds the first`);
    await win(serviceDateToStored("2030-06-06"));
    ok(await prisma.arrivalWindow.count({ where: { serviceAreaId: area.id } }) === 2, "U  the next day's same window is its own row");
    // Why it matters: the old representation made one row per page load.
    await win(new Date("2030-06-07T14:03:00.000Z")); await win(new Date("2030-06-07T21:24:00.000Z"));
    ok(await prisma.arrivalWindow.count({ where: { serviceAreaId: area.id, date: serviceDateToStored("2030-06-07") } }) === 0,
      "U  contrast: two old-style timestamps for one day made two rows, and neither is found by the service date capacity counts");
  } finally {
    await cleanup();
    ok(await prisma.contractor.count({ where: { slug: SLUG } }) === 0, "   probe contractor removed");
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

async function cleanup() {
  const c = await prisma.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!c) return;
  await prisma.arrivalWindow.deleteMany({ where: { serviceArea: { contractorId: c.id } } });
  await prisma.serviceArea.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
