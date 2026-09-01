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
 *
 * HOST-SCOPED — ADR-019.
 *
 * These are compatibility for ELITE'S domain and must never fire on
 * Price2Book's. `/` redirecting to Elite is correct on bookeliteelectric.com
 * and catastrophic on price2book.com, where it would send anyone typing the
 * product's name straight into one contractor's booking storefront instead of
 * the marketing site.
 *
 * Expressed as an EXCLUSION rather than an allowlist, deliberately. An
 * allowlist of Elite hosts would silently drop the redirects on any host
 * nobody remembered to add — a preview URL, a new alias — and the symptom
 * would be a customer's bookmarked link 404ing. The failure mode of the
 * exclusion is the safer direction: an unknown host keeps the compatibility
 * behaviour, and only Price2Book's own hosts are carved out.
 */
const LEGACY_SITE = "elite-electric";

/**
 * Any Price2Book host: the apex, www, app, and anything else under the domain.
 * Next matches `value` as a regex against the Host header.
 */
const PRICE2BOOK_HOST = "(.*\\.)?price2book\\.com";

/** Applied to every legacy redirect: fire UNLESS this is a Price2Book host. */
const NOT_PRICE2BOOK = [{ type: "host", value: PRICE2BOOK_HOST }];

const nextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket domain — set once provisioned
      // { protocol: "https", hostname: "<your-bucket>.r2.dev" },
    ],
  },
  async redirects() {
    const legacy = [
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

    // Applied in ONE place, so a redirect added later cannot forget the
    // scoping — the failure would be silent and only visible on the marketing
    // host, which is the host nobody tests legacy links against.
    return legacy.map((r) => ({ ...r, missing: NOT_PRICE2BOOK }));
  },

  /**
   * The embed serves the SAME pages, not copies of them — Embed V1.
   *
   * `/embed/<publicId>/...` rewrites onto the `[site]` tree with the publicId
   * as the segment, which `siteBySegment` resolves alongside a hosted slug.
   * The browser keeps the /embed URL; Next renders the storefront that already
   * exists.
   *
   * A REWRITE, not a redirect: an iframe that redirected out of /embed would
   * leave the contractor's address bar showing price2book.com, and a second
   * route tree would be a second storefront engine one release away from
   * diverging. The surface only ever changes the shape of a link.
   */
  async rewrites() {
    return [
      { source: "/embed/:publicId", destination: "/:publicId" },
      { source: "/embed/:publicId/:path*", destination: "/:publicId/:path*" },
    ];
  },
};

export default nextConfig;
