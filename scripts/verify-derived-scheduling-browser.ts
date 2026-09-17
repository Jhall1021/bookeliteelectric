/**
 * A DERIVED JOB IS SCHEDULED FOR THE LABOR IT WAS PRICED WITH — IN THE BROWSER.
 * AND A CHECKOUT WITH NOTHING TO PAY NEVER TALKS TO STRIPE.
 *
 *   npx next build && npx tsx scripts/verify-derived-scheduling-browser.ts
 *
 * Drives the storefront a homeowner uses — service intro, questions, Add to My
 * Visit, Choose My Appointment Time, the details form — against a production
 * build of this tree (`next start`, started and stopped here, or BASE_URL).
 *
 * A 200 ft straight surface route is 4.8 crew-hours for one crew = 288 minutes.
 * With default business hours (8:00 AM – 4:30 PM, three arrival windows) that
 * job fits from 8:00 and 11:00, and would run to 6:48 PM from 2:00. No special
 * scheduling rule is involved: this is the existing end-of-day rule, finally
 * given a duration.
 *
 * Proves:
 *   D  the stored line carries crew-hours, crew count and estimatedMinutes
 *   W  native scheduling offers 8:00 and 11:00 and withholds 2:00 for this job
 *      on the server-rendered first day AND on every later day's tab (which
 *      re-asks /api/availability), labelled "Not enough time available", never
 *      "Fully booked"; every window offered is one checkout's rule accepts
 *      (the same day, asked with no visit, offers 2:00 — the job did it)
 *   L  checkout refuses the 2:00 window with WINDOW_TOO_LATE and books nothing,
 *      through the form and as a direct POST for a later day
 *   C  THE REAL BOOKING CONSUMES CAPACITY (one job per window): its
 *      ArrivalWindow carries the canonical service date; that day's 8:00 is
 *      FULL on the server and "Fully booked" on screen, first day and via the
 *      API; a second homeowner's attempt is refused through the form and as a
 *      direct POST; no duplicate ArrivalWindow row exists; with room for two,
 *      the second real booking joins the SAME row. A short job (31 ft, 86 min)
 *      is still offered 2:00 — it genuinely fits.
 *   B  the booking made through the form snapshots the 288-minute duration
 *   N  that whole no-deposit checkout contacts no js.stripe.com, m.stripe.com
 *      or m.stripe.network
 *   P  when a deposit IS due, the deposit UI still asks for Stripe.js
 *
 * P's LIMITATION: the deposit state is supplied by intercepting
 * /api/checkout/deposit with a syntactically-shaped fake publishable key and
 * account, and the Stripe.js request is aborted in the browser. No Stripe
 * credential exists in this environment and none is introduced for this test.
 * What P proves is the loader invocation — that the pure entry still fetches
 * Stripe.js when the card field mounts — not that a card can be authorized.
 *
 * Rehearsal database only. The fixture contractor is `rv2-pilot-rehearsal-*`;
 * everything it booked is removed at the end, also on failure.
 */
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page, type Request } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { liveEndpointOf, resetRefusal, PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { buildPricedDerivedContractor, fixtureSlug, removeFixture } from "./_derivedStorefrontFixture";
import { jobFitsWorkday } from "../lib/jobber";
import { windowAvailabilityForDay } from "../lib/schedulingAvailability";
import { isServiceDate, serviceDateToStored } from "../lib/serviceDate";
import { withContractor } from "../lib/tenantRoute";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const SLUG = fixtureSlug("schedule");
const PORT = Number(process.env.SFB_PORT ?? 3437);
const EXTERNAL = process.env.BASE_URL;
const BASE = EXTERNAL ?? `http://127.0.0.1:${PORT}`;
const ZIP = "08201";
const STRIPE_HOSTS = ["js.stripe.com", "m.stripe.com", "m.stripe.network"];
const stripeHostOf = (url: string) => { try { const h = new URL(url).hostname; return STRIPE_HOSTS.find((s) => h === s || h.endsWith(`.${s}`)) ?? null; } catch { return null; } };

const SELECT: [RegExp, RegExp][] = [
  [/What will you be plugging in/i, /^Everyday things/],
  [/How would you like it powered/i, /^From the nearest outlet/],
  [/Is there a basement/i, /^No$/],
  [/How would you like the wiring run/i, /^Surface-mounted channel on the wall/],
  [/What is the wall made of/i, /^Drywall$/],
  [/Is anything in the way/i, /^No — it.s a clear run along the wall/],
];
const NUMBER = (feet: string): [RegExp, string][] => [
  [/How long is the route, in feet/i, feet], [/How many inside corners/i, "0"],
  [/How many outside corners/i, "0"], [/How many turns stay flat on the wall/i, "0"],
];
const WINDOW_RE = /\d{1,2}:\d\d [AP]M – \d{1,2}:\d\d [AP]M/;
const DAY_END = "4:30 PM";   // default business hours
type Shown = Record<string, { enabled: boolean; badge: string }>;

/** What the schedule screen currently offers: each window, whether it can be chosen, and its label. */
async function readWindows(page: Page): Promise<Shown> {
  const buttons = page.locator("main button").filter({ hasText: WINDOW_RE });
  await buttons.first().waitFor({ timeout: 15000 });
  const shown: Shown = {};
  for (const b of await buttons.all()) {
    const text = ((await b.textContent()) ?? "").trim();
    const label = text.match(WINDOW_RE)![0];
    shown[label] = { enabled: await b.isEnabled(), badge: text.slice(text.indexOf(label) + label.length).trim() };
  }
  return shown;
}

/** Click a day tab and wait for ITS availability answer, not a guess at timing. */
async function openDay(page: Page, i: number): Promise<{ dateISO: string; label: string; body: any }> {
  const tab = page.locator("main div.flex button").nth(i);
  const [res] = await Promise.all([
    page.waitForResponse((r) => /\/api\/availability\/\d{4}-\d\d-\d\d/.test(r.url()), { timeout: 30000 }),
    tab.click(),
  ]);
  const body = await res.json().catch(() => null);
  await page.getByText("Checking real-time availability...").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
  return { dateISO: new URL(res.url()).pathname.split("/").pop()!, label: ((await tab.textContent()) ?? "").trim(), body };
}

async function startServer(): Promise<ChildProcess | null> {
  if (EXTERNAL) return null;
  if (!existsSync(".next/BUILD_ID")) throw new Error("No production build — run `npx next build` first.");
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(PORT), NEXT_TELEMETRY_DISABLED: "1",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex") };
  // A booking is made here. No mail provider is reachable from this server, so
  // the confirmation email fails closed inside checkout's own catch.
  delete env.RESEND_API_KEY; delete env.PLATFORM_RESEND_API_KEY;
  const child = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stderr?.on("data", (d) => { const t = String(d); if (/error/i.test(t) && !/RESEND_API_KEY|Confirmation email failed/.test(t)) process.stderr.write(`[next] ${t}`); });
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status < 500) return child; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill("SIGTERM");
  throw new Error("next start did not come up within 90s");
}

