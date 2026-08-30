/**
 * Phase E/F — the two bathroom exhaust fan packages.
 * Electrical Template v1.1 §1.4, §5.5.
 *
 * ONE PUBLIC ENTRY, TWO PRICED PACKAGES.
 *
 * The packages differ in BOTH labor and equipment — 1.75h with a standard fan,
 * 2.0h with a fan-and-light — and nothing in the schema can substitute one
 * material role for another: material only ever `+=` in applyBranch. So a
 * single service cannot carry both. The fan-only package stays on the public
 * service; the fan-and-light package is a hidden sibling the tree reroutes to,
 * which is the pattern this catalogue already uses for equipment choices
 * (elite-tilt-mount is hidden and reached by reference).
 *
 * Hidden is reachable: neither /api/services/[slug] nor /api/services/by-id
 * filters on `active`, while the category listings do. So the sibling is out of
 * the catalogue and out of search, and still resolves when the reroute sends
 * someone to it — carrying their answers, as RerouteNotice does.
 *
 * §1.4 is satisfied at the end of this: the public service stops being a
 * price-less REMOTE_QUOTE and shows a real starting price, with everything
 * outside the standard package routed to review rather than silently repriced.
 *
 *   npx tsx scripts/build-fan-packages.ts            # report only
 *   npx tsx scripts/build-fan-packages.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { suggestPrimaryPrice, type PricingSettings } from "../lib/pricing";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const CONTRACTOR = "elite-electric";

const BASE_SLUG = "replace-bathroom-exhaust-fan";
const SIBLING_SLUG = "replace-bathroom-exhaust-fan-with-light";

/** Approved package economics. Prices are DERIVED from these, never typed in. */
const PACKAGES = {
  fanOnly: { hours: 1.75, role: "BATH_FAN_STANDARD", calibration: 52500 },
  fanLight: { hours: 2.0, role: "BATH_FAN_LIGHT_STANDARD", calibration: 59500 },
};

const DISCLOSURE =
  "The starting price assumes a standard-size replacement fan, an existing duct " +
  "connection we can reuse, and normal access to the fan location. If the housing " +
  "size, duct size or configuration is different, or the work needs a higher-airflow " +
  "fan, a humidity sensor, a heater or unusual access, we will show you the price " +
  "difference and get your approval before installing anything.";

/**
 * Qualification shared by both packages.
 *
 * Every answer that leaves the standard package routes to review. None of them
 * quietly reprices, which is the §5.5 rule: nonstandard scope is shown and
 * approved, never substituted underneath the customer.
 */
const QUALIFY = [
  {
    key: "fan_housing_standard",
    prompt: "Is the fan you have now a standard size, with ducting we can reuse?",
    helpText: "Most bathroom fans are a standard housing size. If you are not sure, choose that — we will look.",
    options: [
      { value: "standard", label: "Yes — standard size, existing duct", action: "CONTINUE" },
      { value: "different", label: "No — different size, or the ducting needs work", action: "PHOTO_REVIEW" },
      { value: "unsure", label: "I'm not sure", action: "PHOTO_REVIEW" },
    ],
  },
  {
    key: "fan_features",
    prompt: "Do you need any of these?",
    helpText: "A standard replacement covers most bathrooms.",
    options: [
      { value: "standard", label: "No — a standard fan is fine", action: "CONTINUE" },
      { value: "higher_cfm", label: "Higher airflow for a larger bathroom", action: "PHOTO_REVIEW" },
      { value: "humidity_heater", label: "A humidity sensor, or a heater", action: "PHOTO_REVIEW" },
    ],
  },
  {
    key: "fan_access",
    prompt: "Can we reach the fan normally?",
    helpText: "Standard ceiling height, nothing to dismantle to get to it.",
    options: [
      { value: "normal", label: "Yes — normal ceiling and access", action: "RESOLVE_ADJUSTED" },
      { value: "difficult", label: "No — high ceiling, or awkward to reach", action: "PHOTO_REVIEW" },
      { value: "unsure", label: "I'm not sure", action: "PHOTO_REVIEW" },
    ],
  },
] as const;

