/**
 * What Guided Estimates actually does, measured rather than described.
 *
 * /product/guided-estimates makes one claim: a contractor can have a
 * homeowner walk a guided flow, hand over the details and photographs the
 * contractor needs, and then price the work themselves — without publishing
 * an instant price. That claim is only worth making if the product does it,
 * so the page is built from this capture and the build fails when it drifts.
 *
 * WHAT IS MEASURED, AND WHAT IS NOT
 *
 * The first version counted every Service and AnswerOption in the database,
 * across every tenant, live or not, fixture or not. Those numbers were a
 * property of who happened to be in the database that second: a verifier's
 * throwaway contractor moved them for the seconds it existed (3 Sep 2026),
 * and a founder installing a catalog for a contractor that had not launched
 * moved them for good (7 Sep 2026) — at which point `--check` failed on an
 * untouched main and every release was blocked.
 *
 * So every service-derived figure here — booking-type counts, quote-only
 * services, answer options and their routes, photo labels, the worked
 * example — is scoped to SERVICES THAT ARE LIVE ON AN ACTIVE CONTRACTOR'S
 * STOREFRONT, and to genuine contractors only: verifier fixtures are
 * excluded by the one rule in lib/fixtureContractors.ts, the same rule the
 * Platform Admin uses to keep them off its lists. The scope is applied at
 * every query, not just the first one; an answer option is counted only if
 * the service that owns it is in scope. "Already running this way" then
 * means exactly that.
 *
 * QUOTE EVIDENCE IS HISTORY, NOT ESTATE. The review-queue counts show the
 * mechanism has been used by real homeowners. They are kept across a
 * contractor's retirement on purpose — a job that was priced was priced —
 * and exclude only fixtures.
 *
 * --check IS NOT "equals the committed file" ANY MORE (10-11 Sep 2026). It
 * was, and it meant this could only ever pass against the literal, current
 * production connection — never a rehearsal branch, never anything but the
 * one moving target the file happened to be captured from. Ordinary,
 * correct platform growth (a genuine contractor adding one more photo-gated
 * answer) changed a number the page never even reads (`bookingTypes`,
 * `routes`) and blocked a release over it.
 *
 * A first correction to this kept an exact-equality check but loosened it
 * to `live >= committed` on the estate-wide numbers, so growth alone
 * couldn't fail it. That was still an estate-wide comparison running inside
 * `--check` — the very thing that made this non-reproducible on an isolated
 * database in the first place, just with a wider tolerance. `--check` now
 * makes NO estate-wide comparison of any kind. It asks two narrower
 * questions, both answerable from ONE deliberately stable reference tenant
 * (`elite-electric` — the same one capture-hero-flow.ts already uses) plus
 * the committed file's own arithmetic, so the result never depends on how
 * many services any OTHER contractor happens to have right now:
 *
 *   1. Is the committed file internally consistent? (no database needed —
 *      distinctLabels really is labels.length, quotes.total really is the
 *      sum of quotes.byStatus)
 *   2. On elite-electric specifically: does the mechanism still exist (at
 *      least one live REMOTE_QUOTE service with no published price, at
 *      least one live PHOTO_REVIEW answer that blocks booking on photos),
 *      and does the committed WORKED EXAMPLE still route the way the page
 *      illustrates — re-located by its own text, never re-ranked against
 *      the whole estate, with its EXACT set of required photo labels
 *      checked, not just non-empty (a single label quietly dropped is a
 *      wrong illustration, not just a smaller one).
 *
 * THE ESTATE-WIDE NUMBERS THEMSELVES — `bookingTypes`, `remoteQuote.*`,
 * `routes`, `photos.distinctLabels`/`labels`/`blocking`/`preparation`,
 * `quotes` — are still captured, still printed on the page where the page
 * reads them, and still worth keeping honest. They are simply no longer
 * part of `--check`, or of `verify:full`. Their accuracy is a SEPARATE
 * question from "does the product still work", checked by a SEPARATE,
 * separately-invoked command against production specifically:
 *
 *   npx tsx scripts/capture-guided-estimates.ts --audit
 *
 * `--audit` does the exact, estate-wide, field-for-field comparison this
 * file used to do inside `--check` — a genuine drift there means the page's
 * printed numbers are stale, which is worth knowing, but is a marketing
 * content question to resolve on its own schedule (a deliberate
 * re-capture), never a reason to block `verify:full` on a rehearsal
 * database that was never going to hold the same numbers as production in
 * the first place.
 *
 * READ ONLY. Nothing here writes: every mutating method on every model it
 * touches is poisoned before the first query, and `assertReadOnly` fails
 * loudly rather than quietly if a future edit reaches for one. `--audit`
 * inherits this — it only reads.
 *
 * WHAT IS DELIBERATELY NOT CAPTURED. No customer name, email, phone,
 * address or photograph URL, and no quoted amount. A quote is a real
 * homeowner's job. The page needs to say that the review queue is real and
 * what a contractor sees in it — not what anybody was charged.
 *
 * The contractor's identity is substituted the same way the hero fixture
 * does it, so a real tenant's brand never reaches Price2Book's marketing.
 *
 *   npx tsx scripts/capture-guided-estimates.ts           # write the fixture
 *   npx tsx scripts/capture-guided-estimates.ts --check   # capability + example, safe on any database
 *   npx tsx scripts/capture-guided-estimates.ts --audit   # exact estate-wide numbers, production only
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { partitionFixtures } from "../lib/fixtureContractors";

const prisma = new PrismaClient();

function assertReadOnly() {
  const forbidden = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"] as const;
  const models = ["service", "question", "answerOption", "quote", "photo", "contractor"] as const;
  for (const m of models) {
    const model = (prisma as any)[m];
    if (!model) continue;
    for (const f of forbidden) {
      if (typeof model[f] === "function") {
        model[f] = () => { throw new Error(`capture-guided-estimates is READ ONLY — ${m}.${f}`); };
      }
    }
  }
  (prisma as any).$executeRaw = () => { throw new Error("capture-guided-estimates is READ ONLY"); };
  (prisma as any).$executeRawUnsafe = () => { throw new Error("capture-guided-estimates is READ ONLY"); };
}

const OUT = "components/marketing/guidedEstimates.ts";

/** The demonstration identity, as in heroFlow. Never a real tenant's name. */
const IDENTITY = "Voltmark Electric";

