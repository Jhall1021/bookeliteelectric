/**
 * The session-creation race — proven closed with genuine, simultaneous
 * concurrency, against a running server, through a real database. Not a
 * browser script despite the naming convention this repo's other
 * `*-browser-flow.ts` scripts share (kept for consistency and because it
 * drives the SAME running dev/production server those do): true concurrency
 * from a single Node process is easier to prove with `Promise.all` over raw
 * `fetch`, hitting the exact same API route a browser tab would, than by
 * trying to force two real browser tabs to race a network call to the same
 * millisecond.
 *
 * WHAT RACED, AND WHY IT WAS A RACE
 *
 * `lib/guidedFlowSession.ts`'s `findOrCreateActiveSession` used to find the
 * ACTIVE row for a (contractorId, sessionId, serviceId) triple, then create
 * one if nothing was found — two separate statements, with a window between
 * them. Two independent requests hitting `POST /api/guided-flow-sessions`
 * for the SAME triple at close enough to the same instant could each run
 * their `findFirst` before either had run its `create`, each find nothing,
 * and each create a row — proven to actually happen in this task's own
 * rehearsal (React Strict Mode double-invoking a mount effect in `next dev`;
 * see scripts/verify-back-navigation-config-browser-flow.ts's header for
 * that story), and not specific to Strict Mode: any two independent
 * callers — a slow network retry, two tabs, a Device Handoff join landing
 * near the same moment — can hit the identical window in production.
 *
 * FIXED: `activeSessionKey` (prisma/schema.prisma, `@unique`, set only while
 * `status: "ACTIVE"`) turns "at most one ACTIVE session per triple" into a
 * real Postgres uniqueness constraint. `findOrCreateActiveSession` is now
 * idempotent BY that constraint, not by checking first — same idiom as
 * `lib/depositRecording.ts`'s `recordCapture`: whichever concurrent
 * `create` the database commits first wins the row, and every loser's
 * `create` fails with P2002 and fetches the winner by the same
 * deterministic key, never inventing a second row. This script proves both
 * halves: EVERY concurrent POST resolves to the SAME session identity, and
 * an answer saved after the race resolves is still there on a later,
 * independent "resume" call.
 *
 * HOW THE CONCURRENCY IS REAL, NOT SIMULATED: this fires N genuinely
 * concurrent `fetch()` calls (`Promise.all`, not a loop with awaits) at
 * `POST /api/guided-flow-sessions`, each carrying the SAME
 * `x-price2book-visit` token (the embed entry point,
 * `lib/session.ts`'s `tokenFromRequest`, header wins over cookie — used
 * here deliberately so N independent HTTP requests can share one anonymous
 * session identity without a shared browser context or cookie jar at all)
 * and the SAME `serviceSlug`. That is exactly the shape
 * `findOrCreateActiveSession` sees from two browser tabs sharing one
 * session cookie, or from Strict Mode's double effect invocation, or from
 * a genuinely simultaneous cross-device join — the race does not care which
 * of those produced the second request.
 *
 * NOT PART OF `npm run verify`. Needs a running server. Works against
 * either `next dev` or a production build — unlike the back-navigation
 * regression, this race was never Strict-Mode-specific; it is a database
 * concurrency property, proven here by forcing genuine simultaneity
 * directly, not by hoping a browser reproduces it.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3610";
const CONCURRENCY = 12;

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const CONTRACTOR_SLUG = `gf-concurrent-flow-${RUN}`;
const SERVICE_SLUG = `gf-concurrent-target-${RUN}`;

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
  if (serviceIds.length) {
    await prisma.guidedFlowSession.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
    await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: serviceIds } } } }).catch(() => {});
    await prisma.question.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
    await prisma.lineItem.deleteMany({ where: { serviceId: { in: serviceIds } } }).catch(() => {});
  }
  await prisma.visit.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.service.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.pricingSettings.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractorCategory.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractorSite.deleteMany({ where: { contractorId: contractor.id } }).catch(() => {});
  await prisma.contractor.delete({ where: { id: contractor.id } }).catch(() => {});
}

async function buildFixture() {
  const category = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const canonicalCategory = await prisma.canonicalCategory.findFirstOrThrow({ select: { id: true } });

  const contractor = await prisma.contractor.create({
    data: { slug: CONTRACTOR_SLUG, name: "Concurrent Session Regression Electric", active: true },
    select: { id: true },
  });
  const publicId = `site_${randomBytes(16).toString("hex")}`;
  await prisma.contractorSite.create({
    data: { contractorId: contractor.id, hostedSlug: CONTRACTOR_SLUG, publicId, active: true },
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

  const service = await prisma.service.create({
    data: {
      slug: SERVICE_SLUG,
      name: "Concurrent Session Regression Target",
      contractorId: contractor.id,
      categoryId: category.id,
      contractorCategoryId: contractorCategory.id,
      bookingType: "ADJUSTED",
      basePrice: 20000,
      shortDescription: "Regression fixture, deleted at teardown.",
      // No Question/AnswerOption rows on purpose: `updateSessionAnswers`
      // (lib/guidedFlowSession.ts) writes whatever `consumedAnswers` object
      // the PATCH body carries with no cross-check against real question
      // definitions — this script drives the raw session API directly, not
      // GuidedFlowEngine's client-side walk, so the tree underneath the
      // service is irrelevant to what it proves.
    },
    select: { id: true },
  });

  return { contractorId: contractor.id, serviceId: service.id, publicId };
}

async function main() {
  console.log(`\nCONCURRENT SESSION CREATION — same identity, no duplicate ACTIVE row\n`);
  console.log(`  ${BASE}  ·  contractor ${CONTRACTOR_SLUG}  ·  ${CONCURRENCY} simultaneous POSTs\n`);

  await teardown();
  try {
    const { contractorId, serviceId, publicId } = await buildFixture();
    const sharedVisitToken = randomBytes(24).toString("base64url"); // >= 16 chars — lib/session.ts's own floor

    const headers = {
      "Content-Type": "application/json",
      "x-price2book-site": publicId,
      "x-price2book-visit": sharedVisitToken,
    };

    // THE RACE: fired together, not awaited one at a time.
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        fetch(`${BASE}/api/guided-flow-sessions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ serviceSlug: SERVICE_SLUG }),
        })
      )
    );
    ok(
      `all ${CONCURRENCY} concurrent POSTs succeeded`,
      responses.every((r) => r.ok),
      `statuses: ${responses.map((r) => r.status).join(",")}`
    );
    const bodies = await Promise.all(responses.map((r) => r.json()));
    const ids = new Set(bodies.map((b) => b.id));
    ok(
      `every concurrent POST resolved to the SAME session identity`,
      ids.size === 1,
      `got ${ids.size} distinct id(s): ${[...ids].join(", ")}`
    );

    const activeRows = await prisma.guidedFlowSession.findMany({
      where: { contractorId, sessionId: sharedVisitToken, serviceId, status: "ACTIVE" },
    });
    ok(
      "the database holds exactly one ACTIVE GuidedFlowSession for this triple, not one per request",
      activeRows.length === 1,
      `found ${activeRows.length}`
    );

    const sessionId = [...ids][0] as string | undefined;
    const initialVersion = Math.max(...bodies.map((b) => (typeof b.version === "number" ? b.version : -1)));
    ok("a resolvable session id and version came back", typeof sessionId === "string" && initialVersion >= 0);

    if (sessionId) {
      // Save an answer against the ONE row every concurrent caller agreed on.
      const patchRes = await fetch(`${BASE}/api/guided-flow-sessions/${sessionId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ expectedVersion: initialVersion, consumedAnswers: { mount_choice: "paid" } }),
      });
      const patchBody = await patchRes.json();
      ok("the answer save against the race-resolved session succeeds", patchRes.ok, JSON.stringify(patchBody));

      // A LATER, INDEPENDENT call — same identity, same shape a reload's
      // mount effect makes — must resume the SAME row with the answer still
      // on it, not create yet another one.
      const resumeRes = await fetch(`${BASE}/api/guided-flow-sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ serviceSlug: SERVICE_SLUG }),
      });
      const resumeBody = await resumeRes.json();
      ok("resuming after the race still resolves to the same session id", resumeBody.id === sessionId);
      ok(
        "resuming after the race retains the answer saved against it",
        resumeBody.consumedAnswers?.mount_choice === "paid",
        `got ${JSON.stringify(resumeBody.consumedAnswers)}`
      );

      const rowsAfter = await prisma.guidedFlowSession.findMany({
        where: { contractorId, sessionId: sharedVisitToken, serviceId },
      });
      ok(
        "still exactly one GuidedFlowSession row total for this triple — resuming did not create a second one",
        rowsAfter.length === 1,
        `found ${rowsAfter.length}`
      );
    }
  } finally {
    await teardown();
  }
  ok("every fixture is gone at the end", (await prisma.contractor.findUnique({ where: { slug: CONTRACTOR_SLUG } })) === null);

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
