import type { MetadataRoute } from "next";
import { platformOrigin } from "@/lib/origins";

/**
 * Crawling rules — ADR-020.
 *
 * The marketing site should be indexed. Nothing else here should: /dashboard
 * and /choose are behind sign-in, /admin is platform staff, and /api answers
 * machines. Listing them is not a security control — they are protected by
 * auth, not by robots.txt — it keeps a crawler from spending its budget on
 * pages it will only be redirected away from.
 *
 * A contractor's storefront under /<slug> IS meant to be found, so it is not
 * excluded.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = platformOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/dashboard", "/choose", "/sign-in"],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
