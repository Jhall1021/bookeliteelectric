/**
 * REHEARSAL-ONLY. Brings a from-scratch, freshly-`db push`'d database up to
 * the point where the real storefront and checkout are reachable for Elite —
 * every piece of one-time provisioning `seed-all.ts` deliberately does NOT
 * do, because on a real database Elite's own history already did it once.
 *
 *   npx tsx prisma/bootstrap-rehearsal-contractor.ts
 *
 * WHAT THIS WRITES, IN ORDER
 *
 *   1. Contractor(slug: "elite-electric")            — seed-all.ts's own
 *      chain assumes this already exists (_componentHelpers.ts's
 *      eliteContractorId throws "No contractor ... elite-electric" otherwise)
 *   2. ContractorSite                                 — the [site] dynamic
 *      route resolves by ContractorSite.hostedSlug, and provisioning a
 *      contractor from nothing has no dedicated script; this follows the
 *      same shape scripts/onboard-contractor-two.ts uses for BrightPath.
 *   3. ContractorCategory (one, on any canonical category) — ADR-006 split;
 *      every operational catalog read fails closed on a null
 *      Service.contractorCategoryId. Fixture services from any test built
 *      against this bootstrap should still set their own.
 *   4. Contractor.schedulingAuthority = NATIVE, nativeConcurrentJobs = 2
 *      — without these, /api/availability refuses with
 *      SCHEDULING_NOT_CONFIGURED before a homeowner can pick an arrival
 *      window at all.
 *   5. BusinessHours (default 8:00–16:30, Mon–Fri)     — native scheduling's
 *      own default shape; without a row, availability still resolves
 *      (loadBusinessHours defaults), but this makes the default explicit.
 *   6. ServiceArea.zipCodes gets one synthetic test zip appended if the
 *      existing row's list is empty — checkout refuses
 *      WE_DONT_COVER_THAT_ZIP otherwise. Never touches a non-empty list
 *      (a real, contractor-configured area is left alone).
 *
 * WHAT THIS DOES NOT DO — on purpose
 *
 *   - No PricingSettings row: prisma/seed-pricing-settings.ts, part of
 *     `npm run db:seed:all`, already writes that one.
 *   - No canonical TemplateVersion, no CanonicalDisclaimer backfill, no
 *     Service.tradeKey backfill beyond what each seed file already narrowly
 *     writes — those are genuinely missing, checked-in-code gaps for a
 *     from-scratch database, documented in
 *     docs/design/electrical-decision-tree-audit-v1-followthrough-report.md
 *     §9.6, not something this script papers over.
 *   - No JobberCrewMember, no Stripe connection, no real email/SMS
 *     provider — external integrations stay unconfigured, by design.
 *
 * Idempotent: re-running finds each row already there (by slug/unique
 * constraint) and reports it, writing nothing twice.
 *
 * NEVER RUN THIS AGAINST A SHARED OR PRODUCTION DATABASE. Enforced, not just
 * stated: `assertDisposableLocalDatabase()` below refuses to run unless BOTH
 * (a) `DATABASE_URL` resolves to a loopback host, and (b) the connected
 * database carries a `DatabaseIdentity` stamp (ADR-013,
 * scripts/verify-database-identity.ts) whose `key` starts with `local-`.
 * `import.meta.url === pathToFileURL(...)` below is an execution guard (is
 * this the entrypoint, not an import) — it says nothing about which database
 * the connected Prisma client points at, and was previously this script's
 * only safety check. It stays, but it is not the database-target guard.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { assertDisposableLocalDatabase } from "./_assertDisposableLocalDatabase";

const prisma = new PrismaClient();
const SLUG = "elite-electric";
const TEST_ZIP = process.env.REHEARSAL_TEST_ZIP ?? "07701";

async function main() {
  console.log(`\nREHEARSAL BOOTSTRAP — ${SLUG}\n`);
  await assertDisposableLocalDatabase(prisma);

  let contractor = await prisma.contractor.findUnique({ where: { slug: SLUG } });
  if (!contractor) {
    contractor = await prisma.contractor.create({
      data: { slug: SLUG, name: "Elite Electric & Lighting", trade: "residential electrician", phone: "732-204-7003" },
    });
    console.log(`  ✓ created Contractor ${contractor.id}`);
  } else {
    console.log(`  · Contractor already exists (${contractor.id})`);
  }

  const existingSite = await prisma.contractorSite.findUnique({ where: { hostedSlug: SLUG } });
  if (!existingSite) {
    const site = await prisma.contractorSite.create({
      data: { contractorId: contractor.id, hostedSlug: SLUG, publicId: `site_${randomBytes(16).toString("hex")}`, active: true },
    });
    console.log(`  ✓ created ContractorSite ${site.id} (hostedSlug=${SLUG})`);
  } else {
    console.log(`  · ContractorSite already exists (${existingSite.id})`);
  }

  const existingCategory = await prisma.contractorCategory.findFirst({ where: { contractorId: contractor.id } });
  if (!existingCategory) {
    const canonical = await prisma.canonicalCategory.findFirstOrThrow();
    const cc = await prisma.contractorCategory.create({
      data: { contractorId: contractor.id, canonicalCategoryId: canonical.id },
    });
    console.log(`  ✓ created one ContractorCategory ${cc.id}`);
  } else {
    console.log(`  · at least one ContractorCategory already exists`);
  }

  if (!contractor.schedulingAuthority) {
    await prisma.contractor.update({
      where: { id: contractor.id },
      data: { schedulingAuthority: "NATIVE", nativeConcurrentJobs: 2 },
    });
    console.log(`  ✓ set schedulingAuthority=NATIVE, nativeConcurrentJobs=2`);
  } else {
    console.log(`  · schedulingAuthority already set (${contractor.schedulingAuthority})`);
  }

  const existingHours = await prisma.businessHours.findUnique({ where: { contractorId: contractor.id } });
  if (!existingHours) {
    await prisma.businessHours.create({
      data: {
        contractorId: contractor.id,
        workingDays: [1, 2, 3, 4, 5],
        dayStart: "08:00",
        dayEnd: "16:30",
        windowMinutes: 180,
        minWindowMinutes: 60,
      },
    });
    console.log(`  ✓ created BusinessHours (default 8:00–16:30, Mon–Fri)`);
  } else {
    console.log(`  · BusinessHours already exists`);
  }

  const area = await prisma.serviceArea.findFirst({ where: { contractorId: contractor.id, active: true } });
  if (area && area.zipCodes.length === 0) {
    await prisma.serviceArea.update({ where: { id: area.id }, data: { zipCodes: [TEST_ZIP] } });
    console.log(`  ✓ added synthetic test zip ${TEST_ZIP} to the empty ServiceArea`);
  } else if (area) {
    console.log(`  · ServiceArea already has ${area.zipCodes.length} zip(s) — left untouched`);
  } else {
    console.log(`  – no ServiceArea row found — run prisma/seed.ts first (it creates one)`);
  }

  console.log(`\nDone. Elite's storefront, availability, and checkout should now be reachable`);
  console.log(`at http://<dev-server>/${SLUG} on this database. Still missing, deliberately:`);
  console.log(`a published canonical template, disclaimer/trade backfills, Jobber crew, and`);
  console.log(`any external integration — see the followthrough report §9.6.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
