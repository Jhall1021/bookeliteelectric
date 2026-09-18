/**
 * The first-service wizard, walked in a real browser from a genuinely fresh
 * contractor, with a screenshot at every screen a contractor sees.
 *
 * Resume is tested the honest way: at each interruption point a NEW page is
 * opened, so nothing survives in the client — whatever step it lands on is
 * the answer stored state gives.
 *
 *   PLATFORM_MAIL_SINK=<file> BETTER_AUTH_URL=http://localhost:3431 \
 *   WALKTHROUGH_SHOTS=<dir> npx tsx scripts/walkthrough-first-service-browser.ts
 *
 * NOT PART OF `npm run verify`. Needs a running server.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { teardownOnboardingFixture } from "./_onboardingFixtureTeardown";
import { PILOT_ANSWERS } from "../lib/electrical/onboardingPilotReadiness";

const prisma = new PrismaClient();
const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3431";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "";
const SHOTS = process.env.WALKTHROUGH_SHOTS ?? "/tmp/walkthrough";
const KEEP = process.env.WALKTHROUGH_KEEP === "1";
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `rv2-walkthrough-${RUN}`;
const EMAIL = `p2b-rv2-walkthrough-${RUN}@resend.dev`;
const PASSWORD = `Walk-${randomBytes(9).toString("base64url")}`;

let pass = 0, fail = 0, shot = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const snap = async (page: Page, name: string) => {
  shot++;
  const file = `${SHOTS}/${String(shot).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`       [screenshot] ${file}`);
};
async function verificationLinkFor(email: string) {
  let raw = ""; try { raw = await readFile(SINK, "utf8"); } catch { return null; }
  const mine = raw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((m) => m && m.to === email && /confirm/i.test(m.subject));
  return (mine.at(-1)?.text as string | undefined)?.match(/https?:\/\/\S+/)?.[0] ?? null;
}
/** Which step a freshly-loaded page offers to continue. */
async function resumeStep(page: Page): Promise<string | null> {
  const open = page.locator("li.ring-2 p.font-semibold").first();
  if (await open.count()) return (await open.textContent())?.trim() ?? null;
  return null;
}

