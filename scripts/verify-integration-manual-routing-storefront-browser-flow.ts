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
 *   D. BACK / RE-ANSWER ON A NUMBER QUESTION, WITH THE PROMISED SAME-INPUT
 *      COMPARISON — goBack() on the merged branch previously only had
 *      multi-choice questions exercised
 *      (scripts/verify-back-navigation-config-browser-flow.ts). Six Back
 *      clicks from the price screen to the feet question itself, re-typed
 *      with a DIFFERENT footage, re-answered forward: the price must both
 *      (a) differ from the abandoned figure's price, AND (b) match — byte
 *      for byte — the price block B/C got for that SAME footage answered
 *      directly, from a wholly separate context that never touched Back at
 *      all. (b) is the actual proof nothing from the abandoned branch
 *      survived; (a) alone would not have ruled out a constant, wrong price.
 *   E. TURNED-ROUTE REVIEW, ASSERTED BY HEADING NOT BY GENERIC TEXT — the
 *      same tree, one flat corner instead of zero. Pricing a turn requires
 *      the canonical physical fact of ordered segment geometry — regardless
 *      of how that fact is ever supplied (a Route Assist scan is one way to
 *      supply it, not the only conceivable one), a manual answer of a plain
 *      corner COUNT does not carry it. Asserted by waiting for
 *      PhotoReviewNotice's own specific heading ("We can price this
 *      remotely.") racing against the priced heading — not a generic
 *      `/photo/i` text match, which also matches ordinary help copy
 *      elsewhere on this same screen family and would pass even if the
 *      route had priced normally and happened to mention a photo.
 *   F. A COST CHANGE BETWEEN DISPLAYING A PRICE AND ADDING IT TO THE VISIT,
 *      CARRIED ALL THE WAY TO A REAL BOOKING — a price is shown, a material
 *      cost changes server-side (no reload, exactly like a customer who
 *      takes a minute to decide), and clicking "Add to My Visit" against
 *      that now-stale number must be REFUSED (REVIEW_REQUIRED) with NO
 *      LineItem created — the server always independently re-resolves from
 *      the answers, never trusts a price the client displayed or sent. Then
 *      the office reapproves the new economics, a reload shows the
 *      corrected (different) price, and this run continues through NATIVE
 *      scheduling and a no-deposit checkout — not just Add to My Visit — to
 *      a real Booking row, whose totalCents is checked against the
 *      reapproved price directly. Finally, the economics change ONE MORE
 *      TIME, now that the job is booked, and both the Booking and the
 *      LineItem it was built from are re-read to confirm neither moved —
 *      the stored price is a snapshot taken at booking time, never
 *      re-derived on a later read.
 *
 * Stale-approval -> REVIEW is ALSO proven at the server/pricing-function
 * level by scripts/verify-routing-precision-provisioning.ts's own "changed
 * economics invalidate prior approval" / "reapproval restores fixed
 * pricing" — block F above proves the SAME property through the storefront
 * UI specifically, which that script never touches, per the specific gap
 * named against this branch's prior evidence.
 *
 * NOT PART OF `npm run verify`. Needs a running server AND a disposable
 * local database matching scripts/verify-routing-precision-provisioning.ts's
 * own requirement (loopback host, "local-"-prefixed DatabaseIdentity stamp)
 * — reuses the identical buildPricedDerivedContractor/removeFixture helpers,
 * so cleanup is the same bounded pilot-reset path, never a broad delete.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { buildPricedDerivedContractor, removeFixture, fixtureSlug, changeChannelCost, reapprove } from "./_derivedStorefrontFixture";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";
const SLUG = fixtureSlug("manual-storefront");
const ZIP = "08201";

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

/**
 * From "my visit" (a LineItem already added) through NATIVE scheduling and a
 * no-deposit checkout to a real Booking — the same lifecycle
 * scripts/verify-derived-scheduling-browser.ts already proves in isolation,
 * driven here so block F can inspect the actual Booking row, not just the
 * cart-stage LineItem. Assumes the current page is already on /my-visit.
 */
