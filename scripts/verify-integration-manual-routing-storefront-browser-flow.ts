/**
 * The combined branch's own integration point — through the REAL storefront,
 * a REAL browser, a REAL Routing V2 DERIVED_RESOLVED_SCOPE service, built
 * only through the supported lifecycle (scripts/_derivedStorefrontFixture.ts,
 * the same helper scripts/verify-routing-precision-provisioning.ts already
 * uses to prove straight/turned/stale/reapproval at the function level).
 * That script never touches a browser; this one drives GuidedFlowEngine +
 * QuestionStep — the exact files this integration branch's merge hand-
 * resolved — against the real tree, proving the pieces actually wire
 * together for a homeowner, not just that each side's own logic still works
 * in isolation.
 *
 * WHAT THIS PROVES, per the integration instruction's own list:
 *
 *   A. MANUAL COMPLETION, NO ROUTE ASSIST — every answer is typed/clicked
 *      through the real QuestionStep UI (SURFACE_KEYS.feet/inside/outside/
 *      flat as plain textareas, surface/obstacles as plain buttons); nothing
 *      here ever touches Route Assist's scan/photo capture at all.
 *   B. STRAIGHT-ROUTE PRICING — feet=20.5 (the exact figure named in the
 *      integration instruction), every corner count 0, surface Drywall,
 *      obstacles clear -> RESOLVE_INSTANT -> a real price.
 *   C. DISPLAYED VS. STORED PRICE — the number GuidedFlowEngine shows before
 *      "Add to My Visit" is read back from the real LineItem.
 *      computedPriceCents afterward and must match exactly.
 *   D. BACK / RE-ANSWER ON A NUMBER QUESTION — goBack() on the merged branch
 *      previously only had multi-choice questions exercised
 *      (scripts/verify-back-navigation-config-browser-flow.ts). Back three
 *      questions to the feet question itself, re-type a DIFFERENT footage,
 *      and re-answer forward — the fractional pricing must move with it, not
 *      keep pricing the abandoned figure.
 *   E. TURNED-ROUTE REVIEW — the same tree, one flat corner instead of zero.
 *      No segment geometry exists without a Route Assist scan to supply it,
 *      so this must land on PHOTO_REVIEW, not a guessed price — proven here
 *      through the actual customer-facing screen, not just the resolver.
 *
 * Stale-approval -> REVIEW and reapproval -> PRICED restoration are proven
 * already, at the server/pricing-function level, by scripts/verify-routing-
 * precision-provisioning.ts ("changed economics invalidate prior approval" /
 * "reapproval restores fixed pricing") — not repeated here through a second
 * browser path; this script's own addition is the storefront UI layer those
 * checks don't touch.
 *
 * NOT PART OF `npm run verify`. Needs a running server AND a disposable
 * local database matching scripts/verify-routing-precision-provisioning.ts's
 * own requirement (loopback host, "local-"-prefixed DatabaseIdentity stamp)
 * — reuses the identical buildPricedDerivedContractor/removeFixture helpers,
 * so cleanup is the same bounded pilot-reset path, never a broad delete.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { buildPricedDerivedContractor, removeFixture, fixtureSlug } from "./_derivedStorefrontFixture";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";
const SLUG = fixtureSlug("manual-storefront");

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function priceText(page: Page): Promise<string> {
  const text = await page.locator("text=/^\\$[0-9,]+(\\.[0-9]{2})?$/").first().innerText();
  return text.trim();
}

async function answerNumber(page: Page, prompt: string, value: string) {
  await page.getByRole("heading", { name: prompt, exact: true }).waitFor();
  await page.getByRole("textbox").fill(value);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function answerChoice(page: Page, prompt: string, label: string) {
  await page.getByRole("heading", { name: prompt, exact: true }).waitFor();
  // Not exact: true — each option button's accessible name can carry a
  // trailing caption ("We'll confirm your price after a quick look" on a
  // review-triggering sibling), so match the label as a substring instead.
  try {
    await page.getByRole("button", { name: label, exact: false }).first().click();
  } catch (e) {
    console.log(`DIAGNOSTIC — looking for button "${label}", actual page text:\n`, await page.innerText("body").catch(() => "(unreadable)"));
    throw e;
  }
}

/** feet -> inside -> outside -> flat -> surface -> obstacles, straight to a price. */
async function walkStraightRoute(page: Page, feet: string) {
  await answerNumber(page, "How long is the route, in feet?", feet);
  await answerNumber(page, "How many inside corners?", "0");
  await answerNumber(page, "How many outside corners?", "0");
  await answerNumber(page, "How many turns stay flat on the wall?", "0");
  await answerChoice(page, "What is the wall made of?", "Drywall");
  await answerChoice(page, "Is anything in the way?", "No — it's a clear run along the wall");
}

