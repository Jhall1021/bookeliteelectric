/**
 * TWO FRESH CONTRACTORS, EACH INSTALLED FROM THE TEMPLATE, NEVER REPAIRED.
 *
 * The PR #63 review's specific ask: prove the REVISED trees (Routing V2's
 * surface-raceway module, wired above a real qualification gate) actually
 * reach a newly onboarded contractor through the SUPPORTED
 * `preflight`/`installCatalog` lifecycle — not once, but for two independent
 * contractors side by side, with nothing hand-patched onto either tree
 * afterward. `scripts/verify-integration-manual-routing-storefront-browser-
 * flow.ts` already proves this for ONE contractor; this script's own
 * contribution is the SECOND one and the isolation between them, which a
 * single-contractor proof cannot demonstrate by construction.
 *
 * WHAT MAKES THIS A GENUINE SECOND CONTRACTOR, NOT A CLONE: contractor B's
 * own material costs are set DIFFERENTLY from A's (a changed channel cost,
 * same supported `writeMaterialCost`/`changeChannelCost` action any
 * contractor's own admin would use) before either is driven through the
 * storefront — so a shared price between them would be conflated economics,
 * not proof of two working installs.
 *
 * PROVES, for EACH of two independently-installed contractors:
 *   - manual completion, zero Route Assist interaction
 *   - fractional footage prices to a real number, not REVIEW
 *   - a turned route (one flat corner) lands on REVIEW instead of a guess
 *   - the displayed price matches the stored LineItem.computedPriceCents
 *
 * AND, tenant isolation specifically:
 *   - A's approved economics and B's differ (the setup is real, not shared)
 *   - a cost change made to A AFTER B's price was already fetched does not
 *     move B's price on a fresh evaluation — the derived-pricing basis
 *     fingerprint and approval are scoped per contractor, not per template
 *   - each contractor's LineItem is only ever visible under its OWN
 *     contractorId, never the other's
 *
 * NOT PART OF `npm run verify`. Needs a running server AND a disposable
 * local database whose template was extracted from a contractor carrying
 * the real Routing V2 surface-raceway tree (`prisma/seed-new-outlet-v2.ts`'s
 * `migrateEliteOutletToV2`, then `scripts/extract-template-catalog.ts --from
 * elite-electric --apply`) — the same requirement
 * verify-integration-manual-routing-storefront-browser-flow.ts already
 * states, reused here rather than restated as a separate mechanism.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { buildPricedDerivedContractor, removeFixture, fixtureSlug, changeChannelCost, reapprove } from "./_derivedStorefrontFixture";
import { liveEndpointOf, resetRefusal } from "../lib/electrical/pilotScope";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";
const SLUG_A = fixtureSlug("two-fresh-a");
const SLUG_B = fixtureSlug("two-fresh-b");

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
  await page.getByRole("button", { name: label, exact: false }).first().click();
}

/** purpose -> access -> install method, the real gate above the route module. */
async function qualifyForSurfaceRoute(page: Page) {
  await answerChoice(page, "What will this outlet power?", "General use");
  await answerChoice(
    page,
    "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below where the outlet is going?",
    "No"
  );
  await answerChoice(page, "How would you like the wiring run?", "Surface-mounted channel on the wall");
}

async function walkStraightRoute(page: Page, feet: string) {
  await answerNumber(page, "How long is the route, in feet?", feet);
  await answerNumber(page, "How many inside corners?", "0");
  await answerNumber(page, "How many outside corners?", "0");
  await answerNumber(page, "How many turns stay flat on the wall?", "0");
  await answerChoice(page, "What is the wall made of?", "Drywall");
  await answerChoice(page, "Is anything in the way?", "No — it's a clear run along the wall");
}

type TenantResult = {
  contractorId: string;
  serviceId: string;
  publicId: string;
  sessionToken: string;
  approvedTotalCents: number | null;
  straightPriceDisplayed: string;
  straightPriceCents: number;
};

