/** Author the reviewed dedicated-circuit exterior-wall disclosure for one rehearsal tenant. */
import { PrismaClient } from "@prisma/client";
import { authorContractorDisclaimer, pendingContractorDisclaimers } from "../lib/disclaimerAuthoring";
import { isRehearsalSlug } from "../lib/electrical/pilotScope";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const DISCLAIMER_KEY = "EXTERIOR_WALL_CONTINGENCY_DEDICATED";
const DISCLAIMER_TEXT =
  "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. " +
  "Small drywall openings may be needed to get the wiring across, which takes longer, and patching and painting aren't included. " +
  "We'd show you what we're looking at and give you a price before doing any of it.";

const contractorIndex = process.argv.indexOf("--contractor");
const contractorSlug = contractorIndex >= 0 ? process.argv[contractorIndex + 1] : undefined;

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (process.env.DATABASE_URL !== targetUrl) throw new Error("DATABASE_URL must equal the guarded rehearsal target for disclaimer authoring");
  if (!contractorSlug) throw new Error("--contractor is required");
  if (!isRehearsalSlug(contractorSlug)) throw new Error(`refusing non-rehearsal contractor ${contractorSlug}`);
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({ where: { slug: contractorSlug }, select: { id: true } });
    if (!contractor) throw new Error(`${contractorSlug} does not exist`);
    const pending = (await pendingContractorDisclaimers(db, contractor.id)).find((item) => item.key === DISCLAIMER_KEY);
    if (!pending) throw new Error(`${DISCLAIMER_KEY} is not required by this installed catalog`);
    console.log(`\nDEDICATED-CIRCUIT EXTERIOR-WALL DISCLAIMER — ${apply ? "AUTHOR" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}`);
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
