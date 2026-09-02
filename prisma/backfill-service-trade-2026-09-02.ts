/**
 * ONE-TIME BACKFILL — Service.tradeKey for the legacy Electrical catalog.
 *
 * ALREADY APPLIED TO price2book-production on 2 September 2026: 154 services
 * stamped "electrical", postcondition green. This file is the MIGRATION
 * ARTIFACT — it exists so the same change can be replayed truthfully in another
 * environment, and so the repository records exactly what was stamped rather
 * than a description of it.
 *
 * WHY THIS IS NOT `WHERE tradeKey IS NULL -> 'electrical'`
 *
 * That query is a default with extra steps. It would be right on the day it ran
 * and wrong forever after: the first Plumbing or HVAC service created before
 * someone set its trade would be silently classified Electrical, and nothing
 * would report it. The column is nullable and default-free precisely so "we
 * never established this" stays visible and fails closed.
 *
 * WHY COUNTS WERE NOT ENOUGH EITHER
 *
 * An earlier version of this script compared per-contractor COUNTS. That has
 * two holes, and both are the kind that look fine in a log:
 *
 *   One service could disappear and another appear within the same contractor
 *   and the count would still match — a row nobody reviewed, stamped as though
 *   it had been.
 *
 *   It surveyed first and then ran `updateMany({ tradeKey: null })`, so a
 *   service created BETWEEN those two operations was also stamped, having never
 *   been reviewed at all.
 *
 * So this compares an EXACT IDENTITY SET — every reviewed service by slug,
 * under a fingerprint over the whole set — and updates only those exact rows,
 * resolved and written inside ONE transaction. There is no window between
 * deciding what to stamp and stamping it, and no query that could sweep in a
 * row the reviewed set does not name.
 *
 *   npx tsx prisma/backfill-service-trade-2026-09-02.ts --check
 *   npx tsx prisma/backfill-service-trade-2026-09-02.ts --apply
 *
 * Reads only, unless --apply is passed.
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

/** The trade every reviewed row gets. One, because one is what was reviewed. */
const TRADE = "electrical";

/**
 * THE REVIEWED SET, as it stood on 2 September 2026.
 *
 * Every service, by slug, under the contractor that owns it. Slugs rather than
 * ids so the artifact is portable to an environment where ids differ; the
 * fingerprint below is what makes the set itself tamper-evident.
 *
 * Both contractors sold Electrical and only Electrical. That is the fact that
 * made the stamp safe, and it is exactly what stops being true the moment a
 * second trade is provisioned anywhere.
 */
