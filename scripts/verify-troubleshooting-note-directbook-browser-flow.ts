/**
 * The diagnostic note is reachable on a zero-question TROUBLESHOOT_ONLY
 * service — through the real guided flow, a real browser, a real database.
 *
 * `BookingType.TROUBLESHOOT_ONLY` services with no questions of their own
 * (the common shape: "what's wrong?" has no branches worth asking, the
 * technician diagnoses in person) satisfy GuidedFlowEngine's `directBook`
 * check (`flow.questions.length === 0 && bookingType !== "REMOTE_QUOTE" &&
 * anchorPrice !== null`) and so render ONLY `ServiceIntro` — the
 * `state.kind === "resolved"` branch that hosts `PriceConfirmationCard`'s
 * editable note field is never reached, because there is no question to
 * resolve FROM. A homeowner arriving directly got no way to add context for
 * the technician at all; a homeowner arriving via a troubleshooting REROUTE
 * (B.4's carried note, `lib/rerouteHandoff.ts`) had their note silently
 * carried into `customerNote` state and then never shown, edited, or
 * confirmed before booking.
 *
 * FIXED, STRUCTURALLY: `ServiceIntro` now accepts the same
 * `note`/`onNoteChange`/`noteLabel` contract `PriceConfirmationCard` already
 * had, rendered only when `directBook` is true AND the caller supplies
 * `onNoteChange` — `GuidedFlowEngine.tsx` supplies it exactly when
 * `flow.bookingType === "TROUBLESHOOT_ONLY"` (the same structural field the
 * "resolved" branch already keys its own note label on), never by slug. A
 * directBook service that isn't TROUBLESHOOT_ONLY gets no `onNoteChange` and
 * renders exactly as before — the short, one-tap flow is unchanged for the
 * ~65 ordinary flat-price services that aren't diagnostic intake.
 *
 * Fixture: one throwaway contractor, one zero-question TROUBLESHOOT_ONLY
 * service. Two independent browser contexts (their own cookies — two
 * distinct homeowners, not one customer navigating twice):
 *
 *   A. DIRECT ENTRY — no reroute, no sessionStorage payload. The note field
 *      must render (structural: bookingType, not "was there a handoff"),
 *      start EMPTY, and accept typed text. Books, then the real stored
 *      `LineItem.answersSnapshot.customer_note` is read back and must equal
 *      the FINAL typed text, proving persistence into the visit.
 *
 *   B. REROUTED ENTRY — seeds `lib/rerouteHandoff.ts`'s own sessionStorage
 *      key/shape before navigating, exactly as `RerouteNotice`'s
 *      `bookTroubleshooting()` does. The note field must render the CARRIED
 *      text pre-filled, then is CLEARED and re-typed (edited/removed, not
 *      just appended to) before booking — proving the field is genuinely
 *      editable, not a read-only display of the handoff. Carries through a
 *      REAL no-deposit checkout (schedule an arrival window, fill contact
 *      details, confirm) to an actual `Booking` row, and the FINAL edited
 *      text is read back from that booking's own visit's line item —
 *      proving persistence survives all the way through, not just into the
 *      cart.
 *
 * NOT PART OF `npm run verify`. Needs a running server — same convention as
 * scripts/verify-back-navigation-config-browser-flow.ts. Run against a
 * PRODUCTION build (`next build && next start`) for the same reason that
 * script's header documents: this fixture's session bootstrap goes through
 * the identical `findOrCreateActiveSession` path, so a `next dev` run can
 * spuriously hit the (separately fixed, see lib/guidedFlowSession.ts)
 * Strict-Mode session-creation race — unrelated to anything this script
 * itself is proving.
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { REROUTE_HANDOFF_KEY, serializeHandoff } from "../lib/rerouteHandoff";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const CONTRACTOR_SLUG = `gf-notecheck-${RUN}`;
const HOSTED_SLUG = CONTRACTOR_SLUG;
const DIAG_SLUG = `gf-notecheck-diag-${RUN}`;
const SOURCE_SLUG = `gf-notecheck-source-${RUN}`;
const TEST_ZIP = "07701";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function teardown() {
  const contractor = await prisma.contractor.findUnique({ where: { slug: CONTRACTOR_SLUG }, select: { id: true } });
  if (!contractor) return;
  const services = await prisma.service.findMany({ where: { contractorId: contractor.id }, select: { id: true } });
  const serviceIds = services.map((s) => s.id);
  const visits = await prisma.visit.findMany({ where: { contractorId: contractor.id }, select: { id: true } });
  const visitIds = visits.map((v) => v.id);
  await prisma.appointment.deleteMany({ where: { booking: { visitId: { in: visitIds } } } }).catch(() => {});
  await prisma.booking.deleteMany({ where: { visitId: { in: visitIds } } }).catch(() => {});
  if (serviceIds.length) {
    await prisma.guidedFlowSession.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
    await prisma.lineItem.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
  }
  await prisma.visit.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.businessHours.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  // A real checkout (part B) creates a real ArrivalWindow against this
  // contractor's ServiceArea — no cascade from ServiceArea to ArrivalWindow
  // (prisma/schema.prisma's own comment on that relation: Booking must be
  // able to check it, so it's a real FK, not a bare scalar), so it has to go
  // before the ServiceArea that owns it or the delete below 23503s.
  const areas = await prisma.serviceArea.findMany({ where: { contractorId: contractor.id }, select: { id: true } });
  await prisma.arrivalWindow.deleteMany({ where: { serviceAreaId: { in: areas.map((a) => a.id) } } }).catch(() => {});
  await prisma.serviceArea.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.pricingSettings.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractorCategory.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractorSite.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  const customers = await prisma.customer.findMany({ where: { contractorId: contractor.id }, select: { id: true } });
  await prisma.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } }).catch(() => {});
  await prisma.contractor.delete({ where: { id: contractor.id } }).catch(() => {});
}

async function buildFixture() {
  const category = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const canonicalCategory = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });

  const contractor = await prisma.contractor.create({
    data: {
      slug: CONTRACTOR_SLUG,
      name: "Note Reachability Regression Electric",
      active: true,
      schedulingAuthority: "NATIVE",
      nativeConcurrentJobs: 2,
    },
    select: { id: true },
  });
  await prisma.contractorSite.create({
    data: {
      contractorId: contractor.id,
      hostedSlug: HOSTED_SLUG,
      publicId: `site_${randomBytes(16).toString("hex")}`,
      active: true,
    },
  });
  const contractorCategory = await prisma.contractorCategory.create({
    data: { contractorId: contractor.id, canonicalCategoryId: canonicalCategory.id },
    select: { id: true },
  });
  await prisma.pricingSettings.create({
    data: {
      contractorId: contractor.id,
      crewHourRateCents: 15000,
      primaryMinimumCents: 9900,
      roundingIncrementCents: 100,
      defaultPermitAdminCents: 0,
    },
  });
  await prisma.businessHours.create({
    data: {
      contractorId: contractor.id,
      workingDays: [1, 2, 3, 4, 5],
      dayStart: "08:00",
      dayEnd: "16:30",
      windowMinutes: 180,
      minWindowMinutes: 60,
    },
  });
  await prisma.serviceArea.create({
    data: { contractorId: contractor.id, name: "Regression Test Area", zipCodes: [TEST_ZIP], active: true },
  });

  const diag = await prisma.service.create({
    data: {
      slug: DIAG_SLUG,
      name: "Note Reachability Diagnostic Visit",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "TROUBLESHOOT_ONLY",
      basePrice: 24900, // $249.00 — zero questions, directBook-eligible
      estimatedMinutes: 60,
      shortDescription: "Regression fixture, deleted at teardown.",
    },
    select: { id: true, name: true },
  });

  // The reroute's real origin — a distinct, same-tenant service the
  // homeowner actually started on. entryServiceId must name THIS service
  // once carried through the handoff, never the diagnostic target itself;
  // matches the carried note's own "From Ceiling Fan Install" text below.
  const source = await prisma.service.create({
    data: {
      slug: SOURCE_SLUG,
      name: "Ceiling Fan Install",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "INSTANT",
      basePrice: 32500,
      estimatedMinutes: 120,
      shortDescription: "Regression fixture, deleted at teardown.",
    },
    select: { id: true, slug: true },
  });

  return { contractorId: contractor.id, diagServiceId: diag.id, sourceServiceId: source.id, sourceServiceSlug: source.slug };
}

async function noteTextarea(page: Page) {
  return page.getByLabel("What should we tell the technician?");
}

async function runDirectEntry(page: Page, diagServiceId: string) {
  console.log("\nA. DIRECT ENTRY\n");
  await page.goto(`${BASE}/${HOSTED_SLUG}/services/x/${DIAG_SLUG}`);
  await page.waitForLoadState("networkidle");

  const textarea = await noteTextarea(page);
  ok("A. the note field is present on direct entry (no reroute)", await textarea.count() > 0);
  ok("A. it starts empty on direct entry", (await textarea.inputValue()) === "");

  await textarea.fill("Direct entry: outlet in the kitchen sparks when used.");
  await textarea.fill("Direct entry: outlet in the kitchen sparks when used, smells like burning plastic.");
  const finalDirectNote = "Direct entry: outlet in the kitchen sparks when used, smells like burning plastic.";
  ok("A. the field reflects the edited text before booking", (await textarea.inputValue()) === finalDirectNote);

  await page.getByRole("button", { name: /Add to My Visit/ }).click();
  await page.waitForURL(/\/my-visit/, { waitUntil: "commit" });
  await page.waitForLoadState("networkidle");

  const lineItem = await prisma.lineItem.findFirst({
    where: { serviceId: diagServiceId },
    orderBy: { id: "desc" },
    select: { answersSnapshot: true },
  });
  const snapshot = (lineItem?.answersSnapshot ?? {}) as Record<string, unknown>;
  ok(
    "A. the stored visit LineItem's answersSnapshot.customer_note equals the final edited text",
    snapshot.customer_note === finalDirectNote,
    `got ${JSON.stringify(snapshot.customer_note)}`
  );
}

async function runReroutedEntryThroughCheckout(
  page: Page,
  diagServiceId: string,
  sourceServiceId: string,
  sourceServiceSlug: string
) {
  console.log("\nB. REROUTED ENTRY, THROUGH TO A REAL BOOKING\n");
  const carriedNote = "From Ceiling Fan Install: \"Existing switch has no neutral.\" Carried via reroute.";

  // Establish the origin + this browser's own anonymous session cookie
  // before writing sessionStorage — the same origin RerouteNotice's real
  // `bookTroubleshooting()` writes it from.
  await page.goto(`${BASE}/${HOSTED_SLUG}`);
  await page.evaluate(
    ({ key, payload }) => window.sessionStorage.setItem(key, payload),
    {
      key: REROUTE_HANDOFF_KEY,
      payload: serializeHandoff({
        targetServiceId: diagServiceId,
        customerNote: carriedNote,
        entryServiceId: sourceServiceId,
        entryServiceSlug: sourceServiceSlug,
      }),
    }
  );

  // Capture the REAL POST /api/guided-flow-sessions GuidedFlowEngine's own
  // boot sequence sends — not a re-derivation of what it should send. Base
  // path only: the PATCH calls a session makes later target
  // /api/guided-flow-sessions/[id] and must not be mistaken for this one.
  let capturedSessionPost: { serviceSlug?: string; entryServiceId?: string; entryServiceSlug?: string } | null = null;
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    if (new URL(req.url()).pathname !== "/api/guided-flow-sessions") return;
    try {
      capturedSessionPost = req.postDataJSON();
    } catch {
      // Not JSON — leave capturedSessionPost null, the assertion below reports it.
    }
  });

  await page.goto(`${BASE}/${HOSTED_SLUG}/services/x/${DIAG_SLUG}`);
  await page.waitForLoadState("networkidle");

  ok(
    "B. the real POST /api/guided-flow-sessions carries the carried entry provenance, not just targetServiceId/customerNote",
    capturedSessionPost !== null &&
      (capturedSessionPost as { entryServiceId?: string }).entryServiceId === sourceServiceId &&
      (capturedSessionPost as { entryServiceSlug?: string }).entryServiceSlug === sourceServiceSlug,
    `got ${JSON.stringify(capturedSessionPost)}`
  );

  const persistedSession = await prisma.guidedFlowSession.findFirst({
    where: { serviceId: diagServiceId, status: "ACTIVE" },
    orderBy: { id: "desc" },
    select: { entryServiceId: true, entryServiceSlug: true, serviceId: true },
  });
  ok(
    "B. the persisted GuidedFlowSession records the carried entry — resolved serviceId is the diagnostic, entryServiceId is the source",
    persistedSession?.entryServiceId === sourceServiceId &&
      persistedSession?.entryServiceSlug === sourceServiceSlug &&
      persistedSession?.serviceId === diagServiceId,
    `got ${JSON.stringify(persistedSession)}`
  );

  const textarea = await noteTextarea(page);
  ok("B. the note field is present on a rerouted entry", await textarea.count() > 0);
  ok("B. it is pre-filled with the CARRIED note", (await textarea.inputValue()) === carriedNote);

  // Edit/remove: clear the carried text entirely and type a different final
  // note, proving this is a real editable field, not a read-only echo.
  const finalNote = "Edited after reroute: breaker trips within 10 minutes, panel is a Square D QO.";
  await textarea.fill("");
  ok("B. the field can be cleared (removed), not just appended to", (await textarea.inputValue()) === "");
  await textarea.fill(finalNote);

  await page.getByRole("button", { name: /Add to My Visit/ }).click();
  await page.waitForURL(/\/my-visit/, { waitUntil: "commit" });
  await page.waitForLoadState("networkidle");

  const cartLineItem = await prisma.lineItem.findFirst({
    where: { serviceId: diagServiceId },
    orderBy: { id: "desc" },
    select: { answersSnapshot: true },
  });
  const cartSnapshot = (cartLineItem?.answersSnapshot ?? {}) as Record<string, unknown>;
  ok(
    "B. the stored visit LineItem's answersSnapshot.customer_note equals the FINAL edited text (not the carried one)",
    cartSnapshot.customer_note === finalNote,
    `got ${JSON.stringify(cartSnapshot.customer_note)}`
  );

  // Through a real, no-deposit checkout to an actual Booking — the
  // instruction's own "completed booking", not just the cart.
  await page.getByRole("button", { name: /Choose My Appointment Time/ }).click();
  await page.waitForURL(/\/checkout\/schedule/, { waitUntil: "commit" });
  await page.waitForLoadState("networkidle");

  const windowButton = page.locator("button:not([disabled])", { hasText: "–" }).first();
  await windowButton.waitFor({ state: "visible", timeout: 15000 });
  await windowButton.click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/checkout\/details/, { waitUntil: "commit" });
  await page.waitForLoadState("networkidle");

  await page.locator('label:text-is("Full name") + input').fill("Regression Homeowner");
  await page.locator('label:text-is("Email") + input').fill(`regression-${RUN}@example.com`);
  await page.locator('label:text-is("Phone") + input').fill("7325550100");
  await page.locator('label:text-is("Property address") + input').fill("1 Regression Way");
  await page.locator('label:text-is("ZIP code") + input').fill(TEST_ZIP);

  await page.getByRole("button", { name: "Confirm Appointment" }).click();
  await page.waitForURL(/\/checkout\/confirmation\//, { waitUntil: "commit", timeout: 20000 });
  await page.waitForLoadState("networkidle");

  const bookingId = page.url().split("/checkout/confirmation/")[1]?.split(/[/?#]/)[0];
  ok("B. checkout completed to a real booking confirmation page", typeof bookingId === "string" && bookingId.length > 0);

  if (bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        visitId: true,
        visit: { select: { lineItems: { select: { answersSnapshot: true, serviceId: true, entryServiceId: true, entryServiceSlug: true } } } },
      },
    });
    ok("B. the booking is a real, persisted Booking row", booking !== null);
    const bookedLine = booking?.visit.lineItems.find((li) => li.serviceId === diagServiceId);
    ok("B. the completed booking's own visit still has the diagnostic line item", bookedLine !== undefined);
    const bookedSnapshot = (bookedLine?.answersSnapshot ?? {}) as Record<string, unknown>;
    ok(
      "B. the COMPLETED BOOKING's stored line item still carries the final edited note",
      bookedSnapshot.customer_note === finalNote,
      `got ${JSON.stringify(bookedSnapshot.customer_note)}`
    );
    ok(
      "B. Booking.visitId's own LineItem preserves the source entry (Ceiling Fan Install) separately from the resolved service (the diagnostic)",
      bookedLine?.serviceId === diagServiceId && bookedLine?.entryServiceId === sourceServiceId && bookedLine?.entryServiceSlug === sourceServiceSlug,
      `got serviceId=${bookedLine?.serviceId} entryServiceId=${bookedLine?.entryServiceId} entryServiceSlug=${bookedLine?.entryServiceSlug}`
    );
  }
}

async function main() {
  console.log(`\nTROUBLESHOOTING NOTE — REACHABLE ON A directBook SERVICE — real guided flow, real database\n`);
  console.log(`  ${BASE}  ·  contractor ${CONTRACTOR_SLUG}\n`);

  await teardown();
  try {
    const { diagServiceId, sourceServiceId, sourceServiceSlug } = await buildFixture();

    const browser = await chromium.launch();
    try {
      const directCtx = await browser.newContext();
      const directPage = await directCtx.newPage();
      directPage.setDefaultTimeout(30000);
      directPage.on("pageerror", (e) => console.error("DIRECT PAGE ERROR:", e));
      await runDirectEntry(directPage, diagServiceId);
      await directCtx.close();

      const reroutedCtx = await browser.newContext();
      const reroutedPage = await reroutedCtx.newPage();
      reroutedPage.setDefaultTimeout(30000);
      reroutedPage.on("pageerror", (e) => console.error("REROUTED PAGE ERROR:", e));
      await runReroutedEntryThroughCheckout(reroutedPage, diagServiceId, sourceServiceId, sourceServiceSlug);
      await reroutedCtx.close();
    } finally {
      await browser.close();
    }
  } finally {
    // Always torn down, even when a Playwright locator throws (a timeout,
    // not a failed `ok()` check) partway through — leaving no throwaway
    // fixture behind for the next run to trip over.
    await teardown();
  }
  ok("every fixture is gone at the end", (await prisma.contractor.findUnique({ where: { slug: CONTRACTOR_SLUG } })) === null);

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
