/**
 * Retire component roles proved unreachable.
 *
 * Only runs on roles scripts/prove-component-unreachable.ts confirms nothing
 * can select — across active trees, inactive services, the template, and the
 * legacy JobComponent path. It re-runs that proof itself rather than trusting
 * a previous run, because the thing being deleted is priced configuration and
 * "it was dead when I checked" is not the same as "it is dead now".
 *
 * Deactivates the canonical role and removes the contractor's economics, so
 * nothing is left as latent priced configuration. The values are printed
 * before deletion so the record survives in the run log and the commit.
 *
 *   npx tsx scripts/retire-dead-components.ts KEY [KEY...] [--apply]
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { proveUnreachable } from "./prove-component-unreachable";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const keys = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!keys.length) { console.error("\n  give at least one component key\n"); process.exit(1); }

  console.log(`\nRETIRE DEAD COMPONENTS${APPLY ? "" : "   (report only — pass --apply)"}\n`);
  let retired = 0, refused = 0;

  for (const key of keys) {
    const proof = await proveUnreachable(key);
    if (!proof) { console.log(`  REFUSE ${key} — no such canonical component`); refused++; continue; }
    if (!proof.unreachable) {
      console.log(`  REFUSE ${key} — REACHABLE ` +
        `(${proof.activeServiceSelections} active, ${proof.inactiveServiceSelections} inactive, ` +
        `${proof.templateSelections} template, ${proof.legacySelections} legacy)`);
      refused++; continue;
    }

    console.log(`  ${APPLY ? "RETIRE" : "would"} ${key}`);
    for (const c of proof.contractorConfigurations) {
      console.log(`         removing ${c.contractor.slug} economics: ` +
        `$${((c.approvedPriceCents ?? 0) / 100).toFixed(2)} approved, ` +
        `$${(c.addMaterialCostCents / 100).toFixed(2)} material, ${c.addFieldLaborHours}h`);
    }

    if (APPLY) {
      const canonical = await prisma.canonicalComponent.findUniqueOrThrow({
        where: { key }, select: { id: true },
      });
      await prisma.contractorComponent.deleteMany({ where: { canonicalComponentId: canonical.id } });
      await prisma.canonicalComponent.update({ where: { id: canonical.id }, data: { active: false } });
      retired++;
    }
  }

  console.log(`\n  ${retired} retired · ${refused} refused`);
  if (!APPLY) console.log(`  Nothing was changed.`);
  console.log();
  await prisma.$disconnect();
  process.exit(refused === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
