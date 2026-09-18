/**
 * Declare which template services price from a resolved scope.
 *
 * Only `new-120v-outlet`, and only on the template. Existing PROVISIONED
 * services are deliberately untouched: Elite and BrightPath keep pricing
 * exactly as they do today, and a tenant changes method only when somebody
 * decides to. What changes is what a contractor provisioned from here on
 * RECEIVES — which is the actual defect, since a Routing V2 service arriving
 * as LEGACY_PUBLISHED is configured to price the one way its measured scope
 * cannot be priced.
 *
 * The other Routing V2 services stay LEGACY_PUBLISHED until each has its own
 * takeoff proven, rather than being switched together on the assumption that
 * what is true of the surface outlet is true of them.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const DERIVED_TEMPLATE_SERVICE_KEYS = ["new-120v-outlet"];

export async function seedRoutingV2PricingMethod(db: PrismaClient = prisma) {
  const version = await db.templateVersion.findFirstOrThrow({
    where: { trade: "electrical" }, orderBy: { version: "desc" },
    select: { id: true, version: true, kind: true } });

  const updated: string[] = [], absent: string[] = [];
  for (const key of DERIVED_TEMPLATE_SERVICE_KEYS) {
    const svc = await db.templateService.findFirst({
      where: { templateVersionId: version.id, key }, select: { id: true } });
    if (!svc) { absent.push(key); continue; }
    await db.templateService.update({
      where: { id: svc.id }, data: { pricingMethod: "DERIVED_RESOLVED_SCOPE" } });
    updated.push(key);
  }
  return { version: version.version, kind: version.kind, updated, absent };
}

if (process.argv[1] && process.argv[1].endsWith("seed-routing-v2-pricing-method.ts")) {
  seedRoutingV2PricingMethod()
    .then(async (r) => {
      console.log(`\n  electrical v${r.version} ${r.kind}`);
      console.log(`  DERIVED_RESOLVED_SCOPE: ${r.updated.join(", ") || "(none)"}`);
      if (r.absent.length) console.log(`  NOT ON THIS VERSION: ${r.absent.join(", ")}`);
      console.log();
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
