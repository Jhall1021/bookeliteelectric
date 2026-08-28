/**
 * Three origins, not one hostname — ADR-019.
 *
 * Price2Book serves three audiences and they do not belong on the same
 * address:
 *
 *   PLATFORM    price2book.com            marketing and product site
 *   APP         app.price2book.com        the CONTRACTOR's application:
 *                                         sign-in, dashboard, pricing, design
 *   STOREFRONT  price2book.com/<slug>     the HOMEOWNER's experience, and
 *                                         eventually a contractor's own domain
 *
 * The whole application previously derived every absolute URL from one
 * variable, which conflated an OAuth callback (contractor, app origin) with a
 * quote link emailed to a homeowner (storefront origin). Both happened to work
 * while there was one hostname. Neither would survive the second.
 *
 * The storefront origin is deliberately PER-SITE. A contractor bringing their
 * own domain is a product direction already visible in ContractorSite, and a
 * single global storefront origin would have to be unpicked to get there.
 *
 * Everything falls back to the request's own origin, so a preview deployment,
 * a branch URL and localhost all work without configuration — the variables
 * exist to name a CANONICAL address, not to make the app runnable.
 */

/** Normalised: scheme, host, no trailing slash. */
function clean(v: string | null | undefined): string | null {
  if (!v || !v.trim()) return null;
  const s = v.trim();
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try { return new URL(withScheme).origin; } catch { return null; }
}

/** The deployment's own address, when nothing more specific is configured. */
export function deploymentOrigin(): string | null {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  }
  return clean(process.env.VERCEL_BRANCH_URL) ?? clean(process.env.VERCEL_URL);
}

/**
 * The marketing site. Only for links that genuinely point AT Price2Book —
 * "powered by", terms, support. Never for anything a contractor or homeowner
 * does inside the product.
 */
export function platformOrigin(): string | null {
  return clean(process.env.PLATFORM_WEB_ORIGIN);
}

/**
 * The contractor application. Sign-in, magic-link returns, the dashboard, and
 * the Jobber OAuth callback — every one of which is a CONTRACTOR action and
 * none of which a homeowner should ever see.
 */
export function appOrigin(): string | null {
  return clean(process.env.APP_ORIGIN) ?? clean(process.env.BETTER_AUTH_URL) ?? deploymentOrigin();
}

/**
 * Where a homeowner reaches this contractor's storefront.
 *
 * Resolution order, and the order matters:
 *   1. the site's OWN domain, once contractors can bring one
 *   2. the configured storefront origin (today: price2book.com)
 *   3. the deployment's own origin
 *
 * NEVER the app origin. A homeowner following a quote link must not land on
 * the contractor's management application, and the failure would be silent
 * because both hosts serve the same Next.js app.
 */
export function storefrontOrigin(site?: { customDomain?: string | null } | null): string | null {
  return clean(site?.customDomain)
    ?? clean(process.env.STOREFRONT_ORIGIN)
    ?? deploymentOrigin();
}

/** An absolute storefront URL for a path beneath a contractor's hosted slug. */
export function storefrontUrl(
  site: { hostedSlug: string; customDomain?: string | null },
  path = "",
): string | null {
  const origin = storefrontOrigin(site);
  if (!origin) return null;
  const rest = path.replace(/^\//, "");
  // A contractor on their own domain is at the ROOT of it; on the shared
  // origin they are under their slug. Getting this wrong produces
  // acme.com/acme/services, which looks like a bug because it is one.
  return site.customDomain
    ? `${origin}${rest ? `/${rest}` : ""}`
    : `${origin}/${site.hostedSlug}${rest ? `/${rest}` : ""}`;
}

/** An absolute URL inside the contractor application. */
export function appUrl(path = ""): string | null {
  const origin = appOrigin();
  return origin ? `${origin}/${path.replace(/^\//, "")}` : null;
}
