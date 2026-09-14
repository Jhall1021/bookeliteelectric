/**
 * ROUTING V2 — the three direct surface-mounted services.
 *
 * Each is a thin shell around the SHARED module: a name, a description, and one
 * endpoint parameter. None of them owns a route question or a route component.
 * If that ever stops being true, the equivalence verifier fails, which is the
 * point — these exist to prove the module is genuinely shared, not to be three
 * more places routing logic can drift.
 *
 * ALL THREE ARE CREATED INACTIVE AND UNPRICED. Their components have no
 * approved economics yet, so a resolved route fails closed on the component
 * price. Activation waits for the calibration wizard; nothing here creates an
 * alternate activation path.
 */
import { PrismaClient } from "@prisma/client";
import { attachSurfaceRouteModule, type SurfaceEndpoint } from "./_surfaceRouteModule";
import { eliteService } from "./_serviceTargets";

const prisma = new PrismaClient();

type Def = { slug: string; name: string; shortDescription: string; endpoint: SurfaceEndpoint };

export const SURFACE_SERVICES: Def[] = [
  {
    slug: "surface-mounted-outlet",
    name: "Surface-Mounted Outlet",
    endpoint: "OUTLET",
    shortDescription:
      "Add a new outlet without opening finished walls. The wiring runs from an existing power " +
      "source to the new outlet inside a finished surface-mounted channel fixed to the wall.",
  },
  {
    slug: "surface-mounted-switch",
    name: "Surface-Mounted Switch",
    endpoint: "SWITCH",
    shortDescription:
      "Add a wall switch where there isn't one, without opening finished walls. The wiring runs " +
      "in a visible surface-mounted channel rather than being concealed inside the wall.",
  },
  {
    slug: "surface-mounted-fixture-box",
    name: "Surface-Mounted Fixture Box",
    endpoint: "FIXTURE_BOX",
    shortDescription:
      "Create a new powered fixture location without opening finished walls, using a visible " +
      "surface-mounted channel. Fitting the light itself is separate work.",
  },
];

export async function seedSurfaceMountedServices(db: PrismaClient = prisma) {
  // Anchored to the existing outlet service so these land in the same catalog
  // position a customer already browses — and so a missing catalog is a loud
  // failure rather than an invented category.
  // ELITE, NAMED. These fixtures prove the shared modules against the only
  // contractor carrying real component economics. Anchoring on an unscoped
  // slug lookup put them under BrightPath and split the fixtures from the
  // economics meant to price them.
  const anchorTarget = await eliteService(db, "new-120v-outlet");
  const anchor = await db.service.findUniqueOrThrow({
    where: { id: anchorTarget.id },
    select: { categoryId: true, contractorId: true, contractorCategoryId: true, tradeKey: true, bookingType: true },
  });

  const made: { slug: string; id: string }[] = [];
  for (const def of SURFACE_SERVICES) {
    const existing = await db.service.findFirst({
      where: { slug: def.slug, contractorId: anchor.contractorId }, select: { id: true },
    });
    const svc = existing
      ? await db.service.update({
          where: { id: existing.id },
          data: { name: def.name, shortDescription: def.shortDescription },
          select: { id: true },
        })
      : await db.service.create({
          data: {
            slug: def.slug, name: def.name, shortDescription: def.shortDescription,
            categoryId: anchor.categoryId, contractorId: anchor.contractorId,
            contractorCategoryId: anchor.contractorCategoryId,
            tradeKey: anchor.tradeKey, bookingType: anchor.bookingType,
            // INACTIVE AND UNPRICED, deliberately. The route's components carry
            // no approved economics, so a price cannot be computed anyway.
            //
            // NO PRICE FIELD IS WRITTEN — not even null. The price columns are
            // nullable with no default, so a new row is unpriced without this
            // seed saying so, and pricing state belongs to the supported
            // lifecycle (publishSuggestedPrice / derived approval), not a seed.
            // The update branch above writes name and description only, so a
            // rerun can never clear a price an existing service has earned.
            // audit-price-writers holds this file to zero price-field tokens.
            active: false, offered: false,
          },
          select: { id: true },
        });

    await attachSurfaceRouteModule(db, svc.id, def.endpoint, 1);
    made.push({ slug: def.slug, id: svc.id });
  }
  return made;
}

if (process.argv[1] && process.argv[1].endsWith("seed-surface-mounted-services.ts")) {
  seedSurfaceMountedServices()
    .then(async (made) => {
      for (const m of made) console.log(`  ✓ ${m.slug}`);
      console.log(`\n  ${made.length} surface-mounted services, all inactive and unpriced.\n`);
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
