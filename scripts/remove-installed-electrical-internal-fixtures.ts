/**
 * Remove the four Routing V2 proving fixtures from an older installed test
 * contractor. Fresh installs already exclude these rows in installCatalog.
 *
 * Report-only by default. The apply path refuses any fixture that is active,
 * priced, referenced by customer work, or not one of the four exact internal
 * slugs. An old `offered` selection is removable: that mistaken selection is
 * precisely why a proving fixture can still appear in Guided Setup.
 */
import { PrismaClient } from "@prisma/client";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";
import { sanitizeForLog } from "./_sanitizeOutput";

const PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const RECOVERY_ENDPOINT = "ep-shiny-king-ayayoy5q";
const FIXTURE_SLUGS = [
  "rv2-fixture-accessible-outlet",
  "rv2-fixture-accessible-switch",
  "rv2-fixture-back-to-back-outlet",
  "rv2-fixture-finished-wall-outlet",
] as const;

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
  const targetUrl = arg("target-url") ?? process.env.DATABASE_URL;
  const contractorSlug = arg("contractor");
  const apply = process.argv.includes("--apply");
  const recovery = process.argv.includes("--recovery-rehearsal");
  if (!targetUrl) throw new Error("--target-url or DATABASE_URL is required");
  if (!contractorSlug) throw new Error("--contractor is required");
  if (apply && !recovery && !process.argv.includes("--i-confirm-this-is-production")) {
    throw new Error("Applying requires --i-confirm-this-is-production");
  }
  if (apply && !recovery && !arg("recovery-point-confirmed")) {
    throw new Error("Applying requires --recovery-point-confirmed <PITR timestamp>");
  }

  const identity = await probe(targetUrl);
  const expectedEndpoint = recovery ? RECOVERY_ENDPOINT : PRODUCTION_ENDPOINT;
  if (identity.endpoint !== expectedEndpoint || identity.lineage !== PRODUCTION_LINEAGE ||
      identity.markerEndpoint !== PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: database identity does not match the guarded target.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: contractorSlug },
      select: { id: true, name: true },
    });
    const fixtures = await db.service.findMany({
      where: { contractorId: contractor.id, slug: { startsWith: "rv2-fixture-" } },
      orderBy: { slug: "asc" },
      select: {
        id: true, slug: true, active: true, offered: true,
        basePrice: true, whileWeThereBasePrice: true, publishedPriceApprovedAt: true,
        _count: { select: { lineItems: true, quotes: true, guidedFlowSessions: true, referencedByAnswerOptions: true } },
      },
    });
    const expected = new Set<string>(FIXTURE_SLUGS);
    const unexpected = fixtures.filter((fixture) => !expected.has(fixture.slug));
    const unsafe = fixtures.filter((fixture) =>
      fixture.active || fixture.basePrice !== null ||
      fixture.whileWeThereBasePrice !== null || fixture.publishedPriceApprovedAt !== null ||
      fixture._count.lineItems > 0 || fixture._count.quotes > 0 ||
      fixture._count.guidedFlowSessions > 0 || fixture._count.referencedByAnswerOptions > 0);

    console.log(`\nREMOVE INSTALLED ELECTRICAL INTERNAL FIXTURES — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractor.name} (${contractorSlug})`);
    console.log(`  internal fixture rows found: ${fixtures.length}`);
    for (const fixture of fixtures) {
      console.log(`  ${unsafe.includes(fixture) ? "✗" : "·"} ${fixture.slug} — active=${fixture.active}, offered=${fixture.offered}, base=${fixture.basePrice ?? "null"}, add-on=${fixture.whileWeThereBasePrice ?? "null"}, approved=${fixture.publishedPriceApprovedAt ? "yes" : "no"}, customer references=${fixture._count.lineItems + fixture._count.quotes + fixture._count.guidedFlowSessions + fixture._count.referencedByAnswerOptions}`);
    }
    if (unexpected.length) throw new Error(`Unexpected rv2 fixture slug(s): ${unexpected.map((row) => row.slug).join(", ")}`);
    if (unsafe.length) throw new Error(`Refusing fixture row(s) with live, priced, or customer-owned state: ${unsafe.map((row) => row.slug).join(", ")}`);
    if (!apply) {
      console.log("\n  Report only; nothing changed.\n");
      return;
    }

    const serviceIds = fixtures.map((fixture) => fixture.id);
    await db.$transaction(async (tx) => {
      const questions = await tx.question.findMany({
        where: { serviceId: { in: serviceIds } }, select: { id: true },
      });
      const questionIds = questions.map((question) => question.id);
      const options = await tx.answerOption.findMany({
        where: { questionId: { in: questionIds } }, select: { id: true },
      });
      const optionIds = options.map((option) => option.id);
      await tx.answerOptionComponent.deleteMany({ where: { answerOptionId: { in: optionIds } } });
      await tx.answerOptionMaterial.deleteMany({ where: { answerOptionId: { in: optionIds } } });
      await tx.answerOptionDisclaimer.deleteMany({ where: { answerOptionId: { in: optionIds } } });
      await tx.answerOptionPhotoGroup.deleteMany({ where: { answerOptionId: { in: optionIds } } });
      await tx.questionDisclaimer.deleteMany({ where: { questionId: { in: questionIds } } });
      await tx.answerOption.deleteMany({ where: { id: { in: optionIds } } });
      await tx.question.deleteMany({ where: { id: { in: questionIds } } });
      await tx.pricingRule.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await tx.serviceMaterial.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await tx.templateAdoptionReceipt.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await tx.contractorDerivedPricingApproval.deleteMany({ where: { serviceId: { in: serviceIds } } });
      const removed = await tx.service.deleteMany({ where: { id: { in: serviceIds } } });
      if (removed.count !== fixtures.length) throw new Error(`Expected to remove ${fixtures.length} fixtures, removed ${removed.count}.`);
    }, { timeout: 120000 });
    console.log(`\n  Removed ${fixtures.length} internal fixture service row(s). No storefront service, price, or customer work was changed.\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(sanitizeForLog(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
