/**
 * Provision a contractor's service from the template — ADR-014.
 *
 * Copies STRUCTURE into rows the contractor owns. After this the rows are
 * ordinary contractor rows, indistinguishable at runtime from ones they wrote
 * themselves, and the template is irrelevant to serving their storefront.
 *
 * WHAT IT REFUSES TO DO
 *
 * Write a single economic value. Price, labor, materials cost, markups and
 * allowances all arrive UNRESOLVED, and unresolved means the service cannot
 * publish a price — ADR-003's guarantee, reached from a new direction.
 *
 * Zero is never used to mean "unknown". A policy-quantity material gets NO
 * link at all; its key lands in Service.unresolvedMaterialKeys so the
 * contractor supplies their own figure, because writing 25 ft would be
 * shipping Elite's allowance and writing 0 ft would be inventing a decision.
 *
 * The same rule governs BREAKPOINT POLICIES. An answer reading "Less than
 * {b1} feet" arrives with the hole still in it and the policy recorded as
 * unresolved, because the alternative — seeding the boundary Elite happens to
 * use — would hand every contractor Elite's included run length as their
 * starting point, which is the whole thing this separation exists to prevent.
 *
 * Canonical identity is REFERENCED: categories, materials, components and
 * disclaimers resolve to the contractor's own rows for the shared canonical
 * concept, created empty (no price) where they do not exist yet.
 *
 *   --contractor <slug>  target
 *   --trade/--version    which template
 *   --service <key>      which template service (all if omitted)
 *   --apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const contractorSlug = arg("contractor");
  const trade = arg("trade") ?? "electrical";
  const only = arg("service");
  const apply = process.argv.includes("--apply");
  if (!contractorSlug) { console.error("  --contractor <slug> required"); process.exit(1); }

  const contractor = await prisma.contractor.findUniqueOrThrow({
    where: { slug: contractorSlug }, select: { id: true, name: true },
  });

  // The SAME library Guided Setup calls. This script was the only
  // implementation and wrote service by service, so a failure part-way left a
  // partial catalog nobody could see. Keeping the CLI on the shipped path
  // means the tested path and the used path cannot drift apart.
  const source = templateVersionSource(prisma, trade, only);
  const pre = await preflight(prisma, contractor.id, source);
  if (!pre.ok) { console.error(`\n  ${pre.code}: ${pre.message}\n`); process.exit(1); }

  console.log(`\nPROVISION  ${pre.preview.trade} v${pre.preview.version}  ->  ${contractor.name}`);
  console.log(`  ${pre.preview.services} services, ${pre.preview.questions} questions, ` +
    `${pre.preview.options} options, ${pre.preview.policies} policy question(s)   ` +
    `${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`  ${pre.preview.unresolvedMaterialRoles.length} material role(s) not yet costed\n`);

  if (!apply) { console.log(`  Dry run.\n`); await prisma.$disconnect(); return; }

  const result = await installCatalog(prisma, contractor.id, pre.catalog);
  console.log(`  ${result.services} services, ${result.policies} policy question(s) recorded unresolved,`);
  console.log(`  ${result.unresolvedMaterialRoles} material role(s) unresolved, ` +
    `${result.disclaimersToAuthor} disclaimer(s) the contractor must author.`);
  console.log(`\n  Provisioned. Nothing is priced, nothing is offered and nothing is active.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(`\n  ${(e as Error).message}\n`); await prisma.$disconnect(); process.exit(1); });
}
