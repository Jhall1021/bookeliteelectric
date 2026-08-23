/**
 * Which imported multipliers actually matter?
 *
 * An override on a service with NO material changes nothing — 1.0 x $0 and
 * the standard rule x $0 are both zero. Those are pure noise in the blocked
 * list, and clearing them costs nothing and unblocks the row.
 *
 * An override on a service WITH material is a real difference and needs a
 * decision. Report only.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const svc = await prisma.service.findMany({
    where: { active: true, materialMultiplier: { not: null } },
    select: {
      slug: true, name: true, materialMultiplier: true, materialCostCents: true,
      _count: { select: { materials: true } },
    },
    orderBy: { name: "asc" },
  });

  const noMaterial = svc.filter((s) => !s.materialCostCents);
  const withMaterial = svc.filter((s) => s.materialCostCents);

  console.log(`\n${svc.length} active service(s) carry an imported multiplier.\n`);
  console.log(`  ${noMaterial.length} have NO material recorded — the override does nothing.`);
  console.log(`  Clearing those changes no price and unblocks them:\n`);
  for (const s of noMaterial) console.log(`      ${s.materialMultiplier}x   ${s.name.trim()}`);

  console.log(`\n  ${withMaterial.length} DO have material — clearing these moves prices:\n`);
  for (const s of withMaterial) {
    const cost = s.materialCostCents ?? 0;
    const nowSell = Math.round(cost * (s.materialMultiplier ?? 1));
    const stdSell = cost <= 75000 ? Math.round(cost * 1.3) : Math.round(75000 * 1.3 + (cost - 75000) * 1.2);
    console.log(
      `      ${s.name.trim()}\n` +
        `          $${(cost / 100).toFixed(2)} material · override ${s.materialMultiplier}x = $${(nowSell / 100).toFixed(2)}` +
        ` · standard = $${(stdSell / 100).toFixed(2)}  (${nowSell > stdSell ? "-" : "+"}$${Math.abs(stdSell - nowSell) / 100})`
    );
  }
  console.log(`\nReport only. Nothing changed.\n`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