/** Manual completion, fractional footage, correct pricing, REVIEW — for ONE fresh contractor. */
async function proveTenant(
  browser: import("playwright").Browser,
  slug: string,
  feet: string,
  channelCostCents: number
): Promise<TenantResult> {
  const fixture = await buildPricedDerivedContractor(prisma, slug);
  // The one supported action that makes this contractor's economics its
  // OWN, not a copy of whatever FIXTURE_COSTS happened to default to —
  // the same writeMaterialCost path any contractor's admin would use.
  await changeChannelCost(fixture.contractorId, channelCostCents);
  const reapproved = await reapprove(prisma, fixture.contractorId, fixture.serviceId);

  const targetUrl = `${BASE}/${slug}/services/x/new-120v-outlet`;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // ── manual completion, straight route, fractional footage ──────────────
  await page.goto(targetUrl);
  await page.getByRole("button", { name: /Check My Price|Start/ }).click();
  await qualifyForSurfaceRoute(page);
  await walkStraightRoute(page, feet);
  await page.waitForSelector("text=Here's Your Price!");
  const displayed = await priceText(page);
  ok(`${slug}: manual completion (zero Route Assist interaction) resolves to a real price, not REVIEW`,
    /^\$[0-9,]+(\.[0-9]{2})?$/.test(displayed) && errors.length === 0,
    `price=${displayed} errors=${errors.join("; ")}`);

  await page.getByRole("button", { name: /Add to My Visit/ }).click();
  await page.waitForURL(/\/my-visit/, { waitUntil: "commit" });
  const lineItem = await prisma.lineItem.findFirst({
    where: { serviceId: fixture.serviceId },
    orderBy: { id: "desc" },
    select: { computedPriceCents: true, visit: { select: { contractorId: true } } },
  });
  const displayedCents = Math.round(parseFloat(displayed.replace(/[$,]/g, "")) * 100);
  ok(`${slug}: the displayed price equals the stored LineItem.computedPriceCents`,
    lineItem?.computedPriceCents === displayedCents,
    `displayed ${displayed} (${displayedCents}c), stored ${lineItem?.computedPriceCents}c`);
  ok(`${slug}: the LineItem belongs to THIS contractor, not some other tenant`,
    lineItem?.visit.contractorId === fixture.contractorId,
    `expected ${fixture.contractorId}, got ${lineItem?.visit.contractorId}`);

  // The real anonymous-session identity this customer's browser is carrying
  // — lib/sessionCookieConfig.ts's SESSION_COOKIE_NAME — captured before the
  // context closes so main() can replay it against the OTHER contractor's
  // site through the actual API, not just query the database directly.
  const cookies = await ctx.cookies();
  const sessionToken = cookies.find((c) => c.name === "elite_session_id")?.value ?? "";
  ok(`${slug}: the customer's session cookie is real and captured for the cross-tenant API proof`,
    sessionToken.length > 0, `cookies: ${cookies.map((c) => c.name).join(", ")}`);

  await ctx.close();

  // ── a turned route lands on REVIEW, not a guess ─────────────────────────
  {
    const rctx = await browser.newContext();
    const rpage = await rctx.newPage();
    rpage.setDefaultTimeout(30000);
    await rpage.goto(targetUrl);
    await rpage.getByRole("button", { name: /Check My Price|Start/ }).click();
    await qualifyForSurfaceRoute(rpage);
    await answerNumber(rpage, "How long is the route, in feet?", feet);
    await answerNumber(rpage, "How many inside corners?", "0");
    await answerNumber(rpage, "How many outside corners?", "0");
    await answerNumber(rpage, "How many turns stay flat on the wall?", "1");
    await answerChoice(rpage, "What is the wall made of?", "Drywall");
    await answerChoice(rpage, "Is anything in the way?", "No — it's a clear run along the wall");
    const landed = await Promise.race([
      rpage.getByRole("heading", { name: "Here's Your Price!", exact: true }).waitFor().then(() => "PRICED"),
      rpage.getByRole("heading", { name: "We can price this remotely.", exact: true }).waitFor().then(() => "REVIEW"),
    ]).catch(() => "NEITHER");
    ok(`${slug}: a turned route (one flat corner) lands on review, not a guessed price`,
      landed === "REVIEW", `got ${landed}`);
    await rctx.close();
  }

  return {
    contractorId: fixture.contractorId,
    serviceId: fixture.serviceId,
    publicId: fixture.publicId,
    sessionToken,
    approvedTotalCents: reapproved,
    straightPriceDisplayed: displayed,
    straightPriceCents: displayedCents,
  };
}

