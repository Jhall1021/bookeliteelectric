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
import { liveEndpointOf, resetRefusal } from "../lib/electrical/pilotScope";
import { assertLoopbackOrDesignatedRemoteTarget } from "./_remoteCompatibleGuard";
import { checkDeploymentIdentityResponse } from "./_deployedIdentityCheck";
import { newProtectedContext } from "./_previewProtectionAccess";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";
const SLUG = fixtureSlug("manual-storefront");
const ZIP = "08201";

/**
 * For a REMOTE target: proves the app actually serving BASE is connected to
 * THIS SAME database, and that no real provider effect is configured for
 * this specific run — through app/api/deployment-identity/route.ts, which
 * this repo already ships and which returns no secret value, ever. A
 * missing bypass secret means this cannot be proven, so it refuses rather
 * than skip — "unsupported/missing browser verification must exit nonzero
 * BEFORE any destructive work" (docs/design/electrical-preview-
 * initialization.md §9.6 item 3), not a silent pass.
 */
async function checkDeployedIdentityMatches(targetUrl: string): Promise<void> {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypass) { console.log("  STOP: VERCEL_AUTOMATION_BYPASS_SECRET is not set — cannot confirm the deployed app's identity before writing to a remote target."); process.exit(1); }
  const res = await fetch(`${BASE}/api/deployment-identity`, { headers: { "x-vercel-protection-bypass": bypass } });
  if (!res.ok) { console.log(`  STOP: /api/deployment-identity returned ${res.status} — cannot confirm the deployed app's identity.`); process.exit(1); }
  const body = await res.json();
  const check = checkDeploymentIdentityResponse(body, targetUrl);
  if (!check.ok) { console.log(`  STOP: ${check.reason} — refusing to write fixtures against a target the app may not actually be serving.`); process.exit(1); }
  console.log(`  deployed app identity confirmed against ${targetUrl}, and no transactional/platform Resend key is configured server-side`);
}

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

/**
 * The real qualification gate above the surface-route module — a fresh
 * install's own `new-120v-outlet` asks these before it ever asks a route
 * question, exactly as `elite-electric`'s does (this contractor's whole tree
 * was installed from a template extracted off it). Every context below must
 * answer this first; it is not part of `walkStraightRoute` because block D's
 * Back navigation targets the FEET question specifically and never needs to
 * re-answer it.
 *
 * TWO questions, not one — a prior version of this asked a single retired
 * "What will this outlet power?" (`purpose`, prisma/seed-questions.ts).
 * prisma/seed-outlet-power-source.ts runs after that seed in every chain
 * that includes it and explicitly deletes `purpose` ("Two questions asking
 * nearly the same thing is worse than either alone, so the older one goes"),
 * replacing it with these two real ones: `outlet_load_type` ("What will you
 * be plugging in?", "Everyday things" continues) then `outlet_power_source`
 * ("How would you like it powered?", "From the nearest outlet" continues
 * into `below_above_access`). See lib/electrical/onboardingPilotReadiness.ts's
 * PILOT_ANSWERS for the same correction at the function-level.
 */
