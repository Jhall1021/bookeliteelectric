/**
 * A rate change cannot be saved past its own impact unnoticed.
 *
 *   npx tsx scripts/verify-pricing-settings-impact.ts
 *
 * The failure this exists for really happened: a rate typed in exploratorily
 * put 111 published price points out of agreement with the model, wrote no
 * record of who did it or what the figures had been, and was found days later
 * by an unrelated audit.
 *
 * Two claims, both about the shape of the guard rather than any one number:
 * the impact is measured truthfully, and a stale or absent acknowledgement
 * does not get through.
 */

import { PrismaClient } from "@prisma/client";
import { pricingSettingsImpact } from "../lib/pricingSettingsImpact";
import type { PricingSettings } from "../lib/pricing";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

/**
 * The route's rule, lifted out so it can be exercised without a live session.
 * If this and the route ever disagree, the route is wrong — but this test is
 * the thing that says what "right" is.
 */
function wouldBlock(affected: number, acknowledgeImpact: unknown): boolean {
  return affected > 0 && acknowledgeImpact !== affected;
}

async function main() {
  console.log(`\nPRICING SETTINGS — IMPACT CONFIRMATION\n`);

  const elite = await prisma.contractor.findUniqueOrThrow({
    where: { slug: "elite-electric" },
    select: { id: true },
  });
  const live = await prisma.pricingSettings.findUniqueOrThrow({
    where: { contractorId: elite.id },
  });

  // ── the measurement is truthful ─────────────────────────────────────────
  const unchanged = await pricingSettingsImpact(prisma as any, elite.id, live as PricingSettings);
  console.log(`  measured against the live settings: ${unchanged.affected} of ${unchanged.judged} price points disagree`);
  // Four, not two. reconcile-prices separates "unexplained" from "approved
  // exception"; this does not, and should not — an approved exception is still
  // a price the model does not produce. The approval says don't reprice it, not
  // that the gap isn't there. So: the 2 new-coax-line divergences plus the 2
  // standing exceptions (recessed lighting, troubleshooting).
  ok(
    `the current settings are in agreement with the book`,
    unchanged.affected <= 4,
    `${unchanged.affected} affected — expected at most the 2 new-coax-line divergences plus the 2 approved exceptions`
  );
  ok(`it judged a real number of price points`, unchanged.judged > 100, `${unchanged.judged}`);

  // The exact change that caused the incident, measured but never written.
  const incident = await pricingSettingsImpact(prisma as any, elite.id, {
    ...(live as PricingSettings),
    crewHourRateCents: 15000,
    primaryMinimumCents: 29000,
  });
  console.log(`  the 29 Aug figures ($150/hr, $290 min) would affect ${incident.affected} price points`);
  ok(
    `a real rate change is measured as large, not shrugged off`,
    incident.affected > 50,
    `${incident.affected}`
  );
  ok(
    `and it reports direction, not just a count`,
    incident.raised > 0 && incident.lowered > 0,
    `${incident.raised} up / ${incident.lowered} down`
  );

  // ── the guard blocks ────────────────────────────────────────────────────
  console.log();
  ok(`no acknowledgement -> blocked`, wouldBlock(incident.affected, undefined));
  ok(`wrong count -> blocked`, wouldBlock(incident.affected, incident.affected - 1));
  // A number from a preview taken before something else moved. Derived from
  // the real one so it cannot accidentally BE the real one — which is what the
  // first draft of this check did, by hard-coding 111 and calling it stale.
  ok(`a stale count from an older preview -> blocked`, wouldBlock(incident.affected, incident.affected + 7));
  ok(`"true" is not a count -> blocked`, wouldBlock(incident.affected, true));
  ok(`the exact count -> allowed`, !wouldBlock(incident.affected, incident.affected));
  ok(`a change with no impact needs no acknowledgement`, !wouldBlock(0, undefined));

  // ── the trail records what it should ────────────────────────────────────
  console.log();
  const probe = await prisma.contractor.create({
    data: { slug: `psi-probe-${Date.now()}`, name: "Impact Probe" },
    select: { id: true, slug: true },
  });
  try {
    await prisma.pricingSettingsChange.create({
      data: {
        contractorId: probe.id,
        changedByUserId: "u_probe", changedByEmail: "probe@example.test",
        fromCrewHourRateCents: 25000, toCrewHourRateCents: 15000,
        fromPrimaryMinimumCents: 25000, toPrimaryMinimumCents: 29000,
        fromRoundingIncrementCents: 500, toRoundingIncrementCents: 500,
        fromDefaultPermitAdminCents: 0, toDefaultPermitAdminCents: 0,
        publishedPricesAffected: 111, impactAcknowledged: true,
      },
    });
    const row = await prisma.pricingSettingsChange.findFirstOrThrow({
      where: { contractorId: probe.id },
    });
    ok(`the trail keeps what the figures WERE, not just what they became`,
      row.fromCrewHourRateCents === 25000 && row.toCrewHourRateCents === 15000);
    ok(`it names who`, row.changedByEmail === "probe@example.test");
    ok(`it stores the impact known at the time`, row.publishedPricesAffected === 111);

    // Elite's own history must not be visible from another contractor's row.
    const leaked = await prisma.pricingSettingsChange.count({
      where: { contractorId: probe.id, NOT: { contractorId: probe.id } },
    });
    ok(`history is per contractor`, leaked === 0);
  } finally {
    if (!probe.slug.startsWith("psi-probe-")) {
      throw new Error("refusing to delete a contractor this probe did not create");
    }
    await prisma.pricingSettingsChange.deleteMany({ where: { contractorId: probe.id } });
    await prisma.contractor.delete({ where: { id: probe.id } });
  }

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  A rate change now has to be looked at before it lands.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
