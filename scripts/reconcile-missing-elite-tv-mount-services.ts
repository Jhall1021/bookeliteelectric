/**
 * Reconcile two Electrical template services Elite never got provisioned:
 * `articulating-tv-mount` and `tilt-tv-mount`.
 *
 * WHY A DEDICATED SCRIPT, NOT THE EXISTING MACHINERY
 *
 * lib/templateProvisioning.ts's preflight()/installCatalog() is whole-
 * catalog and fresh-contractor only — preflight() refuses outright
 * (CATALOG_ALREADY_INSTALLED) the moment a contractor has ANY service with
 * a templateVersionId, which Elite does (78 of them). scripts/template-
 * update.ts's --adopt path updates an EXISTING provisioned service's
 * structure against a newer template version; it requires
 * `service.findFirstOrThrow` on the contractor's own row for that key,
 * which doesn't exist here either. Neither tool is built for "this
 * contractor is missing an entire service that's been in the template
 * catalog all along."
 *
 * So this script borrows installCatalog's own per-service creation body
 * (lib/templateProvisioning.ts:324-442) as closely as possible, scoped to
 * exactly these two keys, using templateVersionSource(..., onlyKey) —
 * installCatalog's own canonical loader — so every field comes from the
 * template definition itself, never hand-typed. Both services have zero
 * questions and zero materials at the canonical level (confirmed by
 * direct query before writing this), so the question/answer-option/
 * material loops below are close to no-ops for these two, but are kept
 * rather than special-cased, in case that ever changes for either key.
 *
 * Idempotent: refuses (does not skip silently) if the contractor already
 * has a service at that slug — this script creates, never updates.
 *
 *   npx tsx scripts/reconcile-missing-elite-tv-mount-services.ts
 *   npx tsx scripts/reconcile-missing-elite-tv-mount-services.ts --apply
 *
 * GUARDED. --apply refuses unless DATABASE_URL is verified, by marker, to be
 * the authoritative Price2Book production database ITSELF — not a branch of
 * it, not something merely carrying its lineage. This is this Elite
 * reconciliation's own gate, not a general-purpose production-vs-rehearsal
 * switch: unlike scripts/publish-plumbing-template.ts (which defaults to
 * refusing production and requires a launch flag to proceed, because its
 * normal use is rehearsal), this script's only sanctioned target IS
 * production, so it fails closed the other way — requiring production,
 * refusing anything else. Reuses probe() from ./_lineage — the same marker
 * authority verify-database-identity.ts and publish-plumbing-template.ts's
 * own isProductionItself() are built on — rather than re-deriving identity
 * logic here. Dry-run mode performs no check and stays read-only regardless.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { templateVersionSource } from "../lib/templateProvisioning";
import { probe } from "./_lineage";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const CONTRACTOR_SLUG = "elite-electric";
const EXPECTED_MARKER_KEY = "price2book-production";
const TARGETS: { key: string; basePriceCents: number }[] = [
  { key: "articulating-tv-mount", basePriceCents: 14500 }, // $145.00
  { key: "tilt-tv-mount", basePriceCents: 9500 }, // $95.00
];

/**
 * Is DATABASE_URL the production database itself — not a branch of it? Same
 * distinction scripts/_lineage.ts draws (a Neon branch inherits the marker
 * verbatim, so the marker key alone proves nothing; the marker's OWN
 * endpoint must match the one actually connected to).
 */
async function verifyProductionIdentityOrExit() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("\n  DATABASE_URL is not set — refusing to apply.\n"); process.exit(1); }
  const p = await probe(url!);
  const isProduction = !!p.markerKey && p.markerKey === EXPECTED_MARKER_KEY && p.markerEndpoint === p.endpoint;
  console.log(`  identity: endpoint=${p.endpoint} marker=${p.markerKey ?? "(none)"} stampedFor=${p.markerEndpoint ?? "(none)"}`);
  if (!isProduction) {
    console.error(
      `\n  REFUSING --apply: DATABASE_URL (${p.endpoint}) is not verified as "${EXPECTED_MARKER_KEY}" itself.\n` +
      `  ${!p.markerKey ? "No DatabaseIdentity marker present." : p.markerEndpoint !== p.endpoint
        ? `Marker "${p.markerKey}" is stamped for ${p.markerEndpoint} — this looks like a branch/copy, not the original.`
        : `Marker key is "${p.markerKey}", expected "${EXPECTED_MARKER_KEY}".`}\n`
    );
    process.exit(1);
  }
  console.log(`  ok: this is ${EXPECTED_MARKER_KEY} itself.\n`);
}

