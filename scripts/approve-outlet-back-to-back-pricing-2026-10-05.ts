/**
 * Refresh the explicitly owner-approved derived-price basis for the electrical
 * onboarding test site's new-outlet service. Report-only unless --apply.
 */
import { PrismaClient } from "@prisma/client";
import { FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { loadRoutePricingReview } from "../lib/electrical/routePricingReview";
import { loadPricingSettings, loadServiceForResolution } from "../lib/routeResolver";
import { resolveRouteWithDerivedPricing } from "../lib/electrical/resolveWithDerivedPricing";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUG = "electrical-onboarding-test";
const SERVICE_SLUG = "new-120v-outlet";
const EXPECTED_REPRESENTATIVE_TOTAL_CENTS = 84_000;
const EXPECTED_BACK_TO_BACK_TOTAL_CENTS = 29_500;

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
    const service = await db.service.findFirstOrThrow({
      where: {
        slug: SERVICE_SLUG,
        active: true,
        contractor: { slug: CONTRACTOR_SLUG },
      },
      select: { id: true, contractorId: true },
    });
    const existing = await db.contractorDerivedPricingApproval.findUniqueOrThrow({
      where: {
        contractorId_serviceId: {
          contractorId: service.contractorId,
          serviceId: service.id,
        },
      },
      select: { approvedTotalCents: true },
    });
    const review = await loadRoutePricingReview(db, service.contractorId, service.id);
    if (!review?.approvalToken || review.proposal?.totalCents === null || review.proposal?.totalCents === undefined) {
      throw new Error(`No complete current proposal: ${review?.refusal ?? "unavailable"}`);
    }
    if (
      existing.approvedTotalCents !== EXPECTED_REPRESENTATIVE_TOTAL_CENTS ||
      review.proposal.totalCents !== EXPECTED_REPRESENTATIVE_TOTAL_CENTS
    ) {
      throw new Error(
        `Refusing changed totals: existing=${existing.approvedTotalCents}, current=${review.proposal.totalCents}.`,
      );
    }

    console.log(`OUTLET BACK-TO-BACK PRICE APPROVAL — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${CONTRACTOR_SLUG}`);
    console.log(`  representative approval: $${(review.proposal.totalCents / 100).toFixed(2)} (unchanged)`);
    console.log(`  expected back-to-back price: $${(EXPECTED_BACK_TO_BACK_TOTAL_CENTS / 100).toFixed(2)}`);
    if (!apply) {
      console.log("  Report only. Re-run with --apply after explicit owner approval.");
      return;
    }

    const approval = await decideDerivedPricingApproval(
      db,
      { contractorId: service.contractorId, userId: null },
      {
        action: "approve",
        serviceId: service.id,
        expectedFingerprint: review.approvalToken,
      },
    );
    if (
      approval.status !== 200 ||
      approval.body.approved !== true ||
      approval.body.approvedTotalCents !== EXPECTED_REPRESENTATIVE_TOTAL_CENTS
    ) {
      throw new Error(`Approval refused or changed: ${JSON.stringify(approval.body)}`);
    }

    const loaded = await loadServiceForResolution(db, service.id);
    if (!loaded) throw new Error("The outlet service could not be loaded after approval.");
    const settings = await loadPricingSettings(db, service.contractorId);
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
    if (verdict.status !== "PRICED" || verdict.priceCents !== EXPECTED_BACK_TO_BACK_TOTAL_CENTS) {
      throw new Error(`Post-approval price mismatch: ${JSON.stringify(verdict)}`);
    }
    console.log("  approved and verified: back-to-back outlet prices at $295.00");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
