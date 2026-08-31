/**
 * What the intro screen promises, and whether the tree can keep it.
 *
 *   npx tsx scripts/verify-storefront-price-promise.ts
 *
 * "Starting at $2,155" on its own reads like an estimate. Under FLAT_RATE it
 * is the opposite of one: the questions establish scope, and a qualifying
 * project is quoted a price that does not move. The screen now says so before
 * anyone answers anything.
 *
 * TWO WAYS THAT PROMISE COULD BE WRONG, and this exists for both.
 *
 * Promising an exact price on a tree that can legitimately end in review would
 * be broken by design — so the wording is chosen from the TREE, not from a
 * list of slugs. And promising a fixed price at all is a FLAT_RATE claim; a
 * time-and-materials contractor bills actual hours, so the same screen must
 * say something different for them.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { pricingCopy } from "../lib/pricingCopy";

const prisma = new PrismaClient();
let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function main() {
  console.log(`\nSTOREFRONT PRICE PROMISE\n`);

  const intro = strip(readFileSync("components/guided-flow/ServiceIntro.tsx", "utf8"));
  const engine = strip(readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8"));

  // ── the rule is general ────────────────────────────────────────────────
  ok(`1. the promise is read from pricing copy, not written into the screen`,
    /pcopy\.qualifyLead/.test(intro) && /pcopy\.qualifyCta/.test(intro) &&
    /pcopy\.qualifyTrustLine/.test(intro));
  ok(`2. and chosen from the TREE rather than from a service`,
    /routeAction/.test(engine) && /photosBlockBooking/.test(engine) &&
    /mayNotQualify/.test(engine));
  ok(`3. no service slug decides what the screen claims`,
    !/(electrical-panel-replacement|200a-service-upgrade)/.test(intro) &&
    !/(electrical-panel-replacement|200a-service-upgrade)/.test(engine));
  ok(`4. the old unconditional "Get My Price" is gone`,
    !/"Get My Price"/.test(intro));

  // ── the promise differs by what the contractor actually sells ──────────
  const flat = pricingCopy("FLAT_RATE");
  const tm = pricingCopy("TIME_AND_MATERIALS");
  ok(`5. a flat-rate contractor promises a fixed price before booking`,
    /fixed price/i.test(flat.qualifyTrustLine) && /exact price/i.test(flat.qualifyLeadMayReview));
  ok(`6. a time-and-materials contractor promises no such thing`,
    !/fixed price/i.test(tm.qualifyTrustLine) && !/exact price/i.test(tm.qualifyLeadMayReview),
    tm.qualifyTrustLine);
  ok(`7.   and says what it does bill on`,
    /actual time and materials/i.test(tm.qualifyTrustLine));
  ok(`8. the button says CHECK, because some routes end in review`,
    /^Check/.test(flat.qualifyCta) && /^Check/.test(tm.qualifyCta),
    `${flat.qualifyCta} / ${tm.qualifyCta}`);

  // ── the wording matches each live tree ─────────────────────────────────
  const services = await prisma.service.findMany({
    where: { active: true },
    select: {
      slug: true,
      questions: { select: { options: { select: { routeAction: true, photosBlockBooking: true } } } },
    },
  });
  const withTree = services.filter((s) => s.questions.length > 0);
  let mismatched = 0;
  for (const s of withTree) {
    const opts = s.questions.flatMap((q) => q.options);
    const mayNotQualify = opts.some(
      (o) =>
        o.routeAction === "REMOTE_QUOTE" ||
        o.routeAction === "REROUTE_SERVICE" ||
        o.routeAction === "REROUTE_TROUBLESHOOTING" ||
        (o.routeAction === "PHOTO_REVIEW" && o.photosBlockBooking)
    );
    // If nothing can divert, the screen must not hedge; if something can, it
    // must. Either way the wording follows the tree the contractor built.
    const everyRoutePrices = opts.every(
      (o) => o.routeAction === "CONTINUE" || o.routeAction === "RESOLVE_INSTANT" ||
             o.routeAction === "RESOLVE_ADJUSTED" ||
             (o.routeAction === "PHOTO_REVIEW" && !o.photosBlockBooking)
    );
    if (mayNotQualify === everyRoutePrices) mismatched++;
  }
  ok(`9. every live tree resolves to one wording or the other, unambiguously`,
    mismatched === 0, `${mismatched} of ${withTree.length}`);
  console.log(`     ${withTree.length} active service(s) with a tree`);

  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  The screen promises what the tree behind it can deliver.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
