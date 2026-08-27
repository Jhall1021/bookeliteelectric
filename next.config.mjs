/** @type {import('next').NextConfig} */

/**
 * The one legacy storefront — ADR §2.2.
 *
 * Elite's pages used to live at the root: /services, /troubleshooting. They now
 * live under a tenant-addressed prefix, and these redirects keep the old links
 * working while there is exactly one legacy storefront to keep working.
 *
 * TEMPORARY (307), not permanent (308), deliberately. A 308 is cached hard by
 * browsers and burns the root paths into Elite forever, and Price2Book will
 * want /services and /pricing for its own marketing site. These come out once
 * the old links stop mattering; the slugs stay reserved in the meantime — see
 * RESERVED_HOSTED_SLUGS in lib/siteRouting.ts.
 *
 * The important property: the old paths REDIRECT. They do not keep serving
 * Elite implicitly from a soleContractorId fallback, which would have been the
 * easy version and would have left a second, unaddressed way to reach one
 * tenant's catalog.
 */
const LEGACY_SITE = "elite-electric";

const nextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket domain — set once provisioned
      // { protocol: "https", hostname: "<your-bucket>.r2.dev" },
    ],
  },
  async redirects() {
    return [
      { source: "/", destination: `/${LEGACY_SITE}`, permanent: false },
      { source: "/services", destination: `/${LEGACY_SITE}/services`, permanent: false },
      {
        source: "/services/:path*",
        destination: `/${LEGACY_SITE}/services/:path*`,
        permanent: false,
      },
      {
        source: "/troubleshooting",
        destination: `/${LEGACY_SITE}/troubleshooting`,
        permanent: false,
      },
      // The rest of the booking flow moved too. Missing these was a real
      // defect: /my-visit 404'd for anyone with the old link bookmarked or
      // open in a tab, found by the browser smoke test rather than by the
      // build, which cannot know a route used to exist.
      { source: "/my-visit", destination: `/${LEGACY_SITE}/my-visit`, permanent: false },
      {
        source: "/checkout/:path*",
        destination: `/${LEGACY_SITE}/checkout/:path*`,
        permanent: false,
      },
      { source: "/quote/:path*", destination: `/${LEGACY_SITE}/quote/:path*`, permanent: false },
      { source: "/service-area", destination: `/${LEGACY_SITE}/service-area`, permanent: false },
      { source: "/how-it-works", destination: `/${LEGACY_SITE}/how-it-works`, permanent: false },
      { source: "/why-elite", destination: `/${LEGACY_SITE}/why-elite`, permanent: false },
    ];
  },
};

export default nextConfig;