async function main() {
  console.log(`\nTWO FRESH CONTRACTORS — Routing V2 through supported installation, never repaired\n`);
  console.log(`  ${BASE}  ·  ${SLUG_A}  ·  ${SLUG_B}\n`);

  // EXECUTABLE, not just documented — same guard
  // scripts/verify-derived-scheduling-browser.ts already uses, checked for
  // BOTH contractors this script creates.
  const identity = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" }, select: { key: true, neonEndpoint: true } });
  const liveEndpoint = liveEndpointOf(process.env.DATABASE_URL ?? "");
  for (const slug of [SLUG_A, SLUG_B]) {
    const guard = resetRefusal({ slug, identity, liveEndpoint });
    if (guard) { console.log(`  STOP: ${guard.code} — this suite runs on a rehearsal database only.`); process.exit(2); }
  }

  await removeFixture(prisma, SLUG_A).catch(() => {});
  await removeFixture(prisma, SLUG_B).catch(() => {});
  const browser = await chromium.launch();
  try {
    // Two different footages AND two different channel costs — a shared
    // number between them would mean the isolation proof below is
    // vacuous, not passing.
    const a = await proveTenant(browser, SLUG_A, "20.5", 1457);
    const b = await proveTenant(browser, SLUG_B, "33.25", 2891);

    console.log("\n  TENANT ISOLATION\n");

    ok("A and B were approved at genuinely different totals — their economics are their own, not shared",
      a.approvedTotalCents !== null && b.approvedTotalCents !== null && a.approvedTotalCents !== b.approvedTotalCents,
      `A=${a.approvedTotalCents}c, B=${b.approvedTotalCents}c`);

    ok("A's and B's straight-route prices differ (different footage, different costs)",
      a.straightPriceDisplayed !== b.straightPriceDisplayed,
      `A=${a.straightPriceDisplayed}, B=${b.straightPriceDisplayed}`);

    // A material-cost change to A, made AFTER B's price was already
    // fetched and stored, must not move B's price on a FRESH evaluation —
    // the derived-pricing basis fingerprint and approval are scoped per
    // contractor (lib/electrical/derivedPricingBasis.ts), not shared
    // across tenants that happen to install the same template service.
    await changeChannelCost(a.contractorId, 9999);
    const bCtx = await browser.newContext();
    const bPage = await bCtx.newPage();
    bPage.setDefaultTimeout(30000);
    await bPage.goto(`${BASE}/${SLUG_B}/services/x/new-120v-outlet`);
    await bPage.getByRole("button", { name: /Check My Price|Start/ }).click();
    await qualifyForSurfaceRoute(bPage);
    await walkStraightRoute(bPage, "33.25");
    await bPage.waitForSelector("text=Here's Your Price!");
    const bPriceAfterAChanged = await priceText(bPage);
    ok("a cost change to A leaves B's price on a fresh evaluation unchanged — no cross-tenant leakage",
      bPriceAfterAChanged === b.straightPriceDisplayed,
      `B before A's change: ${b.straightPriceDisplayed}; B after: ${bPriceAfterAChanged}`);
    await bCtx.close();

    const aLineItems = await prisma.lineItem.count({ where: { visit: { contractorId: a.contractorId } } });
    const bLineItemsUnderA = await prisma.lineItem.count({ where: { visit: { contractorId: a.contractorId }, serviceId: b.serviceId } });
    ok("A has its own LineItem(s)", aLineItems > 0, `count=${aLineItems}`);
    ok("none of B's service rows are ever reachable under A's contractorId",
      bLineItemsUnderA === 0, `count=${bLineItemsUnderA}`);

    const distinctContractors = new Set([a.contractorId, b.contractorId]);
    const distinctServices = new Set([a.serviceId, b.serviceId]);
    ok("A and B are two genuinely separate contractors", distinctContractors.size === 2);
    ok("A and B each got their OWN new-120v-outlet Service row, not a shared one", distinctServices.size === 2);

    // ── CROSS-TENANT ACCESS THROUGH THE ACTUAL API, not a database count ──
    //
    // GET /api/visit scopes its Visit lookup by BOTH the caller's site
    // header (app/api/visit/route.ts's own `site.contractorId`) AND the
    // caller's session id — so A's real customer identity, replayed against
    // B's site, must find nothing: no Visit row exists for (contractorId:
    // B, sessionId: A's token), because A's real visit was written under
    // (contractorId: A, sessionId: A's token). This is the actual boundary
    // a malicious or misconfigured client would hit, not an inference from
    // row counts.
    const asSite = (publicId: string, sessionToken: string) =>
      fetch(`${BASE}/api/visit`, {
        headers: { "x-price2book-site": publicId, "x-price2book-visit": sessionToken },
      }).then((r) => r.json());

    const aOwnVisit = await asSite(a.publicId, a.sessionToken);
    ok("sanity: A's own session against A's own site sees A's real visit through the API",
      Array.isArray(aOwnVisit.lineItems) && aOwnVisit.lineItems.length > 0 && aOwnVisit.totalCents === a.straightPriceCents,
      `got ${JSON.stringify(aOwnVisit)}`);

    const bOwnVisit = await asSite(b.publicId, b.sessionToken);
    ok("sanity: B's own session against B's own site sees B's real visit through the API",
      Array.isArray(bOwnVisit.lineItems) && bOwnVisit.lineItems.length > 0 && bOwnVisit.totalCents === b.straightPriceCents,
      `got ${JSON.stringify(bOwnVisit)}`);

    const aSessionAgainstBSite = await asSite(b.publicId, a.sessionToken);
    ok("A's real session, replayed against B's site through the actual API, sees NOTHING of A's — not B's data either, just empty",
      Array.isArray(aSessionAgainstBSite.lineItems) && aSessionAgainstBSite.lineItems.length === 0 && aSessionAgainstBSite.totalCents === 0,
      `got ${JSON.stringify(aSessionAgainstBSite)}`);

    const bSessionAgainstASite = await asSite(a.publicId, b.sessionToken);
    ok("B's real session, replayed against A's site through the actual API, sees NOTHING of B's either — the isolation holds both directions",
      Array.isArray(bSessionAgainstASite.lineItems) && bSessionAgainstASite.lineItems.length === 0 && bSessionAgainstASite.totalCents === 0,
      `got ${JSON.stringify(bSessionAgainstASite)}`);
  } finally {
    await browser.close();
    await removeFixture(prisma, SLUG_A).catch(() => {});
    await removeFixture(prisma, SLUG_B).catch(() => {});
  }
  ok("both fixtures are gone at the end",
    (await prisma.contractor.count({ where: { slug: { in: [SLUG_A, SLUG_B] } } })) === 0);

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
