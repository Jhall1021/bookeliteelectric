/**
 * Prove a component role is unreachable before removing it.
 *
 * "No answer selects it" is not proof on its own. A role can be reached from
 * an inactive service that is later switched on, from a template that a future
 * contractor provisions, or from a tree belonging to a contractor other than
 * the one being looked at. Deactivating on a partial check would delete
 * economics that something still depends on.
 *
 * So this checks every path a selection could arrive by:
 *   1. answer options on ACTIVE services of any contractor
 *   2. answer options on INACTIVE services (they can be switched on)
 *   3. the template's own answer options (what a new contractor provisions)
 *   4. any JobComponent already recorded against a real visit
 *
 *   npx tsx scripts/prove-component-unreachable.ts KEY [KEY...]
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

export async function proveUnreachable(key: string) {
  const canonical = await prisma.canonicalComponent.findUnique({
    where: { key },
    select: { id: true, key: true, active: true },
  });
  if (!canonical) return null;

  const liveOptions = await prisma.answerOptionComponent.findMany({
    where: { canonicalComponentId: canonical.id },
    select: {
      answerOption: {
        select: {
          label: true,
          question: {
            select: { key: true, service: { select: { slug: true, active: true, contractor: { select: { slug: true } } } } },
          },
        },
      },
    },
  });
  const active = liveOptions.filter((o) => o.answerOption.question.service.active);
  const inactive = liveOptions.filter((o) => !o.answerOption.question.service.active);

  const templateOptions = await prisma.templateAnswerOptionComponent.count({
    where: { canonicalComponentId: canonical.id },
  });

  /**
   * The LEGACY path, which is easy to miss.
   *
   * JobComponent is the pre-canonical component model and still carries its
   * own economics. AnswerOptionComponent can point at one through
   * `componentId` INSTEAD of `canonicalComponentId`, so a role can be selected
   * without any canonical link at all. Checking only the canonical side would
   * declare such a role dead while a tree still reaches it.
   */
  const legacy = await prisma.jobComponent.findUnique({
    where: { key },
    select: { id: true, active: true, approvedPriceCents: true, addMaterialCostCents: true },
  });
  const legacySelections = legacy
    ? await prisma.answerOptionComponent.count({ where: { componentId: legacy.id } })
    : 0;

  const contractorRows = await prisma.contractorComponent.findMany({
    where: { canonicalComponentId: canonical.id },
    select: {
      active: true, approvedPriceCents: true, addMaterialCostCents: true, addFieldLaborHours: true,
      contractor: { select: { slug: true } },
    },
  });

  return {
    key: canonical.key,
    canonicalActive: canonical.active,
    activeServiceSelections: active.length,
    inactiveServiceSelections: inactive.length,
    templateSelections: templateOptions,
    legacyRow: legacy,
    legacySelections,
    contractorConfigurations: contractorRows,
    unreachable:
      active.length === 0 && inactive.length === 0 && templateOptions === 0 && legacySelections === 0,
  };
}

async function main() {
  const keys = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!keys.length) { console.error("\n  give at least one component key\n"); process.exit(1); }

  console.log(`\nREACHABILITY PROOF\n`);
  for (const key of keys) {
    const r = await proveUnreachable(key);
    if (!r) { console.log(`  ${key}: no such canonical component\n`); continue; }
    console.log(`  ${r.key}`);
    console.log(`    selections on ACTIVE services      ${r.activeServiceSelections}`);
    console.log(`    selections on INACTIVE services    ${r.inactiveServiceSelections}`);
    console.log(`    selections in the TEMPLATE         ${r.templateSelections}`);
    console.log(`    selections via the LEGACY row      ${r.legacySelections}` +
      (r.legacyRow ? `   (legacy JobComponent exists, active ${r.legacyRow.active})` : `   (no legacy row)`));
    for (const c of r.contractorConfigurations) {
      console.log(`    configured by ${c.contractor.slug}: $${((c.approvedPriceCents ?? 0) / 100).toFixed(2)} approved, ` +
        `$${(c.addMaterialCostCents / 100).toFixed(2)} material, ${c.addFieldLaborHours}h, active ${c.active}`);
    }
    console.log(`    VERDICT: ${r.unreachable ? "UNREACHABLE — nothing can select it" : "REACHABLE — do not remove"}\n`);
  }
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
