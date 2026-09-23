/**
 * Author the neutral customer-supplied-equipment scope wording for the
 * designated Electrical rehearsal contractor. The text is grounded in the
 * atomic recipe workbook: owner-supplied equipment is excluded from material
 * quantities, while each service's listed installation materials remain in
 * its recipe.
 *
 *   npx tsx scripts/author-electrical-rehearsal-customer-supplied-disclaimer-2026-09-23.ts
 *   npx tsx scripts/author-electrical-rehearsal-customer-supplied-disclaimer-2026-09-23.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { authorContractorDisclaimer, pendingContractorDisclaimers } from "../lib/disclaimerAuthoring";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
const DISCLAIMER_KEY = "CUSTOMER_SUPPLIED_EQUIPMENT";
const DISCLAIMER_TEXT =
  "This service price is for installing compatible equipment you provide and the small installation materials listed in the service. " +
  "The equipment itself is not included. Please have all manufacturer-required mounting hardware, cords, adapters, and accessories on site. " +
  "Missing parts, incompatible or defective equipment, changes to wiring, venting, mounting surfaces, or cable concealment are reviewed and approved separately before additional work.";

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  // disclaimerAuthoring's transaction uses the application's DATABASE_URL.
  // Require it to be this exact guarded rehearsal target before importing is
  // allowed to result in any write.
  if (process.env.DATABASE_URL !== targetUrl) {
    throw new Error("DATABASE_URL must equal the guarded rehearsal target for disclaimer authoring");
  }
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({
      where: { slug: EXPECTED_CONTRACTOR }, select: { id: true },
    });
    if (!contractor) throw new Error(`${EXPECTED_CONTRACTOR} does not exist`);
    const pending = (await pendingContractorDisclaimers(db, contractor.id))
      .find((item) => item.key === DISCLAIMER_KEY);
    if (!pending) throw new Error(`${DISCLAIMER_KEY} is not required by this installed catalog`);

    console.log(`\nCUSTOMER-SUPPLIED EQUIPMENT DISCLAIMER — ${apply ? "AUTHOR" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${EXPECTED_CONTRACTOR}`);
    console.log(`  affected services: ${pending.dependentSlugs.join(", ")}`);
    console.log(`  current: ${pending.authored ? pending.text : "not authored"}`);
    console.log(`  proposed: ${DISCLAIMER_TEXT}\n`);

    if (pending.authored) {
      if (pending.text !== DISCLAIMER_TEXT) throw new Error("existing contractor wording differs; refusing to overwrite it");
      console.log("  wording already current; no change\n");
      return;
    }
    if (!apply) { console.log("  would author and attach this wording; no change\n"); return; }

    const result = await authorContractorDisclaimer(db, contractor.id, DISCLAIMER_KEY, DISCLAIMER_TEXT);
    if (!result.ok) throw new Error(`${result.code} — ${result.message}`);
    console.log(`  authored and attached to ${result.attached} applicable answer option(s)\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
