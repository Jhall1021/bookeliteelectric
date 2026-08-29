/**
 * Phase C — record the consumables these services actually consume.
 * Electrical Template v1.1 §4.3, §5.3, §7.2, §7.3, §8, §14, §16, §20 Phase C.
 *
 * Each of these installs something into an existing opening and consumes normal
 * misc. materials — connectors, anchors, wire nuts, tape — which were simply
 * never recorded, leaving the service reading as material-free.
 *
 * §14: not applied mechanically to every zero-material service. A thermostat
 * legitimately remains zero, and the owner-supplied bath fan keeps its
 * deliberate zero; neither is in this list.
 *
 * §16: this adds the real cost structure and does NOT reprice anything. The
 * cached materialCostCents is brought into line with the new recipe — it feeds
 * the SUGGESTED price, not the published one — and the published price is left
 * alone. The suggested-price movement that results is reported, because that
 * divergence is the point of recording the cost at all.
 *
 *   npx tsx scripts/add-consumables-recipes.ts            # report only
 *   npx tsx scripts/add-consumables-recipes.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { suggestPrimaryPrice, type PricingSettings } from "../lib/pricing";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CONTRACTOR = "elite-electric";

/** §14 — services that truly consume misc. installation material. */
const SERVICES = [
  { slug: "replace-interior-light-fixture", why: "§4.3 — customer's fixture, our connectors and anchors" },
  { slug: "replace-exterior-light-fixture", why: "§4.3" },
  { slug: "replace-motion-flood-light", why: "§4.3" },
  { slug: "replace-ceiling-fan", why: "§5.3 — no fan-rated box: an existing fan location is assumed" },
  { slug: "video-doorbell-existing-wiring", why: "§7.2 — no transformer: existing wiring is assumed" },
  { slug: "floodlight-camera-existing", why: "§7.3 — customer supplies the camera" },
  { slug: "dishwasher-electrical", why: "§8 — customer supplies the appliance" },
  { slug: "garbage-disposal-install", why: "§8" },
  { slug: "otr-microwave-install", why: "§8" },
  { slug: "install-new-microwave", why: "§8" },
  { slug: "replace-range-hood", why: "§8" },
  // §6.2, §6.3 — resolved by Elite policy: normal screws, anchors and basic
  // mounting consumables are supplied; the TV mount and any specialty soundbar
  // bracket are not, unless the customer selects a supplied-mount option, which
  // carries its own material role.
  { slug: "tv-install-existing-location", why: "§6.2 — consumables yes, mount customer-supplied" },
  { slug: "soundbar-installation", why: "§6.3 — consumables yes, no specialty bracket by default" },
];

const ROLE = "CONSUMABLES_SMALL";

async function main() {
  const c = await prisma.contractor.findUniqueOrThrow({
    where: { slug: CONTRACTOR },
    select: { id: true, name: true },
  });
  const settings = (await prisma.pricingSettings.findUniqueOrThrow({
    where: { contractorId: c.id },
    select: { crewHourRateCents: true, primaryMinimumCents: true, roundingIncrementCents: true, defaultPermitAdminCents: true },
  })) as PricingSettings;

  const role = await prisma.contractorMaterial.findFirstOrThrow({
    where: { contractorId: c.id, canonicalMaterial: { key: ROLE } },
    select: { unitCostCents: true, canonicalMaterialId: true },
  });

  console.log(`\nPHASE C — CONSUMABLES${APPLY ? "" : "   (report only — pass --apply to write)"}`);
  console.log(`  ${ROLE} = $${(role.unitCostCents / 100).toFixed(2)} each\n`);
  console.log(`  ${"service".padEnd(34)} ${"published".padEnd(11)} ${"suggested".padEnd(11)} ${"after".padEnd(11)} cause`);

  let written = 0, already = 0, missing = 0;
  for (const s of SERVICES) {
    const svc = await prisma.service.findFirst({
      where: { contractorId: c.id, slug: s.slug },
      select: {
        id: true, slug: true, basePrice: true, materialCostCents: true, materialMultiplier: true,
        fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true, isPrimaryEligible: true,
        permitAdminCents: true, otherDirectCostCents: true,
        materials: { select: { id: true, canonicalMaterialId: true } },
      },
    });
    if (!svc) { console.log(`  MISSING ${s.slug}`); missing++; continue; }

    if (svc.materials.some((m) => m.canonicalMaterialId === role.canonicalMaterialId)) {
      console.log(`  ${svc.slug.padEnd(34)} already has ${ROLE}`);
      already++; continue;
    }

    const inputs = {
      fieldLaborHours: svc.fieldLaborHours, wwtLaborHours: svc.wwtLaborHours,
      requiresTechCount: svc.requiresTechCount, materialMultiplier: svc.materialMultiplier,
      permitAdminCents: svc.permitAdminCents, otherDirectCostCents: svc.otherDirectCostCents,
      isPrimaryEligible: svc.isPrimaryEligible,
    };
    const before = suggestPrimaryPrice({ ...inputs, materialCostCents: svc.materialCostCents }, settings).totalCents;
    const newMaterial = (svc.materialCostCents ?? 0) + role.unitCostCents;
    const after = suggestPrimaryPrice({ ...inputs, materialCostCents: newMaterial }, settings).totalCents;

    const d = (n: number | null) => (n === null ? "—" : `$${(n / 100).toFixed(2)}`);
    console.log(
      `  ${svc.slug.padEnd(34)} ${d(svc.basePrice).padEnd(11)} ${d(before).padEnd(11)} ${d(after).padEnd(11)} ${s.why}`,
    );

    if (APPLY) {
      await prisma.serviceMaterial.create({
        data: {
          serviceId: svc.id,
          canonicalMaterialId: role.canonicalMaterialId,
          quantity: 1,
          order: svc.materials.length,
        },
      });
      // The cached figure is brought into line with the recipe it now has.
      // This drives the SUGGESTED price; basePrice is untouched.
      await prisma.service.update({
        where: { id: svc.id },
        data: { materialCostCents: newMaterial, materialCostResolved: true },
      });
      written++;
    }
  }

  console.log(`\n  ${written} written · ${already} already recorded · ${missing} not found`);
  console.log(`  Published prices are NOT changed. Suggested-price movement above is the`);
  console.log(`  divergence between what the work costs and what is published (§16).`);
  if (!APPLY) console.log(`  Nothing was changed.`);
  console.log();
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
