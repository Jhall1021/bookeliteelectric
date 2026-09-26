/**
 * Publish clearer customer copy for the three direct surface-mounted services.
 *
 * Report-only unless --apply is supplied. Installed services are updated only
 * when they still carry the prior prepared description, so a contractor's own
 * edited copy is never overwritten. Template rows are the platform-authored
 * source and are updated for future catalog installations.
 *
 * This script changes wording only. It never touches prices, approvals,
 * activation, questions, routing, materials, policies, or bookings.
 */
import { PrismaClient } from "@prisma/client";
import { SURFACE_SERVICES } from "../prisma/seed-surface-mounted-services";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";

const priorDescriptionBySlug: Record<string, string> = {
  "surface-mounted-outlet":
    "Add a new outlet without opening finished walls. The wiring runs from an existing power " +
    "source to the new outlet inside a finished surface-mounted channel fixed to the wall.",
  "surface-mounted-switch":
    "Add a wall switch where there isn't one, without opening finished walls. The wiring runs " +
    "in a visible surface-mounted channel rather than being concealed inside the wall.",
  "surface-mounted-fixture-box":
    "Create a new powered fixture location without opening finished walls, using a visible " +
    "surface-mounted channel. Fitting the light itself is separate work.",
};

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const slugs = SURFACE_SERVICES.map((service) => service.slug);
    const [installed, templates] = await Promise.all([
      db.service.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true, shortDescription: true, contractor: { select: { slug: true } } },
        orderBy: [{ contractorId: "asc" }, { slug: "asc" }],
      }),
      db.templateService.findMany({
        where: { key: { in: slugs }, templateVersion: { trade: "electrical" } },
        select: { id: true, key: true, shortDescription: true, templateVersion: { select: { version: true } } },
        orderBy: [{ templateVersion: { version: "asc" } }, { key: "asc" }],
      }),
    ]);
    const eligible = installed.filter((service) =>
      service.shortDescription === priorDescriptionBySlug[service.slug],
    );
    const customized = installed.filter((service) =>
      service.shortDescription !== priorDescriptionBySlug[service.slug]
      && service.shortDescription !== SURFACE_SERVICES.find((definition) => definition.slug === service.slug)?.shortDescription,
    );

    console.log(`SURFACE SERVICE COPY — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  installed defaults to update: ${eligible.length}`);
    console.log(`  contractor-customized rows preserved: ${customized.length}`);
    console.log(`  electrical template rows to update: ${templates.length}`);
    if (!apply) return console.log("  Report only. Re-run with --apply to publish wording only.");

    const installedBySlug = new Map(SURFACE_SERVICES.map((definition) => [
      definition.slug,
      eligible.filter((service) => service.slug === definition.slug).map((service) => service.id),
    ]));
    const templateBySlug = new Map(SURFACE_SERVICES.map((definition) => [
      definition.slug,
      templates.filter((service) => service.key === definition.slug).map((service) => service.id),
    ]));

    await db.$transaction(async (tx) => {
      for (const definition of SURFACE_SERVICES) {
        const installedIds = installedBySlug.get(definition.slug) ?? [];
        if (installedIds.length > 0) {
          await tx.service.updateMany({
            where: { id: { in: installedIds } },
            data: { shortDescription: definition.shortDescription },
          });
        }
        const templateIds = templateBySlug.get(definition.slug) ?? [];
        if (templateIds.length > 0) {
          await tx.templateService.updateMany({
            where: { id: { in: templateIds } },
            data: { shortDescription: definition.shortDescription },
          });
        }
      }
    });
    console.log("  Published. No contractor-customized copy or pricing state was changed.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
