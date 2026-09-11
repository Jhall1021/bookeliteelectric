/**
 * ROUTING V2 — the canonical vocabulary says what it means, and costs nothing yet.
 *
 * Two independent things are asserted here, and both matter:
 *
 *   1. MEANINGS ARE FROZEN AND COMPLETE. Every component declares what it
 *      includes and what it excludes. A component whose meaning is vague is one
 *      that later absorbs whatever a new pricing case needs it to mean, which is
 *      how the old access-x-distance bundle happened in the first place.
 *
 *   2. ECONOMICS ARE ABSENT. Not zero — absent. A zero price is a price, and it
 *      would book work for nothing. The resolver fails closed on an unapproved
 *      component, and that is the state these must stay in until a contractor
 *      supplies real figures through calibration.
 */
import { PrismaClient } from "@prisma/client";
import { REHEARSAL_FIXTURE_SLUGS } from "../prisma/_serviceTargets";
import { ROUTING_V2_COMPONENTS } from "../prisma/seed-routing-v2-components";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** No component key may encode a length, a band, or an access class. */
const BANNED_IN_KEY = [
  /UNDER_?\d/i, /OVER_?\d/i, /_\d+_\d+$/, /\d+\s*FT/i,
  /ACCESSIBLE_(UNDER|OVER|\d)/i, /FINISHED_(UNDER|OVER|\d)/i,
];

async function main() {
  console.log("\nROUTING V2 — CANONICAL COMPONENT INVENTORY\n");

  const keys = ROUTING_V2_COMPONENTS.map((c) => c.key);
  const rows = await prisma.canonicalComponent.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true, name: true, notes: true, active: true, customerFacingLabel: true },
  });
  ok(rows.length === keys.length, `all ${keys.length} components exist`, `found ${rows.length}`);

  console.log("\n  MEANINGS\n");
  for (const c of rows) {
    const n = c.notes ?? "";
    ok(/INCLUDES:/.test(n) && /EXCLUDES/.test(n),
      `${c.key} states both what it includes and what it excludes`,
      n.slice(0, 90));
  }
  const badKey = rows.filter((c) => BANNED_IN_KEY.some((re) => re.test(c.key)));
  ok(badKey.length === 0,
    "no key encodes a distance band or an access class — that is the model V2 replaces",
    badKey.map((c) => c.key).join(", "));

  console.log("\n  ECONOMICS ARE ABSENT, NOT ZERO\n");
  const priced = await prisma.contractorComponent.findMany({
    // Scoped away from rehearsal fixtures: this asserts what PROVISIONING
    // produces, and a fixture holding a deliberate configuration is not a
    // counter-example to that. See REHEARSAL_FIXTURE_SLUGS.
    where: { canonicalComponent: { key: { in: keys } },
             contractor: { slug: { notIn: REHEARSAL_FIXTURE_SLUGS } } },
    select: { approvedPriceCents: true, addFieldLaborHours: true, addMaterialCostCents: true,
              addScheduleMinutes: true, canonicalComponent: { select: { key: true } } },
  });
  const withPrice = priced.filter((p) => p.approvedPriceCents !== null);
  ok(withPrice.length === 0,
    `no V2 component carries an approved price (${priced.length} contractor rows checked)`,
    withPrice.map((p) => `${p.canonicalComponent.key}=${p.approvedPriceCents}`).join(", "));
  const zeroPriced = priced.filter((p) => p.approvedPriceCents === 0);
  ok(zeroPriced.length === 0,
    "and none is priced at zero — absent and free are different claims",
    zeroPriced.map((p) => p.canonicalComponent.key).join(", "));
  const invented = priced.filter((p) =>
    (p.addFieldLaborHours ?? 0) > 0 || (p.addMaterialCostCents ?? 0) > 0 || (p.addScheduleMinutes ?? 0) > 0);
  ok(invented.length === 0,
    "no labor time, material cost or schedule minutes were invented",
    invented.map((p) => p.canonicalComponent.key).join(", "));

  console.log("\n  NOTHING WAS DERIVED FROM THE LEGACY BUNDLES\n");
  const legacy = await prisma.contractorComponent.findMany({
    where: { canonicalComponent: { key: { in: [
      "OUTLET_RUN_ACCESSIBLE_UNDER_10", "OUTLET_RUN_ACCESSIBLE_10_20",
      "OUTLET_RUN_FINISHED_UNDER_10", "OUTLET_RUN_FINISHED_10_20",
      "SWITCHLEG_ACCESSIBLE_UNDER_10", "SWITCHLEG_ACCESSIBLE_10_20",
      "SWITCHLEG_FINISHED_UNDER_10", "SWITCHLEG_FINISHED_10_20"] } } },
    select: { approvedPriceCents: true, canonicalComponent: { select: { key: true } } },
  });
  ok(legacy.length > 0, `the legacy families are still present and intact (${legacy.length} rows)`);
  ok(legacy.every((l) => l.approvedPriceCents !== null),
    "and keep their historical approved prices — retired from emission, not deleted",
    legacy.filter((l) => l.approvedPriceCents === null).map((l) => l.canonicalComponent.key).join(", "));

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
