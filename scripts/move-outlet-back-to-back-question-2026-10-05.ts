/**
 * Move the ordinary new-outlet back-to-back check directly after the customer
 * chooses "From the nearest outlet". Report-only unless --apply is supplied.
 */
import { PrismaClient } from "@prisma/client";
import { FINISHED_KEYS } from "../prisma/_finishedWallModule";
import {
  migrateOutletToV2,
  OUTLET_SLUG,
  OUTLET_V2_KEYS,
} from "../prisma/seed-new-outlet-v2";
import { loadPricingSettings, loadServiceForResolution } from "../lib/routeResolver";
import { resolveRouteWithDerivedPricing } from "../lib/electrical/resolveWithDerivedPricing";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTORS = ["electrical-onboarding-test", "elite-electric"];

async function assertWiring(db: PrismaClient, serviceId: string) {
  const source = await db.question.findFirstOrThrow({
    where: { serviceId, key: "outlet_power_source" },
    select: { options: true },
  });
  const backToBack = await db.question.findFirstOrThrow({
    where: { serviceId, key: FINISHED_KEYS.backToBack },
    select: { id: true, options: true },
  });
  const access = await db.question.findFirstOrThrow({
    where: { serviceId, key: "below_above_access" },
    select: { id: true },
  });
  const tap = source.options.find((option) => option.value === "tap_existing");
  const yes = backToBack.options.find((option) => option.value === "yes");
  const no = backToBack.options.find((option) => option.value === "no");
  if (
    tap?.routeAction !== "CONTINUE" ||
    tap.nextQuestionId !== backToBack.id ||
    yes?.routeAction !== "RESOLVE_INSTANT" ||
    no?.routeAction !== "CONTINUE" ||
    no.nextQuestionId !== access.id
  ) {
    throw new Error("The outlet back-to-back branch did not match the required wiring.");
  }
}

async function assertInstantPrice(db: PrismaClient, serviceId: string) {
  const loaded = await loadServiceForResolution(db, serviceId);
  if (!loaded) throw new Error(`Service ${serviceId} could not be loaded for pricing.`);
  const settings = await loadPricingSettings(db, loaded.contractorId ?? "");
  const verdict = await resolveRouteWithDerivedPricing(
    db,
    loaded,
    {
      outlet_load_type: "everyday",
      outlet_power_source: "tap_existing",
      [FINISHED_KEYS.backToBack]: "yes",
    },
    true,
    settings,
  );
  if (verdict.status !== "PRICED") {
    throw new Error(
      `Back-to-back outlet did not price instantly: ${verdict.status} ${
        "derivedRefusalCode" in verdict ? verdict.derivedRefusalCode ?? "" : ""
      } ${"reason" in verdict ? verdict.reason ?? "" : ""}`.trim(),
    );
  }
  return verdict.priceCents;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(targetUrl);
  if (
    identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT ||
    identity.lineage !== PRODUCTION_LINEAGE ||
    identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT
  ) {
    throw new Error(
      `Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`,
    );
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const targets = await db.service.findMany({
      where: {
        slug: OUTLET_SLUG,
        active: true,
        questions: { some: { key: OUTLET_V2_KEYS.method, options: { some: {} } } },
      },
      select: { id: true, contractor: { select: { slug: true } } },
      orderBy: { contractor: { slug: "asc" } },
    });
    const actual = targets.map((target) => target.contractor.slug).sort();
    if (actual.join(",") !== EXPECTED_CONTRACTORS.join(",")) {
      throw new Error(`Refusing unexpected active targets: ${actual.join(", ") || "none"}.`);
    }

    console.log(`OUTLET BACK-TO-BACK ORDER — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const target of targets) console.log(`  ${target.contractor.slug} (${target.id})`);
    if (!apply) {
      console.log("  Report only. Re-run with --apply to move and verify the branch.");
      return;
    }

    for (const target of targets) {
      await migrateOutletToV2(db, target.id);
      await assertWiring(db, target.id);
      const priceCents = await assertInstantPrice(db, target.id);
      console.log(`  updated ${target.contractor.slug}: back-to-back price $${(priceCents / 100).toFixed(2)}`);
    }
    console.log(`  Published and price-verified ${targets.length} outlet tree(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