async function main() {
  console.log(`\nFIRST-SERVICE WIZARD — BROWSER WALKTHROUGH\n  ${BASE}\n`);
  if (!SINK) throw new Error("PLATFORM_MAIL_SINK must match the server");
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  let contractorId = "";
  try {
    // ── account + business (existing flows' shape; not the pilot under test) ──
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("Walkthrough Owner");
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForSelector("h1:has-text('Confirm your email')", { timeout: 60000 });
    let link: string | null = null;
    for (let i = 0; i < 20 && !link; i++) { link = await verificationLinkFor(EMAIL); if (!link) await page.waitForTimeout(500); }
    if (!link) throw new Error("no verification link");
    await page.goto(link);
    const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL }, select: { id: true } });
    const c = await prisma.contractor.create({ data: { slug: SLUG, name: "Walkthrough Electric", active: true, countryCode: "US", trade: "residential electrician" }, select: { id: true } });
    contractorId = c.id;
    const site = await prisma.contractorSite.create({ data: { contractorId: c.id, hostedSlug: SLUG, publicId: `site_${randomBytes(16).toString("hex")}`, active: true }, select: { publicId: true } });
    await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
    await prisma.contractorMembership.create({ data: { userId: user.id, contractorId: c.id, role: "OWNER", active: true } });

    console.log("  1  FRESH CONTRACTOR — catalog not installed\n");
    await page.goto(`${BASE}/dashboard/first-service`);
    await page.waitForSelector("h1");
    await snap(page, "fresh-install-catalog");
    ok(await page.getByRole("button", { name: "Add Electrical services" }).isVisible(), "1  first screen offers to add Electrical services");
    await page.getByRole("button", { name: "Add Electrical services" }).click();
    await page.waitForSelector("text=steps done", { timeout: 120000 });

    console.log("\n  2  RESUME AFTER CATALOG INSTALL\n");
    const p2 = await ctx.newPage(); await p2.goto(`${BASE}/dashboard/first-service`); await p2.waitForSelector("text=steps done");
    ok((await resumeStep(p2)) === "Materials", "2  a fresh page opens on Materials", String(await resumeStep(p2)));
    await snap(p2, "after-install-materials-open"); await p2.close();

    console.log("\n  3  MATERIALS — how you run it\n");
    await page.reload(); await page.waitForSelector("text=How you run surface wiring");
    await snap(page, "materials-empty");
    const body = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
    ok(!/SURFACE_RACEWAY|CONDUCTOR_THHN|ELEC_ROUTE|OUTLET_EXTENSION|canonical|fingerprint|policy|scope/i.test(body),
      "3  no internal keys or architecture words on the materials screen", body.match(/SURFACE_RACEWAY\w*|CONDUCTOR_THHN\w*|canonical|fingerprint|policy|scope/i)?.[0] ?? "");
    await page.getByRole("radio", { name: "#12", exact: true }).check();
    await page.getByRole("radio", { name: "I pull a separate ground wire" }).check();
    await page.getByLabel("Support clip every").fill("5");
    await page.locator('input[name="ends"][type="radio"]').first().check();
    await page.locator('input[name="source"]').first().check();
    await page.locator('input[name="dest"]').nth(1).check();
    await page.getByLabel("Extra wire you leave at each connection").fill("0.5");
    await page.getByRole("button", { name: "Save how you run it" }).click();
    await page.waitForSelector("text=#12 hot wire", { timeout: 60000 });

    console.log("\n  4  RESUME MIDWAY THROUGH MATERIALS (setup saved, no prices)\n");
    const p4 = await ctx.newPage(); await p4.goto(`${BASE}/dashboard/first-service`); await p4.waitForSelector("text=steps done");
    ok((await resumeStep(p4)) === "Materials", "4  still on Materials — prices not entered yet", String(await resumeStep(p4)));
    ok(await p4.getByRole("radio", { name: "#12", exact: true }).isChecked(), "4  …and the wire size already chosen is shown, not asked again");
    await p4.close();

    console.log("\n  5  MATERIALS — what you pay\n");
    const prices: Record<string, [string, string]> = {
      "Raceway channel": ["5", "14.57"], "Joint cover": ["1", "1.87"], "Inside corner": ["1", "3.27"],
      "Outside corner": ["1", "3.27"], "Flat corner": ["1", "3.17"], "Support clip": ["1", "0.57"],
      "Entrance fitting": ["1", "4.47"], "Surface outlet box": ["1", "6.47"],
      "#12 hot wire": ["500", "89.17"], "#12 neutral wire": ["500", "89.17"], "#12 ground wire": ["500", "74.17"],
    };
    for (const [name, [qty, price]] of Object.entries(prices)) {
      const size = page.getByLabel(`${name} pack size`); const cost = page.getByLabel(`${name} price`);
      if (await size.count()) { await size.fill(qty); await cost.fill(price); }
      else ok(false, `5  part "${name}" is listed`, "not on the screen");
    }
    await snap(page, "materials-prices-filled");
    await page.getByRole("button", { name: "Save prices" }).click();
    await page.waitForSelector("text=Next: labor", { timeout: 60000 });
    await snap(page, "materials-saved");

    console.log("\n  6  LABOR — partly done, then interrupted\n");
    await page.getByRole("button", { name: "Next: labor" }).click();
    await page.waitForSelector("text=How much field labor");
    await snap(page, "labor-empty");
    const laborText = await page.locator("body").innerText();
    ok(/Published references vary/.test(laborText), "6  disputed evidence reads as 'references vary', not a number to copy");
    ok(!/0\.02|0\.6|0\.2 h/.test(laborText), "6  nothing is pre-filled from a reference");
    // Fill ONE row and save — the rest stay undecided, never zero.
    await page.getByLabel("Running surface raceway minutes").fill("1.2");
    await page.getByRole("button", { name: "Save labor" }).click();
    await page.waitForTimeout(2500);
    const p6 = await ctx.newPage(); await p6.goto(`${BASE}/dashboard/first-service`); await p6.waitForSelector("text=steps done");
    ok((await resumeStep(p6)) === "Labor", "6  a fresh page resumes on Labor", String(await resumeStep(p6)));
    ok((await p6.getByLabel("Running surface raceway minutes").inputValue()) === "1.2", "6  …showing the saved minutes, not asking again");
    ok((await p6.getByLabel("Outlet installation minutes").inputValue()) === "", "6  …while unsaved rows are still empty, not zero");
    await snap(p6, "resume-midway-labor"); await p6.close();

    await page.reload(); await page.waitForSelector("text=How much field labor");
    const planning = page.locator("text=Planning the surface run").locator("xpath=ancestor::div[contains(@class,'py-3.5')]");
    await planning.getByRole("button", { name: "No extra time for this" }).click();
    await page.getByLabel("Outlet installation minutes").fill("36");
    await page.getByLabel("Mounting the outlet box minutes").fill("12");
    await page.getByRole("button", { name: "Save labor" }).click();
    await page.waitForSelector("text=Next: your pricing", { timeout: 60000 });
    await snap(page, "labor-complete");

    console.log("\n  7  PRICING, THEN INTERRUPTED BEFORE APPROVAL\n");
    await page.getByRole("button", { name: "Next: your pricing" }).click();
    await page.waitForSelector("text=What you charge per crew-hour");
    await snap(page, "pricing-empty");
    const priceInputs = page.locator("input[inputmode=decimal]");
    await priceInputs.nth(0).fill("185");
    await priceInputs.nth(1).fill("195");
    await page.locator("select").selectOption("500");
    if (await page.getByRole("radio", { name: "No charge" }).count()) await page.getByRole("radio", { name: "No charge" }).check();
    await page.getByRole("button", { name: "Save and review price" }).click();
    // Not `text=Customer price`: Playwright text matching is case-insensitive
    // and matched "Round customer prices up…" on the pricing card.
    await page.getByRole("button", { name: "Approve this price" }).waitFor({ timeout: 60000 });
    await snap(page, "review-price");
    const review = await page.locator("body").innerText();
    ok(/Customer price/.test(review) && /Materials markup/.test(review), "7  review shows the real breakdown");
    ok(!/Permit \/ admin/.test(review), "7  a $0 permit row is NOT shown in the breakdown");
    ok(!/price appears here once/.test(review), "7  no 'not ready yet' flash after completing everything");
    const p7 = await ctx.newPage(); await p7.goto(`${BASE}/dashboard/first-service`); await p7.waitForSelector("text=steps done");
    ok((await resumeStep(p7)) === "Review your price", "7  a fresh page resumes on Review", String(await resumeStep(p7)));
    await p7.close();

    console.log("\n  8  APPROVE, THEN INTERRUPTED BEFORE GOING LIVE\n");
    await page.getByRole("button", { name: "Approve this price" }).click();
    await page.waitForSelector("text=Make New 120V Outlet bookable", { timeout: 60000 });
    const p8 = await ctx.newPage(); await p8.goto(`${BASE}/dashboard/first-service`); await p8.waitForSelector("text=steps done");
    ok((await resumeStep(p8)) === "Go live", "8  a fresh page resumes on Go live", String(await resumeStep(p8)));
    await snap(p8, "resume-before-activation"); await p8.close();

    console.log("\n  9  GO LIVE → SUCCESS\n");
    await page.getByRole("button", { name: "Make New 120V Outlet bookable" }).click();
    await page.waitForSelector("text=Your first service is ready to book", { timeout: 60000 });
    await snap(page, "success");
    const successText = await page.locator("body").innerText();
    const shownPrice = successText.match(/\$[\d,]+/)?.[0];
    ok(/Live/.test(successText), `9  success shows Live at ${shownPrice}`);

    console.log("\n  10 THE HOMEOWNER GETS THAT PRICE\n");
    const svc = await prisma.service.findFirstOrThrow({ where: { contractorId: c.id, slug: "new-120v-outlet" }, select: { id: true } });
    const home = await browser.newContext();
    const v = await home.request.post(`${BASE}/api/visit`, { headers: { "x-price2book-site": site.publicId }, data: { serviceId: svc.id, answersSnapshot: PILOT_ANSWERS } });
    const line = await prisma.lineItem.findFirst({ where: { serviceId: svc.id }, select: { computedPriceCents: true } });
    ok(v.status() === 200 && line?.computedPriceCents !== null, `10 /api/visit priced the job at ${line?.computedPriceCents}c`, `${v.status()}`);
    ok(shownPrice === `$${Math.round((line?.computedPriceCents ?? 0) / 100).toLocaleString("en-US")}`,
      "10 the success screen's price is the price the homeowner is charged", `${shownPrice} vs ${line?.computedPriceCents}`);

    console.log("\n  11 A COST CHANGES — PRICE NEEDS REVIEW\n");
    await page.getByRole("button", { name: "Review this service’s setup" }).click();
    await page.waitForSelector("text=What you pay for the parts");
    await page.getByLabel("Raceway channel price").fill("16.99");
    await page.getByRole("button", { name: "Save prices" }).click();
    await page.waitForSelector("text=Price needs review", { timeout: 60000 });
    await snap(page, "stale-banner");
    await page.getByRole("button", { name: "Review it" }).click();
    await page.waitForSelector("text=Previously approved");
    await snap(page, "stale-review-old-vs-new");
    const staleText = await page.locator("body").innerText();
    ok(/Previously approved/.test(staleText) && /New price/.test(staleText), "11 old and new prices are both shown");
    ok(!/fingerprint|basis|hash/i.test(staleText), "11 no fingerprint language");
    const v2 = await home.request.post(`${BASE}/api/visit`, { headers: { "x-price2book-site": site.publicId }, data: { serviceId: svc.id, answersSnapshot: PILOT_ANSWERS } });
    ok(v2.status() === 409 && (await v2.json()).error === "REVIEW_REQUIRED", "11 homeowner now gets a review, not the old price");
    await page.getByRole("button", { name: "Approve this price" }).click();
    await page.waitForTimeout(2500); await page.reload(); await page.waitForSelector("h1", { timeout: 60000 });
    await snap(page, "reapproved");
    const v3 = await home.request.post(`${BASE}/api/visit`, { headers: { "x-price2book-site": site.publicId }, data: { serviceId: svc.id, answersSnapshot: PILOT_ANSWERS } });
    ok(v3.status() === 200, "11 after re-approval the homeowner is priced again");
    await home.close();
  } finally {
    await browser.close();
    if (!KEEP) {
      await teardownOnboardingFixture(prisma, SLUG);   // throws rather than hiding a failed teardown
      const u = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
      if (u) {
        await prisma.session.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.account.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
      }
    }
  }
  console.log(`\n  ${pass} passed, ${fail} failed   (${shot} screenshots in ${SHOTS})\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
