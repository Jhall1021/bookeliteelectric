/**
 * Phase E — equipment material roles.
 * Electrical Template v1.1 §5.5, §6.1.
 *
 * Canonical identity describes the EQUIPMENT CLASS and never a retailer or a
 * SKU (§1.1). "Broan-NuTone BE8" is what Elite happens to buy; "an 80 CFM
 * bathroom exhaust fan" is what the job needs. The model goes in the
 * contractor's own row as a note, where it can change without touching trade
 * knowledge.
 *
 * The 110 CFM roles are ALTERNATIVES to the 80 CFM ones, not additions stacked
 * on top. Nothing here selects them — wiring the customer's choice into the
 * tree is Phase F, and this stops short of it deliberately.
 *
 * The two TV mount roles do get wired, because §6.1 specifies them completely
 * and they close two `costWithoutRecipe` findings from the audit: both
 * services carry a cached material cost with no recipe behind it, and the role
 * cost reproduces that figure exactly.
 *
 *   npx tsx scripts/add-equipment-roles.ts            # report only
 *   npx tsx scripts/add-equipment-roles.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CONTRACTOR = "elite-electric";

/** Equipment classes. Elite's product choice lives in `note`, not in the key. */
const ROLES: { key: string; name: string; costCents: number; note: string }[] = [
  { key: "BATH_FAN_STANDARD", name: "Bathroom exhaust fan, standard housing (80 CFM class)",
    costCents: 6900, note: "Elite standard: Broan-NuTone BE8, 80 CFM" },
  { key: "BATH_FAN_LIGHT_STANDARD", name: "Bathroom exhaust fan with light, standard housing (80 CFM class)",
    costCents: 8500, note: "Elite standard: Broan-NuTone BEL8, 80 CFM + LED" },
  { key: "BATH_FAN_HIGH_CFM", name: "Bathroom exhaust fan, higher airflow (110 CFM class)",
    costCents: 11900, note: "Elite upgrade: Broan-NuTone AER110K, 110 CFM. Alternative to BATH_FAN_STANDARD, not an addition" },
  { key: "BATH_FAN_LIGHT_HIGH_CFM", name: "Bathroom exhaust fan with light, higher airflow (110 CFM class)",
    costCents: 16900, note: "Elite upgrade: Broan-NuTone AER110CCTK, 110 CFM + light. Alternative to BATH_FAN_LIGHT_STANDARD" },
  { key: "TV_MOUNT_TILT_STANDARD", name: "Tilting TV wall mount, standard",
    costCents: 5000, note: "Contractor-supplied mount" },
  { key: "TV_MOUNT_FULL_MOTION_STANDARD", name: "Full-motion (articulating) TV wall mount, standard",
    costCents: 10000, note: "Contractor-supplied mount" },
];

/**
 * §6.1 — the two services whose material cost has no recipe behind it.
 * The role cost must reproduce the cached figure exactly, or this refuses.
 */
const WIRE_INTO: { slug: string; role: string }[] = [
  { slug: "elite-tilt-mount", role: "TV_MOUNT_TILT_STANDARD" },
  { slug: "elite-articulating-mount", role: "TV_MOUNT_FULL_MOTION_STANDARD" },
];

async function main() {
  const c = await prisma.contractor.findUniqueOrThrow({
    where: { slug: CONTRACTOR }, select: { id: true, name: true },
  });

  console.log(`\nPHASE E — EQUIPMENT ROLES${APPLY ? "" : "   (report only — pass --apply)"}\n`);

  const idByKey = new Map<string, string>();
  for (const r of ROLES) {
    const existing = await prisma.canonicalMaterial.findUnique({ where: { key: r.key }, select: { id: true } });
    const cost = existing
      ? await prisma.contractorMaterial.findFirst({
          where: { contractorId: c.id, canonicalMaterialId: existing.id }, select: { unitCostCents: true } })
      : null;
    console.log(`  ${existing ? (cost ? "exists" : "role   ") : (APPLY ? "CREATE" : "would ")} ${r.key.padEnd(32)} $${(r.costCents / 100).toFixed(2).padEnd(8)} ${r.note}`);

    if (!APPLY) continue;
    const mat = existing ?? await prisma.canonicalMaterial.create({
      data: { key: r.key, name: r.name, unit: "each" }, select: { id: true },
    });
    idByKey.set(r.key, mat.id);
    await prisma.contractorMaterial.upsert({
      where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: mat.id } },
      update: {},
      create: {
        contractorId: c.id, canonicalMaterialId: mat.id, unitCostCents: r.costCents,
        costConfidence: "CONFIRMED", costSource: "CUSTOM", notes: r.note, costUpdatedAt: new Date(),
      },
    });
  }

  console.log(`\n  WIRING (§6.1 — closes two costWithoutRecipe findings)\n`);
  for (const w of WIRE_INTO) {
    const svc = await prisma.service.findFirst({
      where: { contractorId: c.id, slug: w.slug },
      select: { id: true, slug: true, materialCostCents: true, materials: { select: { id: true } } },
    });
    if (!svc) { console.log(`  MISSING ${w.slug}`); continue; }
    const role = ROLES.find((r) => r.key === w.role)!;

    if (svc.materials.length > 0) { console.log(`  ${svc.slug.padEnd(30)} already has a recipe`); continue; }
    if ((svc.materialCostCents ?? 0) !== role.costCents) {
      console.log(`  REFUSE ${svc.slug} — cached $${((svc.materialCostCents ?? 0) / 100).toFixed(2)} ` +
        `but ${w.role} is $${(role.costCents / 100).toFixed(2)}. Not written.`);
      continue;
    }
    console.log(`  ${APPLY ? "WRITE " : "would "} ${svc.slug.padEnd(30)} ${w.role} ×1 = $${(role.costCents / 100).toFixed(2)}  (matches cached cost exactly)`);

    if (APPLY) {
      await prisma.serviceMaterial.create({
        data: { serviceId: svc.id, canonicalMaterialId: idByKey.get(w.role)!, quantity: 1, order: 0 },
      });
    }
  }

  if (!APPLY) console.log(`\n  Nothing was changed.`);
  console.log();
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
