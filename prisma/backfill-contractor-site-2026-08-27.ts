/**
 * One storefront site for Elite — 27 August 2026. ADR §2.2.
 *
 *   npx tsx prisma/backfill-contractor-site-2026-08-27.ts            (report)
 *   npx tsx prisma/backfill-contractor-site-2026-08-27.ts --apply    (write)
 *
 * Additive: creates rows in a new routing table. Touches no catalog, no
 * pricing, no customer data.
 *
 * WHY publicId IS NOT THE CONTRACTOR SLUG
 *
 * `hostedSlug` is a public address and reads like one. `publicId` is what an
 * API request carries, and it is deliberately opaque: it reveals nothing about
 * the contractor, and it can be rotated without renaming anything a customer
 * sees. Making them the same string would weld the two together and mean
 * rotating one changes the other.
 *
 * Idempotent: upserts by hostedSlug and never rewrites an existing publicId,
 * because rotating an identifier is a deliberate act and not something a
 * re-run should do.
 */

import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTRACTOR_SLUG = "elite-electric";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nBACKFILL — storefront site (ADR §2.2)`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const contractor = await prisma.contractor.findUnique({
    where: { slug: CONTRACTOR_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!contractor) {
    console.error(`  No contractor "${CONTRACTOR_SLUG}".\n`);
    process.exit(1);
    return;
  }

  const existing = await prisma.contractorSite.findUnique({
    where: { hostedSlug: contractor.slug },
    select: { id: true, publicId: true, active: true },
  });

  console.log(`  Contractor: ${contractor.name}`);
  console.log(`  hostedSlug: ${contractor.slug}`);
  console.log(
    existing
      ? `  Existing site: ${existing.publicId} (active=${existing.active})`
      : `  No site yet — one will be created.`
  );

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  const site = await prisma.contractorSite.upsert({
    where: { hostedSlug: contractor.slug },
    // Never rewrites publicId. Rotating an identifier is deliberate.
    update: { active: true },
    create: {
      contractorId: contractor.id,
      hostedSlug: contractor.slug,
      publicId: `site_${randomBytes(16).toString("hex")}`,
      active: true,
    },
    select: { id: true, publicId: true, hostedSlug: true, contractorId: true },
  });

  console.log(`\n  site id   : ${site.id}`);
  console.log(`  publicId  : ${site.publicId}`);
  console.log(`  hostedSlug: ${site.hostedSlug}`);

  // ---- verify ------------------------------------------------------------
  const all = await prisma.contractorSite.findMany({
    select: { hostedSlug: true, contractorId: true, active: true },
  });
  const perContractor = new Map<string, number>();
  for (const s of all) perContractor.set(s.contractorId, (perContractor.get(s.contractorId) ?? 0) + 1);

  console.log(`\n  VERIFY: ${all.length} site(s) across ${perContractor.size} contractor(s)`);
  const resolvesToOne = site.contractorId === contractor.id;
  console.log(
    `  VERIFY: the site resolves to ${resolvesToOne ? "exactly its own contractor" : "THE WRONG CONTRACTOR"}`
  );
  if (!resolvesToOne) {
    process.exitCode = 1;
    return;
  }
  console.log(`\n  Done. Nothing routes through it yet.\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
