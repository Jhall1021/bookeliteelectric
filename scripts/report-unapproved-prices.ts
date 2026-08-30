/**
 * Every published price with no approval behind it.
 *
 *   npx tsx scripts/report-unapproved-prices.ts
 *
 * These predate the price/approval boundary: until 30 Aug 2026 the service
 * editor wrote `basePrice` straight from a typed field, so a number could
 * reach a homeowner without passing through the pricing engine or anyone's
 * decision. They are not necessarily WRONG prices — most reproduce their
 * derived figure exactly. They are unapproved ones.
 *
 * REPORT ONLY, AND DELIBERATELY SO. Stamping these would be a script
 * approving prices on a contractor's behalf, which is the exact failure the
 * boundary exists to prevent. Each clears when the contractor re-approves it
 * through the pricing screen's publish action.
 *
 * The Postgres constraint is installed NOT VALID until this list is empty;
 * `install-price-approval-constraint.ts --validate` then extends it over the
 * existing dataset.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice } from "../lib/pricing";

const prisma = new PrismaClient();
const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

async function main() {
  const svcs = await prisma.service.findMany({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
    orderBy: [{ active: "desc" }, { slug: "asc" }],
  });

  console.log(`\nPUBLISHED WITHOUT APPROVAL — ${svcs.length} service(s)\n`);
  if (svcs.length === 0) {
    console.log(`  None. Run install-price-approval-constraint.ts --validate to`);
    console.log(`  extend the constraint over the existing dataset.\n`);
    return;
  }

  const head = ["service", "published", "derived", "delta", "customer-visible"];
  const rows: string[][] = [];

  for (const s of svcs) {
    const settings = await prisma.pricingSettings.findUnique({
      where: { contractorId: s.contractorId },
    });
    const derived = settings ? suggestPrimaryPrice(s as never, settings as never).totalCents : null;
    const delta = derived !== null && s.basePrice !== null ? derived - s.basePrice : null;
    rows.push([
      s.slug,
      money(s.basePrice),
      money(derived),
      delta === null ? "—" : delta === 0 ? "none" : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}`,
      s.active ? "yes — active" : "no — inactive",
    ]);
  }

  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(w[i])).join("  ");
  console.log(`  ${line(head)}`);
  console.log(`  ${w.map((n) => "─".repeat(n)).join("  ")}`);
  for (const r of rows) console.log(`  ${line(r)}`);

  const exact = rows.filter((r) => r[3] === "none").length;
  const differ = rows.filter((r) => r[3] !== "none" && r[3] !== "—").length;
  const underivable = rows.filter((r) => r[3] === "—").length;

  console.log(`\n  ${exact} reproduce their derived price exactly — they need the stamp only.`);
  console.log(`  ${differ} differ, and the gap is a decision for the contractor.`);
  if (underivable) {
    console.log(`  ${underivable} DERIVE NOTHING — the pricing screen cannot re-approve a figure it`);
    console.log(`    cannot compute, so these need their inputs completed or their price`);
    console.log(`    removed before the constraint can be validated.`);
  }
  console.log(`\n  Nothing here approves anything. Each clears by re-approving through`);
  console.log(`  the pricing screen, which derives the figure and stamps it.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