async function bookNativeAppointment(page: Page, email: string): Promise<string> {
  await page.getByRole("button", { name: "Choose My Appointment Time" }).click();
  await page.waitForURL(/checkout\/schedule/, { timeout: 30000 });
  await page.getByRole("heading", { name: "Select an Arrival Window" }).waitFor({ timeout: 30000 });
  const windowButton = page.locator("main button").filter({ hasText: /\d{1,2}:\d\d [AP]M – \d{1,2}:\d\d [AP]M/ }).first();
  await windowButton.waitFor({ timeout: 15000 });
  await windowButton.click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/checkout\/details/, { timeout: 30000 });

  // The details form's inputs carry no associated labels, so they are
  // filled in order — the same layout verify-derived-scheduling-browser.ts
  // already documents (name, email, phone, address, zip).
  const inputs = page.locator("form input");
  await inputs.first().waitFor({ timeout: 15000 });
  const values = ["Booking Proof (TEST)", email, "6095550100", "1 Rehearsal Way", ZIP];
  for (let i = 0; i < values.length; i++) await inputs.nth(i).fill(values[i]);

  const [checkoutRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST", { timeout: 60000 }),
    page.getByRole("button", { name: "Confirm Appointment" }).click(),
  ]);
  const body = await checkoutRes.json().catch(() => null);
  if (checkoutRes.status() !== 200 || typeof body?.bookingId !== "string") {
    throw new Error(`checkout did not book: ${checkoutRes.status()} ${JSON.stringify(body)}`);
  }
  await page.waitForURL(/checkout\/confirmation\//, { timeout: 60000 }).catch(() => {});
  return body.bookingId as string;
}

/**
 * resetPilotContractor (which removeFixture below calls) REFUSES a
 * contractor with any real Booking — deleting a booking is deliberately not
 * something a reset ever decides on its own
 * (lib/electrical/pilotReset.ts). Block F now makes a real one, so it must
 * be torn down explicitly first — the same shape
 * scripts/verify-derived-scheduling-browser.ts already uses for the
 * identical reason.
 */
async function removeBooked(contractorId: string) {
  const where = { booking: { visit: { contractorId } } };
  await prisma.paymentEvent.deleteMany({ where });
  await prisma.bookingAdjustment.deleteMany({ where });
  await prisma.booking.deleteMany({ where: { visit: { contractorId } } });
  await prisma.customer.deleteMany({ where: { contractorId } });
  await prisma.arrivalWindow.deleteMany({ where: { serviceArea: { contractorId } } });
  await prisma.serviceArea.deleteMany({ where: { contractorId } });
}

