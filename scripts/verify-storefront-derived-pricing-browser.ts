/**
 * THE REAL STOREFRONT, IN A REAL BROWSER — a derived service reaches its price.
 *
 *   npx next build && npx tsx scripts/verify-storefront-derived-pricing-browser.ts
 *
 * Stage 1A's deployed rehearsal found the defect every earlier suite missed:
 * they priced the homeowner by POSTing /api/visit directly, and the storefront's
 * own guided flow sent every homeowner of a derived service to photo review on
 * the FIRST answer. This drives the pages a homeowner uses — the service intro,
 * each question, the price card, Add to My Visit — against a production build of
 * this tree (`next start`, started and stopped here, or BASE_URL if given).
 *
 * Proves, through the browser:
 *   1  a derived service with basePrice null does not review on the first answer
 *   2  "Everyday things" continues to "How would you like it powered?"
 *   3  the straight surface route reaches POST /api/price-evaluation
 *   4  the server answers PRICED
 *   5  the storefront renders exactly that price
 *   6  Add to My Visit stores that same current price on the LineItem
 *   7  a stale approval turns the terminal result into REVIEW — shown before
 *      display, and refused at Add to My Visit when it goes stale after display
 *   8  a turned route shows REVIEW
 *   9  a published-price service keeps its behavior and never asks the evaluator
 *  10  the browser receives no derived economics
 *
 * Rehearsal database only: refuses a database stamped as production for the
 * endpoint it is connected to. Fixture contractors are `rv2-pilot-rehearsal-*`
 * and are removed at the end, also on failure.
 */
import { PrismaClient } from "@prisma/client";
import { chromium, type Page, type Response } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { liveEndpointOf, resetRefusal } from "../lib/electrical/pilotScope";
import { buildPricedDerivedContractor, changeChannelCost, fixtureSlug, reapprove, removeFixture } from "./_derivedStorefrontFixture";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const SLUG = fixtureSlug("sfbrowser");
const PORT = Number(process.env.SFB_PORT ?? 3437);
const EXTERNAL = process.env.BASE_URL;
const BASE = EXTERNAL ?? `http://127.0.0.1:${PORT}`;

const SELECT: [RegExp, RegExp][] = [
  [/What will you be plugging in/i, /^Everyday things/],
  [/How would you like it powered/i, /^From the nearest outlet/],
  [/Is there a basement/i, /^No$/],
  [/How would you like the wiring run/i, /^Surface-mounted channel on the wall/],
  [/What is that wall surface/i, /^Drywall$/],
  // Typographic or straight apostrophe — whichever the catalog carries.
  [/Does anything sit in the way along that route/i, /^No — it.s a clear run along the wall/],
];
const straight = { feet: "31", inside: "0", outside: "0", flat: "0" };
const NUMBER = (r: typeof straight): [RegExp, string][] => [
  [/how many feet is that route/i, r.feet], [/How many inside corners/i, r.inside],
  [/How many outside corners/i, r.outside], [/turn a corner while staying on the same/i, r.flat],
];

async function startServer(): Promise<ChildProcess | null> {
  if (EXTERNAL) return null;
  if (!existsSync(".next/BUILD_ID")) throw new Error("No production build — run `npx next build` first.");
  const child = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    env: { ...process.env, PORT: String(PORT), NEXT_TELEMETRY_DISABLED: "1",
           BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (d) => { const t = String(d); if (/error/i.test(t)) process.stderr.write(`[next] ${t}`); });
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status < 500) return child; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill("SIGTERM");
  throw new Error("next start did not come up within 90s");
}

type Walk = { page: Page; evaluations: { status: number; body: any }[]; visitPosts: number; firstNextHeading: string | null; outcome: "PRICED" | "REVIEW" | "OTHER"; shownPrice: string | null; serviceDtoKeys: string[] };