const REVIEWED: { contractorSlug: string; services: string[] }[] = [
  {
    contractorSlug: "elite-electric",
    services: [
    "200a-service-upgrade",
    "240v-garage-outlet",
    "240v-garage-outlet-14-30",
    "240v-garage-outlet-14-50",
    "240v-garage-outlet-6-50",
    "bathroom-fan-light-combo",
    "bidet-smart-toilet-outlet",
    "customer-supplied-non-smart-outlet",
    "customer-supplied-smart-switch",
    "dedicated-120v-circuit-outlet",
    "dishwasher-electrical",
    "doorbell-transformer-replacement",
    "double-pole-breaker-replacement",
    "dryer-receptacle-replacement",
    "electric-fireplace-circuit",
    "electrical-panel-replacement",
    "electrical-troubleshooting",
    "elite-articulating-mount",
    "elite-tilt-mount",
    "exterior-gfci-other-routing",
    "exterior-gfci-standard",
    "fan-replacing-light",
    "floodlight-camera-existing",
    "freezer-fridge-dedicated-circuit",
    "garage-door-opener-outlet",
    "garage-door-opener-outlet-ev",
    "garbage-disposal-install",
    "generator-inlet-interlock",
    "hardwired-smoke-detector",
    "home-electrical-safety-inspection",
    "hot-tub-spa-electrical",
    "install-new-microwave",
    "level-2-ev-charger",
    "new-120v-outlet",
    "new-240v-appliance-circuit",
    "new-ceiling-fan",
    "new-ceiling-light",
    "new-coax-line",
    "new-ethernet-line",
    "new-exterior-flood-camera",
    "new-exterior-lighting-locations",
    "new-video-doorbell-wiring",
    "new-wall-sconce",
    "occupancy-motion-switch",
    "otr-microwave-install",
    "outdoor-landscape-lighting",
    "pool-equipment-electrical",
    "range-receptacle-replacement",
    "recessed-lighting",
    "remove-and-replace-existing-chandelier",
    "replace-3-way-switch",
    "replace-bathroom-exhaust-fan",
    "replace-bathroom-exhaust-fan-with-light",
    "replace-ceiling-fan",
    "replace-exterior-light-fixture",
    "replace-gfci-outlet",
    "replace-interior-light-fixture",
    "replace-led-dimmer",
    "replace-motion-flood-light",
    "replace-range-hood",
    "replace-standard-outlet",
    "replace-standard-switch",
    "replace-wall-sconce",
    "single-pole-breaker-replacement",
    "smart-outlet-upgrade",
    "smart-switch-upgrade",
    "smart-thermostat-install",
    "smoke-co-detector",
    "soundbar-installation",
    "sump-pump-dedicated-circuit",
    "swap-out-customer-supplied-non-smart-switch",
    "timer-switch-install",
    "transfer-switch",
    "tv-install-existing-location",
    "tv-installation",
    "under-cabinet-led-lighting",
    "usb-outlet-upgrade",
    "video-doorbell-existing-wiring",
    "whole-house-surge-protection",
    ],
  },
  {
    contractorSlug: "brightpath-electric",
    services: [
    "200a-service-upgrade",
    "240v-garage-outlet",
    "articulating-tv-mount",
    "bathroom-fan-light-combo",
    "bidet-smart-toilet-outlet",
    "customer-supplied-non-smart-outlet",
    "customer-supplied-smart-switch",
    "dedicated-120v-circuit-outlet",
    "dishwasher-electrical",
    "doorbell-transformer-replacement",
    "double-pole-breaker-replacement",
    "dryer-receptacle-replacement",
    "electric-fireplace-circuit",
    "electrical-panel-replacement",
    "electrical-troubleshooting",
    "exterior-gfci-other-routing",
    "exterior-gfci-standard",
    "fan-replacing-light",
    "floodlight-camera-existing",
    "freezer-fridge-dedicated-circuit",
    "garage-door-opener-outlet",
    "garage-door-opener-outlet-ev",
    "garbage-disposal-install",
    "generator-inlet-interlock",
    "hardwired-smoke-detector",
    "home-electrical-safety-inspection",
    "hot-tub-spa-electrical",
    "install-new-microwave",
    "level-2-ev-charger",
    "new-120v-outlet",
    "new-240v-appliance-circuit",
    "new-ceiling-fan",
    "new-ceiling-light",
    "new-coax-line",
    "new-ethernet-line",
    "new-exterior-flood-camera",
    "new-exterior-lighting-locations",
    "new-video-doorbell-wiring",
    "new-wall-sconce",
    "occupancy-motion-switch",
    "otr-microwave-install",
    "outdoor-landscape-lighting",
    "pool-equipment-electrical",
    "range-receptacle-replacement",
    "recessed-lighting",
    "remove-and-replace-existing-chandelier",
    "replace-3-way-switch",
    "replace-bathroom-exhaust-fan",
    "replace-ceiling-fan",
    "replace-exterior-light-fixture",
    "replace-gfci-outlet",
    "replace-interior-light-fixture",
    "replace-led-dimmer",
    "replace-motion-flood-light",
    "replace-range-hood",
    "replace-standard-outlet",
    "replace-standard-switch",
    "replace-wall-sconce",
    "single-pole-breaker-replacement",
    "smart-outlet-upgrade",
    "smart-switch-upgrade",
    "smart-thermostat-install",
    "smoke-co-detector",
    "soundbar-installation",
    "sump-pump-dedicated-circuit",
    "swap-out-customer-supplied-non-smart-switch",
    "tilt-tv-mount",
    "timer-switch-install",
    "transfer-switch",
    "tv-install-existing-location",
    "tv-installation",
    "under-cabinet-led-lighting",
    "usb-outlet-upgrade",
    "video-doorbell-existing-wiring",
    "whole-house-surge-protection",
    ],
  },
];

/**
 * Fingerprint of the reviewed set.
 *
 * Recomputed at run time and compared. An edit to REVIEWED that does not also
 * update this is refused — so the set cannot be widened casually to make a
 * failing run pass, which is the failure mode ADR-021 names for baselines.
 */
const FINGERPRINT = "2ac2d1e1b34cb70d";

