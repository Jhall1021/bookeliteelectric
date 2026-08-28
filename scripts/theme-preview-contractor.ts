/**
 * Stand up a throwaway storefront on a chosen theme, to look at it.
 *
 *   npx tsx scripts/theme-preview-contractor.ts --theme modern-clean-b --up
 *   npx tsx scripts/theme-preview-contractor.ts --down
 *
 * Exists because the only honest way to prove a variant changes composition is
 * to render a real second contractor through the real path. Flipping Elite's
 * own pin would prove the same thing by mutating a live storefront, which is
 * not a trade worth making for a screenshot.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { provision, destroyContractor } from "./_throwaway";
import { DEFINITIONS, definitionKey } from "../lib/theme/definition";

loadEnv();
const prisma = new PrismaClient();
const SLUG = "__theme-preview__";
const HOSTED = "theme-preview";
/** One storefront per definition, so all six can be compared in one pass. */
const allSlug = (key: string) => `__theme-preview-${key}__`;
const allHosted = (key: string) => `tp-${key}`;
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  if (process.argv.includes("--down")) {
    await destroyContractor(prisma, SLUG);
    for (const d of DEFINITIONS) await destroyContractor(prisma, allSlug(definitionKey(d)));
    console.log(`  removed every preview contractor`);
    await prisma.$disconnect();
    return;
  }

  // --all stands up one storefront per definition. Comparing six variants
  // needs six contractors: a theme is a property of a contractor, and
  // repointing one contractor six times would prove the resolver runs, not
  // that six real storefronts differ.
  if (process.argv.includes("--all")) {
    for (const d of DEFINITIONS) {
      const key = definitionKey(d);
      const slug = allSlug(key), hosted = allHosted(key);
      await destroyContractor(prisma, slug);
      const made = await prisma.contractor.create({
        data: { slug, name: `Preview ${d.label}`, active: true,
                themeFamily: d.family, themeVariant: d.variant, themeVersion: d.version,
                brandColors: { primary: "#0B7A5B" },
                // Deliberately a DIFFERENT business in every respect a
                // homeowner can see, so a screenshot that still says Elite is
                // a failure rather than a coincidence.
                shortName: "Northgate", legalName: "Northgate Electric LLC",
                phone: "(602) 555-0148", supportEmail: "hello@northgate.example",
                addressLine1: "88 Copper Row", city: "Mesa", state: "AZ", postalCode: "85201",
                licenseLabel: "AZ ROC License", licenseNumber: "331902",
                serviceAreaLabel: "the East Valley, AZ",
                pricingStrategy: process.argv.includes("--tm") ? "TIME_AND_MATERIALS" : "FLAT_RATE" },
        select: { id: true },
      });
      await prisma.contractorSite.create({
        data: { contractorId: made.id, hostedSlug: hosted, publicId: `pub_${hosted}`, active: true },
      });
      provision(slug, ["--service", "new-120v-outlet"]);
      await prisma.service.updateMany({ where: { contractorId: made.id }, data: { active: true } });
      console.log(`  /${hosted}  ${key}`);
    }
    await prisma.$disconnect();
    return;
  }
  const themeKey = arg("theme") ?? "modern-clean-b";
  const version = Number(arg("version") ?? "1");
  const dash = themeKey.lastIndexOf("-");
  const family = themeKey.slice(0, dash), variant = themeKey.slice(dash + 1);

  await destroyContractor(prisma, SLUG);
  const c = await prisma.contractor.create({
    data: {
      slug: SLUG, name: "Northgate Electric", active: true,
      themeFamily: family, themeVariant: variant, themeVersion: version,
      // A brand colour unlike Elite's, so the screenshot also shows the
      // resolver deriving an accent rather than reusing the fixed one.
      brandColors: { primary: "#0B7A5B" },
      // A DIFFERENT business in every respect a homeowner can see: different
      // name, state, licensing body, phone. A preview that still says Elite
      // anywhere is then a failure rather than a coincidence.
      shortName: "Northgate", legalName: "Northgate Electric LLC",
      phone: "(602) 555-0148", supportEmail: "hello@northgate.example",
      addressLine1: "88 Copper Row", city: "Mesa", state: "AZ", postalCode: "85201",
      licenseLabel: "AZ ROC License", licenseNumber: "331902",
      serviceAreaLabel: "the East Valley, AZ",
      pricingStrategy: process.argv.includes("--tm") ? "TIME_AND_MATERIALS" : "FLAT_RATE",
    },
    select: { id: true },
  });
  await prisma.contractorSite.create({
    data: { contractorId: c.id, hostedSlug: HOSTED, publicId: `pub_${HOSTED}`, active: true },
  });
  provision(SLUG);
  // The homepage's featured tiles only show ACTIVE services, and provisioning
  // deliberately leaves everything inactive and unpriced. Activating them here
  // is a property of the preview, not of provisioning.
  await prisma.service.updateMany({ where: { contractorId: c.id }, data: { active: true } });
  console.log(`\n  http://localhost:3000/${HOSTED}   theme=${themeKey} v${version}\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