/** Answer the tree exactly as a homeowner does, from the service intro to the terminal screen. */
async function walk(browser: import("playwright").Browser, servicePath: string, route = straight, opts: { stopAfterFirst?: boolean } = {}): Promise<Walk> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const w: Walk = { page, evaluations: [], visitPosts: 0, firstNextHeading: null, outcome: "OTHER", shownPrice: null, serviceDtoKeys: [] };
  page.on("response", async (x: Response) => {
    const u = x.url(), m = x.request().method();
    if (u.endsWith("/api/price-evaluation") && m === "POST") w.evaluations.push({ status: x.status(), body: await x.json().catch(() => null) });
    if (u.endsWith("/api/visit") && m === "POST") w.visitPosts++;
    if (/\/api\/services\/[^/?]+$/.test(u) && m === "GET") { const b = await x.json().catch(() => null); if (b) w.serviceDtoKeys = [...Object.keys(b), ...(b.questions ?? []).flatMap((q: any) => (q.options ?? []).flatMap((o: any) => Object.keys(o)))]; }
  });
  await page.goto(`${BASE}${servicePath}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Check My Price/i }).click();
  let answered = 0;
  for (let i = 0; i < 20; i++) {
    const heading = page.locator("h1, h2").filter({ hasText: /\?|price this remotely/ }).first();
    const add = page.getByRole("button", { name: /Add to My Visit/i });
    await Promise.race([heading.waitFor({ timeout: 15000 }).catch(() => {}), add.waitFor({ timeout: 15000 }).catch(() => {})]);
    const checking = page.getByText("Checking whether we can price this online…");
    if (await checking.count()) { await checking.waitFor({ state: "detached", timeout: 30000 }); continue; }
    if (await add.count()) { w.outcome = "PRICED"; w.shownPrice = (await page.locator(".text-4xl").first().textContent())?.trim() ?? null; break; }
    const text = (await heading.textContent().catch(() => "")) ?? "";
    if (answered === 1 && w.firstNextHeading === null) w.firstNextHeading = text.trim();
    if (/price this remotely/i.test(text)) { w.outcome = "REVIEW"; break; }
    if (opts.stopAfterFirst && answered === 1) break;
    const num = NUMBER(route).find(([re]) => re.test(text));
    // NUMBER questions take a typed answer in a textarea and a Continue button (QuestionStep).
    const input = page.locator("textarea").first();
    if (num && await input.count()) { await input.fill(num[1]); await page.getByRole("button", { name: "Continue", exact: true }).click(); answered++; await page.waitForTimeout(300); continue; }
    const sel = SELECT.find(([re]) => re.test(text));
    if (sel) { await page.getByRole("button", { name: sel[1] }).first().click(); answered++; await page.waitForTimeout(300); continue; }
    throw new Error(`unrecognized step: "${text}"`);
  }
  return w;
}

async function main() {
  console.log("\nSTOREFRONT DERIVED PRICING — IN THE BROWSER\n");
  const identity = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" }, select: { key: true, neonEndpoint: true } });
  const guard = resetRefusal({ slug: SLUG, identity, liveEndpoint: liveEndpointOf(process.env.DATABASE_URL ?? "") });
  if (guard) { console.log(`  STOP: ${guard.code} — this suite runs on a rehearsal database only.`); process.exit(2); }

  let server: ChildProcess | null = null;
  const browser = await chromium.launch();
  await removeFixture(prisma, SLUG);
  try {
    server = await startServer();
    const f = await buildPricedDerivedContractor(prisma, SLUG);
    const pilot = await prisma.service.findUniqueOrThrow({ where: { id: f.serviceId }, select: { slug: true, contractorCategoryId: true } });
    const category = await prisma.contractorCategory.findUniqueOrThrow({ where: { id: pilot.contractorCategoryId! }, select: { canonicalCategory: { select: { slug: true } } } });
    const servicePath = (slug: string) => `/${SLUG}/services/${category.canonicalCategory.slug}/${slug}`;

    console.log("  1-2  THE FIRST ANSWER NO LONGER ENDS THE FLOW\n");
    const first = await walk(browser, servicePath(pilot.slug), straight, { stopAfterFirst: true });
    ok(first.firstNextHeading === "How would you like it powered?", `1  after "Everyday things" the homeowner is asked "${first.firstNextHeading}"`);
    ok(first.evaluations.length === 0 && first.visitPosts === 0, "2  …no price asked for and nothing added mid-tree");
    await first.page.context().close();

    console.log("\n  3-6  THE STRAIGHT ROUTE IS PRICED BY THE SERVER, SHOWN, AND STORED\n");
    const s = await walk(browser, servicePath(pilot.slug));
    const ev = s.evaluations.at(-1);
    ok(s.evaluations.length === 1 && ev?.status === 200, "3  the terminal answer asked POST /api/price-evaluation exactly once", JSON.stringify(s.evaluations));
    ok(ev?.body?.outcome === "PRICED" && ev.body.priceCents === f.approvedTotalCents, `4  the server answered PRICED at the approved derived price`, JSON.stringify(ev?.body));
    const expectedShown = `$${((ev?.body?.priceCents ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
    ok(s.outcome === "PRICED" && s.shownPrice === expectedShown, `5  the price card shows ${s.shownPrice} — the server's figure`, `expected ${expectedShown}`);
    // Contractor-derived economics. (overrideFieldLaborHours / overrideTechCount /
    // overrideEstimatedMinutes are canonical tree-option fields the payload
    // carried before this change; they are not a contractor's costs.)
    const economicKeys = [...new Set(s.serviceDtoKeys.filter((k) => /crewHour|materialCost|markup|fingerprint|packagePrice|approvedTotal|takeoff|contractorComponent|addFieldLaborHours|referenceLabor|basis/i.test(k)))];
    const topLevel = s.serviceDtoKeys.slice(0, s.serviceDtoKeys.indexOf("questions") + 1).sort().join(",");
    const EXPECTED_TOP = "basePrice,bookingType,ctaLabel,disclaimer,estimatedMinutes,icon,id,name,pricingMethod,questions,referencedAccessSlots,shortDescription,slug,startingPriceLabel,timeAndMaterials,whileWeThereBasePrice";
    ok(economicKeys.length === 0 && topLevel === EXPECTED_TOP,
      "10 the service payload carries no derived economics — the only field this fix added is pricingMethod", `${economicKeys.join(",")} | ${topLevel}`);
    ok(s.visitPosts === 0, "6  nothing was stored before the homeowner chose Add to My Visit");
    await s.page.getByRole("button", { name: /Add to My Visit/i }).click();
    await s.page.waitForURL(/my-visit/, { timeout: 60000 });
    const line = await prisma.lineItem.findFirst({ where: { visit: { contractorId: f.contractorId }, serviceId: f.serviceId }, select: { id: true, computedPriceCents: true, resolvedEconomicBasis: true, isPrimary: true } });
    ok(!!line && line.computedPriceCents === ev?.body?.priceCents && !!line.resolvedEconomicBasis,
      `6  Add to My Visit stored ${line ? `$${(line.computedPriceCents ?? 0) / 100}` : "nothing"} — the price shown, with its economic basis`, JSON.stringify(line));
    await s.page.context().close();

    console.log("\n  7  STALE ECONOMICS NEVER REACH THE HOMEOWNER OR THE VISIT\n");
    await changeChannelCost(f.contractorId, 1699);
    const stale = await walk(browser, servicePath(pilot.slug));
    ok(stale.outcome === "REVIEW" && stale.evaluations.at(-1)?.body?.outcome === "REVIEW" && stale.shownPrice === null,
      "7  a material cost change after approval → the terminal screen is a review, no price shown", JSON.stringify({ o: stale.outcome, e: stale.evaluations }));
    const lineAfter = await prisma.lineItem.findUniqueOrThrow({ where: { id: line!.id }, select: { computedPriceCents: true, resolvedEconomicBasis: true } });
    ok(lineAfter.computedPriceCents === line!.computedPriceCents && lineAfter.resolvedEconomicBasis === line!.resolvedEconomicBasis,
      "7  …and the booked line keeps the price and basis it was stored with");
    await stale.page.context().close();

    const newTotal = await reapprove(prisma, f.contractorId, f.serviceId);
    const shown = await walk(browser, servicePath(pilot.slug));
    ok(shown.outcome === "PRICED" && shown.evaluations.at(-1)?.body?.priceCents === newTotal,
      `7  re-approved → the storefront shows the NEW price ${shown.shownPrice}`, JSON.stringify(shown.evaluations));
    const linesBefore = await prisma.lineItem.count({ where: { visit: { contractorId: f.contractorId } } });
    await changeChannelCost(f.contractorId, 1799);           // goes stale AFTER the price was shown
    await shown.page.getByRole("button", { name: /Add to My Visit/i }).click();
    await shown.page.getByRole("heading", { name: "We can price this remotely." }).waitFor({ timeout: 30000 }).catch(() => {});
    const refusedText = await shown.page.locator("body").innerText();
    const linesAfter = await prisma.lineItem.count({ where: { visit: { contractorId: f.contractorId } } });
    ok(/We can price this remotely\./.test(refusedText) && linesAfter === linesBefore && !/my-visit/.test(shown.page.url()),
      "7  stale between display and Add to My Visit → review shown, nothing stored, the shown figure not persisted",
      JSON.stringify({ linesBefore, linesAfter, url: shown.page.url() }));
    await shown.page.context().close();
    await reapprove(prisma, f.contractorId, f.serviceId);

    console.log("\n  8  A TURNED ROUTE IS A REVIEW\n");
    const turned = await walk(browser, servicePath(pilot.slug), { feet: "31", inside: "2", outside: "0", flat: "1" });
    ok(turned.outcome === "REVIEW" && turned.evaluations.at(-1)?.body?.outcome === "REVIEW" && turned.shownPrice === null,
      "8  two inside corners and a flat corner → review, no invented price", JSON.stringify(turned.evaluations));
    await turned.page.context().close();

    console.log("\n  9  A PUBLISHED-PRICE SERVICE IS UNCHANGED\n");
    // A NAMED service, not "the first unpriced published-price service": that
    // query matches five in the installed catalog, unordered, and three of them
    // (surface-mounted-*) open on a typed NUMBER question whose Continue stays
    // disabled — the gate timed out whenever Postgres returned one of those.
    // This is the service every earlier green run exercised. Every property the
    // proof depends on is asserted in the query, so catalog drift fails here by
    // name rather than as a click timeout.
    const LEGACY_SLUG = "exterior-gfci-other-routing";
    const legacy = await prisma.service.findFirstOrThrow({
      where: { contractorId: f.contractorId, slug: LEGACY_SLUG, contractorCategoryId: pilot.contractorCategoryId, pricingMethod: "LEGACY_PUBLISHED", basePrice: null },
      select: { id: true, slug: true, name: true,
        questions: { orderBy: { order: "asc" }, take: 1, select: { inputType: true, options: { orderBy: { order: "asc" }, take: 1, select: { label: true } } } } } });
    const firstQuestion = legacy.questions[0];
    if (firstQuestion?.inputType !== "SINGLE_SELECT" || !firstQuestion.options[0]) {
      throw new Error(`check 9 fixture drifted: ${LEGACY_SLUG} must open on a SINGLE_SELECT question, found ${firstQuestion?.inputType ?? "none"}`);
    }
    await prisma.service.update({ where: { id: legacy.id }, data: { active: true } });   // fixture state: visible, still unpriced
    const lctx = await browser.newContext(); const lp = await lctx.newPage();
    let legacyEvaluations = 0;
    lp.on("request", (r) => { if (r.url().endsWith("/api/price-evaluation")) legacyEvaluations++; });
    await lp.goto(`${BASE}${servicePath(legacy.slug)}`, { waitUntil: "networkidle" });
    await lp.getByRole("button", { name: /Check My Price/i }).click();
    // The homeowner's first answer: the first authored option, by its label.
    const firstOption = lp.getByRole("button", { name: firstQuestion.options[0].label, exact: true });
    await firstOption.waitFor({ timeout: 15000 });
    await firstOption.click();
    await lp.waitForTimeout(1500);
    const ltext = await lp.locator("body").innerText();
    ok(/We can price this remotely\./.test(ltext) && legacyEvaluations === 0,
      `9  "${legacy.name}" (published-price, no price published) still goes to review on its first priced answer, without asking the evaluator`,
      JSON.stringify({ legacyEvaluations, head: ltext.slice(0, 200) }));
    await lctx.close();
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
    await removeFixture(prisma, SLUG);
    ok(await prisma.contractor.count({ where: { slug: SLUG } }) === 0, "   the fixture contractor this run created is gone");
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await removeFixture(prisma, SLUG).catch(() => {}); await prisma.$disconnect(); process.exit(1); });