/** Service intro → terminal price card → Add to My Visit, as a homeowner. */
async function priceAndAdd(page: Page, servicePath: string, feet: string) {
  await page.goto(`${BASE}${servicePath}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Check My Price/i }).click();
  for (let i = 0; i < 20; i++) {
    const heading = page.locator("h1, h2").filter({ hasText: /\?|price this remotely/ }).first();
    const add = page.getByRole("button", { name: /Add to My Visit/i });
    await Promise.race([heading.waitFor({ timeout: 15000 }).catch(() => {}), add.waitFor({ timeout: 15000 }).catch(() => {})]);
    const checking = page.getByText("Checking whether we can price this online…");
    if (await checking.count()) { await checking.waitFor({ state: "detached", timeout: 30000 }); continue; }
    if (await add.count()) { await add.click(); await page.waitForURL(/my-visit/, { timeout: 60000 }); return "PRICED"; }
    const text = (await heading.textContent().catch(() => "")) ?? "";
    if (/price this remotely/i.test(text)) return "REVIEW";
    const num = NUMBER(feet).find(([re]) => re.test(text));
    const input = page.locator("textarea").first();
    if (num && await input.count()) { await input.fill(num[1]); await page.getByRole("button", { name: "Continue", exact: true }).click(); await page.waitForTimeout(300); continue; }
    const sel = SELECT.find(([re]) => re.test(text));
    if (sel) { await page.getByRole("button", { name: sel[1] }).first().click(); await page.waitForTimeout(300); continue; }
    throw new Error(`unrecognized step: "${text}"`);
  }
  return "OTHER";
}

/** The details form's inputs carry no associated labels (a recorded finding), so they are filled in order. */
async function fillDetails(page: Page, email: string) {
  const inputs = page.locator("form input");
  await inputs.first().waitFor({ timeout: 15000 });
  const values = ["Duration Proof (TEST)", email, "6095550100", "1 Rehearsal Way", ZIP];
  for (let i = 0; i < values.length; i++) await inputs.nth(i).fill(values[i]);
}

async function removeBooked(contractorId: string) {
  const where = { booking: { visit: { contractorId } } };
  await prisma.paymentEvent.deleteMany({ where });
  await prisma.bookingAdjustment.deleteMany({ where });
  await prisma.troubleshootingSession.deleteMany({ where });
  await prisma.booking.deleteMany({ where: { visit: { contractorId } } });   // appointments, pre-work visit cascade
  await prisma.lineItem.deleteMany({ where: { visit: { contractorId } } });
  await prisma.visit.deleteMany({ where: { contractorId } });
  await prisma.customer.deleteMany({ where: { contractorId } });
  await prisma.arrivalWindow.deleteMany({ where: { serviceArea: { contractorId } } });
  await prisma.serviceArea.deleteMany({ where: { contractorId } });
}

async function teardown() {
  if (!SLUG.startsWith(PILOT_REHEARSAL_PREFIX)) throw new Error(`refusing to tear down ${SLUG}`);
  const c = await prisma.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (c) await removeBooked(c.id);
  await removeFixture(prisma, SLUG);
}

async function main() {
  console.log("\nDERIVED DURATION → NATIVE SCHEDULING → CHECKOUT, AND STRIPE ONLY WHEN PAID\n");
  const identity = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" }, select: { key: true, neonEndpoint: true } });
  const guard = resetRefusal({ slug: SLUG, identity, liveEndpoint: liveEndpointOf(process.env.DATABASE_URL ?? "") });
  if (guard) { console.log(`  STOP: ${guard.code} — this suite runs on a rehearsal database only.`); process.exit(2); }

  let server: ChildProcess | null = null;
  let browser: Browser | null = null;
  await teardown();
  try {
    server = await startServer();
    browser = await chromium.launch();
    const f = await buildPricedDerivedContractor(prisma, SLUG);
    // Fixture scheduling state, exactly what a contractor sets in setup: our own
    // calendar with one job per window, and a service area. Default business hours.
    await prisma.contractor.update({ where: { id: f.contractorId }, data: { schedulingAuthority: "NATIVE", nativeConcurrentJobs: 1 } });
    await prisma.serviceArea.create({ data: { contractorId: f.contractorId, name: "rehearsal area", zipCodes: [ZIP], active: true } });
    ok(await prisma.businessHours.count({ where: { contractorId: f.contractorId } }) === 0, "   fixture uses default business hours — no special scheduling rule");

    const pilot = await prisma.service.findUniqueOrThrow({ where: { id: f.serviceId }, select: { slug: true, contractorCategoryId: true } });
    const category = await prisma.contractorCategory.findUniqueOrThrow({ where: { id: pilot.contractorCategoryId! }, select: { canonicalCategory: { select: { slug: true } } } });
    const servicePath = `/${SLUG}/services/${category.canonicalCategory.slug}/${pilot.slug}`;

    const ctx: BrowserContext = await browser.newContext();
    const stripeHits: string[] = [];
    ctx.on("request", (r: Request) => { if (stripeHostOf(r.url())) stripeHits.push(r.url()); });
    const page = await ctx.newPage();

    console.log("  D  THE STORED LINE CARRIES THE DERIVED LABOR\n");
    ok(await priceAndAdd(page, servicePath, "200") === "PRICED", "D  200 ft straight route → priced → Add to My Visit");
    const line = await prisma.lineItem.findFirst({ where: { visit: { contractorId: f.contractorId }, serviceId: f.serviceId },
      select: { resolvedCrewHours: true, resolvedCrewCount: true, estimatedMinutes: true, computedPriceCents: true } });
    ok(!!line && Math.abs((line.resolvedCrewHours ?? -1) - 4.8) < 1e-9, `D  resolvedCrewHours = ${line?.resolvedCrewHours}`, JSON.stringify(line));
    ok(line?.resolvedCrewCount === 1, `D  resolvedCrewCount = ${line?.resolvedCrewCount}`);
    ok(line?.estimatedMinutes === 288, `D  estimatedMinutes = ${line?.estimatedMinutes} (4.8 h ÷ 1 crew × 60)`);

    console.log("\n  W  NATIVE SCHEDULING WITHHOLDS THE WINDOW THE JOB CANNOT FINISH IN — EVERY DAY\n");
    await page.getByRole("button", { name: "Choose My Appointment Time" }).click();
    await page.waitForURL(/checkout\/schedule/, { timeout: 30000 });
    await page.getByRole("heading", { name: "Select an Arrival Window" }).waitFor({ timeout: 30000 });
    const LATE = "2:00 PM – 4:30 PM", NOT_ENOUGH = "Not enough time available";
    const first = await readWindows(page);
    ok(first["8:00 AM – 11:00 AM"]?.enabled === true && first["11:00 AM – 2:00 PM"]?.enabled === true, "W  first day (server-rendered): 8:00 AM and 11:00 AM are offered (288 min ends 12:48 PM / 3:48 PM)", JSON.stringify(first));
    ok(first[LATE]?.enabled === false, "W  first day: 2:00 PM is not offered — 288 minutes would run to 6:48 PM, past 4:30 PM", JSON.stringify(first));
    ok(first[LATE]?.badge === NOT_ENOUGH, `W  first day: it reads "${first[LATE]?.badge}", not "Fully booked"`, JSON.stringify(first));

    const tabCount = await page.locator("main div.flex button").count();
    ok(tabCount >= 2, `W  the schedule offers ${tabCount} working days to move between`);
    const days: { dateISO: string; label: string }[] = [];
    const agreeWithCheckout: string[] = [];
    let laterDayApi: any = null;
    for (let i = 1; i < tabCount; i++) {
      const day = await openDay(page, i);
      days.push(day);
      if (i === 1) laterDayApi = day.body;
      const shown = await readWindows(page);
      ok(shown["8:00 AM – 11:00 AM"]?.enabled === true && shown["11:00 AM – 2:00 PM"]?.enabled === true && shown[LATE]?.enabled === false && shown[LATE]?.badge === NOT_ENOUGH,
        `W  later day ${day.label} (/api/availability/${day.dateISO}): 8:00 and 11:00 offered, 2:00 PM withheld as "${shown[LATE]?.badge}"`, JSON.stringify(shown));
      for (const [label, w] of Object.entries(shown)) {
        const [start, end] = label.split(" – ");
        if (w.enabled && !jobFitsWorkday(day.dateISO, { start, end }, DAY_END, 288)) agreeWithCheckout.push(`${day.dateISO} ${label}`);
      }
    }
    ok(agreeWithCheckout.length === 0, "W  no later-day window offered is one checkout would refuse for length", agreeWithCheckout.join(", "));
    ok((laterDayApi?.windows ?? []).find((w: any) => w.start === "2:00 PM")?.unavailableReason === "NOT_ENOUGH_TIME",
      "W  the later-day API answer itself names NOT_ENOUGH_TIME — the server decided, not the browser", JSON.stringify(laterDayApi));

    // Back to the first day, which is now answered by the API too.
    const again = await openDay(page, 0);
    const againShown = await readWindows(page);
    ok(againShown[LATE]?.enabled === false && againShown[LATE]?.badge === NOT_ENOUGH, `W  first day re-asked through the tab (${again.label}): the same answer as the server render`, JSON.stringify(againShown));

    // Control: the same later day asked with NO visit (no session) has no known job length.
    const noVisit = await (await fetch(`${BASE}/api/availability/${days[0].dateISO}`, { headers: { "x-price2book-site": f.publicId } })).json();
    const noVisitLate = (noVisit.windows ?? []).find((w: any) => w.start === "2:00 PM");
    ok(noVisitLate?.available === true && !noVisitLate.unavailableReason, `W  control: ${days[0].label} asked with no visit offers 2:00 PM — the job's length is what withheld it`, JSON.stringify(noVisit));
    ok(await prisma.booking.count({ where: { visit: { contractorId: f.contractorId } } }) === 0, "W  …and nothing was booked, so capacity did not withhold it");

    await page.getByRole("button", { name: "8:00 AM – 11:00 AM" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(/checkout\/details/, { timeout: 30000 });
    const detailsUrl = page.url();
    const dateISO = new URL(detailsUrl).searchParams.get("date")!;
    ok(isServiceDate(dateISO) && dateISO === again.dateISO, `W  the chosen day travels to checkout as the service date itself, ${dateISO}`);

    console.log("\n  L  CHECKOUT REFUSES THE LATE WINDOW\n");
    const late = new URL(detailsUrl); late.searchParams.set("windowStart", "2:00 PM"); late.searchParams.set("windowEnd", "4:30 PM");
    await page.goto(late.toString(), { waitUntil: "networkidle" });
    await fillDetails(page, "duration-proof@example.invalid");
    const [lateRes] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST", { timeout: 60000 }),
      page.getByRole("button", { name: "Confirm Appointment" }).click(),
    ]);
    const lateBody = await lateRes.json().catch(() => null);
    ok(lateRes.status() === 409 && lateBody?.error === "WINDOW_TOO_LATE", `L  POST /api/checkout for 2:00 PM → ${lateRes.status()} ${lateBody?.error}`, JSON.stringify(lateBody));
    // Checkout is authoritative on its own: a direct POST, not through any screen, for a later day's late window.
    const direct = await page.request.post(`${BASE}/api/checkout`, { headers: { "x-price2book-site": f.publicId, "content-type": "application/json" },
      data: { name: "Duration Proof (TEST)", email: "duration-proof@example.invalid", phone: "6095550100", address: "1 Rehearsal Way", zipCode: ZIP,
              date: days[0].dateISO, windowStart: "2:00 PM", windowEnd: "4:30 PM" } });
    const directBody = await direct.json().catch(() => null);
    ok(direct.status() === 409 && directBody?.error === "WINDOW_TOO_LATE", `L  direct POST /api/checkout for ${days[0].label} 2:00 PM → ${direct.status()} ${directBody?.error}`, JSON.stringify(directBody));
    // A timestamp is not a service date: refused before anything is written (a stale pre-fix tab, or a hand-built request).
    const stamp = await page.request.post(`${BASE}/api/checkout`, { headers: { "x-price2book-site": f.publicId, "content-type": "application/json" },
      data: { name: "Duration Proof (TEST)", email: "duration-proof@example.invalid", phone: "6095550100", address: "1 Rehearsal Way", zipCode: ZIP,
              date: `${dateISO}T21:24:21.606Z`, windowStart: "8:00 AM", windowEnd: "11:00 AM" } });
    ok(stamp.status() === 400 && (await stamp.json().catch(() => null))?.error === "INVALID_SERVICE_DATE", `L  a timestamp instead of a service date → ${stamp.status()} INVALID_SERVICE_DATE`);
    ok(await prisma.booking.count({ where: { visit: { contractorId: f.contractorId } } }) === 0
      && await prisma.customer.count({ where: { contractorId: f.contractorId } }) === 0, "L  …no booking and no customer were created");

    console.log("\n  B  THE BOOKING SNAPSHOTS THE DURATION\n");
    await page.goto(detailsUrl, { waitUntil: "networkidle" });
    await page.getByText("Nothing to pay now").waitFor({ timeout: 15000 }).catch(() => {});
    ok(await page.getByText("Nothing to pay now").count() > 0, "N  the details form renders the no-deposit state");
    await fillDetails(page, "duration-proof@example.invalid");
    const [bookRes] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST", { timeout: 60000 }),
      page.getByRole("button", { name: "Confirm Appointment" }).click(),
    ]);
    const bookBody = await bookRes.json().catch(() => null);
    await page.waitForURL(/checkout\/confirmation\//, { timeout: 60000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    ok(bookRes.status() === 200 && !!bookBody?.bookingId && /checkout\/confirmation\//.test(page.url()), "B  8:00 AM books and lands on the confirmation page", JSON.stringify({ s: bookRes.status(), bookBody, url: page.url() }));
    const booking = bookBody?.bookingId ? await prisma.booking.findUnique({ where: { id: bookBody.bookingId },
      select: { estimatedDurationMinutes: true, totalCents: true, arrivalWindow: { select: { startTime: true } } } }) : null;
    ok(booking?.estimatedDurationMinutes === 288, `B  Booking.estimatedDurationMinutes = ${booking?.estimatedDurationMinutes}`, JSON.stringify(booking));
    ok(booking?.totalCents === line?.computedPriceCents && booking?.arrivalWindow?.startTime === "8:00 AM", "B  …at the priced total, in the 8:00 AM window", JSON.stringify({ booking, line }));

    console.log("\n  N  NO DEPOSIT, NO STRIPE\n");
    for (const host of STRIPE_HOSTS) {
      const hits = stripeHits.filter((u) => stripeHostOf(u) === host);
      ok(hits.length === 0, `N  ${host}: ${hits.length} requests across the storefront, schedule, both details loads and confirmation`, hits.join(" "));
    }
    await ctx.close();

    console.log("\n  C  A REAL STOREFRONT BOOKING CONSUMES NATIVE CAPACITY\n");
    const asSite = <T>(fn: (db: never) => Promise<T>) => withContractor(f.contractorId, "site-identifier", (db) => fn(db as never));
    const sched = { windows: [{ start: "8:00 AM", end: "11:00 AM" }, { start: "11:00 AM", end: "2:00 PM" }, { start: "2:00 PM", end: DAY_END }], dayEndDisplay: DAY_END };
    const realWindow = await prisma.booking.findUniqueOrThrow({ where: { id: bookBody.bookingId }, select: { arrivalWindow: { select: { id: true, date: true, serviceAreaId: true } } } });
    ok(realWindow.arrivalWindow.date.toISOString() === serviceDateToStored(dateISO).toISOString(),
      `C  the checkout-created ArrivalWindow stores the canonical service date ${realWindow.arrivalWindow.date.toISOString()} for ${dateISO}`);
    const eightAm = { serviceAreaId: realWindow.arrivalWindow.serviceAreaId, date: serviceDateToStored(dateISO), startTime: "8:00 AM", endTime: "11:00 AM" };
    const serverLong = await asSite((db) => windowAvailabilityForDay(db, f.contractorId, dateISO, sched, 288));
    ok(JSON.stringify(serverLong.map((w) => [w.start, w.available, w.unavailableReason ?? null])) === JSON.stringify([["8:00 AM", false, "FULL"], ["11:00 AM", true, null], ["2:00 PM", false, "NOT_ENOUGH_TIME"]]),
      "C  server: that day, a 288-min job sees 8:00 FULL (the real booking), 11:00 offered, 2:00 NOT_ENOUGH_TIME", JSON.stringify(serverLong));
    const serverNone = await asSite((db) => windowAvailabilityForDay(db, f.contractorId, dateISO, sched, null));
    ok(serverNone[0].unavailableReason === "FULL" && serverNone[1].available && serverNone[2].available, "C  server: with no job length, only 8:00 is unavailable — FULL", JSON.stringify(serverNone));

    const cctx = await browser.newContext();
    const cpage = await cctx.newPage();
    ok(await priceAndAdd(cpage, servicePath, "31") === "PRICED", "C  a second homeowner prices a 31 ft straight route → Add to My Visit");
    const shortLine = await prisma.lineItem.findFirst({ where: { visit: { contractorId: f.contractorId, status: "OPEN" }, serviceId: f.serviceId }, select: { estimatedMinutes: true } });
    ok(shortLine?.estimatedMinutes === 86, `C  …its line carries ${shortLine?.estimatedMinutes} minutes`);
    await cpage.getByRole("button", { name: "Choose My Appointment Time" }).click();
    await cpage.getByRole("heading", { name: "Select an Arrival Window" }).waitFor({ timeout: 30000 });
    const booked = await readWindows(cpage);
    ok(booked["8:00 AM – 11:00 AM"]?.enabled === false && booked["8:00 AM – 11:00 AM"]?.badge === "Fully booked",
      `C  first day (server-rendered) ${again.label} 8:00 AM reads "${booked["8:00 AM – 11:00 AM"]?.badge}"`, JSON.stringify(booked));
    ok(booked[LATE]?.enabled === true && booked["11:00 AM – 2:00 PM"]?.enabled === true, "C  …while 11:00 and 2:00 PM are offered to a job that genuinely fits (86 min ends 3:26 PM)", JSON.stringify(booked));
    await openDay(cpage, 1);
    const shortLater = await readWindows(cpage);
    ok(Object.values(shortLater).every((w) => w.enabled), `C  later day ${days[0].label}: nothing booked there, every window offered`, JSON.stringify(shortLater));
    await openDay(cpage, 0);
    const bookedViaApi = await readWindows(cpage);
    ok(bookedViaApi["8:00 AM – 11:00 AM"]?.enabled === false && bookedViaApi["8:00 AM – 11:00 AM"]?.badge === "Fully booked", "C  the same day re-asked through its tab (/api/availability) is still \"Fully booked\"", JSON.stringify(bookedViaApi));

    const fullUrl = `${BASE}/${SLUG}/checkout/details?${new URLSearchParams({ date: dateISO, windowStart: "8:00 AM", windowEnd: "11:00 AM" })}`;
    await cpage.goto(fullUrl, { waitUntil: "networkidle" });
    await fillDetails(cpage, "capacity-proof@example.invalid");
    const [takenRes] = await Promise.all([
      cpage.waitForResponse((r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST", { timeout: 60000 }),
      cpage.getByRole("button", { name: "Confirm Appointment" }).click(),
    ]);
    const takenBody = await takenRes.json().catch(() => null);
    ok(takenRes.status() === 409 && /just taken/.test(takenBody?.error ?? ""), `C  the second homeowner submitting the full 8:00 AM window → ${takenRes.status()} "${takenBody?.error}"`, JSON.stringify(takenBody));
    const takenDirect = await cpage.request.post(`${BASE}/api/checkout`, { headers: { "x-price2book-site": f.publicId, "content-type": "application/json" },
      data: { name: "Capacity Proof (TEST)", email: "capacity-proof@example.invalid", phone: "6095550101", address: "2 Rehearsal Way", zipCode: ZIP, date: dateISO, windowStart: "8:00 AM", windowEnd: "11:00 AM" } });
    ok(takenDirect.status() === 409, `C  …and a direct POST for it → ${takenDirect.status()}`, await takenDirect.text());
    ok(await prisma.booking.count({ where: { visit: { contractorId: f.contractorId } } }) === 1 && await prisma.customer.count({ where: { contractorId: f.contractorId } }) === 1,
      "C  still one booking and one customer — the refusals wrote nothing");
    ok(await prisma.arrivalWindow.count({ where: eightAm }) === 1 && await prisma.arrivalWindow.count({ where: { serviceArea: { contractorId: f.contractorId } } }) === 1,
      "C  exactly one ArrivalWindow row exists for the contractor — no duplicate for that service-date window");

    // Room for two (fixture setting): the second real booking must JOIN the row, not make another.
    await prisma.contractor.update({ where: { id: f.contractorId }, data: { nativeConcurrentJobs: 2 } });
    await cpage.goto(fullUrl, { waitUntil: "networkidle" });
    await fillDetails(cpage, "capacity-proof@example.invalid");
    const [secondRes] = await Promise.all([
      cpage.waitForResponse((r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST", { timeout: 60000 }),
      cpage.getByRole("button", { name: "Confirm Appointment" }).click(),
    ]);
    const secondBody = await secondRes.json().catch(() => null);
    ok(secondRes.status() === 200 && !!secondBody?.bookingId, `C  with room for two, the second homeowner books 8:00 AM`, JSON.stringify(secondBody));
    const rows = await prisma.arrivalWindow.findMany({ where: eightAm, select: { id: true, _count: { select: { bookings: true } } } });
    ok(rows.length === 1 && rows[0].id === realWindow.arrivalWindow.id && rows[0]._count.bookings === 2,
      "C  both real bookings share the ONE ArrivalWindow row for that service date and window", JSON.stringify(rows));
    const serverTwo = await asSite((db) => windowAvailabilityForDay(db, f.contractorId, dateISO, sched, null));
    ok(serverTwo[0].unavailableReason === "FULL", "C  two bookings in a two-job window → FULL again, counted from the real rows", JSON.stringify(serverTwo));
    await cctx.close();

    console.log("\n  P  A DEPOSIT STILL LOADS STRIPE.JS (test boundary — see header)\n");
    const pctx = await browser.newContext();
    const loaderHits: string[] = [];
    await pctx.route((u) => !!stripeHostOf(u.toString()), (route) => { loaderHits.push(route.request().url()); return route.abort(); });
    await pctx.route(`${BASE}/api/checkout/deposit`, (route) => route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ depositDueCents: 5000, creditsToJob: true, ready: true, publishableKey: "pk_test_loaderBoundaryOnly", stripeAccountId: "acct_loaderBoundaryOnly" }) }));
    const pp = await pctx.newPage();
    await pp.goto(`${BASE}/${SLUG}/checkout/details?${new URL(detailsUrl).searchParams.toString()}`, { waitUntil: "domcontentloaded" });
    await pp.getByRole("heading", { name: "Deposit" }).waitFor({ timeout: 30000 }).catch(() => {});
    for (let i = 0; i < 20 && loaderHits.length === 0; i++) await pp.waitForTimeout(250);
    ok(await pp.getByRole("heading", { name: "Deposit" }).count() > 0, "P  a required deposit mounts the card step");
    ok(loaderHits.some((u) => stripeHostOf(u) === "js.stripe.com"), `P  …which requests Stripe.js from js.stripe.com (${loaderHits.length} request(s), aborted, no credential used)`, loaderHits.join(" "));
    await pctx.close();
  } finally {
    await browser?.close();
    if (server) server.kill("SIGTERM");
    await teardown();
    ok(await prisma.contractor.count({ where: { slug: SLUG } }) === 0, "   the fixture contractor, its booking and its customer are gone");
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
