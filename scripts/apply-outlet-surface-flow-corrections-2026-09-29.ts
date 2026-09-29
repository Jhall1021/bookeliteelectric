import { PrismaClient } from "@prisma/client";
import { acceptMaterialBaselineVersion } from "../lib/materialCost";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { syncBidetOutletTree } from "../prisma/seed-bidet-outlet-v2";
import { attachSurfaceRouteModule, type SurfaceEndpoint } from "../prisma/_surfaceRouteModule";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";

const SURFACE_CONSUMERS: readonly { slug: string; endpoint: SurfaceEndpoint; order: number }[] = [
  { slug: "new-120v-outlet", endpoint: "OUTLET", order: 20 },
  { slug: "surface-mounted-outlet", endpoint: "OUTLET", order: 1 },
  { slug: "surface-mounted-switch", endpoint: "SWITCH", order: 1 },
  { slug: "surface-mounted-fixture-box", endpoint: "FIXTURE_BOX", order: 1 },
  { slug: "new-ceiling-fan", endpoint: "CEILING_FAN", order: 50 },
];

const INTERNAL_ONLY = ["surface-mounted-switch", "surface-mounted-fixture-box"] as const;
const APPROVE = ["new-120v-outlet", "bidet-smart-toilet-outlet", "surface-mounted-outlet", "new-ceiling-fan"] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(url);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG },
      select: { id: true, name: true },
    });
    const services = await db.service.findMany({
      where: { contractorId: contractor.id, slug: { in: [...new Set([
        ...SURFACE_CONSUMERS.map((entry) => entry.slug),
        "bidet-smart-toilet-outlet",
      ])] } },
      select: { id: true, slug: true, active: true, offered: true },
    });
    const bySlug = new Map(services.map((service) => [service.slug, service]));
    for (const slug of [...SURFACE_CONSUMERS.map((entry) => entry.slug), "bidet-smart-toilet-outlet"]) {
      if (!bySlug.has(slug)) throw new Error(`Missing ${slug} for ${CONTRACTOR_SLUG}`);
    }

    const gfci = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: "GFCI_INTERIOR" }, select: { id: true } });
    const currentGfci = await db.contractorMaterial.findUnique({
      where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: gfci.id } },
      select: { id: true },
    });
    const baseline = currentGfci ? null : await db.materialBaselineVersion.findFirst({
      where: { canonicalMaterialId: gfci.id },
      orderBy: [{ sourcedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (!currentGfci && !baseline) throw new Error("No prepared GFCI_INTERIOR material baseline exists");

    console.log(`${apply ? "apply" : "report"}: ${contractor.name} (${CONTRACTOR_SLUG})`);
    console.log(`surface consumers: ${SURFACE_CONSUMERS.map((entry) => entry.slug).join(", ")}`);
    console.log(`internal recipe-only services to hide: ${INTERNAL_ONLY.join(", ")}`);
    console.log(`GFCI material: ${currentGfci ? "already present" : "prepared baseline will be accepted"}`);
    if (!apply) return;

    if (!currentGfci && baseline) {
      const accepted = await acceptMaterialBaselineVersion(db, {
        contractorId: contractor.id,
        baselineVersionId: baseline.id,
      }, {
        reason: "Prepared GFCI endpoint cost for the bidet/smart-toilet new-outlet route",
        actor: "codex-outlet-surface-flow-correction",
      });
      if (!accepted.ok && accepted.code !== "ALREADY_RESOLVED") throw new Error(`GFCI baseline acceptance failed: ${accepted.code}`);
    }

    for (const entry of SURFACE_CONSUMERS) {
      await attachSurfaceRouteModule(db, bySlug.get(entry.slug)!.id, entry.endpoint, entry.order);
      console.log(`updated surface questions: ${entry.slug}`);
    }
    const cloned = await syncBidetOutletTree(db, contractor.id);
    console.log(`bidet tree copied: ${cloned.questionCount} questions`);

    await db.service.updateMany({
      where: { contractorId: contractor.id, slug: { in: [...INTERNAL_ONLY] } },
      data: { active: false, offered: false },
    });

    for (const slug of APPROVE) {
      const service = await db.service.findUniqueOrThrow({
        where: { contractorId_slug: { contractorId: contractor.id, slug } },
        select: { id: true },
      });
      const result = await decideDerivedPricingApproval(db, { contractorId: contractor.id }, {
        action: "approve",
        serviceId: service.id,
      });
      if (result.status !== 200 || result.body.approved !== true) {
        throw new Error(`${slug} approval failed: ${JSON.stringify(result.body)}`);
      }
      console.log(`approved current basis: ${slug} (${result.body.approvedTotalCents} cents)`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
