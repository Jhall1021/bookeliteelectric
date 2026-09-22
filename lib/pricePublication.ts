/**
 * Publishing a suggested price — the single authority.
 *
 * Extracted from the pricing route for the same reason activation was: an
 * onboarding exercise that reimplemented "derive, then stamp" would be a
 * second publication path, and the one that skipped a check would be the one
 * nobody noticed. The route delegates here; it no longer decides.
 *
 * WHAT IT WILL NOT DO
 *
 * Accept a number. The figure is always derived from the contractor's own
 * inputs through `suggestPrimaryPrice`, because a typed price is a price that
 * stops tracking its inputs. A caller may say WHICH service to publish; it may
 * not say what the answer is.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice } from "./pricing";
import { flatPriceFoundationReadiness } from "./priceReviewReadiness";

export type PublishRefusal = { code: string; message: string };

export type PublishResult =
  | { ok: true; basePrice: number; whileWeThereBasePrice: number | null }
  | { ok: false; refusal: PublishRefusal };

/**
 * Derive this service's price from its inputs and publish it, stamping the
 * approval that makes it customer-facing.
 */
export async function publishSuggestedPrice(
  db: PrismaClient | Prisma.TransactionClient,
  contractorId: string,
  serviceId: string,
  options: { expectedBasePrice?: number } = {},
): Promise<PublishResult> {
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    return { ok: false, refusal: { code: "UNKNOWN_SERVICE", message: "Service not found" } };
  }

  // The UI may advance ready services while unrelated offered services still
  // need setup. Recheck THIS service here at the publication boundary: a
  // missing material cost is never zero, and unresolved policy wording is
  // never customer-ready.
  const foundation = flatPriceFoundationReadiness({
    materialCostResolved: service.materialCostResolved,
    unresolvedMaterialKeys: service.unresolvedMaterialKeys ?? [],
    unresolvedPolicyKeys: service.unresolvedPolicyKeys ?? [],
  });
  if (!foundation.ready) {
    return {
      ok: false,
      refusal: {
        code: foundation.code,
        message: foundation.code === "MATERIALS_UNRESOLVED"
          ? `This service can't be priced yet — ${foundation.message}.`
          : `This service asks a question whose answers are written from ` +
            `${service.unresolvedPolicyKeys.join(", ")}, and that hasn't been decided — so its ` +
            `choices would read as "{b1} feet or less". Decide it before approving a price.`,
      },
    };
  }

  const settings = await db.pricingSettings.findUnique({ where: { contractorId } });
  if (!settings) {
    return {
      ok: false,
      refusal: {
        code: "PRICING_SETTINGS_MISSING",
        message: "Pricing settings are not configured — there is nothing to compute a price from.",
      },
    };
  }

  const primary = suggestPrimaryPrice(service as never, settings as never);
  if (primary.totalCents === null) {
    return {
      ok: false,
      refusal: {
        code: "NO_SUGGESTED_PRICE",
        message: primary.unavailableReason ?? "No suggested price to publish.",
      },
    };
  }

  // Batch review shows a person a concrete suggestion before they approve it.
  // Refuse if any input changed between that render and the write; never let an
  // approval click silently authorize a different number.
  if (options.expectedBasePrice !== undefined && primary.totalCents !== options.expectedBasePrice) {
    return {
      ok: false,
      refusal: {
        code: "STALE_SUGGESTED_PRICE",
        message: "The suggested price changed after it was shown. Reload and review the current figure.",
      },
    };
  }

  // The add-on price only moves when its own hours exist. A service can
  // legitimately have a published primary price and no add-on price at all, so
  // a null here leaves the existing value alone rather than wiping it.
  const wwt = suggestWwtPrice(service as never, settings as never);

  await db.service.update({
    where: { id: serviceId },
    data: {
      basePrice: primary.totalCents,
      publishedPriceApprovedAt: new Date(),
      ...(wwt.totalCents !== null ? { whileWeThereBasePrice: wwt.totalCents } : {}),
    },
  });

  return {
    ok: true,
    basePrice: primary.totalCents,
    whileWeThereBasePrice: wwt.totalCents,
  };
}
