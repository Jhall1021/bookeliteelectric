/**
 * Publish the four-card New Outlets catalog.
 *
 * Report-only by default. Pass --apply after the production identity guard.
 * Longer exterior-GFCI routing and the standalone surface-raceway recipe stay
 * installed for internal routing/pricing, while the application filters them
 * out of every customer and setup catalog.
 */
import { PrismaClient } from "@prisma/client";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const NEW_OUTLETS = "new-outlets";

const PUBLIC_SERVICES = [
  {
    slug: "dedicated-120v-circuit-outlet",
    name: "New Dedicated Outlet",
    description:
      "A new outlet on its own dedicated circuit back to the panel for an appliance or piece of equipment that needs power to itself.",
    sortOrder: 1,
  },
  {
    slug: "exterior-gfci-standard",
    name: "New Exterior GFCI Outlet",
    description:
      "A new weatherproof outdoor GFCI outlet. We'll determine whether we can tap power directly behind it or need to extend wiring from the nearest suitable interior outlet.",
    sortOrder: 2,
  },
  {
    slug: "garage-door-opener-outlet",
    name: "New Garage Outlet",
    description:
      "A new surface-mounted garage outlet, including a ceiling outlet for a garage-door opener.",
    sortOrder: 3,
  },
  {
    slug: "new-120v-outlet",
    name: "New 120V Outlet — General Use",
    description:
      "A new general-use outlet powered from the nearest suitable circuit. The questions include concealed and surface-mounted wiring options.",
    sortOrder: 4,
  },
] as const;

const INTERNAL_SERVICES = ["exterior-gfci-other-routing", "surface-mounted-outlet"] as const;

async function updateLiveCatalogs(db: PrismaClient, apply: boolean) {
  const contractors = await db.contractor.findMany({
    where: {
      services: { some: { slug: "new-120v-outlet" } },
    },
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });

  let ready = 0;
  for (const contractor of contractors) {
    const [canonical, legacy, services] = await Promise.all([
      db.canonicalCategory.findUnique({ where: { slug: NEW_OUTLETS }, select: { id: true } }),
      db.serviceCategory.findUnique({ where: { slug: NEW_OUTLETS }, select: { id: true } }),
      db.service.findMany({
        where: {
          contractorId: contractor.id,
          slug: { in: [...PUBLIC_SERVICES.map((service) => service.slug), ...INTERNAL_SERVICES] },
        },
        select: {
          id: true,
          slug: true,
          questions: {
            where: { key: "gfci_receptacle_behind" },
            select: {
              options: {
                where: { value: "no" },
                select: { routeAction: true, rerouteServiceId: true },
              },
            },
          },
        },
      }),
    ]);
    const bySlug = new Map(services.map((service) => [service.slug, service]));
    const missing = PUBLIC_SERVICES.filter((service) => !bySlug.has(service.slug)).map((service) => service.slug);
    const exterior = bySlug.get("exterior-gfci-standard");
    const exteriorHandoff = exterior?.questions[0]?.options[0];
    const handoffReady = exteriorHandoff?.routeAction === "REROUTE_SERVICE"
      && exteriorHandoff.rerouteServiceId === bySlug.get("exterior-gfci-other-routing")?.id;
    if (!canonical || !legacy || missing.length || !handoffReady) {
      console.log(
        `${contractor.slug}: skipped — ${!canonical || !legacy ? "New Outlets category missing" : ""}` +
        `${missing.length ? ` missing ${missing.join(", ")}` : ""}` +
        `${!handoffReady ? " exterior GFCI handoff missing" : ""}`,
      );
      continue;
    }

    ready++;
    console.log(`${contractor.slug}: ${apply ? "updating" : "ready"} — four public New Outlets services`);
    if (!apply) continue;

    await db.$transaction(async (tx) => {
      const contractorCategory = await tx.contractorCategory.upsert({
        where: {
          contractorId_canonicalCategoryId: {
            contractorId: contractor.id,
            canonicalCategoryId: canonical.id,
          },
        },
        update: {},
        create: {
          contractorId: contractor.id,
          canonicalCategoryId: canonical.id,
          sortOrder: 1,
          navGroup: "outlets-switches",
        },
      });

      for (const definition of PUBLIC_SERVICES) {
        await tx.service.update({
          where: { id: bySlug.get(definition.slug)!.id },
          data: {
            name: definition.name,
            shortDescription: definition.description,
            categoryId: legacy.id,
            contractorCategoryId: contractorCategory.id,
            sortOrder: definition.sortOrder,
          },
        });
      }
      await tx.service.updateMany({
        where: { contractorId: contractor.id, slug: { in: [...INTERNAL_SERVICES] } },
        data: { sortOrder: 90 },
      });
    }, { timeout: 120000 });
  }
  return ready;
}

async function updateTemplates(db: PrismaClient, apply: boolean) {
  const canonical = await db.canonicalCategory.findUnique({
    where: { slug: NEW_OUTLETS },
    select: { id: true },
  });
  if (!canonical) throw new Error("New Outlets canonical category is missing");

  let updated = 0;
  for (const definition of PUBLIC_SERVICES) {
    const templates = await db.templateService.findMany({
      where: { key: definition.slug, templateVersion: { trade: "electrical" } },
      select: { id: true },
    });
    updated += templates.length;
    if (!apply || templates.length === 0) continue;
    await db.templateService.updateMany({
      where: { id: { in: templates.map((template) => template.id) } },
      data: {
        name: definition.name,
        shortDescription: definition.description,
        canonicalCategoryId: canonical.id,
      },
    });
  }
  console.log(`electrical templates: ${updated} service definition(s) ${apply ? "updated" : "ready"}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (
    identity.endpoint !== EXPECTED_ENDPOINT
    || identity.lineage !== PRODUCTION_LINEAGE
    || identity.markerEndpoint !== EXPECTED_ENDPOINT
  ) {
    throw new Error(`refusing ${identity.endpoint}: production lineage/marker guard failed`);
  }

  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const ready = await updateLiveCatalogs(db, apply);
    await updateTemplates(db, apply);
    console.log(apply
      ? `Published the condensed New Outlets catalog to ${ready} live catalog(s).`
      : "Report only. Re-run with --apply to publish the guarded catalog update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
