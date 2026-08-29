import type { MetadataRoute } from "next";
import { platformOrigin } from "@/lib/origins";

/**
 * The marketing site's sitemap — ADR-020.
 *
 * Deliberately only the platform's own pages. Contractor storefronts are
 * tenant content on a shared origin, and enumerating every contractor's slug
 * in one public file would publish the customer list of a product that is
 * still onboarding "a small number of contractors". If storefronts need
 * indexing later, that belongs in a per-tenant sitemap at the [site]
 * boundary, where the tenant is already resolved.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = platformOrigin();
  if (!origin) return [];
  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
  ];
}
