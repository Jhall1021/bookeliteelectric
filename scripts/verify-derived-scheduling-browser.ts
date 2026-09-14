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
 *      (the same day, asked without a duration, offers 2:00 — the job did it)
 *   L  checkout refuses the 2:00 window with WINDOW_TOO_LATE and books nothing
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
  [/What is that wall surface/i, /^Drywall$/],
  [/Does anything sit in the way along that route/i, /^No — it.s a clear run along the wall/],
];
const NUMBER: [RegExp, string][] = [
  [/how many feet is that route/i, "200"], [/How many inside corners/i, "0"],
  [/How many outside corners/i, "0"], [/turn a corner while staying on the same/i, "0"],
];

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
async function priceAndAdd(page: Page, servicePath: string) {
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
    const num = NUMBER.find(([re]) => re.test(text));
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
    ok(await priceAndAdd(page, servicePath) === "PRICED", "D  200 ft straight route → priced → Add to My Visit");
    const line = await prisma.lineItem.findFirst({ where: { visit: { contractorId: f.contractorId }, serviceId: f.serviceId },
      select: { resolvedCrewHours: true, resolvedCrewCount: true, estimatedMinutes: true, computedPriceCents: true } });
    ok(!!line && Math.abs((line.resolvedCrewHours ?? -1) - 4.8) < 1e-9, `D  resolvedCrewHours = ${line?.resolvedCrewHours}`, JSON.stringify(line));
    ok(line?.resolvedCrewCount === 1, `D  resolvedCrewCount = ${line?.resolvedCrewCount}`);
    ok(line?.estimatedMinutes === 288, `D  estimatedMinutes = ${line?.estimatedMinutes} (4.8 h ÷ 1 crew × 60)`);

    console.log("\n  W  NATIVE SCHEDULING WITHHOLDS THE WINDOW THE JOB CANNOT FINISH IN\n");
    await page.getByRole("button", { name: "Choose My Appointment Time" }).click();
    await page.waitForURL(/checkout\/schedule/, { timeout: 30000 });
    await page.getByRole("heading", { name: "Select an Arrival Window" }).waitFor({ timeout: 30000 });
    const windowButtons = page.locator("main button").filter({ hasText: /\d{1,2}:\d\d [AP]M – \d{1,2}:\d\d [AP]M/ });
    await windowButtons.first().waitFor({ timeout: 15000 });
    const shown: Record<string, boolean> = {};
    for (const b of await windowButtons.all()) shown[((await b.textContent()) ?? "").match(/\d{1,2}:\d\d [AP]M – \d{1,2}:\d\d [AP]M/)![0]] = await b.isEnabled();
    ok(shown["8:00 AM – 11:00 AM"] === true && shown["11:00 AM – 2:00 PM"] === true, "W  8:00 AM and 11:00 AM are offered (288 min ends by 1:48 PM / 3:48 PM)", JSON.stringify(shown));
    ok(shown["2:00 PM – 4:30 PM"] === false, "W  2:00 PM is not offered — 288 minutes would run to 6:48 PM, past 4:30 PM", JSON.stringify(shown));

    // OBSERVATION, NOT AN ASSERTION. The windows above are the server-rendered
    // first day. Another day's tab re-asks GET /api/availability/[date] with
    // ?duration=, and that route does not read the parameter — so a later day
    // may offer 2:00 PM and checkout then refuses it (L). Pre-existing and
    // outside this change's scope; recorded here so the report states it.
    const dayTabs = page.locator("main div.flex button");
    const dayTab = (await dayTabs.first().textContent())?.trim();
    if (await dayTabs.count() > 1) {
      await dayTabs.nth(1).click();
      await page.getByText("Checking real-time availability...").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
      const later = page.getByRole("button", { name: "2:00 PM – 4:30 PM" });
      await later.waitFor({ timeout: 15000 }).catch(() => {});
      console.log(`  NOTE second day tab (${(await dayTabs.nth(1).textContent())?.trim()}): 2:00 PM – 4:30 PM ${await later.count() && await later.isEnabled() ? "IS offered — the tab refetch ignores duration (recorded finding)" : "is not offered"}`);
      await dayTabs.first().click();
      await page.getByText("Checking real-time availability...").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
    }
    await page.getByRole("button", { name: "8:00 AM – 11:00 AM" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(/checkout\/details/, { timeout: 30000 });
    const detailsUrl = page.url();
    const dateISO = new Date(new URL(detailsUrl).searchParams.get("date")!).toISOString().split("T")[0];
    // Same day, same contractor, no bookings: asked with no duration, 2:00 is open.
    const control = await (await fetch(`${BASE}/api/availability/${dateISO}`, { headers: { "x-price2book-site": f.publicId } })).json();
    const ctlLate = (control.windows ?? []).find((w: any) => w.start === "2:00 PM");
    ok(ctlLate?.available === true, `W  control: the same day (${dayTab?.trim()}) with no job length offers 2:00 PM — the duration is what withheld it`, JSON.stringify(control));
    ok(await prisma.booking.count({ where: { visit: { contractorId: f.contractorId } } }) === 0, "W  …and nothing was booked, so capacity did not withhold it");

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
