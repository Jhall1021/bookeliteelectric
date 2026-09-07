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
 * and exclude only fixtures. Note what follows: a new quote submission
 * changes this snapshot and needs a re-capture before the next release.
 *
 * READ ONLY. Nothing here writes: every mutating method on every model it
 * touches is poisoned before the first query, and `assertReadOnly` fails
 * loudly rather than quietly if a future edit reaches for one.
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
 *   npx tsx scripts/capture-guided-estimates.ts --check   # fail if it drifted
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
  console.log(`\nGUIDED ESTIMATES — ${checking ? "checking" : "capturing"}\n`);

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

  if (!checking) {
    const file =
      `/**\n` +
      ` * GENERATED — do not edit by hand.\n` +
      ` *\n` +
      ` * What Guided Estimates does, measured from the product: live services of\n` +
      ` * active contractors, verifier fixtures excluded. The page that reads this\n` +
      ` * may not claim anything the capture does not contain.\n` +
      ` *\n` +
      ` * Re-capture:   npx tsx scripts/capture-guided-estimates.ts\n` +
      ` * Check drift:  npx tsx scripts/capture-guided-estimates.ts --check\n */\n` +
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
  const differences = diff(committed, snapshot, "");
  if (!differences.length) {
    console.log(`\n  ok   /product/guided-estimates still matches the product\n`);
    await prisma.$disconnect();
    return;
  }
  console.error(`\n  FAIL Guided Estimates drifted from what the page claims:`);
  for (const d of differences.slice(0, 25)) console.error(`         ${d}`);
  if (differences.length > 25) console.error(`         …and ${differences.length - 25} more`);
  console.error(`\n       Re-capture: npx tsx scripts/capture-guided-estimates.ts`);
  console.error(`       Then read the page — a route that changed changes what it promises.\n`);
  process.exit(1);
}

function diff(a: any, b: any, at: string): string[] {
  if (a === b) return [];
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    return [`${at || "(root)"}: committed ${JSON.stringify(a)} — live ${JSON.stringify(b)}`];
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.flatMap((k) => diff(a[k], b[k], at ? `${at}.${k}` : k));
}

main().catch(async (e) => { console.error(`\n  ${e.message}\n`); await prisma.$disconnect(); process.exit(1); });
