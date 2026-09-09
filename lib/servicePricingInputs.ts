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
 * PARTIAL, BY CONSTRUCTION, NOT BY READING FIRST. The update payload is
 * built from ONLY the keys actually present on `overrides` — a key that
 * isn't there is left as JavaScript `undefined`, and Prisma's own `update`
 * treats an `undefined` field as "do not touch this column", never as
 * "write null". An earlier version of this function read the row first and
 * wrote every field back — the override where present, the just-read
 * current value everywhere else — which reproduces the CORRECT value in the
 * common case but is a real read-modify-write race: a concurrent write to
 * ANY of the fields this function re-supplies, landing between the read and
 * this function's own update, would be silently overwritten with the stale
 * value this function read. Never reading `current` at all closes that
 * race outright — the SQL UPDATE this issues does not mention a column
 * unless the caller named it, so a concurrent writer's change to a column
 * this call omits survives regardless of timing.
 *
 * `null` is preserved exactly as an explicit instruction: passing
 * `{ wwtLaborHours: null }` clears that column, same as the admin form
 * submitting a blanked-out field always has.
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
  return db.service.update({
    where: { id: serviceId },
    data: {
      // Each right-hand side is `undefined` whenever the caller didn't
      // supply that key — Prisma's own semantics for "leave this column
      // alone" — and the caller's actual value (including an explicit
      // `null`) otherwise. No field is ever read back from the database
      // first.
      fieldLaborHours: overrides.fieldLaborHours,
      wwtLaborHours: overrides.wwtLaborHours,
      materialCostCents: overrides.materialCostCents,
      materialMultiplier: overrides.materialMultiplier,
      permitAdminCents: overrides.permitAdminCents,
      otherDirectCostCents: overrides.otherDirectCostCents,
      estimatedMinutes: overrides.estimatedMinutes,
      requiresTechCount: overrides.requiresTechCount,
      isPrimaryEligible: overrides.isPrimaryEligible,
      estimatedMinutesReviewed: overrides.estimatedMinutesReviewed,
      photoState: overrides.photoState,
    },
    select: {
      id: true, fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
    },
  });
}
