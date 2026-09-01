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

import type { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice } from "./pricing";

export type PublishRefusal = { code: string; message: string };

export type PublishResult =
  | { ok: true; basePrice: number; whileWeThereBasePrice: number | null }
  | { ok: false; refusal: PublishRefusal };

/**
 * Derive this service's price from its inputs and publish it, stamping the
 * approval that makes it customer-facing.
 */
export async function publishSuggestedPrice(
  db: PrismaClient,
  contractorId: string,
  serviceId: string
): Promise<PublishResult> {
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    return { ok: false, refusal: { code: "UNKNOWN_SERVICE", message: "Service not found" } };
  }

  // A PRICE IS A PROMISE ABOUT A QUESTION THE HOMEOWNER CAN READ.
  //
  // Band questions build their option labels from a policy's boundaries, so
  // an undecided policy leaves the homeowner reading "{b1} feet or less".
  // Publishing is the commercial boundary, and it is the boundary
  // verify-policy-resolution asserts against — it asks for services carrying
  // publishedPriceApprovedAt, not for active ones. BrightPath got an approved
  // price on a service with four hole-bearing labels because this check lived
  // only in CI.
  const unresolvedPolicies = service.unresolvedPolicyKeys ?? [];
  if (unresolvedPolicies.length > 0) {
    return {
      ok: false,
      refusal: {
        code: "POLICY_UNRESOLVED",
        message:
          `This service asks a question whose answers are written from ` +
          `${unresolvedPolicies.join(", ")}, and that hasn't been decided — so its ` +
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