function fingerprintOf(set: typeof REVIEWED): string {
  return createHash("sha256").update(JSON.stringify(set)).digest("hex").slice(0, 16);
}

type Problem = string;

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("\nBACKFILL — Service.tradeKey, reviewed 2 September 2026\n");

  const actual = fingerprintOf(REVIEWED);
  if (actual !== FINGERPRINT) {
    console.log(`  REFUSED — the reviewed set has been edited.`);
    console.log(`    recorded fingerprint ${FINGERPRINT}`);
    console.log(`    computed fingerprint ${actual}`);
    console.log(`\n  Editing the set is a re-review, not a fix. Update FINGERPRINT`);
    console.log(`  deliberately once somebody has looked at what changed.\n`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const total = REVIEWED.reduce((n, r) => n + r.services.length, 0);
  console.log(`  reviewed set: ${total} service(s) across ${REVIEWED.length} contractor(s), fingerprint ${FINGERPRINT}`);
  for (const r of REVIEWED) console.log(`    ${r.contractorSlug}  ${r.services.length}`);
  console.log();

  // Survey and write inside ONE transaction, so nothing created between the two
  // can be swept in — the exact hole the count-based version had.
  const result = await prisma.$transaction(async (tx) => {
    const problems: Problem[] = [];
    const toStamp: string[] = [];
    let alreadyStamped = 0;

    for (const r of REVIEWED) {
      const c = await tx.contractor.findFirst({
        where: { slug: r.contractorSlug },
        select: { id: true },
      });
      if (!c) {
        problems.push(`${r.contractorSlug}: contractor not found`);
        continue;
      }

      const live = await tx.service.findMany({
        where: { contractorId: c.id },
        select: { id: true, slug: true, tradeKey: true },
      });
      const liveBySlug = new Map(live.map((s) => [s.slug, s]));
      const reviewed = new Set(r.services);

      // EXACT SET COMPARISON, both directions. A missing service and an extra
      // one cannot cancel out, which is what a count allowed.
      for (const slug of r.services) {
        if (!liveBySlug.has(slug)) problems.push(`${r.contractorSlug}/${slug}: reviewed, not present`);
      }
      for (const s of live) {
        if (!reviewed.has(s.slug)) {
          problems.push(`${r.contractorSlug}/${s.slug}: present, and NOT in the reviewed set`);
        }
      }
      if (problems.length > 0) continue;

      for (const slug of r.services) {
        const s = liveBySlug.get(slug)!;
        if (s.tradeKey === TRADE) alreadyStamped++;
        else if (s.tradeKey === null) toStamp.push(s.id);
        else problems.push(`${r.contractorSlug}/${slug}: already "${s.tradeKey}", not "${TRADE}"`);
      }
    }

    if (problems.length > 0) return { problems, stamped: 0, alreadyStamped, toStamp: toStamp.length };

    if (!apply) return { problems, stamped: 0, alreadyStamped, toStamp: toStamp.length };

    // By explicit id, never by a predicate. Only the reviewed rows can be
    // written, and only where the trade is still unset.
    const res = await tx.service.updateMany({
      where: { id: { in: toStamp }, tradeKey: null },
      data: { tradeKey: TRADE },
    });
    return { problems, stamped: res.count, alreadyStamped, toStamp: toStamp.length };
  });

  if (result.problems.length > 0) {
    console.log("  REFUSED — the live catalog does not match the reviewed set:");
    for (const p of result.problems) console.log(`    ${p}`);
    console.log(
      "\n  This is not a failure to work around. Somebody added, removed or already\n" +
        "  classified services since the review, and whether those are Electrical is\n" +
        "  a question for a person. Re-review, update REVIEWED and FINGERPRINT, and\n" +
        "  run again.\n"
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`  ok — the live catalog matches the reviewed set exactly`);
  console.log(`    already stamped "${TRADE}": ${result.alreadyStamped}`);
  console.log(`    still to stamp:            ${result.toStamp}`);

  if (!apply) {
    console.log("\n  --check only. Re-run with --apply to write.\n");
  } else {
    console.log(`\n  stamped ${result.stamped} service(s) in one transaction.`);
    console.log(`  Services created hereafter get their trade from provisioning or from`);
    console.log(`  the explicit choice on custom-service creation; a null tradeKey stays`);
    console.log(`  "not established" and fails closed.\n`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
