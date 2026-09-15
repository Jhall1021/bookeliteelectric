/**
 * Where a guided-flow price comes from — decided ONCE, before any number.
 *
 *   LEGACY_PUBLISHED        the published base price plus approved increments,
 *                           exactly as before (customerPrice). A missing
 *                           published price, or a component with no approved
 *                           customer price, still means review.
 *   DERIVED_RESOLVED_SCOPE  the SERVER. The browser navigates the question tree
 *                           but never calculates or infers the customer's
 *                           price: no published base exists by design, and the
 *                           economics (labor, material packages, markup,
 *                           approval) are not in the page. A missing base price
 *                           is therefore expected here and is NOT a review.
 *                           The flow asks POST /api/price-evaluation at the
 *                           terminal answer.
 *
 * Pure and dependency-light on purpose: the storefront regression drives it
 * directly, and a derived branch that ever reached customerPrice would be the
 * defect Stage 1A found — every homeowner sent to review on the first answer.
 */
import { customerPrice, type JobConfiguration } from "./pricing";

export type FlowPricingMethod = "LEGACY_PUBLISHED" | "DERIVED_RESOLVED_SCOPE";

export type FlowPriceSource =
  | { source: "PUBLISHED"; totalCents: number }
  | { source: "PUBLISHED_REVIEW"; floorCents: number }
  | { source: "SERVER" };

export function flowPriceSource(
  pricingMethod: FlowPricingMethod | null | undefined,
  config: JobConfiguration,
  publishedAnchorCents: number | null,
): FlowPriceSource {
  if (pricingMethod === "DERIVED_RESOLVED_SCOPE") return { source: "SERVER" };
  const priced = customerPrice(config, publishedAnchorCents);
  return priced.mustReview
    ? { source: "PUBLISHED_REVIEW", floorCents: priced.totalCents ?? 0 }
    : { source: "PUBLISHED", totalCents: priced.totalCents ?? 0 };
}
