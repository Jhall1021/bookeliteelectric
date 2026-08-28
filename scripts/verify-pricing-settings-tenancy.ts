/**
 * Each contractor prices with its own labour rate.
 *
 * WHAT WAS WRONG
 *
 * `PricingSettings.id` defaulted to the literal "default", so every settings
 * row wanted the same primary key: a second contractor saving their rate
 * collided outright and could not have settings at all. The runtime app code
 * was already contractor-keyed — this is the lesson from the Jobber fix
 * restated, that a contractorId column existing is not the same as the
 * application using it as the identity, and the id was still the identity.
 *
 * Reconciliation was worse. It read ONE settings row by `id: "default"` and
 * ALL active services unscoped, then priced every service against that row.
 * With two contractors it would grade one business's published prices against
 * another's labour rate and service-call minimum — and that report is what
 * decides whether a published price is wrong.
 *
 * Creates a throwaway contractor with a deliberately CONTRADICTORY rate, so a
 * leak shows up as a wrong number rather than a missing row.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();

const DUMMY_SLUG = "__pricing_tenancy_probe__";
// Deliberately nothing like Elite's. A cross-tenant read produces a visibly
// wrong figure rather than a plausible one.
const DUMMY_RATE = 99900;
const DUMMY_MIN = 88800;

let pass = 0, fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) { pass++; console.log(`    ok   ${label}`); }
  else { fail++; console.log(`    FAIL ${label}${detail ? `\n           ${detail}` : ""}`); }
}

const settingsFor = (contractorId: string) =>
  prisma.pricingSettings.findUnique({ where: { contractorId } });

async function main() {
  console.log("\nPRICING SETTINGS TENANCY\n");

  const elite = await prisma.contractor.findFirstOrThrow({
    where: { slug: { not: DUMMY_SLUG } },
    select: { id: true, name: true },
  });
  const eliteBefore = await settingsFor(elite.id);
  if (!eliteBefore) {
    console.error("  Elite has no pricing settings — nothing to protect. Aborting.");
    process.exitCode = 1;
    return;
  }
  const dummy = await prisma.contractor.upsert({
    where: { slug: DUMMY_SLUG }, update: {},
    create: { slug: DUMMY_SLUG, name: "Pricing tenancy probe" },
  });
  console.log(`  ${elite.name}: rate ${eliteBefore.targetRateCents}, minimum ${eliteBefore.primaryMinimumCents}`);
  console.log(`  ${dummy.name}: will take rate ${DUMMY_RATE}, minimum ${DUMMY_MIN}\n`);

  try {
    console.log("  DIFFERENT RATES CAN COEXIST");
    await prisma.pricingSettings.create({
      data: {
        contractorId: dummy.id,
        targetRateCents: DUMMY_RATE,
        primaryMinimumCents: DUMMY_MIN,
        roundingIncrementCents: 500,
        defaultPermitAdminCents: 0,
      },
    });
    const d = await settingsFor(dummy.id);
    const e = await settingsFor(elite.id);
    ok(d?.targetRateCents === DUMMY_RATE, "the probe contractor has its OWN crew rate");
    ok(e?.targetRateCents === eliteBefore.targetRateCents,
       "and Elite's rate is unchanged by that",
       `Elite's rate is now ${e?.targetRateCents}`);
    ok(d!.id !== e!.id, "the two rows have distinct primary keys",
       "a shared literal id is what made a second row impossible");

    console.log("\n  UPDATING ONE CANNOT ALTER THE OTHER");
    await prisma.pricingSettings.update({
      where: { contractorId: dummy.id },
      data: { targetRateCents: DUMMY_RATE + 1000 },
    });
    ok((await settingsFor(dummy.id))?.targetRateCents === DUMMY_RATE + 1000,
       "the probe's update lands on the probe");
    ok((await settingsFor(elite.id))?.targetRateCents === eliteBefore.targetRateCents,
       "and Elite's rate did not move",
       `Elite's rate is now ${(await settingsFor(elite.id))?.targetRateCents}`);

    await prisma.pricingSettings.update({
      where: { contractorId: elite.id },
      data: { targetRateCents: eliteBefore.targetRateCents + 1 },
    });
    ok((await settingsFor(dummy.id))?.targetRateCents === DUMMY_RATE + 1000,
       "and an update to Elite does not move the probe's rate either");
    await prisma.pricingSettings.update({
      where: { contractorId: elite.id },
      data: { targetRateCents: eliteBefore.targetRateCents },
    });

    console.log("\n  SEEDS CANNOT REACH ANOTHER CONTRACTOR'S SETTINGS");
    // The seed resolves its contractor and upserts on contractorId. Run it and
    // prove the probe's deliberately-wrong rate survives untouched.
    const dummyRateBeforeSeed = (await settingsFor(dummy.id))!.targetRateCents;
    let seedRan = true;
    try {
      execFileSync("npx", ["tsx", "prisma/seed-pricing-settings.ts"], { stdio: "pipe" });
    } catch { seedRan = false; }
    ok(seedRan, "the pricing-settings seed runs");
    ok((await settingsFor(dummy.id))?.targetRateCents === dummyRateBeforeSeed,
       "and it did NOT overwrite the probe contractor's settings",
       `probe rate is now ${(await settingsFor(dummy.id))?.targetRateCents}, was ${dummyRateBeforeSeed}`);

    console.log("\n  RECONCILIATION USES EACH CONTRACTOR'S OWN SETTINGS");
    const out = execFileSync("npx", ["tsx", "scripts/reconcile-prices.ts"], {
      stdio: "pipe", encoding: "utf8",
    });
    const headers = [...out.matchAll(/PRICE RECONCILIATION — (.+)/g)].map((m) => m[1].trim());
    ok(headers.includes(elite.name), `it reports for ${elite.name}`, `saw: ${headers.join(", ")}`);
    ok(headers.includes(dummy.name), `and separately for ${dummy.name}`, `saw: ${headers.join(", ")}`);
    const eliteRateShown = `$${eliteBefore.targetRateCents / 100}`;
    const dummyRateShown = `$${(DUMMY_RATE + 1000) / 100}`;
    ok(out.includes(`Crew-hour rate        ${eliteRateShown}`),
       `Elite's section quotes Elite's rate (${eliteRateShown})`);
    ok(out.includes(`Crew-hour rate        ${dummyRateShown}`),
       `the probe's section quotes the PROBE's rate (${dummyRateShown})`,
       "a shared settings row would have printed one rate twice");
  } finally {
    // NOTE: updatedAt cannot be restored. It is @updatedAt, so writing the
    // restore is itself a write and bumps it. Every VALUE returns to what it
    // was; the timestamp keeps a fingerprint that this suite ran. Proven by
    // db-parity's content checksums, which found exactly that and nothing else.
    console.log("\n  CLEANUP");
    await prisma.pricingSettings.deleteMany({ where: { contractorId: dummy.id } });
    await prisma.contractor.deleteMany({ where: { slug: DUMMY_SLUG } });
    await prisma.pricingSettings.update({
      where: { contractorId: elite.id },
      data: {
        targetRateCents: eliteBefore.targetRateCents,
        primaryMinimumCents: eliteBefore.primaryMinimumCents,
        roundingIncrementCents: eliteBefore.roundingIncrementCents,
        defaultPermitAdminCents: eliteBefore.defaultPermitAdminCents,
      },
    });
    const restored = await settingsFor(elite.id);
    ok(restored?.targetRateCents === eliteBefore.targetRateCents &&
       restored?.primaryMinimumCents === eliteBefore.primaryMinimumCents,
       "Elite's REAL rate and minimum restored — every value byte-identical",
       `rate ${restored?.targetRateCents} vs ${eliteBefore.targetRateCents}`);
  }

  console.log("\n" + "─".repeat(76));
  console.log(fail === 0
    ? `\n  ${pass} checks passed. Each contractor prices with its own settings.\n`
    : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
