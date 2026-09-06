/**
 * What Guided Estimates actually does, measured rather than described.
 *
 * /product/guided-estimates makes one claim: a contractor can have a
 * homeowner walk a guided flow, hand over the details and photographs the
 * contractor needs, and then price the work themselves — without publishing
 * an instant price. That claim is only worth making if the product does it,
 * so the page is built from this capture and the build fails when it drifts.
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

  // ── how much of the estate actually runs this way ──────────────────────
  const byBookingType = await prisma.service.groupBy({
    by: ["bookingType"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const r of byBookingType) counts[String(r.bookingType)] = r._count._all;

  const remoteQuoteServices = await prisma.service.findMany({
    where: { bookingType: "REMOTE_QUOTE" },
    select: { id: true, name: true, basePrice: true, category: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // The claim that matters most on the page: these services carry no
  // published price, and the product is fine with that.
  const withoutPublishedPrice = remoteQuoteServices.filter((s) => s.basePrice === null).length;

  // ── the answers that hand a job to the contractor ──────────────────────
  // Only REMOTE_QUOTE and PHOTO_REVIEW: the two routes where a human being
  // prices the work. Grouped by prompt so the page shows real questions.
  const options = await prisma.answerOption.findMany({
    where: { routeAction: { in: ["REMOTE_QUOTE", "PHOTO_REVIEW"] } },
    select: {
      label: true,
      routeAction: true,
      requiredPhotoLabels: true,
      photosBlockBooking: true,
      question: { select: { prompt: true, service: { select: { name: true, bookingType: true } } } },
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
   * Among those, the answer asking for the most photographs, because it is
   * the clearest case of a homeowner supplying what a contractor would
   * otherwise have driven across town to see.
   */
  const withPhotos = options
    .filter((o) => o.requiredPhotoLabels.length > 0 && o.photosBlockBooking)
    .sort((a, b) => {
      const quoteFirst =
        Number(b.question.service.bookingType === "REMOTE_QUOTE") -
        Number(a.question.service.bookingType === "REMOTE_QUOTE");
      return quoteFirst || b.requiredPhotoLabels.length - a.requiredPhotoLabels.length;
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
  const quoteStatuses = await prisma.quote.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const quotes: Record<string, number> = {};
  for (const q of quoteStatuses) quotes[String(q.status)] = q._count._all;
  const quotesTotal = Object.values(quotes).reduce((a, b) => a + b, 0);

  const snapshot = {
    generatedBy: "scripts/capture-guided-estimates.ts",
    identity: IDENTITY,
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

  if (!checking) {
    const file =
      `/**\n` +
      ` * GENERATED — do not edit by hand.\n` +
      ` *\n` +
      ` * What Guided Estimates does, measured from the product. The page that\n` +
      ` * reads this may not claim anything the capture does not contain.\n` +
      ` *\n` +
      ` * Re-capture:   npx tsx scripts/capture-guided-estimates.ts\n` +
      ` * Check drift:  npx tsx scripts/capture-guided-estimates.ts --check\n */\n` +
      `export const GUIDED_ESTIMATES = ${JSON.stringify(snapshot, null, 2)} as const;\n`;
    writeFileSync(OUT, file);
    console.log(`  wrote ${OUT}`);
    console.log(`  ${snapshot.remoteQuote.services} quote-only services, ${snapshot.photos.distinctLabels} distinct photo requests, ${quotesTotal} quote(s) submitted\n`);
    await prisma.$disconnect();
    return;
  }

  if (!existsSync(OUT)) {
    console.error(`  FAIL ${OUT} does not exist — run the capture\n`);
    process.exit(1);
  }
  const committed = (await import(pathToFileURL(`${process.cwd()}/${OUT}`).href)).GUIDED_ESTIMATES;
  const a = JSON.stringify(committed);
  const b = JSON.stringify(snapshot);
  if (a === b) {
    console.log(`  ok   /product/guided-estimates still matches the product\n`);
    await prisma.$disconnect();
    return;
  }
  console.error(`\n  FAIL Guided Estimates drifted from what the page claims.`);
  console.error(`       Re-capture: npx tsx scripts/capture-guided-estimates.ts`);
  console.error(`       Then read the page — a route that changed changes what it promises.\n`);
  process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