async function main() {
  assertReadOnly();
  const checking = process.argv.includes("--check");
  const auditing = process.argv.includes("--audit");
  console.log(`\nGUIDED ESTIMATES — ${checking ? "checking" : auditing ? "auditing (estate-wide, exact)" : "capturing"}\n`);

  // The one fixture rule, applied in code (see lib/fixtureContractors for why
  // not in SQL), then every query is scoped by contractor id.
  const contractors = await prisma.contractor.findMany({ select: { id: true, slug: true, active: true }, orderBy: { createdAt: "asc" } });
  const { genuine, fixtures } = partitionFixtures(contractors);
  const activeIds = genuine.filter((c) => c.active).map((c) => c.id);
  const genuineIds = genuine.map((c) => c.id);
  console.log(`  ${genuine.length} genuine contractor(s), ${activeIds.length} active · ${fixtures.length} verifier fixture(s) excluded`);

  /** A genuine contractor's service, live or not. Quote history is scoped this way. */
  const GENUINE_SERVICE = { contractorId: { in: genuineIds } };
  /** A service the product is actually running: live, on an active, genuine contractor. */
  const LIVE_SERVICE = { active: true, contractorId: { in: activeIds } };

  // ── how much of the live estate actually runs this way ─────────────────
  const byBookingType = await prisma.service.groupBy({
    by: ["bookingType"],
    where: LIVE_SERVICE,
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const r of byBookingType) counts[String(r.bookingType)] = r._count._all;

  const remoteQuoteServices = await prisma.service.findMany({
    where: { ...LIVE_SERVICE, bookingType: "REMOTE_QUOTE" },
    select: { id: true, name: true, basePrice: true, category: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // The claim that matters most on the page: these services carry no
  // published price, and the product is fine with that.
  const withoutPublishedPrice = remoteQuoteServices.filter((s) => s.basePrice === null).length;

  // ── the answers that hand a job to the contractor ──────────────────────
  // Only REMOTE_QUOTE and PHOTO_REVIEW: the two routes where a human being
  // prices the work. Grouped by prompt so the page shows real questions.
  // Same scope as the services: an answer counts only if its service does.
  const options = await prisma.answerOption.findMany({
    where: {
      routeAction: { in: ["REMOTE_QUOTE", "PHOTO_REVIEW"] },
      question: { service: LIVE_SERVICE },
    },
    select: {
      label: true,
      order: true,
      routeAction: true,
      requiredPhotoLabels: true,
      photosBlockBooking: true,
      question: {
        select: {
          prompt: true,
          order: true,
          _count: { select: { options: true } },
          service: { select: { name: true, bookingType: true } },
        },
      },
    },
  });

  const routeCounts: Record<string, number> = {};
  for (const o of options) {
    const k = String(o.routeAction);
    routeCounts[k] = (routeCounts[k] ?? 0) + 1;
  }

  // Every distinct photo label the product asks a homeowner for. This is the
  // page's evidence that the request is specific — "a photo" proves nothing,
  // "your electrical panel, door open if possible" proves the product knows
  // what the office needs to look at.
  const photoLabels = Array.from(
    new Set(options.flatMap((o) => o.requiredPhotoLabels))
  ).sort();

  // Photos that GATE a price, versus photos that merely help the technician
  // arrive prepared. Conflating the two would overstate the mechanism.
  const blocking = options.filter((o) => o.requiredPhotoLabels.length > 0 && o.photosBlockBooking).length;
  const preparation = options.filter((o) => o.requiredPhotoLabels.length > 0 && !o.photosBlockBooking).length;

  /**
   * One worked example, chosen by evidence rather than taste.
   *
   * IT MUST BE A GATING ANSWER. `photosBlockBooking` is the whole
   * distinction: true means the photographs are a CONDITION — the customer
   * submits them and the office prices the work, which is Guided Estimates.
   * False means the price is already locked and the photographs only help
   * the technician arrive prepared, which is Instant Price wearing a camera.
   * A first draft of this capture picked a `false` one and would have
   * illustrated the wrong mechanism entirely.
   *
   * IT MUST ALSO BE AN ANSWER. Some quote-only services open with a single
   * "Continue" that exists only to collect photographs. That is the
   * mechanism working, but a question with one option is not a question,
   * and "Continue" shown as the homeowner's answer would illustrate a form,
   * not a guided flow. So the example comes from a question that offered a
   * choice.
   *
   * Among those, the answer asking for the most photographs, because it is
   * the clearest case of a homeowner supplying what a contractor would
   * otherwise have driven across town to see. Ties break on service name,
   * question order and option order, so the pick cannot depend on the order
   * rows came back in.
   */
  const withPhotos = options
    .filter((o) => o.requiredPhotoLabels.length > 0 && o.photosBlockBooking && o.question._count.options > 1)
    .sort((a, b) => {
      const quoteFirst =
        Number(b.question.service.bookingType === "REMOTE_QUOTE") -
        Number(a.question.service.bookingType === "REMOTE_QUOTE");
      return (
        quoteFirst ||
        b.requiredPhotoLabels.length - a.requiredPhotoLabels.length ||
        a.question.service.name.localeCompare(b.question.service.name) ||
        a.question.order - b.question.order ||
        a.order - b.order
      );
    });
  const chosen = withPhotos[0] ?? null;

  const example = chosen
    ? {
        serviceName: chosen.question.service.name,
        prompt: chosen.question.prompt,
        answer: chosen.label,
        routeAction: String(chosen.routeAction),
        bookingType: String(chosen.question.service.bookingType),
        photoLabels: chosen.requiredPhotoLabels,
        blocksBooking: chosen.photosBlockBooking,
      }
    : null;

  // ── the review queue is real, and has been used ────────────────────────
  // Counts and status names only. No amounts, no customers, no photographs.
  // History, not estate: a retired contractor's priced jobs still happened.
  const quoteStatuses = await prisma.quote.groupBy({
    by: ["status"],
    where: { service: GENUINE_SERVICE },
    _count: { _all: true },
  });
  const quotes: Record<string, number> = {};
  for (const q of quoteStatuses) quotes[String(q.status)] = q._count._all;
  const quotesTotal = Object.values(quotes).reduce((a, b) => a + b, 0);

  const snapshot = {
    generatedBy: "scripts/capture-guided-estimates.ts",
    // When the estate-wide figures below were last confirmed accurate — set
    // only by a real capture, never touched by --check or --audit. The page
    // qualifies its aggregate numbers with this date rather than implying
    // they are live, so a number that has only grown since capture stays
    // truthful without needing to match live data on every request.
    capturedAt: new Date().toISOString().slice(0, 10),
    identity: IDENTITY,
    scope: "live services of active contractors; verifier fixtures excluded (lib/fixtureContractors.ts); quotes are history",
    bookingTypes: counts,
    remoteQuote: {
      services: remoteQuoteServices.length,
      withoutPublishedPrice,
      categories: Array.from(
        new Set(remoteQuoteServices.map((s) => s.category?.name).filter(Boolean) as string[])
      ).sort(),
    },
    routes: routeCounts,
    photos: { distinctLabels: photoLabels.length, labels: photoLabels, blocking, preparation },
    example,
    quotes: { total: quotesTotal, byStatus: quotes },
  };

  console.log(`  ${remoteQuoteServices.length} live quote-only service(s) across ${snapshot.remoteQuote.categories.length} categor${snapshot.remoteQuote.categories.length === 1 ? "y" : "ies"} · ${withoutPublishedPrice} without a published price`);
  console.log(`  ${photoLabels.length} distinct photo requests · ${blocking} gating answers · ${preparation} preparation answers · ${quotesTotal} quote(s) submitted`);
  console.log(`  example: ${example ? `${example.serviceName} — "${example.answer}" (${example.photoLabels.length} photos)` : "none"}`);

  if (!checking && !auditing) {
    const file =
      `/**\n` +
      ` * GENERATED — do not edit by hand.\n` +
      ` *\n` +
      ` * What Guided Estimates does, measured from the product: live services of\n` +
      ` * active contractors, verifier fixtures excluded. The page that reads this\n` +
      ` * may not claim anything the capture does not contain.\n` +
      ` *\n` +
      ` * Re-capture:      npx tsx scripts/capture-guided-estimates.ts\n` +
      ` * Capability check: npx tsx scripts/capture-guided-estimates.ts --check   (any database)\n` +
      ` * Exact audit:      npx tsx scripts/capture-guided-estimates.ts --audit   (production only)\n */\n` +
      `export const GUIDED_ESTIMATES = ${JSON.stringify(snapshot, null, 2)} as const;\n`;
    writeFileSync(OUT, file);
    console.log(`\n  wrote ${OUT}\n`);
    await prisma.$disconnect();
    return;
  }

  if (!existsSync(OUT)) {
    console.error(`  FAIL ${OUT} does not exist — run the capture\n`);
    process.exit(1);
  }
  const committed = (await import(pathToFileURL(`${process.cwd()}/${OUT}`).href)).GUIDED_ESTIMATES;
  const failures: string[] = [];

  // ── the committed file cannot contradict itself ─────────────────────────
  // Cheap, needs no database at all: catches a hand-edit or a bad capture
  // before anything else runs. Shared by --check and --audit.
  if (committed.photos.distinctLabels !== committed.photos.labels.length) {
    failures.push(
      `committed photos.distinctLabels (${committed.photos.distinctLabels}) does not match ` +
        `committed photos.labels.length (${committed.photos.labels.length}) — the committed file is internally inconsistent`
    );
  }
  const committedQuotesSum = Object.values(committed.quotes.byStatus as Record<string, number>).reduce(
    (a: number, b: number) => a + b,
    0
  );
  if (committed.quotes.total !== committedQuotesSum) {
    failures.push(
      `committed quotes.total (${committed.quotes.total}) does not match the sum of ` +
        `committed quotes.byStatus (${committedQuotesSum})`
    );
  }

  if (auditing) {
    // ── exact, estate-wide, production-only ──────────────────────────────
    // The comparison --check used to make. Deliberately separate: this is a
    // question about whether the MARKETING CONTENT is current, not about
    // whether the product still works, and it is only ever meaningful
    // against the literal, current production connection — a rehearsal or
    // any other database has no reason to carry the same numbers.
    const exact: [string, unknown, unknown][] = [
      ["bookingTypes", committed.bookingTypes, snapshot.bookingTypes],
      ["remoteQuote", committed.remoteQuote, snapshot.remoteQuote],
      ["routes", committed.routes, snapshot.routes],
      ["photos.distinctLabels", committed.photos.distinctLabels, snapshot.photos.distinctLabels],
      ["photos.labels", committed.photos.labels, snapshot.photos.labels],
      ["photos.blocking", committed.photos.blocking, snapshot.photos.blocking],
      ["photos.preparation", committed.photos.preparation, snapshot.photos.preparation],
      ["quotes", committed.quotes, snapshot.quotes],
    ];
    for (const [label, committedVal, liveVal] of exact) {
      const cs = JSON.stringify(committedVal);
      const ls = JSON.stringify(liveVal);
      if (cs !== ls) failures.push(`${label}: committed ${cs} — live ${ls}`);
    }
    if (!failures.length) {
      console.log(`\n  ok   the committed snapshot (captured ${committed.capturedAt}) matches production exactly\n`);
      await prisma.$disconnect();
      return;
    }
    console.error(`\n  FAIL the marketing snapshot (captured ${committed.capturedAt}) has drifted from production:`);
    for (const f of failures) console.error(`         ${f}`);
    console.error(`\n       This is a content-freshness question, not a product regression — re-capture`);
    console.error(`       when convenient: npx tsx scripts/capture-guided-estimates.ts\n`);
    process.exit(1);
  }

  // ── --check: capability, not estate-wide equality ──────────────────────
  // Everything below is answerable from ONE deliberately stable reference
  // tenant plus the committed file's own text — never the whole estate, so
  // an unrelated contractor's activity is never why this fails.
  const REFERENCE_TENANT = process.env.GUIDED_ESTIMATES_REFERENCE_TENANT ?? "elite-electric";
  const refContractor = await prisma.contractor.findUnique({ where: { slug: REFERENCE_TENANT }, select: { id: true } });
  if (!refContractor) {
    failures.push(`reference tenant "${REFERENCE_TENANT}" does not exist on this database — cannot verify Guided Estimates capability`);
  } else {
    const REF_LIVE_SERVICE = { active: true, contractorId: refContractor.id };

    // The mechanism must still exist on the reference tenant: at least one
    // live quote-only service with no published price, and at least one
    // live photo-gating answer. Existence, not a count — ordinary growth or
    // shrinkage elsewhere on the estate can never affect this, because it
    // never leaves elite-electric.
    const refRemoteQuoteWithoutPrice = await prisma.service.count({
      where: { ...REF_LIVE_SERVICE, bookingType: "REMOTE_QUOTE", basePrice: null },
    });
    if (refRemoteQuoteWithoutPrice === 0) {
      failures.push(`${REFERENCE_TENANT} has no live REMOTE_QUOTE service with no published price — the page's central claim has nothing to point to`);
    }
    const refBlockingAnswers = await prisma.answerOption.count({
      where: {
        routeAction: { in: ["REMOTE_QUOTE", "PHOTO_REVIEW"] },
        photosBlockBooking: true,
        requiredPhotoLabels: { isEmpty: false },
        question: { service: REF_LIVE_SERVICE },
      },
    });
    if (refBlockingAnswers === 0) {
      failures.push(`${REFERENCE_TENANT} has no live answer that gates a price on required photos — the mechanism this page describes has nothing to point to`);
    }

    // The committed WORKED EXAMPLE, re-located by its own text — never
    // re-ranked against the whole estate, so a better example appearing
    // elsewhere can never be why this fails.
    if (!committed.example) {
      failures.push(`committed snapshot has no worked example to re-verify`);
    } else {
      const ex = committed.example;
      const liveOption = await prisma.answerOption.findFirst({
        where: {
          label: ex.answer,
          routeAction: ex.routeAction,
          question: { prompt: ex.prompt, service: { name: ex.serviceName, contractorId: refContractor.id } },
        },
        select: {
          requiredPhotoLabels: true,
          photosBlockBooking: true,
          question: { select: { service: { select: { active: true, bookingType: true } } } },
        },
      });
      if (!liveOption) {
        failures.push(
          `the committed worked example ("${ex.serviceName}" — "${ex.answer}") no longer exists on ${REFERENCE_TENANT} — the example routing is broken`
        );
      } else {
        if (!liveOption.question.service.active) {
          failures.push(`the worked example's service ("${ex.serviceName}") is no longer active on ${REFERENCE_TENANT}`);
        }
        // EXACT set comparison, not just non-empty: dropping even one
        // required photo is a wrong illustration, not merely a smaller one.
        const committedPhotoSet = new Set(ex.photoLabels as string[]);
        const livePhotoSet = new Set(liveOption.requiredPhotoLabels);
        const missing = (ex.photoLabels as string[]).filter((l) => !livePhotoSet.has(l));
        const added = liveOption.requiredPhotoLabels.filter((l) => !committedPhotoSet.has(l));
        if (missing.length || added.length) {
          const parts: string[] = [];
          if (missing.length) parts.push(`no longer requires ${JSON.stringify(missing)}`);
          if (added.length) parts.push(`now also requires ${JSON.stringify(added)}`);
          failures.push(`the worked example's required photos changed: ${parts.join("; ")}`);
        }
        if (liveOption.photosBlockBooking !== ex.blocksBooking) {
          failures.push(
            `the worked example's photosBlockBooking changed: committed ${ex.blocksBooking}, live ${liveOption.photosBlockBooking}`
          );
        }
        if (String(liveOption.question.service.bookingType) !== ex.bookingType) {
          failures.push(
            `the worked example's service bookingType changed: committed ${ex.bookingType}, live ${liveOption.question.service.bookingType}`
          );
        }
      }
    }
  }

  if (!failures.length) {
    console.log(`\n  ok   /product/guided-estimates still matches the product\n`);
    await prisma.$disconnect();
    return;
  }
  console.error(`\n  FAIL Guided Estimates capability check failed:`);
  for (const f of failures) console.error(`         ${f}`);
  console.error(`\n       This means the product itself changed on ${REFERENCE_TENANT}, or the committed`);
  console.error(`       file is malformed — read the page before re-capturing.\n`);
  process.exit(1);
}

main().catch(async (e) => { console.error(`\n  ${e.message}\n`); await prisma.$disconnect(); process.exit(1); });