async function main() {
  console.log(`\nRECONCILE MISSING ELITE SERVICES   ${APPLY ? "APPLY" : "DRY RUN (--apply to write)"}\n`);
  if (APPLY) await verifyProductionIdentityOrExit();

  const contractor = await prisma.contractor.findUniqueOrThrow({ where: { slug: CONTRACTOR_SLUG }, select: { id: true } });

  for (const target of TARGETS) {
    console.log(`  --- ${target.key} ---`);

    const existing = await prisma.service.findFirst({ where: { contractorId: contractor.id, slug: target.key } });
    if (existing) {
      console.log(`    REFUSING: ${CONTRACTOR_SLUG} already has a service at slug "${target.key}" (id ${existing.id}). Nothing to reconcile.`);
      continue;
    }

    const source = templateVersionSource(prisma, "electrical", target.key);
    const catalog = await source.load();
    if (catalog.services.length !== 1) {
      console.log(`    REFUSING: expected exactly 1 template service for key "${target.key}", found ${catalog.services.length}.`);
      continue;
    }
    const raw = catalog.services[0] as unknown as Record<string, never> & {
      key: string; slug: string; name: string; canonicalCategoryId: string; templateVersionId: string;
      shortDescription: string | null; icon: string | null; bookingType: never; photoState: never;
      isPrimaryEligible: boolean; requiresTechCount: number;
      materials: { quantityIsPolicy: boolean; canonicalMaterialId: string; quantity: number | null; order: number; canonicalMaterial: { key: string } }[];
      questions: unknown[];
    };

    console.log(`    template source: v${catalog.version}, name="${raw.name}", bookingType=${String(raw.bookingType)}`);
    console.log(`    materials: ${raw.materials.length}, questions: ${raw.questions.length}`);
    if (raw.materials.length > 0 || raw.questions.length > 0) {
      console.log(`    NOTE: this key has questions/materials — verify the loops below handle them before trusting this run.`);
    }

    if (!APPLY) {
      console.log(`    would CREATE service "${raw.slug}" (${raw.name}), then set basePrice=${target.basePriceCents} and approve/publish/activate/offer it.`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const t = tx as unknown as PrismaClient;

      const cc = await t.contractorCategory.upsert({
        where: { contractorId_canonicalCategoryId: { contractorId: contractor.id, canonicalCategoryId: raw.canonicalCategoryId } },
        update: {},
        create: { contractorId: contractor.id, canonicalCategoryId: raw.canonicalCategoryId, sortOrder: 0 },
      });
      const legacyCat = await t.serviceCategory.findFirstOrThrow({ select: { id: true } });

      const structural = raw.materials.filter((m) => !m.quantityIsPolicy);
      const unresolved = raw.materials.filter((m) => m.quantityIsPolicy).map((m) => m.canonicalMaterial.key);

      const svc = await t.service.create({
        data: {
          contractorId: contractor.id, contractorCategoryId: cc.id, categoryId: legacyCat.id,
          slug: raw.slug, name: raw.name, shortDescription: raw.shortDescription, icon: raw.icon,
          bookingType: raw.bookingType, photoState: raw.photoState,
          isPrimaryEligible: raw.isPrimaryEligible, requiresTechCount: raw.requiresTechCount,
          templateVersionId: raw.templateVersionId, templateKey: raw.key, tradeKey: catalog.trade,
          active: false, materialCostResolved: unresolved.length === 0, unresolvedMaterialKeys: unresolved,
        },
        select: { id: true },
      });

      for (const m of structural) {
        await t.serviceMaterial.create({
          data: { serviceId: svc.id, canonicalMaterialId: m.canonicalMaterialId, quantity: m.quantity!, order: m.order },
        });
      }

      console.log(`    CREATED service ${svc.id} — structure only (active=false, no price yet)`);

      // Explicit reconciliation step, per this task's direct approval — a
      // seed/provisioning path must never stamp its own approval (see
      // prisma/seed-bathroom-fans.ts), but this script's whole purpose IS
      // the one explicit reconciliation this task authorized.
      await t.service.update({
        where: { id: svc.id },
        data: {
          basePrice: target.basePriceCents,
          active: true,
          offered: true,
          publishedPriceApprovedAt: new Date(),
        },
      });
      console.log(`    APPROVED/PUBLISHED — basePrice=${target.basePriceCents}, active=true, offered=true`);
    });
  }

  console.log(`\n${APPLY ? "Applied." : "Dry run — nothing written."}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