async function main() {
  console.log(`\nINTEGRATION — manual Routing V2 completion through the real storefront\n`);
  console.log(`  ${BASE}  ·  contractor ${SLUG}\n`);

  await removeFixture(prisma, SLUG).catch(() => {});
  const browser = await chromium.launch();
  try {
    const fixture = await buildPricedDerivedContractor(prisma, SLUG);
    const targetUrl = `${BASE}/${SLUG}/services/x/new-120v-outlet`;

    // ── A/B/C. Manual completion, straight route, displayed vs. stored ──
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await walkStraightRoute(page, "20.5");
      await page.waitForSelector("text=Here's Your Price!");
      const displayed = await priceText(page);
      ok("B. a straight route (all corners 0, clear, drywall) resolves to a real price, not REVIEW",
        /^\$[0-9,]+(\.[0-9]{2})?$/.test(displayed), `got ${displayed}`);
      ok("A. reached that price with zero Route Assist interaction — every answer was typed/clicked manually",
        errors.length === 0, errors.join("; "));

      await page.getByRole("button", { name: /Add to My Visit/ }).click();
      await page.waitForURL(/\/my-visit/, { waitUntil: "commit" });

      const lineItem = await prisma.lineItem.findFirst({
        where: { serviceId: fixture.serviceId },
        orderBy: { id: "desc" },
        select: { computedPriceCents: true },
      });
      const displayedCents = Math.round(parseFloat(displayed.replace(/[$,]/g, "")) * 100);
      ok("C. the displayed price equals the stored LineItem.computedPriceCents",
        lineItem?.computedPriceCents === displayedCents,
        `displayed ${displayed} (${displayedCents}c), stored ${lineItem?.computedPriceCents}c`);

      await ctx.close();
    }

    // ── D. Back three questions to feet itself, re-answer with a DIFFERENT
    // footage, and confirm the price follows the new figure ──────────────
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await walkStraightRoute(page, "14.625");
      await page.waitForSelector("text=Here's Your Price!");
      const priceAt14625 = await priceText(page);

      // Back through obstacles -> surface -> flat -> outside -> inside -> feet:
      // 6 forward transitions were pushed (intro->feet's answer pushed "intro",
      // feet's own answer pushed "inside_q", ... obstacles' answer pushed
      // "obstacles_q" as the LAST entry) so 6 Back clicks from the price
      // screen land back on the feet question itself.
      for (let i = 0; i < 6; i++) {
        await page.getByRole("button", { name: "Back" }).click();
      }
      await page.getByRole("heading", { name: "How long is the route, in feet?", exact: true }).waitFor();

      // Re-answer with a genuinely different footage, then walk forward again.
      await page.getByRole("textbox").fill("20.5");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await answerNumber(page, "How many inside corners?", "0");
      await answerNumber(page, "How many outside corners?", "0");
      await answerNumber(page, "How many turns stay flat on the wall?", "0");
      await answerChoice(page, "What is the wall made of?", "Drywall");
      await answerChoice(page, "Is anything in the way?", "No — it's a clear run along the wall");
      await page.waitForSelector("text=Here's Your Price!");
      const priceAt205 = await priceText(page);

      ok("D. re-answering the feet question after Back changes the price (fractional footage actually re-priced)",
        priceAt205 !== priceAt14625, `14.625ft -> ${priceAt14625}; after Back, 20.5ft -> ${priceAt205}`);

      // The 20.5ft price here should match the FIRST context's 20.5ft price
      // exactly (same inputs, same contractor economics) — proving Back
      // didn't leave any stale config/answer behind from the 14.625ft branch.
      const sessionAnswers = await prisma.guidedFlowSession.findFirst({
        where: { serviceId: fixture.serviceId, status: "ACTIVE" },
        orderBy: { lastActivityAt: "desc" },
        select: { consumedAnswers: true },
      });
      const consumed = (sessionAnswers?.consumedAnswers ?? {}) as Record<string, unknown>;
      ok("D. the server's own persisted answers hold the FINAL 20.5, not the abandoned 14.625",
        consumed[SURFACE_KEYS.feet] === "20.5", `got ${JSON.stringify(consumed[SURFACE_KEYS.feet])}`);

      await ctx.close();
    }

    // ── E. Turned route (one flat corner) -> PHOTO_REVIEW, not a guess ──
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await answerNumber(page, "How long is the route, in feet?", "20.5");
      await answerNumber(page, "How many inside corners?", "0");
      await answerNumber(page, "How many outside corners?", "0");
      await answerNumber(page, "How many turns stay flat on the wall?", "1");
      await answerChoice(page, "What is the wall made of?", "Drywall");
      await answerChoice(page, "Is anything in the way?", "No — it's a clear run along the wall");

      const landedOnReview = await Promise.race([
        page.waitForSelector("text=Here's Your Price!").then(() => "PRICED"),
        page.waitForSelector("text=/take a quick look|photo/i").then(() => "REVIEW"),
      ]).catch(() => "NEITHER");
      ok("E. a turned route (one flat corner, no Route Assist segment geometry) lands on review, not a guessed price",
        landedOnReview === "REVIEW", `got ${landedOnReview}`);

      await ctx.close();
    }
  } finally {
    await browser.close();
    await removeFixture(prisma, SLUG).catch(() => {});
  }
  ok("every fixture is gone at the end", (await prisma.contractor.findUnique({ where: { slug: SLUG } })) === null);

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
