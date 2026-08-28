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
import { DEFINITIONS } from "../lib/theme/definition";

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
    for (const d of DEFINITIONS) await destroyContractor(prisma, allSlug(d.key));
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
      const slug = allSlug(d.key), hosted = allHosted(d.key);
      await destroyContractor(prisma, slug);
      const made = await prisma.contractor.create({
        data: { slug, name: `Preview ${d.label}`, active: true,
                themeKey: d.key, themeVersion: d.version,
                brandColors: { primary: "#0B7A5B" } },
        select: { id: true },
      });
      await prisma.contractorSite.create({
        data: { contractorId: made.id, hostedSlug: hosted, publicId: `pub_${hosted}`, active: true },
      });
      provision(slug, ["--service", "new-120v-outlet"]);
      await prisma.service.updateMany({ where: { contractorId: made.id }, data: { active: true } });
      console.log(`  /${hosted}  ${d.key}`);
    }
    await prisma.$disconnect();
    return;
  }
  const themeKey = arg("theme") ?? "modern-clean-b";
  const version = Number(arg("version") ?? "1");

  await destroyContractor(prisma, SLUG);
  const c = await prisma.contractor.create({
    data: {
      slug: SLUG, name: "Theme Preview Electric", active: true,
      themeKey, themeVersion: version,
      // A brand colour unlike Elite's, so the screenshot also shows the
      // resolver deriving an accent rather than reusing the fixed one.
      brandColors: { primary: "#0B7A5B" },
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