async function main() {
  const c = await prisma.contractor.findUniqueOrThrow({
    where: { slug: CONTRACTOR }, select: { id: true, name: true },
  });
  const settings = (await prisma.pricingSettings.findUniqueOrThrow({
    where: { contractorId: c.id },
    select: { crewHourRateCents: true, primaryMinimumCents: true, roundingIncrementCents: true, defaultPermitAdminCents: true },
  })) as PricingSettings;

  const material = async (key: string) =>
    prisma.contractorMaterial.findFirstOrThrow({
      where: { contractorId: c.id, canonicalMaterial: { key } },
      select: { unitCostCents: true, canonicalMaterialId: true },
    });
  const consumables = await material("CONSUMABLES_SMALL");

  const base = await prisma.service.findFirstOrThrow({
    where: { contractorId: c.id, slug: BASE_SLUG },
    select: { id: true, name: true, categoryId: true, contractorCategoryId: true, sortOrder: true, heroImage: true, icon: true, shortDescription: true },
  });

  console.log(`\nBATHROOM FAN PACKAGES${APPLY ? "" : "   (report only — pass --apply)"}\n`);

  /** Derive each package price from its own economics. */
  const derive = async (p: { hours: number; role: string; calibration: number }) => {
    const equip = await material(p.role);
    const matCents = equip.unitCostCents + consumables.unitCostCents;
    const total = suggestPrimaryPrice(
      { fieldLaborHours: p.hours, wwtLaborHours: null, requiresTechCount: 1, materialCostCents: matCents,
        materialMultiplier: null, permitAdminCents: null, otherDirectCostCents: null, isPrimaryEligible: true },
      settings,
    ).totalCents;
    if (total === null) {
      throw new Error(`${p.role}: the engine produced no price. Refusing to publish a package it cannot derive.`);
    }
    return { ...p, equip, matCents, total };
  };
  const only = await derive(PACKAGES.fanOnly);
  const light = await derive(PACKAGES.fanLight);

  for (const [name, d] of [["fan only", only], ["fan + light", light]] as const) {
    const delta = d.total - d.calibration;
    console.log(`  ${name.padEnd(12)} ${d.hours}h + ${d.role.padEnd(24)} material $${(d.matCents / 100).toFixed(2).padEnd(7)} ` +
      `DERIVED $${(d.total / 100).toFixed(2)}   vs calibration $${(d.calibration / 100).toFixed(2)}   ${delta >= 0 ? "+" : ""}$${(delta / 100).toFixed(2)}`);
  }

  if (!APPLY) { console.log(`\n  Nothing was changed.\n`); await prisma.$disconnect(); return; }

  // ── the hidden sibling ────────────────────────────────────────────────────
  let sibling = await prisma.service.findFirst({ where: { contractorId: c.id, slug: SIBLING_SLUG }, select: { id: true } });
  if (!sibling) {
    sibling = await prisma.service.create({
      data: {
        contractorId: c.id, categoryId: base.categoryId, contractorCategoryId: base.contractorCategoryId,
        slug: SIBLING_SLUG, name: "Replace Bathroom Exhaust Fan with Light — We Supply the Fan",
        shortDescription: base.shortDescription, disclaimer: DISCLOSURE,
        bookingType: "ADJUSTED", active: false, isPrimaryEligible: true,
        fieldLaborHours: light.hours, requiresTechCount: 1,
        estimatedMinutes: Math.round(light.hours * 60), estimatedMinutesReviewed: true,
        materialCostCents: light.matCents, materialCostResolved: true,
        basePrice: light.total, publishedPriceApprovedAt: new Date(),
        heroImage: base.heroImage, icon: base.icon, sortOrder: base.sortOrder,
      },
      select: { id: true },
    });
    await prisma.serviceMaterial.createMany({
      data: [
        { serviceId: sibling.id, canonicalMaterialId: light.equip.canonicalMaterialId, quantity: 1, order: 0 },
        { serviceId: sibling.id, canonicalMaterialId: consumables.canonicalMaterialId, quantity: 1, order: 1 },
      ],
    });
    console.log(`\n  created hidden sibling ${SIBLING_SLUG}`);
  } else {
    console.log(`\n  hidden sibling already exists`);
  }

  // ── the public service ────────────────────────────────────────────────────
  await prisma.service.update({
    where: { id: base.id },
    data: {
      bookingType: "ADJUSTED", active: true, startingPriceLabel: null, disclaimer: DISCLOSURE,
      fieldLaborHours: only.hours, estimatedMinutes: Math.round(only.hours * 60), estimatedMinutesReviewed: true,
      materialCostCents: only.matCents, materialCostResolved: true,
      basePrice: only.total, publishedPriceApprovedAt: new Date(),
    },
  });
  const existingMats = await prisma.serviceMaterial.count({ where: { serviceId: base.id } });
  if (existingMats === 0) {
    await prisma.serviceMaterial.createMany({
      data: [
        { serviceId: base.id, canonicalMaterialId: only.equip.canonicalMaterialId, quantity: 1, order: 0 },
        { serviceId: base.id, canonicalMaterialId: consumables.canonicalMaterialId, quantity: 1, order: 1 },
      ],
    });
  }

  // ── trees ─────────────────────────────────────────────────────────────────
  const buildQualification = async (serviceId: string, startOrder: number) => {
    const ids: string[] = [];
    for (const [i, q] of QUALIFY.entries()) {
      const made = await prisma.question.create({
        data: { serviceId, key: q.key, prompt: q.prompt, helpText: q.helpText, inputType: "SINGLE_SELECT", order: startOrder + i },
        select: { id: true },
      });
      ids.push(made.id);
    }
    for (const [i, q] of QUALIFY.entries()) {
      for (const [j, o] of q.options.entries()) {
        await prisma.answerOption.create({
          data: {
            questionId: ids[i], value: o.value, label: o.label, order: j,
            routeAction: o.action as any,
            nextQuestionId: o.action === "CONTINUE" ? ids[i + 1] ?? null : null,
            requiredPhotoLabels: o.action === "PHOTO_REVIEW" ? ["The fan you have now", "The ceiling around it"] : [],
            photosBlockBooking: o.action === "PHOTO_REVIEW",
          },
        });
      }
    }
    return ids[0];
  };

  const wipe = async (serviceId: string) => {
    const qs = await prisma.question.findMany({ where: { serviceId }, select: { id: true } });
    const ids = qs.map((q) => q.id);
    await prisma.answerOption.deleteMany({ where: { questionId: { in: ids } } });
    await prisma.question.deleteMany({ where: { id: { in: ids } } });
  };

  await wipe(sibling.id);
  await buildQualification(sibling.id, 0);
  console.log(`  sibling tree: ${QUALIFY.length} qualification questions`);

  await wipe(base.id);
  const firstQualify = await buildQualification(base.id, 1);
  const packageQ = await prisma.question.create({
    data: {
      serviceId: base.id, key: "fan_package", order: 0, inputType: "SINGLE_SELECT",
      prompt: "Which would you like?",
      helpText: "We supply the fan. A light version costs a little more to fit as well as to buy.",
    },
    select: { id: true },
  });
  await prisma.answerOption.create({
    data: { questionId: packageQ.id, value: "fan_only", label: "Fan only", order: 0,
      routeAction: "CONTINUE", nextQuestionId: firstQualify },
  });
  await prisma.answerOption.create({
    data: { questionId: packageQ.id, value: "fan_light", label: "Fan with a light", order: 1,
      routeAction: "REROUTE_SERVICE", rerouteServiceId: sibling.id },
  });
  console.log(`  public tree: package question + ${QUALIFY.length} qualification questions`);

  console.log();
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
