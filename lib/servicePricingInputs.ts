/**
 * THE authority for saving a service's pricing INPUTS — never the published
 * price. Extracted from app/api/admin/services/[serviceId]/pricing/route.ts's
 * "save" action, which previously did this inline as the only caller.
 *
 * Handoff §5/§31: a calculated price is a recommendation, never silently
 * promoted to the published one. That distinction lives entirely in that
 * route's separate "publish" action (lib/pricePublication.ts) — this
 * function never touches basePrice, whileWeThereBasePrice or
 * publishedPriceApprovedAt, and never will; a caller that needs to publish
 * uses that authority explicitly, on its own click, same as the admin panel.
 *
 * PARTIAL, SAFELY. Only the keys present in `overrides` change — everything
 * else keeps its current stored value. This is what the extraction is FOR:
 * the original inline code built its update payload from a full admin-form
 * body every key of which came out of `num()`, which turns "the field was
 * absent" into an explicit `null` — so a second caller sending only
 * `{ fieldLaborHours }` would have silently nulled out wwtLaborHours,
 * materialCostCents, and everything else on that service. This function reads
 * the row first and only overwrites what the caller actually named, so a
 * caller (like the labor wizard) that only means to move one figure cannot
 * touch the rest by omission.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { PhotoState } from "@prisma/client";

export type ServicePricingInputOverrides = Partial<{
  fieldLaborHours: number | null;
  wwtLaborHours: number | null;
  materialCostCents: number | null;
  /** Null means "use the tier derived from material cost" (handoff §4). */
  materialMultiplier: number | null;
  permitAdminCents: number | null;
  otherDirectCostCents: number | null;
  estimatedMinutes: number | null;
  requiresTechCount: number;
  isPrimaryEligible: boolean;
  estimatedMinutesReviewed: boolean;
  photoState: PhotoState;
}>;

type Db = PrismaClient | Prisma.TransactionClient;

export async function saveServicePricingInputs(
  db: Db,
  serviceId: string,
  overrides: ServicePricingInputOverrides
) {
  const current = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: {
      fieldLaborHours: true, wwtLaborHours: true, materialCostCents: true, materialMultiplier: true,
      permitAdminCents: true, otherDirectCostCents: true, estimatedMinutes: true, requiresTechCount: true,
      isPrimaryEligible: true, estimatedMinutesReviewed: true, photoState: true,
    },
  });

  const pick = <K extends keyof ServicePricingInputOverrides>(key: K) =>
    overrides[key] !== undefined ? overrides[key] : current[key];

  return db.service.update({
    where: { id: serviceId },
    data: {
      fieldLaborHours: pick("fieldLaborHours"),
      wwtLaborHours: pick("wwtLaborHours"),
      materialCostCents: pick("materialCostCents"),
      materialMultiplier: pick("materialMultiplier"),
      permitAdminCents: pick("permitAdminCents"),
      otherDirectCostCents: pick("otherDirectCostCents"),
      estimatedMinutes: pick("estimatedMinutes"),
      requiresTechCount: pick("requiresTechCount"),
      isPrimaryEligible: pick("isPrimaryEligible"),
      estimatedMinutesReviewed: pick("estimatedMinutesReviewed"),
      photoState: pick("photoState"),
    },
    select: {
      id: true, fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
    },
  });
}
