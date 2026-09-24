/**
 * THE LABOR THAT PRICES A DERIVED JOB IS THE LABOR THAT SCHEDULES IT.
 *
 *   npx tsx scripts/verify-derived-duration.ts
 *
 * Stage 1A's booking stored no crew-hours and no duration although its price
 * was computed from 1.42 known crew-hours: resolveRouteWithDerivedPricing
 * returned the pure resolver's config, whose fieldLaborHours / estimatedMinutes
 * come from the SERVICE record (null for a derived service), and dropped the
 * derived labor. Everything downstream — /api/visit's snapshot, the schedule
 * page, checkout's WINDOW_TOO_LATE rule, Booking.estimatedDurationMinutes —
 * already reads those config fields; they just never received a value.
 *
 * This proves the seam: the derived result carries its crew count with its
 * hours, the resolver fills the config from them, the conversion is the
 * documented conservative one, nothing comes from the price, and a review
 * carries no derived duration. The browser half (windows removed, late window
 * refused, booking snapshot, no Stripe on a no-deposit checkout) is
 * verify-derived-scheduling-browser.ts.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { elapsedMinutesFromCrewHours, DERIVED_PRICING_TECH_COUNT } from "../lib/electrical/derivedScopePricing";
import { resolveRouteWithDerivedPricing } from "../lib/electrical/resolveWithDerivedPricing";
import { proposeDerivedScope } from "../lib/electrical/loadDerivedScope";
import { planNewLine } from "../lib/visitLinePlanning";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { PILOT_ANSWERS } from "../lib/electrical/onboardingPilotReadiness";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { withContractor } from "../lib/tenantRoute";
import { jobFitsWorkday } from "../lib/jobber";
import { visitJobDurationMinutes, windowAvailabilityForDay } from "../lib/schedulingAvailability";
import { buildPricedDerivedContractor, fixtureSlug, removeFixture } from "./_derivedStorefrontFixture";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const SLUG = fixtureSlug("duration");
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function main() {
  console.log("\nDERIVED LABOR → SCHEDULING DURATION\n");

  console.log("  U  THE CONVERSION\n");
  ok(DERIVED_PRICING_TECH_COUNT === 1, "U  derived pricing still prices one crew — no crew selection introduced");
  ok(elapsedMinutesFromCrewHours(1, 1) === 60, "U  1 crew-hour, 1 crew → 60 min");
  ok(elapsedMinutesFromCrewHours(1, 2) === 30, "U  1 crew-hour, 2 crew → 30 min elapsed");
  ok(elapsedMinutesFromCrewHours(0.62 + 0.6 + 0.2, 1) === 86, "U  1.42 crew-hours = 85.2 min → 86: a fractional minute rounds UP (never under-allocate)");
  ok(elapsedMinutesFromCrewHours(200 * 0.02 + 0.6 + 0.2, 1) === 288, "U  4.8 crew-hours → 288, not 289: floating-point noise (288.00000000000006) adds no minute");
  ok(elapsedMinutesFromCrewHours(0, 1) === 0, "U  zero labor → 0");
  let threw = 0;
  for (const [h, t] of [[-1, 1], [1, 0], [Number.NaN, 1]] as const) { try { elapsedMinutesFromCrewHours(h, t); } catch { threw++; } }
  ok(threw === 3, "U  negative hours, zero crew and NaN are refused, not converted");

  console.log("\n  S  THE SEAM, AND ONLY THE SEAM\n");
  const resolver = code("lib/electrical/resolveWithDerivedPricing.ts");
  ok(/fieldLaborHours: priced\.laborHours,/.test(resolver) && /techCount: priced\.techCount,/.test(resolver)
    && /estimatedMinutes: elapsedMinutesFromCrewHours\(priced\.laborHours, priced\.techCount\),/.test(resolver),
    "S  PRICED fills fieldLaborHours, techCount and estimatedMinutes from the derived pricing result");
  const configBlock = resolver.slice(resolver.indexOf("config: {"), resolver.indexOf("},", resolver.indexOf("config: {")));
  ok(!/totalCents|priceCents|breakdown/.test(configBlock), "S  …and nothing in that config comes from the price", configBlock);
  const pricing = code("lib/electrical/derivedScopePricing.ts");
  ok(/techCount,\n\s*components: \[\],/.test(pricing) && /laborHours,\n\s*techCount,\n\s*\};/.test(pricing),
    "S  the crew count returned is the SAME one handed to compute() for the price");
  const visit = code("app/api/visit/route.ts");
  ok(/resolvedCrewHours: resolved\.config\.fieldLaborHours,/.test(visit) && /resolvedCrewCount: resolved\.config\.techCount,/.test(visit)
    && /estimatedMinutes: resolved\.config\.estimatedMinutes,/.test(visit),
    "S  /api/visit already snapshots those config fields — it needed no change");
  ok(/li\.estimatedMinutes/.test(code("app/api/checkout/deposit/route.ts")), "S  the deposit route still sums line estimatedMinutes itself — deposit behavior untouched");

  console.log("\n  A  ONE DURATION, ONE FIT RULE — FIRST DAY, LATER DAYS, CHECKOUT\n");
  ok(visitJobDurationMinutes([]) === null && visitJobDurationMinutes([{ estimatedMinutes: 288 }]) === 288
    && visitJobDurationMinutes([{ estimatedMinutes: 86 }, { estimatedMinutes: 288 }]) === 374
    && visitJobDurationMinutes([{ estimatedMinutes: 86 }, { estimatedMinutes: null }]) === null,
    "A  visit duration = sum of line minutes; null when empty or any line has none");
  const availRoute = code("app/api/availability/[dateISO]/route.ts");
  for (const f of ["app/api/checkout/route.ts", "app/[site]/checkout/schedule/page.tsx", "app/api/availability/[dateISO]/route.ts"]) {
    const src = code(f);
    ok(/visitJobDurationMinutes\(/.test(src) && !/li\.estimatedMinutes/.test(src), `A  ${f} reads the job length through visitJobDurationMinutes, not its own sum`);
  }
  ok(/getSessionId\(\)/.test(availRoute) && /status: "OPEN"/.test(availRoute) && /windowAvailabilityForDay\([\s\S]*?estimatedDurationMinutes\)/.test(availRoute)
    && !/searchParams|duration=|"duration"/.test(availRoute),
    "A  /api/availability applies the OPEN visit's duration, read-only, and ignores anything the request says about length");
  ok(!/searchParams\.set\("duration"/.test(code("components/checkout/ScheduleClient.tsx")), "A  the schedule client no longer sends a duration for the server to ignore");
  const jobber = code("lib/jobber.ts"), scheduling = code("lib/schedulingAvailability.ts"), checkout = code("app/api/checkout/route.ts");
  ok((jobber.match(/workdayEnd\.getTime\(\)/g) ?? []).length === 1 && !/workdayEnd/.test(scheduling) && !/workdayEnd/.test(checkout),
    "A  the end-of-day comparison exists once — inside jobFitsWorkday");
  ok(/jobFitsWorkday\(dateISO, w, dayEnd, estimatedDurationMinutes\)/.test(jobber) && /jobFitsWorkday\(dateISO, w, schedule\.dayEndDisplay, estimatedDurationMinutes\)/.test(scheduling)
    && /if \(!jobFitsWorkday\(dateISO, \{ start: windowStart, end: windowEnd \}, toDisplay\(toMinutes\(businessHours\.dayEnd\)\), estimatedDurationMinutes\)\)[\s\S]{0,80}WINDOW_TOO_LATE/.test(checkout),
    "A  Jobber availability, native availability and checkout's WINDOW_TOO_LATE all call it");
  const DAY = "2030-06-05", END = "4:30 PM";
  const W = [{ start: "8:00 AM", end: "11:00 AM" }, { start: "11:00 AM", end: "2:00 PM" }, { start: "2:00 PM", end: "4:30 PM" }];
  ok(JSON.stringify(W.map((w) => jobFitsWorkday(DAY, w, END, 288))) === "[true,true,false]", "A  288 min: fits from 8:00 and 11:00, not from 2:00 (ends 6:48 PM)");
  ok(JSON.stringify(W.map((w) => jobFitsWorkday(DAY, w, END, 86))) === "[true,true,true]" && JSON.stringify(W.map((w) => jobFitsWorkday(DAY, w, END, null))) === "[true,true,true]",
    "A  86 min or no known length: 2:00 fits (ends 3:26 PM / window end)");
  ok(jobFitsWorkday(DAY, W[2], END, 150) && !jobFitsWorkday(DAY, W[2], END, 151), "A  boundary: 2:00 + 150 min ends exactly 4:30 and fits; 151 does not");
  const depositUi = code("app/[site]/checkout/details/DepositPayment.tsx");
  ok(/import \{ loadStripe \} from "@stripe\/stripe-js\/pure";/.test(depositUi), "S  Stripe's loader comes from the pure entry (no load on import)");
  const { execFileSync } = await import("node:child_process");
  let defaultImports = "";
  // git grep exits 1 when nothing matches — the passing case.
  try { defaultImports = execFileSync("git", ["grep", "-lE", "from ['\"]@stripe/stripe-js['\"]", "--", "app", "components", "lib"], { encoding: "utf8" }).trim(); }
  catch (e) { if ((e as { status?: number }).status !== 1) throw e; }
  ok(defaultImports === "", "S  …and the default, script-injecting entry is imported nowhere in app, components or lib", defaultImports);

  await removeFixture(prisma, SLUG);
  try {
    console.log("\n  D  ON A REAL REHEARSAL CONTRACTOR\n");
    const f = await buildPricedDerivedContractor(prisma, SLUG);
    const loaded = await loadServiceForResolution(prisma, f.serviceId);
    const settings = await loadPricingSettings(prisma, f.contractorId);
    const asSite = <T>(fn: (db: never) => Promise<T>) => withContractor(f.contractorId, "site-identifier", (db) => fn(db as never));
    const route = (feet: string, extra: Record<string, string> = {}) => ({ ...PILOT_ANSWERS, [SURFACE_KEYS.feet]: feet, ...extra });

    for (const feet of ["31", "200"]) {
      const answers = route(feet);
      const components = ((resolveRoute(loaded as never, answers, true, settings) as any).config.components) as { key: string; quantity: number }[];
      const { proposal } = await asSite((db) => proposeDerivedScope(db, { contractorId: f.contractorId, serviceId: f.serviceId,
        components, routeFeet: Number(feet), turnCount: 0,
        context: { isPrimary: true, isPrimaryEligible: true, servicePermitAdminEstablished: false },
        service: { materialMultiplier: null, permitAdminCents: null, otherDirectCostCents: null, isPrimaryEligible: true } }));
      if (proposal.kind !== "PRICED") throw new Error(`${feet} ft pricing proposal was ${proposal.kind}`);
      const expectedHours = proposal.laborHours;
      const v: any = await asSite((db) => resolveRouteWithDerivedPricing(db, loaded as never, answers, true, settings));
      ok(v.status === "PRICED" && Math.abs(v.config.fieldLaborHours - expectedHours) < 1e-9,
        `D  ${feet} ft: PRICED with fieldLaborHours = the approved atomic labor used by pricing (${expectedHours.toFixed(2)} crew-hours)`, JSON.stringify(v.config?.fieldLaborHours));
      ok(v.config.techCount === proposal.techCount, `D  ${feet} ft: techCount = ${proposal.techCount}, the crew the price used`);
      ok(v.config.estimatedMinutes === elapsedMinutesFromCrewHours(expectedHours, proposal.techCount), `D  ${feet} ft: estimatedMinutes = ${v.config.estimatedMinutes}`, JSON.stringify(v.config.estimatedMinutes));
      ok(proposal.laborHours === v.config.fieldLaborHours && proposal.techCount === v.config.techCount,
        `D  ${feet} ft: the scheduling fields equal the labor and crew the price was computed from`);
      const plan = await asSite((db) => planNewLine(db, { contractorId: f.contractorId, service: loaded as never, answersSnapshot: answers, existing: [] }));
      ok(plan.kind === "PLACED" && (plan.resolved as any).config.estimatedMinutes === v.config.estimatedMinutes && (plan.resolved as any).config.fieldLaborHours === v.config.fieldLaborHours,
        `D  ${feet} ft: /api/visit's plan receives the same duration it snapshots`);
    }

    console.log("\n  N  NATIVE AVAILABILITY, SERVER-SIDE, NAMES WHY A WINDOW IS WITHHELD\n");
    await prisma.contractor.update({ where: { id: f.contractorId }, data: { schedulingAuthority: "NATIVE", nativeConcurrentJobs: 1 } });
    const sched = { windows: W, dayEndDisplay: END };
    const long = await asSite((db) => windowAvailabilityForDay(db as never, f.contractorId, DAY, sched, 288));
    ok(JSON.stringify(long.map((w) => [w.start, w.available, w.unavailableReason ?? null])) === JSON.stringify([["8:00 AM", true, null], ["11:00 AM", true, null], ["2:00 PM", false, "NOT_ENOUGH_TIME"]]),
      "N  288 min on an empty day → 8:00 and 11:00 offered, 2:00 withheld as NOT_ENOUGH_TIME (not FULL)", JSON.stringify(long));
    const none = await asSite((db) => windowAvailabilityForDay(db as never, f.contractorId, DAY, sched, null));
    ok(none.every((w) => w.available && !w.unavailableReason), "N  no known length → every window offered", JSON.stringify(none));
    ok(long.every((w) => w.available === jobFitsWorkday(DAY, w, END, 288)), "N  on an empty day, offered ⇔ checkout's rule accepts it — for every window");

    const turned: any = await asSite((db) => resolveRouteWithDerivedPricing(db, loaded as never, route("31", { [SURFACE_KEYS.inside]: "2" }), true, settings));
    const svc = await prisma.service.findUniqueOrThrow({ where: { id: f.serviceId }, select: { estimatedMinutes: true, fieldLaborHours: true } });
    ok(turned.status === "REVIEW" && (turned.config?.estimatedMinutes ?? null) === svc.estimatedMinutes && (turned.config?.fieldLaborHours ?? null) === svc.fieldLaborHours,
      "D  a REVIEW route carries no derived duration — only a priced job's labor becomes scheduling time", JSON.stringify(turned.config ? { m: turned.config.estimatedMinutes, h: turned.config.fieldLaborHours } : null));
  } finally {
    await removeFixture(prisma, SLUG);
    ok(await prisma.contractor.count({ where: { slug: SLUG } }) === 0, "   the fixture contractor this run created is gone");
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await removeFixture(prisma, SLUG).catch(() => {}); await prisma.$disconnect(); process.exit(1); });
