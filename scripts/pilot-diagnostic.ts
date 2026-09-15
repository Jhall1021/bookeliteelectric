/**
 * First-service pilot diagnostic for one contractor — the same view staff see
 * on /platform/onboarding/<id>, for a terminal.
 *
 *   npx tsx scripts/pilot-diagnostic.ts --slug <contractor-slug>
 *
 * READ-ONLY. Reads through the tenant guard for that one contractor.
 */
import { PrismaClient } from "@prisma/client";
import { withContractor } from "../lib/tenantRoute";
import { loadPilotDiagnostic } from "../lib/electrical/pilotDiagnostic";

const prisma = new PrismaClient();
const slug = process.argv[process.argv.indexOf("--slug") + 1];

async function main() {
  if (!slug || slug.startsWith("--")) throw new Error("usage: --slug <contractor-slug>");
  const c = await prisma.contractor.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!c) throw new Error(`no contractor ${slug}`);
  const d = await withContractor(c.id, "system", (db) => loadPilotDiagnostic(db, c.id));
  const money = (x: number | null) => (x === null ? "—" : `$${Math.round(x / 100)}`);
  console.log(`\nFIRST-SERVICE PILOT — ${c.name}\n`);
  console.log(`  Status:  ${d.status}`);
  console.log(`  Next:    ${d.nextAction}\n`);
  for (const ch of d.checks) console.log(`  ${ch.ok ? "✓" : "✗"} ${ch.label}${ch.detail ? ` — ${ch.detail}` : ""}`);
  if (d.missing.length) console.log(`\n  Still needed: ${d.missing.join(" · ")}`);
  const a = d.audit;
  console.log(`\n  Last setup activity:   ${a.lastSetupActivityAt?.toISOString() ?? "none"}`);
  console.log(`  Price approved:        ${a.approvedAt ? `${a.approvedAt.toISOString()} at ${money(a.approvedTotalCents)}` : "not yet"}`);
  console.log(`  Current proposed:      ${money(a.currentProposedCents)}`);
  console.log(`  Changes since approval: ${a.costChangesSinceApproval} cost, ${a.laborChangesSinceApproval} labor${a.pricingChangesSinceApproval ? ", pricing" : ""}`);
  console.log(`  Live:                  ${a.active ? "yes" : "no"}`);
  console.log(`  Homeowner request now: ${a.storefrontVerdict}${a.storefrontReason ? ` — ${a.storefrontReason}` : ""}`);
  console.log(`  Priced bookings:       ${a.pricedBookings}${a.lastPricedBookingAt ? `, last ${a.lastPricedBookingAt.toISOString()}` : ""}\n`);
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(String(e.message ?? e)); await prisma.$disconnect(); process.exit(1); });