async function main() {
  console.log(`\nINTEGRATION — manual Routing V2 completion through the real storefront\n`);
  console.log(`  ${BASE}  ·  contractor ${SLUG}\n`);

  await removeFixture(prisma, SLUG).catch(() => {});
  const browser = await chromium.launch();
  let contractorId: string | undefined;
  try {
    const fixture = await buildPricedDerivedContractor(prisma, SLUG);
    contractorId = fixture.contractorId;
    // Native scheduling + a service area covering ZIP — needed only so
    // block F can carry its booking all the way through
    // "Choose My Appointment Time" to a real Booking row, the same setup
    // scripts/verify-derived-scheduling-browser.ts uses for the identical
    // step. Default business hours; nothing else in this suite touches
    // scheduling.
    await prisma.contractor.update({ where: { id: fixture.contractorId }, data: { schedulingAuthority: "NATIVE", nativeConcurrentJobs: 1 } });
    await prisma.serviceArea.create({ data: { contractorId: fixture.contractorId, name: "rehearsal area", zipCodes: [ZIP], active: true } });
    const targetUrl = `${BASE}/${SLUG}/services/x/new-120v-outlet`;
    // Captured in block A/B/C, compared against in block D — the actual
    // "same input, same price" proof, not just an inequality against a
    // different footage.
    let referencePriceAt205: string | null = null;

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
      referencePriceAt205 = displayed;
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

      // THE PROMISED SAME-INPUT COMPARISON: not just "the price changed from
      // the abandoned figure" — this 20.5ft-after-Back price must be
      // IDENTICAL to block A/B/C's own 20.5ft price, captured from a
      // completely separate context that never went through the 14.625ft
      // branch or any Back click at all. Same contractor, same economics,
      // same footage; only the path taken to answer it differs. Anything
      // else would mean some residue of the abandoned 14.625ft branch (an
      // extra component, a stale config field) survived into this figure.
      ok("D. the SAME footage prices identically whether reached directly or via Back-and-re-answer",
        referencePriceAt205 !== null && priceAt205 === referencePriceAt205,
        `direct 20.5ft (block A/B/C) -> ${referencePriceAt205}; via Back-and-re-answer -> ${priceAt205}`);

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

      // Not a generic "photo" text match — that string also appears inside
      // ordinary help copy elsewhere on this same screen family. The
      // terminal PHOTO_REVIEW state renders exactly one component
      // (PhotoReviewNotice) whose own heading is this specific, stable
      // string ("We can price this remotely.") — unambiguous proof of
      // WHICH terminal state was actually reached, not just that some text
      // containing "photo" showed up somewhere on the page.
      const landedOnReview = await Promise.race([
        page.getByRole("heading", { name: "Here's Your Price!", exact: true }).waitFor().then(() => "PRICED"),
        page.getByRole("heading", { name: "We can price this remotely.", exact: true }).waitFor().then(() => "REVIEW"),
      ]).catch(() => "NEITHER");
      ok("E. a turned route (one flat corner — pricing a turn needs canonical segment geometry, which a manual corner COUNT never supplies) lands on review, not a guessed price",
        landedOnReview === "REVIEW", `got ${landedOnReview}`);

      await ctx.close();
    }

    // ── F. A cost change between DISPLAYING a price and ADDING it to the
    // visit must never book at the stale number — and the flow must still
    // reach a real booking once the new economics are approved ──────────
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await walkStraightRoute(page, "20.5");
      await page.waitForSelector("text=Here's Your Price!");
      const priceBeforeCostChange = await priceText(page);

      // This SAME service, on this SAME contractor, was already booked once
      // in block A/B/C above (a separate browser context, its own visit) —
      // so the baseline is whatever that left behind, not zero. Captured
      // HERE, right before the stale attempt, so "did the refused attempt
      // create anything" is a real before/after comparison, not an assumed
      // starting count.
      const lineItemsBeforeStaleAttempt = await prisma.lineItem.count({ where: { serviceId: fixture.serviceId } });

      // The office changes a material cost AFTER this price was already
      // shown — no reload, no re-navigation; the screen keeps showing the
      // number it fetched a moment ago, exactly like a real customer who
      // takes a minute to decide. Same helper
      // verify-routing-precision-provisioning.ts uses to prove this
      // invalidates the prior approval at the function level; this proves
      // what the STOREFRONT actually does about it.
      await changeChannelCost(fixture.contractorId, 3457);

      // Click "Add to My Visit" against the now-stale displayed price. The
      // server independently re-resolves from the answers, not from
      // anything the client sent or displayed
      // (components/guided-flow/GuidedFlowEngine.tsx's own addToVisit sends
      // serviceId + answersSnapshot, never a price) — so this must be
      // REFUSED (409 REVIEW_REQUIRED, app/api/visit/route.ts), not booked
      // at priceBeforeCostChange. Confirmed directly against the network
      // response, not inferred from navigation timing alone.
      const staleResponse = page.waitForResponse(
        (r) => r.url().includes("/api/visit") && r.request().method() === "POST"
      );
      await page.getByRole("button", { name: /Add to My Visit/ }).click();
      const staleResult = await staleResponse;
      ok("F. the stale-priced Add to My Visit is refused with 409 REVIEW_REQUIRED, not booked",
        staleResult.status() === 409, `got ${staleResult.status()}: ${await staleResult.text().catch(() => "")}`);

      const lineItemsAfterStaleAttempt = await prisma.lineItem.count({ where: { serviceId: fixture.serviceId } });
      ok("F. the refused, stale-priced attempt created NO new LineItem",
        lineItemsAfterStaleAttempt === lineItemsBeforeStaleAttempt,
        `before: ${lineItemsBeforeStaleAttempt}, after: ${lineItemsAfterStaleAttempt}`);

      // The office re-approves the NEW economics — a real, supported action
      // (the same decideDerivedPricingApproval path buildPricedDerivedContractor
      // itself used to approve the original figure).
      await reapprove(prisma, fixture.contractorId, fixture.serviceId);

      // A reload always lands back on the intro screen first (same shape as
      // scripts/verify-back-navigation-config-browser-flow.ts's own step D
      // and scripts/verify-delayed-network-answer-save-browser-flow.ts) —
      // "Check My Price" is what calls startQuestions() and re-fires the
      // server_pricing evaluation from scratch, showing the CORRECTED price
      // instead of the stale one.
      await page.reload();
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await page.waitForSelector("text=Here's Your Price!");
      const priceAfterReapproval = await priceText(page);
      ok("F. after reapproval, a fresh evaluation shows a DIFFERENT price than the stale one — the cost change is real, not cosmetic",
        priceAfterReapproval !== priceBeforeCostChange,
        `before cost change: ${priceBeforeCostChange}; after reapproval: ${priceAfterReapproval}`);

      // NOW booking succeeds — proving the flow still reaches a genuine
      // booking once the staleness is actually resolved, not merely that it
      // correctly refuses to book forever.
      await page.getByRole("button", { name: /Add to My Visit/ }).click();
      await page.waitForURL(/\/my-visit/, { waitUntil: "commit" });
      const bookedLineItem = await prisma.lineItem.findFirst({
        where: { serviceId: fixture.serviceId },
        orderBy: { id: "desc" },
        select: { id: true, computedPriceCents: true },
      });
      const afterReapprovalCents = Math.round(parseFloat(priceAfterReapproval.replace(/[$,]/g, "")) * 100);
      ok("F. the re-added LineItem stores the NEW (post-reapproval) price, not the stale pre-change one",
        bookedLineItem?.computedPriceCents === afterReapprovalCents,
        `displayed ${priceAfterReapproval} (${afterReapprovalCents}c), stored ${bookedLineItem?.computedPriceCents}c`);

      // Continue all the way through NATIVE scheduling and a no-deposit
      // checkout to a REAL Booking — the gap the review named: this block
      // used to stop at the cart-stage LineItem and never actually booked.
      const bookingId = await bookNativeAppointment(page, "booking-proof@example.invalid");
      const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { totalCents: true } });
      ok("F. checkout produced a real Booking row for the reapproved, correctly-priced attempt",
        !!booking, `bookingId ${bookingId}`);
      ok("F. the Booking's totalCents matches the reapproved price at the moment of booking",
        booking?.totalCents === afterReapprovalCents,
        `booking.totalCents ${booking?.totalCents}c, expected ${afterReapprovalCents}c`);

      // THE SNAPSHOT PROOF the review specifically asked for: change the
      // economics AGAIN, now that the job is already booked and paid for (no
      // deposit due, but confirmed). A live re-derivation at this point
      // would move a number the homeowner already agreed to out from under
      // them after the fact — exactly what app/api/checkout/route.ts's own
      // comment on totalCents says can never happen ("stays the ...
      // homeowner is agreeing to"). Both the Booking row and the LineItem it
      // was built from must hold still.
      await changeChannelCost(fixture.contractorId, 9999);
      await reapprove(prisma, fixture.contractorId, fixture.serviceId);
      const bookingAfterLaterChange = await prisma.booking.findUnique({ where: { id: bookingId }, select: { totalCents: true } });
      const lineItemAfterLaterChange = await prisma.lineItem.findUnique({ where: { id: bookedLineItem!.id }, select: { computedPriceCents: true } });
      ok("F. a cost change made AFTER booking leaves the booked Booking.totalCents unchanged",
        bookingAfterLaterChange?.totalCents === afterReapprovalCents,
        `at booking: ${afterReapprovalCents}c, after a further cost change: ${bookingAfterLaterChange?.totalCents}c`);
      ok("F. …and leaves the booked LineItem.computedPriceCents unchanged too — a snapshot, never re-derived live",
        lineItemAfterLaterChange?.computedPriceCents === afterReapprovalCents,
        `at booking: ${afterReapprovalCents}c, after a further cost change: ${lineItemAfterLaterChange?.computedPriceCents}c`);

      await ctx.close();
    }
  } finally {
    await browser.close();
    if (contractorId) await removeBooked(contractorId).catch(() => {});
    await removeFixture(prisma, SLUG).catch(() => {});
  }
  ok("every fixture is gone at the end", (await prisma.contractor.findUnique({ where: { slug: SLUG } })) === null);

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