async function qualifyForSurfaceRoute(page: Page) {
  await answerChoice(page, "What will you be plugging in?", "Everyday things");
  await answerChoice(page, "How would you like it powered?", "From the nearest outlet");
  await answerChoice(
    page,
    "Is there a basement (unfinished, or with a drop ceiling) or attic directly above or below where the outlet is going?",
    "No"
  );
  await answerChoice(page, "How would you like the wiring run?", "Surface-mounted channel on the wall");
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

  // THREE GUARDS, THREE DIFFERENT JOBS — belt and braces, not redundancy.
  //
  // assertLoopbackOrDesignatedRemoteTarget enforces the REHEARSAL BOUNDARY:
  // a loopback Postgres explicitly stamped "local-*" (unchanged default —
  // assertDisposableLocalDatabase, exactly as before this guard existed),
  // OR an explicitly designated remote target verified through
  // init-preview-database.ts's own decideRemoteTarget (exact endpoint/
  // project/database plus inherited-lineage classification) — never a bare
  // "anything non-loopback passes." It says nothing about which contractor
  // is being mutated — a legitimate rehearsal database could still carry a
  // copy of a real tenant's rows.
  //
  // resetRefusal enforces the TENANT boundary on top of that: SLUG must be
  // a designated rehearsal contractor and never elite-electric/
  // brightpath-electric, on either a local or a remote target.
  //
  // For a remote target, checkDeployedIdentityMatches (below) is the THIRD
  // guard: the app actually serving BASE must be confirmed talking to THIS
  // SAME database before any fixture write happens — the target decision
  // above proves the DATABASE is the right one; it says nothing about
  // whether the deployment at BASE is the one connected to it.
  const targetUrl = process.env.DATABASE_URL ?? "";
  const targetDecision = await assertLoopbackOrDesignatedRemoteTarget(prisma, targetUrl);
  if (!targetDecision.ok) { console.log(`  STOP: ${targetDecision.reason}`); process.exit(1); }
  if (targetDecision.mode === "remote") await checkDeployedIdentityMatches(targetUrl);
  const identity = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" }, select: { key: true, neonEndpoint: true } });
  const guard = resetRefusal({ slug: SLUG, identity, liveEndpoint: liveEndpointOf(process.env.DATABASE_URL ?? "") });
  if (guard) { console.log(`  STOP: ${guard.code} — this suite runs on a rehearsal database only.`); process.exit(2); }

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
      const ctx = await newProtectedContext(browser, BASE, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      // The optional "measure with your phone" button DOES render on this
      // exact route — surface_route_feet/inside/outside corner counts are
      // all registered in lib/visual-assist/route-assist/
      // guidedFlowInvocation.ts's REGISTRY — so "zero Route Assist
      // interaction" is a claim about never CALLING it, not about it being
      // absent. lib/routeAssistHandoffClient.ts's only network surface is
      // /api/guided-flow-sessions/:id/visual-assist-tasks; watched directly
      // rather than inferred from "the button was never clicked".
      const routeAssistCalls: string[] = [];
      page.on("request", (r) => { if (r.url().includes("/visual-assist-tasks")) routeAssistCalls.push(r.url()); });

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await qualifyForSurfaceRoute(page);
      await walkStraightRoute(page, "20.5");
      await page.waitForSelector("text=Here's Your Price!");
      const displayed = await priceText(page);
      referencePriceAt205 = displayed;
      ok("B. a straight route (all corners 0, clear, drywall) resolves to a real price, not REVIEW",
        /^\$[0-9,]+(\.[0-9]{2})?$/.test(displayed), `got ${displayed}`);
      ok("A. reached that price with zero Route Assist interaction — every answer was typed/clicked manually",
        errors.length === 0, errors.join("; "));
      ok("A. …and zero Route Assist NETWORK calls, verified directly — its own capture button renders on this exact route (feet/inside/outside corners are all registered) but was never opened",
        routeAssistCalls.length === 0, `calls: ${routeAssistCalls.join(", ")}`);

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

    // ── G. The qualification gate's large-appliance hand-off actually goes
    // somewhere LIVE and BOOKABLE — the outlet's own launch depends on it
    // (activateService's DEPENDENCY_UNAVAILABLE check, satisfied through
    // real configuration/publish/activation, not a flag flip — see
    // _derivedStorefrontFixture.ts), so the launch proof is incomplete
    // without actually walking the hand-off itself ─────────────────────────
    {
      const ctx = await newProtectedContext(browser, BASE, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      // The real reroute-triggering answer on the current, non-retired
      // question — see qualifyForSurfaceRoute's own comment for why this is
      // `outlet_load_type`, not the deleted `purpose`.
      await answerChoice(page, "What will you be plugging in?", "A fridge, freezer, or window air conditioner");

      await page.getByRole("heading", { name: "Based on your answer, you actually need a different service", exact: true }).waitFor();
      const continueButton = page.getByRole("button", { name: /Continue to/ });
      await continueButton.waitFor();
      ok("G. the hand-off names the real dependency by name, not a generic redirect",
        /Dedicated Circuit/i.test((await continueButton.textContent()) ?? ""),
        `got "${await continueButton.textContent()}"`);
      await continueButton.click();

      // Lands on the dependency's OWN intro — proving the target page is
      // real and live, not a dead link a customer would bounce off of.
      await page.waitForURL(/dedicated-120v-circuit-outlet/, { timeout: 15000 });
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      // Fridge/freezer has a well-known amperage, so its own tree skips
      // asking (real branching this test discovered, not a defect) and goes
      // straight to route access.
      await answerChoice(page, "What will this dedicated circuit power?", "Refrigerator or freezer");
      await answerChoice(page, "Can we reach the wiring path through an unfinished basement, a basement with a removable drop ceiling, or an accessible attic?", "Yes — unfinished basement");
      // A newer question in this tree, added after this test was first
      // written — CONTINUE regardless of the answer, but it still has to be
      // answered before dedicated_distance renders at all.
      await answerChoice(page, "Is this going on an outside wall?", "No, it's an interior wall");
      // The label reads "30 feet or less" because that's the boundary this
      // fixture's own panel_circuit_run.breakpoints policy resolved to
      // ([30, 60]) — the band question rewrites its own option labels from
      // the decided policy, not a fixed number.
      await answerChoice(page, "About how far will the wire travel from the electrical panel to the new outlet?", "30 feet or less");
      await answerChoice(page, "One quick note about access openings", "I understand");
      // A known appliance, an accessible route and a short distance is
      // enough certainty to price this one instantly — real branching this
      // test discovered, not the terminal PHOTO_REVIEW every path was
      // assumed to share. Lands on PricedPhotoReview specifically: a real,
      // locked-in price ($485) plus non-blocking prep photos for the
      // technician (AnswerOption.photosBlockBooking = false) — any of the
      // three real terminal screens this tree can reach is a genuine,
      // fully-functional outcome; anything else means the dependency isn't
      // actually live. Polled rather than raced: three concurrent
      // `waitFor()` calls against a DOM that is still transitioning between
      // render states is exactly the shape that produces a spurious
      // "element detached" rejection racing ahead of the real, later
      // resolution.
      let landedOn: "PRICED" | "REVIEW" | "PRICED_WITH_PHOTOS" | "NEITHER" = "NEITHER";
      for (let i = 0; i < 30 && landedOn === "NEITHER"; i++) {
        const body = await page.innerText("body").catch(() => "");
        if (body.includes("Here's Your Price!")) landedOn = "PRICED";
        else if (body.includes("We can price this remotely.")) landedOn = "REVIEW";
        else if (body.includes("One last thing before you schedule")) landedOn = "PRICED_WITH_PHOTOS";
        else await page.waitForTimeout(1000);
      }
      ok("G. the dependency completes a full path to its own real terminal state — a live, published, activated service, walked end to end, not just a page that loads",
        landedOn === "PRICED" || landedOn === "REVIEW" || landedOn === "PRICED_WITH_PHOTOS", `got ${landedOn}`);
      if (landedOn === "PRICED" || landedOn === "PRICED_WITH_PHOTOS") {
        const dependencyPrice = await priceText(page);
        ok("G. …and it's a real calculated number, not a placeholder",
          /^\$[0-9,]+(\.[0-9]{2})?$/.test(dependencyPrice) && dependencyPrice !== "$0",
          `got ${dependencyPrice}`);
      }

      await ctx.close();
    }

    // ── D. Back three questions to feet itself, re-answer with a DIFFERENT
    // footage, and confirm the price follows the new figure ──────────────
    {
      const ctx = await newProtectedContext(browser, BASE, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await qualifyForSurfaceRoute(page);
      await walkStraightRoute(page, "14.625");
      await page.waitForSelector("text=Here's Your Price!");
      const priceAt14625 = await priceText(page);

      // Back through obstacles -> surface -> flat -> outside -> inside ->
      // feet, however many questions actually sit above feet on THIS
      // contractor's tree (outlet_load_type/outlet_power_source/access/
      // install-method, then the six surface-route questions) — clicked
      // until the feet heading itself is reached, rather than a fixed count
      // tied to one particular tree shape, which a qualification gate above
      // the route module would silently throw off.
      const feetHeading = page.getByRole("heading", { name: "How long is the route, in feet?", exact: true });
      for (let i = 0; i < 15 && !(await feetHeading.count()); i++) {
        await page.getByRole("button", { name: "Back" }).click();
      }
      await feetHeading.waitFor();

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
      const ctx = await newProtectedContext(browser, BASE, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await qualifyForSurfaceRoute(page);
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
      const ctx = await newProtectedContext(browser, BASE, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);

      await page.goto(targetUrl);
      await page.getByRole("button", { name: /Check My Price|Start/ }).click();
      await qualifyForSurfaceRoute(page);
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
      ok("F. the stale-priced Add to My Visit is refused with 409, not booked",
        staleResult.status() === 409, `got ${staleResult.status()}: ${await staleResult.text().catch(() => "")}`);
      // THE EXACT RESPONSE, not just the status code — a 409 for the WRONG
      // reason (a different validation failure, say) would still read as
      // "refused" on status alone. `error: "REVIEW_REQUIRED"` is the
      // specific code GuidedFlowEngine.tsx's own addToVisit branches on
      // (components/guided-flow/GuidedFlowEngine.tsx) to route the customer
      // to a review screen rather than a generic failure.
      const staleBody = await staleResult.json().catch(() => null);
      ok("F. …and the response body names the SPECIFIC reason — REVIEW_REQUIRED, not a generic failure",
        staleBody?.error === "REVIEW_REQUIRED", `got ${JSON.stringify(staleBody)}`);

      const lineItemsAfterStaleAttempt = await prisma.lineItem.count({ where: { serviceId: fixture.serviceId } });
      ok("F. the refused, stale-priced attempt created NO new LineItem",
        lineItemsAfterStaleAttempt === lineItemsBeforeStaleAttempt,
        `before: ${lineItemsBeforeStaleAttempt}, after: ${lineItemsAfterStaleAttempt}`);

      // THE CUSTOMER-VISIBLE SIDE OF THE REFUSAL — a correct API response the
      // UI never surfaces is invisible to the one person the refusal is
      // supposed to protect. GuidedFlowEngine.tsx's addToVisit routes a
      // REVIEW_REQUIRED 409 to PhotoReviewNotice, whose own heading and body
      // are fixed, real customer copy — not a generic error banner, and not
      // the same screen as an ordinary failed request.
      await page.getByRole("heading", { name: "We can price this remotely.", exact: true }).waitFor({ timeout: 15000 });
      const refusalBody = await page.innerText("body").catch(() => "");
      ok("F. …and the customer sees a real, specific refusal message naming this service, not a generic error",
        refusalBody.includes("mean we need a few photos to confirm the price") && refusalBody.includes("New 120V Outlet"),
        `body: ${refusalBody.slice(0, 300)}`);

      // The office re-approves the NEW economics — a real, supported action
      // (the same decideDerivedPricingApproval path buildPricedDerivedContractor
      // itself used to approve the original figure).
      await reapprove(prisma, fixture.contractorId, fixture.serviceId);
      // WHICH approval actually authorized what's about to be booked —
      // captured now, at the moment it was made, so the provenance check
      // below is a real match against a specific row, not an inference.
      const approvalAtReapproval = await prisma.contractorDerivedPricingApproval.findUnique({
        where: { contractorId_serviceId: { contractorId: fixture.contractorId, serviceId: fixture.serviceId } },
        select: { approvedBasisFingerprint: true },
      });

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
        select: {
          id: true, computedPriceCents: true, answersSnapshot: true, resolvedEconomicBasis: true,
          resolvedComponentKeys: true, resolvedMaterialCostCents: true,
        },
      });
      const afterReapprovalCents = Math.round(parseFloat(priceAfterReapproval.replace(/[$,]/g, "")) * 100);
      ok("F. the re-added LineItem stores the NEW (post-reapproval) price, not the stale pre-change one",
        bookedLineItem?.computedPriceCents === afterReapprovalCents,
        `displayed ${priceAfterReapproval} (${afterReapprovalCents}c), stored ${bookedLineItem?.computedPriceCents}c`);
      // The economic PROVENANCE of this booking — not just the price it
      // settled on, but the customer's own answers that produced it, AND
      // WHICH economic basis justified that price
      // (lib/electrical/derivedPricingBasis.ts's fingerprint over every
      // price-relevant contractor input — LineItem.resolvedEconomicBasis).
      // A stored price alone is a number; the fingerprint is what makes it
      // accountable to a SPECIFIC, identifiable set of costs, not just "the
      // costs at some point". Captured here, before any further economics
      // change, so both checks below are real before/after comparisons.
      const bookedAnswersAtBooking = JSON.stringify(bookedLineItem?.answersSnapshot);
      const basisAtBooking = bookedLineItem?.resolvedEconomicBasis ?? null;
      ok("F. the booked LineItem records the actual answers that produced its price (SURFACE_KEYS.feet = 20.5)",
        (bookedLineItem?.answersSnapshot as Record<string, unknown> | null)?.[SURFACE_KEYS.feet] === "20.5",
        `got ${bookedAnswersAtBooking}`);
      ok("F. the booked LineItem records WHICH economic basis produced its price — a real fingerprint, not null",
        typeof basisAtBooking === "string" && basisAtBooking.length > 0,
        `got ${JSON.stringify(basisAtBooking)}`);
      // THE MATCH ITSELF — not just "a fingerprint exists", but that it is
      // EXACTLY the one the office's own reapproval actually produced,
      // captured the moment that approval was made. A snapshot that merely
      // looks like a fingerprint but doesn't match the real approval row
      // would be worse than none — it would look like provenance without
      // being it.
      ok("F. the booked fingerprint EXACTLY matches the approval that actually authorized it — not just any non-null value",
        basisAtBooking !== null && basisAtBooking === approvalAtReapproval?.approvedBasisFingerprint,
        `booked: ${basisAtBooking}, approval that authorized it: ${approvalAtReapproval?.approvedBasisFingerprint}`);
      // THE MATERIAL/COMPONENT SNAPSHOTS — the fingerprint says WHICH basis;
      // these say WHAT was actually resolved under it: which components
      // priced this route, and what the material cost was, package-aware —
      // the other half of "why this customer received this price".
      ok("F. the booked LineItem records the real components that priced this route, not an empty snapshot",
        Array.isArray(bookedLineItem?.resolvedComponentKeys) && bookedLineItem.resolvedComponentKeys.length > 0
          && bookedLineItem.resolvedComponentKeys.includes("SURFACE_ROUTE_FT"),
        `got ${JSON.stringify(bookedLineItem?.resolvedComponentKeys)}`);
      ok("F. the booked LineItem records a real, positive resolved material cost, not null or zero",
        typeof bookedLineItem?.resolvedMaterialCostCents === "number" && bookedLineItem.resolvedMaterialCostCents > 0,
        `got ${bookedLineItem?.resolvedMaterialCostCents}`);

      // Continue all the way through NATIVE scheduling and a no-deposit
      // checkout to a REAL Booking — the gap the review named: this block
      // used to stop at the cart-stage LineItem and never actually booked.
      const bookingId = await bookNativeAppointment(page, "booking-proof@example.invalid");
      const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { totalCents: true, visitId: true } });
      ok("F. checkout produced a real Booking row for the reapproved, correctly-priced attempt",
        !!booking, `bookingId ${bookingId}`);
      ok("F. the Booking's totalCents matches the reapproved price at the moment of booking",
        booking?.totalCents === afterReapprovalCents,
        `booking.totalCents ${booking?.totalCents}c, expected ${afterReapprovalCents}c`);
      // THE LINK ITSELF — every check above trusted `bookedLineItem` on the
      // strength of "most recent LineItem for this service", captured before
      // any Booking existed to join through. Now that a real Booking does
      // exist, walk the actual relation — Booking.visitId -> LineItem.visitId
      // — and prove the row inspected above is the SAME row the completed
      // Booking's own Visit actually contains, not a recency guess that
      // happened to be right in a suite with no concurrent activity.
      const lineItemViaBooking = await prisma.lineItem.findFirst({
        where: { visitId: booking?.visitId, serviceId: fixture.serviceId },
        select: { id: true },
      });
      ok("F. the LineItem inspected throughout this block IS the one the completed Booking's Visit actually contains — a real join, not an inference from recency",
        !!booking?.visitId && lineItemViaBooking?.id === bookedLineItem?.id,
        `inspected LineItem ${bookedLineItem?.id}, LineItem via Booking.visitId (${booking?.visitId}): ${lineItemViaBooking?.id}`);

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
      const lineItemAfterLaterChange = await prisma.lineItem.findUnique({
        where: { id: bookedLineItem!.id },
        select: {
          computedPriceCents: true, answersSnapshot: true, resolvedEconomicBasis: true,
          resolvedComponentKeys: true, resolvedMaterialCostCents: true,
        },
      });
      ok("F. a cost change made AFTER booking leaves the booked Booking.totalCents unchanged",
        bookingAfterLaterChange?.totalCents === afterReapprovalCents,
        `at booking: ${afterReapprovalCents}c, after a further cost change: ${bookingAfterLaterChange?.totalCents}c`);
      ok("F. …and leaves the booked LineItem.computedPriceCents unchanged too — a snapshot, never re-derived live",
        lineItemAfterLaterChange?.computedPriceCents === afterReapprovalCents,
        `at booking: ${afterReapprovalCents}c, after a further cost change: ${lineItemAfterLaterChange?.computedPriceCents}c`);
      // ECONOMIC PROVENANCE, THE OTHER HALF: the price is one snapshot, but a
      // price with no record of what it was priced FROM is unaccountable —
      // an auditor, or a homeowner disputing a charge, needs the ANSWERS
      // that justified it, not just the number. Both must survive a later
      // economics change untouched, together.
      ok("F. …and the booked LineItem's answersSnapshot is untouched too — the provenance, not just the price, is frozen",
        JSON.stringify(lineItemAfterLaterChange?.answersSnapshot) === bookedAnswersAtBooking,
        `at booking: ${bookedAnswersAtBooking}, after a further cost change: ${JSON.stringify(lineItemAfterLaterChange?.answersSnapshot)}`);

      // NOT JUST "IT DIDN'T CHANGE" — the booked basis fingerprint must
      // demonstrably DIFFER from the contractor's CURRENT approval (proving
      // the economics genuinely moved, so an unchanged booked value is a
      // real snapshot of a now-stale basis, not a coincidence), while the
      // booked row itself stays pinned to what actually justified this
      // customer's price.
      const currentApproval = await prisma.contractorDerivedPricingApproval.findFirst({
        where: { contractorId: fixture.contractorId, serviceId: fixture.serviceId },
        select: { approvedBasisFingerprint: true },
      });
      ok("F. the contractor's CURRENT approval basis has genuinely moved since booking (the later cost change was real, not cosmetic)",
        typeof currentApproval?.approvedBasisFingerprint === "string" && currentApproval.approvedBasisFingerprint !== basisAtBooking,
        `at booking: ${basisAtBooking}, current approval: ${currentApproval?.approvedBasisFingerprint}`);
      ok("F. …while the booked LineItem's own resolvedEconomicBasis stays pinned to the ORIGINAL basis — the provenance a homeowner or auditor would trace is never silently rewritten to match a later approval",
        lineItemAfterLaterChange?.resolvedEconomicBasis === basisAtBooking,
        `at booking: ${basisAtBooking}, after a further cost change: ${lineItemAfterLaterChange?.resolvedEconomicBasis}`);
      // THE MATERIAL/COMPONENT SNAPSHOTS SURVIVE TOO — a channel-cost change
      // is exactly the kind of edit that could plausibly leak into these
      // fields if they were ever re-read live instead of snapshotted; they
      // must not.
      ok("F. …and the booked resolvedComponentKeys survive the later cost change unchanged too",
        JSON.stringify(lineItemAfterLaterChange?.resolvedComponentKeys) === JSON.stringify(bookedLineItem?.resolvedComponentKeys),
        `at booking: ${JSON.stringify(bookedLineItem?.resolvedComponentKeys)}, after: ${JSON.stringify(lineItemAfterLaterChange?.resolvedComponentKeys)}`);
      ok("F. …and the booked resolvedMaterialCostCents survives the later cost change unchanged too — not re-priced at the new $99.99 channel cost",
        lineItemAfterLaterChange?.resolvedMaterialCostCents === bookedLineItem?.resolvedMaterialCostCents,
        `at booking: ${bookedLineItem?.resolvedMaterialCostCents}c, after: ${lineItemAfterLaterChange?.resolvedMaterialCostCents}c`);

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
