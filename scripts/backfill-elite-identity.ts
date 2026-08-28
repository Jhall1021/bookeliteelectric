/**
 * Move Elite's identity out of the components and into their contractor row.
 *
 * The values are exactly what the components carried, character for character,
 * because the acceptance test is that Elite renders identically THROUGH their
 * data. A tidied address or a reformatted phone number would pass a code
 * review and fail the proof.
 *
 * Idempotent, and refuses to overwrite anything already set — this runs once
 * against a live contractor.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();

const ELITE = {
  slug: "elite-electric",
  data: {
    shortName: "Elite",
    legalName: "Elite Electric & Lighting",
    logoUrl: "/images/elite-logo.png",
    logoWhiteUrl: "/images/elite-logo.png",
    phone: "732-204-7003",
    addressLine1: "1309 Allaire Ave.",
    city: "Ocean",
    state: "NJ",
    postalCode: "07712",
    licenseLabel: "NJ Electrical License",
    licenseNumber: "17272",
    serviceAreaLabel: "Monmouth & Ocean Counties, NJ",
    serviceAreaImageUrl: "/images/nj-service-area-map.png",
    serviceAreaImageAlt:
      "Map of New Jersey with Monmouth and Ocean counties highlighted as our service area",
  },
} as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const c = await prisma.contractor.findUniqueOrThrow({
    where: { slug: ELITE.slug },
    select: { id: true, name: true, shortName: true, legalName: true, logoUrl: true,
              logoWhiteUrl: true, phone: true, addressLine1: true, city: true, state: true,
              postalCode: true, licenseLabel: true, licenseNumber: true,
              serviceAreaLabel: true, serviceAreaImageUrl: true, serviceAreaImageAlt: true },
  });

  const current = c as unknown as Record<string, unknown>;
  const toSet: Record<string, string> = {};
  const kept: string[] = [];
  for (const [k, v] of Object.entries(ELITE.data)) {
    const existing = current[k];
    // Never overwrite. If somebody has already set one of these through the
    // admin, their value is the real one and this script is out of date.
    if (existing != null && String(existing).trim()) { kept.push(`${k}="${existing}"`); continue; }
    toSet[k] = v;
  }

  console.log(`\nELITE IDENTITY BACKFILL   ${apply ? "APPLY" : "DRY RUN"}\n`);
  for (const [k, v] of Object.entries(toSet)) console.log(`  set   ${k.padEnd(20)} ${v}`);
  for (const k of kept) console.log(`  keep  ${k}`);
  if (!Object.keys(toSet).length) console.log(`  Nothing to set.`);

  if (apply && Object.keys(toSet).length) {
    await prisma.contractor.update({ where: { id: c.id }, data: toSet });
    console.log(`\n  Written.`);
  } else if (!apply) {
    console.log(`\n  Dry run — pass --apply.`);
  }
  console.log("");
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
