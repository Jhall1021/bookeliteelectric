/**
 * Add the physical overhead-service materials already promised by the 200A
 * service wording to the named rehearsal contractor's installed recipe.
 *
 * This is deliberately narrower than prisma/seed-200a-service-upgrade.ts,
 * which targets the legacy source contractor and rebuilds the whole question
 * tree. This script preserves questions, answers, activation and labor. It
 * adds/repairs six ServiceMaterial lines, recomputes the cached material
 * total, then republishes the derived flat price through the normal guarded
 * publication boundary.
 */
import { PrismaClient } from "@prisma/client";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
const SERVICE_SLUG = "200a-service-upgrade";
const EXPECTED_RECONCILED_PRIMARY_CENTS = 465_500;

const LINES = [
  ["SERVICE_MAST_RMC_2IN_10FT", 1],
  ["SERVICE_WEATHERHEAD_2IN", 1],
  ["METER_HUB_2IN", 1],
  ["SERVICE_MAST_SUPPORT_SET_2IN", 1],
  ["WIRE_SERVICE_AL_4_0", 20],
  ["WIRE_SERVICE_AL_2_0_NEUTRAL", 10],
] as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const contractorSlug = arg("contractor") ?? EXPECTED_CONTRACTOR;
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (contractorSlug !== EXPECTED_CONTRACTOR) throw new Error(`refusing contractor ${contractorSlug}`);

  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT ||
      identity.lineage !== PRODUCTION_LINEAGE ||
      identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: contractorSlug }, select: { id: true },
    });
    const service = await db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId: contractor.id, slug: SERVICE_SLUG } },
      select: {
        id: true, active: true, offered: true, bookingType: true, pricingMethod: true,
        basePrice: true, whileWeThereBasePrice: true, fieldLaborHours: true,
        materialCostCents: true, materialCostResolved: true,
      },
    });
    const preserved = {
      active: service.active,
      offered: service.offered,
      bookingType: service.bookingType,
      pricingMethod: service.pricingMethod,
      fieldLaborHours: service.fieldLaborHours,
    };

    const roles = await db.canonicalMaterial.findMany({
      where: { key: { in: LINES.map(([key]) => key) } },
      select: { id: true, key: true, unit: true },
    });
    const byKey = new Map(roles.map((role) => [role.key, role]));
    const missingRoles = LINES.filter(([key]) => !byKey.has(key)).map(([key]) => key);
    if (missingRoles.length) throw new Error(`missing canonical roles: ${missingRoles.join(", ")}`);

    const priced = await db.contractorMaterial.findMany({
      where: { contractorId: contractor.id, active: true, canonicalMaterialId: { in: roles.map((role) => role.id) } },
      select: { canonicalMaterialId: true },
    });
    const pricedIds = new Set(priced.map((row) => row.canonicalMaterialId));
    const unpriced = roles.filter((role) => !pricedIds.has(role.id)).map((role) => role.key);
    if (unpriced.length) throw new Error(`rehearsal contractor has no active cost for: ${unpriced.join(", ")}`);

    const existing = await db.serviceMaterial.findMany({
      where: { serviceId: service.id, canonicalMaterialId: { in: roles.map((role) => role.id) } },
      select: { canonicalMaterialId: true, quantity: true, quantityIsPolicy: true, order: true },
    });
    const existingByRole = new Map(existing.map((row) => [row.canonicalMaterialId, row]));
    const maxOrder = await db.serviceMaterial.aggregate({ where: { serviceId: service.id }, _max: { order: true } });

    console.log(`\n200A OVERHEAD RECIPE COMPLETION — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}`);
    console.log(`  service state: ${service.active ? "active" : "inactive"}, ${service.offered ? "offered" : "not offered"}`);
    console.log(`  cached materials before: $${((service.materialCostCents ?? 0) / 100).toFixed(2)} (${service.materialCostResolved ? "resolved" : "unresolved"})\n`);

    let changed = 0;
    for (const [index, [key, quantity]] of LINES.entries()) {
      const role = byKey.get(key)!;
      const row = existingByRole.get(role.id);
      const same = row?.quantity === quantity && row.quantityIsPolicy === false;
      console.log(`  ${same ? "·" : apply ? "+" : "?"} ${key} x ${quantity} ${role.unit}`);
      if (!same && apply) {
        await db.serviceMaterial.upsert({
          where: { serviceId_canonicalMaterialId: { serviceId: service.id, canonicalMaterialId: role.id } },
          update: { quantity, quantityIsPolicy: false },
          create: {
            serviceId: service.id,
            canonicalMaterialId: role.id,
            quantity,
            quantityIsPolicy: false,
            order: (maxOrder._max.order ?? -1) + index + 1,
          },
        });
        changed++;
      }
    }

    if (!apply) {
      console.log(`\n  Report only. ${LINES.length - existing.length} line(s) are absent; re-run with --apply to complete this one recipe.\n`);
      return;
    }

    const recomputed = await recomputeServiceMaterialCost(db, service.id);
    const publication = await publishSuggestedPrice(db, contractor.id, service.id, {
      expectedBasePrice: EXPECTED_RECONCILED_PRIMARY_CENTS,
    });
    if (!publication.ok) {
      throw new Error(`200A price publication refused: ${publication.refusal.code} — ${publication.refusal.message}`);
    }
    const after = await db.service.findUniqueOrThrow({
      where: { id: service.id },
      select: {
        active: true, offered: true, bookingType: true, pricingMethod: true,
        basePrice: true, whileWeThereBasePrice: true, fieldLaborHours: true,
        materialCostCents: true, materialCostResolved: true,
      },
    });
    for (const [key, value] of Object.entries(preserved)) {
      if (after[key as keyof typeof preserved] !== value) throw new Error(`safety assertion failed: ${key} changed`);
    }
    if (!after.materialCostResolved) throw new Error("200A material recipe remained unresolved after recompute");

    console.log(`\n  ${changed} recipe line(s) changed.`);
    console.log(`  cached materials after: $${((after.materialCostCents ?? 0) / 100).toFixed(2)} (resolved)`);
    console.log(`  published primary: $${((service.basePrice ?? 0) / 100).toFixed(2)} -> $${(publication.basePrice / 100).toFixed(2)}`);
    console.log(`  published same-visit: $${((service.whileWeThereBasePrice ?? 0) / 100).toFixed(2)} -> ${publication.whileWeThereBasePrice === null ? "unchanged" : `$${(publication.whileWeThereBasePrice / 100).toFixed(2)}`}`);
    console.log(`  labor, activation, offer state and question tree preserved.`);
    if (!recomputed) throw new Error("material recompute unexpectedly returned no result");
    console.log();
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
