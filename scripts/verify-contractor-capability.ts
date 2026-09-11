/**
 * ContractorCapability — the three states, and that nothing collapses them.
 *
 * The value of this primitive is the distinction it refuses to lose. "We never
 * asked this contractor" and "this contractor said no" send a homeowner to the
 * same place today, and they are different facts about the business. A boolean
 * would erase that permanently, and no later screen could recover it.
 */
import { PrismaClient } from "@prisma/client";
import { capabilityState, loadCapabilityFacts, CAPABILITY_KEYS, isCapabilityKey } from "../lib/capabilities";
import { readFileSync } from "node:fs";
import { eliteContractorId } from "../prisma/_componentHelpers";

const prisma = new PrismaClient();
const RUN = `rv2cap-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function main() {
  console.log("\nCONTRACTOR CAPABILITY — OFFERED SCOPE, NOT A CREDENTIAL\n");

  console.log("  A  THE VOCABULARY IS NARROW AND ITS OWN\n");
  ok(CAPABILITY_KEYS.length === 2 &&
     CAPABILITY_KEYS.includes("BASEBOARD_ACCESS_REINSTALL") &&
     CAPABILITY_KEYS.includes("DRYWALL_ACCESS_RESTORATION"),
    "A  the initial vocabulary is exactly the two Routing V2 scopes", CAPABILITY_KEYS.join(", "));
  ok(!isCapabilityKey("EPA_608"),
    "A  a CREDENTIAL key is not a capability key — the domains stay separate");

  const src = readFileSync("lib/capabilities.ts", "utf8");
  const cred = readFileSync("lib/credentials.ts", "utf8");
  ok(!/CREDENTIAL_KEYS/.test(src), "A  capabilities does not reuse the credential vocabulary");
  ok(!/CAPABILITY_KEYS/.test(cred), "A  and credentials was not widened to absorb capabilities");
  // The contract that makes the whole thing worth having.
  ok(!/export function hasCapability|=> *state *=== *"declared"/.test(src),
    "A  there is NO boolean helper collapsing the two non-declared states");

  console.log("\n  B  THREE STATES, FROM REAL ROWS\n");
  // ELITE, NAMED. This took whichever contractor came back first, so the
  // capability rows it wrote and deleted belonged to an arbitrary tenant.
  const c = { id: await eliteContractorId(prisma), slug: "elite-electric" };
  const KEY = "BASEBOARD_ACCESS_REINSTALL";
  await prisma.contractorCapability.deleteMany({ where: { contractorId: c.id, key: KEY } });

  let facts = await loadCapabilityFacts(prisma, c.id);
  ok(capabilityState(facts, KEY) === "not-established",
    "B  no row at all is not-established", capabilityState(facts, KEY));

  const row = await prisma.contractorCapability.create({
    data: { contractorId: c.id, key: KEY }, select: { id: true } });
  facts = await loadCapabilityFacts(prisma, c.id);
  ok(capabilityState(facts, KEY) === "declared",
    "B  a live row is declared", capabilityState(facts, KEY));

  await prisma.contractorCapability.update({
    where: { id: row.id }, data: { revokedAt: new Date() } });
  facts = await loadCapabilityFacts(prisma, c.id);
  ok(capabilityState(facts, KEY) === "revoked",
    "B  a revoked row is revoked — the row is KEPT, not deleted", capabilityState(facts, KEY));
  ok(capabilityState(facts, KEY) !== "not-established",
    "B  and revoked is NOT the same state as never-declared");

  await prisma.contractorCapability.delete({ where: { id: row.id } });
  ok(capabilityState(await loadCapabilityFacts(prisma, c.id), KEY) === "not-established",
    "B  fixture removed, back to not-established");

  console.log("\n  C  PROVISIONING DOES NOT DECLARE ON A CONTRACTOR'S BEHALF\n");
  const prov = readFileSync("lib/templateProvisioning.ts", "utf8");
  ok(!/contractorCapability/i.test(prov),
    "C  provisioning never creates a capability row — the template says what a route " +
    "REQUIRES; only the contractor says what they OFFER");

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
