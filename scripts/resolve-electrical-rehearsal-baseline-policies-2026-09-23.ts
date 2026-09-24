/**
 * Record the explicit Price2Book baseline answers needed to finish the
 * designated Electrical rehearsal. These are rehearsal fixture answers, not
 * template defaults: the canonical template deliberately ships every policy
 * unresolved so a real contractor must confirm or replace them.
 *
 * Numeric bands preserve the catalog's authored service scopes. The bathroom
 * fan answer matches its itemized fan material. Connected-device app setup is
 * excluded because the audited atomic workbook includes electrical function
 * testing and handoff, but no app commissioning step. Raceway offcuts are
 * reused across legs, matching the user's per-use purchasing direction.
 */
import { PrismaClient } from "@prisma/client";
import { isRehearsalSlug } from "../lib/electrical/pilotScope";
import { resolvePolicy } from "../lib/policyResolution";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const contractorIndex = process.argv.indexOf("--contractor");
const contractorSlug = contractorIndex >= 0 ? process.argv[contractorIndex + 1] : undefined;

const ANSWERS = [
  { key: "bathroom_fan.supply_arrangement", answer: { choice: "Contractor supplies the fan" } },
  { key: "connected_device.commissioning", answer: { choice: "NOT_INCLUDED" } },
  { key: "data_cable_run.breakpoints", answer: { boundaries: [50] } },
  { key: "exterior_mount_height.breakpoints", answer: { boundaries: [8, 12] } },
  { key: "exterior_outlet_run.breakpoints", answer: { boundaries: [10, 20] } },
  { key: "sconce_run.breakpoints", answer: { boundaries: [20] } },
  { key: "surface_raceway.offcut_reuse", answer: { choice: "REUSE_ACROSS_LEGS" } },
  { key: "switch_leg_run.breakpoints", answer: { boundaries: [10, 20] } },
  { key: "under_cabinet_run.breakpoints", answer: { boundaries: [12] } },
  { key: "surface_outlet.branch_conductor_spec", answer: { choice: "12" } },
  { key: "surface_raceway.conductor_slack_per_termination", answer: { measurement: 0.5 } },
  { key: "concealed_branch.cable_role", answer: { choice: "WIRE_14_2" } },
  { key: "concealed_branch.cable_slack_per_termination", answer: { measurement: 7 } },
  { key: "concealed_branch.back_to_back_cable_allowance", answer: { measurement: 3 } },
  { key: "concealed_branch.cable_support_spacing", answer: { measurement: 4.5 } },
  { key: "concealed_branch.support_at_each_termination", answer: { choice: "YES" } },
  { key: "concealed_branch.drywall_framing_spacing_inches", answer: { measurement: 16 } },
] as const;

const same = (row: { boundaries: number[]; choice: string | null; measurement: number | null }, answer: { boundaries?: readonly number[]; choice?: string; measurement?: number }) =>
  answer.measurement !== undefined
    ? row.measurement === answer.measurement
    : answer.choice !== undefined
    ? row.choice === answer.choice
    : JSON.stringify(row.boundaries) === JSON.stringify(answer.boundaries);

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
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
    const contractor = await db.contractor.findUnique({
      where: { slug: contractorSlug }, select: { id: true },
    });
    if (!contractor) throw new Error(`${contractorSlug} does not exist`);
    const rows = await db.contractorPolicyValue.findMany({
      where: { contractorId: contractor.id, key: { in: ANSWERS.map(({ key }) => key) } },
      select: { key: true, boundaries: true, choice: true, measurement: true, resolvedAt: true },
    });
    if (rows.length !== ANSWERS.length) {
      const found = new Set(rows.map(({ key }) => key));
      throw new Error(`missing policies: ${ANSWERS.filter(({ key }) => !found.has(key)).map(({ key }) => key).join(", ")}`);
    }

    console.log(`\nELECTRICAL REHEARSAL BASELINE POLICIES — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}\n`);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    let pending = 0;
    for (const item of ANSWERS) {
      const row = byKey.get(item.key)!;
      const proposed = "choice" in item.answer
        ? item.answer.choice
        : "measurement" in item.answer
          ? item.answer.measurement
          : item.answer.boundaries.join(", ");
      if (row.resolvedAt) {
        if (!same(row, item.answer)) throw new Error(`${item.key} is already resolved to a different answer; refusing to overwrite it`);
        console.log(`  ${item.key}: already current (${proposed})`);
        continue;
      }
      pending++;
      console.log(`  ${item.key}: ${apply ? "resolve" : "would resolve"} to ${proposed}`);
    }
    if (!apply) {
      console.log(`\n  would resolve ${pending} policy answer(s); no change\n`);
      return;
    }
    for (const item of ANSWERS) {
      const row = byKey.get(item.key)!;
      if (row.resolvedAt) continue;
      const answer = "choice" in item.answer
        ? { choice: item.answer.choice }
        : "measurement" in item.answer
          ? { measurement: item.answer.measurement }
          : { boundaries: [...item.answer.boundaries] };
      const result = await resolvePolicy(db, contractor.id, item.key, answer);
      if (!result.ok) throw new Error(`${item.key}: ${result.refusal.code} — ${result.refusal.message}`);
    }
    console.log(`\n  resolved ${pending} explicit rehearsal baseline policy answer(s)\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
