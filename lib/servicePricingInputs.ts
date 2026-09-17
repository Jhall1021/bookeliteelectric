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
 *
 * ONE FIELD IS NOT ALWAYS WRITABLE THIS WAY: materialCostCents.
 *
 * Once a service is ITEMIZED — it has at least one ServiceMaterial recipe
 * line — its cached materialCostCents is DERIVED, owned exclusively by
 * lib/materialCost.ts's recompute (recomputeServiceMaterialCost, run off
 * requiredRolesFor/assessMaterialReadiness in lib/materialResolution.ts,
 * the repository's one existing definition of what a service's recipe is
 * and whether it's ready to price). A general pricing-inputs save has no
 * business overwriting that total by hand; the recipe — add/remove/quantity,
 * or a cost change cascading through the recompute — is the only legitimate
 * way it moves. Only a NON-itemized service's materialCostCents is a real,
 * hand-entered allowance this function may still set or clear freely.
 *
 * Checked BEFORE the update, and refuses the WHOLE call rather than
 * dropping just this one field — a caller that silently succeeds minus the
 * field it asked for is worse than one that fails and says why: it looks
 * like the request worked and quietly didn't do what was asked.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { PhotoState } from "@prisma/client";
import { requiredRolesFor } from "./materialResolution";

/**
 * A stable, catchable refusal from this authority — distinct from an
 * unexpected failure, the same way MaterialCostError (lib/materialCost.ts)
 * is distinct from a raw thrown Error. `code` is for a caller to switch on
 * without parsing `message`; `message` is safe to show an admin as-is.
 */
export class ServicePricingInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Whether a raw request body is even attempting to write materialCostCents
 * — key presence, not value, exactly what the check above tests on
 * `overrides`. The one place a route's incoming JSON is translated into
 * "leave this field alone" vs "here is an instruction for it", so every
 * caller of saveServicePricingInputs applies the identical rule on the way
 * in that this function applies on the way through. Knows nothing about
 * itemization — that decision stays solely inside saveServicePricingInputs
 * itself, via requiredRolesFor.
 */
export function wantsMaterialCostWrite(body: Record<string, unknown>): boolean {
  return "materialCostCents" in body;
}

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
  // "materialCostCents" in overrides, not a truthiness/null check — an
  // explicit `null` is exactly as much an attempted overwrite of the
  // derived total as any other value would be, and a key the caller never
  // supplied must never trigger this at all (that's the ordinary "leave
  // this column alone" case every other field already gets).
  if ("materialCostCents" in overrides) {
    const recipe = await requiredRolesFor(db, serviceId);
    if (recipe.length > 0) {
      throw new ServicePricingInputError(
        "ITEMIZED_MATERIAL_COST_LOCKED",
        "This service's material cost comes from its itemized recipe and can't be set directly. " +
          "Add, remove or reprice materials on the recipe instead."
      );
    }
  }

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
