/**
 * Material cost holds, applied at the ROLE.
 *
 * A cost that needs reverifying is a property of the material, not of the
 * services that happen to use it. Copper moved; `WIRE_10_3` is the thing in
 * doubt. Tracking that service by service means remembering, every time a
 * package is built, which of its five ingredients were provisional — and
 * forgetting once publishes a price built on a number nobody stands behind.
 *
 * So the hold lives on `ContractorMaterial.costStatus`, which the schema
 * already had:
 *
 *     OK      the cost is current
 *     STALE   the cost needs reverifying before anything prices on it
 *     ERROR   the supplier link failed
 *
 * and everything downstream asks the recipe rather than a list of slugs.
 *
 * A held role does NOT stop a package being built, derived or reported. It
 * stops it being PUBLISHED. Development proceeds on the current figure; the
 * promise to a customer waits for a figure somebody has checked.
 */

import type { PrismaClient } from "@prisma/client";

export type HeldRole = {
  key: string;
  status: "STALE" | "ERROR";
  note: string | null;
  unitCostCents: number;
};

export type BlockedService = {
  slug: string;
  published: boolean;
  heldRoles: HeldRole[];
};

/** This contractor's roles whose cost is not currently trustworthy. */
export async function heldRoles(db: PrismaClient, contractorId: string): Promise<HeldRole[]> {
  const rows = await db.contractorMaterial.findMany({
    where: { contractorId, active: true, costStatus: { in: ["STALE", "ERROR"] } },
    select: {
      unitCostCents: true, costStatus: true, costStatusNote: true,
      canonicalMaterial: { select: { key: true } },
    },
  });
  return rows.map((r) => ({
    key: r.canonicalMaterial?.key ?? "?",
    status: r.costStatus as "STALE" | "ERROR",
    note: r.costStatusNote,
    unitCostCents: r.unitCostCents,
  }));
}

/**
 * Every service whose recipe reaches a held role.
 *
 * Reads the RECIPE, not a remembered list. A service that starts consuming a
 * held role tomorrow is blocked tomorrow, without anybody updating anything.
 */
export async function servicesOnHold(
  db: PrismaClient,
  contractorId: string
): Promise<BlockedService[]> {
  const held = await heldRoles(db, contractorId);
  if (held.length === 0) return [];
  const heldByKey = new Map(held.map((h) => [h.key, h]));

  const services = await db.service.findMany({
    where: {
      contractorId,
      materials: { some: { canonicalMaterial: { key: { in: [...heldByKey.keys()] } } } },
    },
    select: {
      slug: true, basePrice: true,
      materials: { select: { canonicalMaterial: { select: { key: true } } } },
    },
    orderBy: { slug: "asc" },
  });

  return services.map((s) => ({
    slug: s.slug,
    published: s.basePrice !== null,
    heldRoles: s.materials
      .map((m) => heldByKey.get(m.canonicalMaterial?.key ?? ""))
      .filter((h): h is HeldRole => Boolean(h)),
  }));
}

/**
 * For a publisher to call before writing a price. Returns the reason to
 * refuse, or null if the service is clear.
 */
export async function publicationHold(
  db: PrismaClient,
  contractorId: string,
  slug: string
): Promise<string | null> {
  const blocked = (await servicesOnHold(db, contractorId)).find((s) => s.slug === slug);
  if (!blocked) return null;
  return (
    `${slug} depends on ${blocked.heldRoles.length} role(s) whose cost is on hold: ` +
    blocked.heldRoles.map((h) => `${h.key} (${h.status})`).join(", ")
  );
}
