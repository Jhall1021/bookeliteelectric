/**
 * ROUTING V2 — proving harness services.
 *
 * Each shared route module gets a minimal service that does nothing but enter
 * it. That keeps the module provable BEFORE any real customer-facing tree
 * consumes it, which is the sequencing the architecture depends on: a service
 * should consume a finished primitive, never be the place one is invented.
 *
 * These are inactive and unoffered. They are scaffolding for the verifiers, and
 * the retirement verifier will later assert they never reach a customer.
 */
import { PrismaClient } from "@prisma/client";
import { attachAccessibleConcealedModule, attachBackToBackModule } from "./_concealedRouteModules";

const prisma = new PrismaClient();

export const ROUTE_FIXTURES = [
  { slug: "rv2-fixture-accessible-outlet", name: "RV2 fixture — accessible concealed (outlet)",
    module: "ACCESSIBLE" as const, endpoint: "OUTLET" as const },
  { slug: "rv2-fixture-accessible-switch", name: "RV2 fixture — accessible concealed (switch)",
    module: "ACCESSIBLE" as const, endpoint: "SWITCH" as const },
  { slug: "rv2-fixture-back-to-back-outlet", name: "RV2 fixture — back to back (outlet)",
    module: "BACK_TO_BACK" as const, endpoint: "OUTLET" as const },
];

export async function seedRoutingV2Fixtures(db: PrismaClient = prisma) {
  const anchor = await db.service.findFirstOrThrow({
    where: { slug: "new-120v-outlet" },
    select: { categoryId: true, contractorId: true, contractorCategoryId: true, tradeKey: true, bookingType: true },
  });

  for (const f of ROUTE_FIXTURES) {
    const existing = await db.service.findFirst({
      where: { slug: f.slug, contractorId: anchor.contractorId }, select: { id: true } });
    const svc = existing ?? await db.service.create({
      data: {
        slug: f.slug, name: f.name, categoryId: anchor.categoryId,
        contractorId: anchor.contractorId, contractorCategoryId: anchor.contractorCategoryId,
        tradeKey: anchor.tradeKey, bookingType: anchor.bookingType,
        active: false, offered: false, basePrice: null, publishedPriceApprovedAt: null,
        shortDescription: "Routing V2 verification fixture. Never offered to a customer.",
      }, select: { id: true } });

    if (f.module === "ACCESSIBLE") await attachAccessibleConcealedModule(db, svc.id, f.endpoint, 1);
    else await attachBackToBackModule(db, svc.id, f.endpoint, 1);
  }
  return ROUTE_FIXTURES.length;
}

if (process.argv[1] && process.argv[1].endsWith("seed-routing-v2-fixtures.ts")) {
  seedRoutingV2Fixtures()
    .then(async (n) => { console.log(`\n  ${n} route fixtures seeded (inactive, unoffered).\n`); await prisma.$disconnect(); })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
